begin;

create or replace function public.job_offer_matching_fingerprint(
  p_job_offer_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'company_id', offer.company_id,
    'title', offer.title,
    'description_hash', offer.description_hash,
    'location_text', offer.location_text,
    'country_code', offer.country_code,
    'region', offer.region,
    'city', offer.city,
    'work_mode', offer.work_mode,
    'seniority', offer.seniority,
    'employment_type', offer.employment_type,
    'salary_min', offer.salary_min,
    'salary_max', offer.salary_max,
    'salary_currency', offer.salary_currency,
    'status', offer.status
  )
  from public.job_offers offer
  where offer.id = p_job_offer_id;
$$;

create or replace function public.find_existing_job_offers_batch(
  p_source_code text,
  p_offers jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  item jsonb;
  existing jsonb;
  results jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_offers) <> 'array' then
    raise exception 'Offers batch must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_offers) > 500 then
    raise exception 'Offers batch exceeds 500 items' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_offers)
  loop
    existing := public.find_existing_job_offer(
      p_source_code,
      nullif(btrim(item->>'external_job_id'), ''),
      nullif(btrim(item->>'canonical_source_url'), ''),
      nullif(btrim(item->>'canonical_url'), ''),
      coalesce((item->>'canonical_url_is_reliable')::boolean, false)
    );
    results := results || jsonb_build_array(
      jsonb_build_object(
        'batch_index', (item->>'batch_index')::integer,
        'job_offer_id', existing->>'job_offer_id',
        'job_offer_source_id', existing->>'job_offer_source_id',
        'matched_by', existing->>'matched_by'
      )
    );
  end loop;

  return results;
end;
$$;

create or replace function public.ingest_company_career_job_offers_batch(
  p_offers jsonb,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  existing jsonb;
  ingested jsonb;
  before_fingerprint jsonb;
  after_fingerprint jsonb;
  offer_id uuid;
  outcome text;
  results jsonb := '[]'::jsonb;
  created_count integer := 0;
  updated_count integer := 0;
  unchanged_count integer := 0;
begin
  if jsonb_typeof(p_offers) <> 'array' then
    raise exception 'Offers batch must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_offers) = 0 then
    return jsonb_build_object(
      'results', results,
      'created', 0,
      'updated', 0,
      'unchanged', 0
    );
  end if;
  if jsonb_array_length(p_offers) > 500 then
    raise exception 'Offers batch exceeds 500 items' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_offers)
  loop
    existing := public.find_existing_job_offer(
      item->>'source_code',
      nullif(btrim(item->>'external_job_id'), ''),
      nullif(btrim(item->>'canonical_source_url'), ''),
      nullif(btrim(item->>'canonical_url'), ''),
      coalesce((item->>'canonical_url_is_reliable')::boolean, false)
    );
    if existing is not null then
      before_fingerprint := public.job_offer_matching_fingerprint(
        (existing->>'job_offer_id')::uuid
      );
    else
      before_fingerprint := null;
    end if;

    ingested := public.ingest_company_career_job_offer(item, p_observed_at);
    offer_id := (ingested->>'job_offer_id')::uuid;
    after_fingerprint := public.job_offer_matching_fingerprint(offer_id);

    if (ingested->>'offer_created')::boolean then
      outcome := 'CREATED';
      created_count := created_count + 1;
    elsif before_fingerprint is distinct from after_fingerprint then
      outcome := 'UPDATED';
      updated_count := updated_count + 1;
    else
      outcome := 'UNCHANGED';
      unchanged_count := unchanged_count + 1;
    end if;

    results := results || jsonb_build_array(
      jsonb_build_object(
        'batch_index', (item->>'batch_index')::integer,
        'job_offer_id', offer_id,
        'job_offer_source_id', ingested->>'job_offer_source_id',
        'outcome', outcome,
        'source_created', (ingested->>'source_created')::boolean,
        'matched_existing', existing is not null
      )
    );
  end loop;

  return jsonb_build_object(
    'results', results,
    'created', created_count,
    'updated', updated_count,
    'unchanged', unchanged_count
  );
end;
$$;

create or replace function public.upsert_job_matches_batch(
  p_search_profile_id uuid,
  p_matches jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_search public.search_profiles;
  created_count integer;
  updated_count integer;
begin
  if jsonb_typeof(p_matches) <> 'array' then
    raise exception 'Matches batch must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_matches) > 500 then
    raise exception 'Matches batch exceeds 500 items' using errcode = '22023';
  end if;

  select * into target_search
  from public.search_profiles
  where id = p_search_profile_id
    and status = 'ACTIVE'
    and deleted_at is null;
  if not found then
    raise exception 'Active SearchProfile not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.job_preferences
  where user_id = target_search.user_id
    and search_profile_id = target_search.id
    and search_profile_version = target_search.version
    and deleted_at is null;
  if not found then
    raise exception 'Current JobPreferences not found' using errcode = 'P0002';
  end if;

  with parsed as (
    select distinct on (input.job_offer_id, input.scoring_version)
      input.job_offer_id,
      input.scoring_version,
      input.score,
      input.eligibility_status,
      input.score_components,
      input.hard_gates,
      input.reasons
    from jsonb_to_recordset(p_matches) as input(
      job_offer_id uuid,
      scoring_version text,
      score integer,
      eligibility_status text,
      score_components jsonb,
      hard_gates jsonb,
      reasons jsonb
    )
    order by input.job_offer_id, input.scoring_version
  ), upserted as (
    insert into public.job_matches (
      user_id,
      candidate_profile_id,
      search_profile_id,
      search_profile_version,
      job_offer_id,
      scoring_version,
      score,
      eligibility_status,
      score_components,
      hard_gates,
      reasons
    )
    select
      target_search.user_id,
      target_search.candidate_profile_id,
      target_search.id,
      target_search.version,
      parsed.job_offer_id,
      parsed.scoring_version,
      parsed.score,
      parsed.eligibility_status::public.job_match_eligibility,
      parsed.score_components,
      parsed.hard_gates,
      parsed.reasons
    from parsed
    join public.job_offers offer on offer.id = parsed.job_offer_id
    on conflict on constraint job_matches_identity_key do update
    set
      score = excluded.score,
      eligibility_status = excluded.eligibility_status,
      score_components = excluded.score_components,
      hard_gates = excluded.hard_gates,
      reasons = excluded.reasons
    returning (xmax = 0) as created
  )
  select
    count(*) filter (where created),
    count(*) filter (where not created)
  into created_count, updated_count
  from upserted;

  return jsonb_build_object(
    'created', coalesce(created_count, 0),
    'updated', coalesce(updated_count, 0)
  );
end;
$$;

revoke all on function public.job_offer_matching_fingerprint(uuid)
from public, anon, authenticated;
revoke all on function public.find_existing_job_offers_batch(text, jsonb)
from public, anon, authenticated;
revoke all on function public.ingest_company_career_job_offers_batch(jsonb, timestamptz)
from public, anon, authenticated;
revoke all on function public.upsert_job_matches_batch(uuid, jsonb)
from public, anon, authenticated;

grant execute on function public.find_existing_job_offers_batch(text, jsonb)
to service_role;
grant execute on function public.ingest_company_career_job_offers_batch(jsonb, timestamptz)
to service_role;
grant execute on function public.upsert_job_matches_batch(uuid, jsonb)
to service_role;

commit;

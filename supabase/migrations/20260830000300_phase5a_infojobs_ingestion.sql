begin;

create or replace function public.find_existing_job_offer(
  p_source_code text,
  p_external_job_id text,
  p_canonical_source_url text,
  p_canonical_url text,
  p_canonical_url_is_reliable boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  source_id uuid;
  matched_offer_id uuid;
  matched_source_id uuid;
  matched_by text;
begin
  select id into source_id
  from public.job_sources
  where code = p_source_code;

  if source_id is not null and p_external_job_id is not null then
    select job_offer_id, id
    into matched_offer_id, matched_source_id
    from public.job_offer_sources
    where job_source_id = source_id
      and external_job_id = p_external_job_id;

    if found then matched_by := 'external_job_id'; end if;
  end if;

  if matched_offer_id is null
     and source_id is not null
     and p_canonical_source_url is not null then
    select job_offer_id, id
    into matched_offer_id, matched_source_id
    from public.job_offer_sources
    where job_source_id = source_id
      and canonical_source_url = p_canonical_source_url;

    if found then matched_by := 'canonical_source_url'; end if;
  end if;

  if matched_offer_id is null
     and p_canonical_url_is_reliable
     and p_canonical_url is not null then
    select id into matched_offer_id
    from public.job_offers
    where canonical_url = p_canonical_url
      and canonical_url_is_reliable;

    if found then matched_by := 'canonical_url'; end if;
  end if;

  if matched_offer_id is null then return null; end if;

  return jsonb_build_object(
    'job_offer_id', matched_offer_id,
    'job_offer_source_id', matched_source_id,
    'matched_by', matched_by
  );
end;
$$;

create or replace function public.ingest_job_offer(
  p_offer jsonb,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_code text := nullif(btrim(p_offer->>'source_code'), '');
  v_source_name text := nullif(btrim(p_offer->>'source_name'), '');
  v_external_job_id text := nullif(btrim(p_offer->>'external_job_id'), '');
  v_source_url text := nullif(btrim(p_offer->>'source_url'), '');
  v_canonical_source_url text := nullif(btrim(p_offer->>'canonical_source_url'), '');
  v_canonical_url text := nullif(btrim(p_offer->>'canonical_url'), '');
  v_canonical_url_is_reliable boolean := coalesce(
    (p_offer->>'canonical_url_is_reliable')::boolean,
    false
  );
  v_source_id uuid;
  v_company_id uuid;
  v_offer_id uuid;
  v_offer_source_id uuid;
  v_offer_created boolean := false;
  v_source_created boolean := false;
begin
  if v_source_code is null
     or v_source_name is null
     or v_source_url is null
     or v_canonical_source_url is null
     or nullif(btrim(p_offer->>'title'), '') is null then
    raise exception 'Missing required normalized offer fields' using errcode = '23502';
  end if;

  if v_canonical_url_is_reliable and v_canonical_url is null then
    raise exception 'Reliable canonical URL is missing' using errcode = '23514';
  end if;

  insert into public.job_sources (code, name, base_url)
  values (v_source_code, v_source_name, nullif(btrim(p_offer->>'source_base_url'), ''))
  on conflict (code) do update
  set
    name = excluded.name,
    base_url = coalesce(excluded.base_url, public.job_sources.base_url)
  returning id into v_source_id;

  if nullif(btrim(p_offer->>'company_name'), '') is not null then
    insert into public.companies (name, website_url)
    values (
      btrim(p_offer->>'company_name'),
      nullif(btrim(p_offer->>'company_website_url'), '')
    )
    on conflict (normalized_name) do update
    set website_url = coalesce(
      public.companies.website_url,
      excluded.website_url
    )
    returning id into v_company_id;
  end if;

  -- A stable lock order makes concurrent retries deterministic.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'job-source-url:' || v_source_id::text || ':' || v_canonical_source_url,
      0
    )
  );
  if v_external_job_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'job-external-id:' || v_source_id::text || ':' || v_external_job_id,
        0
      )
    );
  end if;
  if v_canonical_url_is_reliable then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('job-canonical-url:' || v_canonical_url, 0)
    );
  end if;

  if v_external_job_id is not null then
    select id, job_offer_id
    into v_offer_source_id, v_offer_id
    from public.job_offer_sources
    where job_source_id = v_source_id
      and job_offer_sources.external_job_id = v_external_job_id;
  end if;

  if v_offer_source_id is null then
    select id, job_offer_id
    into v_offer_source_id, v_offer_id
    from public.job_offer_sources
    where job_source_id = v_source_id
      and job_offer_sources.canonical_source_url = v_canonical_source_url;
  end if;

  if v_offer_source_id is not null then
    update public.job_offers
    set
      company_id = coalesce(v_company_id, job_offers.company_id),
      title = p_offer->>'title',
      description = coalesce(p_offer->>'description', job_offers.description),
      location_text = coalesce(p_offer->>'location_text', job_offers.location_text),
      country_code = coalesce(p_offer->>'country_code', job_offers.country_code),
      region = coalesce(p_offer->>'region', job_offers.region),
      city = coalesce(p_offer->>'city', job_offers.city),
      work_mode = coalesce(
        nullif(p_offer->>'work_mode', '')::public.job_work_mode,
        job_offers.work_mode
      ),
      seniority = coalesce(p_offer->>'seniority', job_offers.seniority),
      employment_type = coalesce(
        p_offer->>'employment_type',
        job_offers.employment_type
      ),
      salary_min = coalesce(
        nullif(p_offer->>'salary_min', '')::numeric,
        job_offers.salary_min
      ),
      salary_max = coalesce(
        nullif(p_offer->>'salary_max', '')::numeric,
        job_offers.salary_max
      ),
      salary_currency = coalesce(
        p_offer->>'salary_currency',
        job_offers.salary_currency
      ),
      published_at = coalesce(
        nullif(p_offer->>'published_at', '')::timestamptz,
        job_offers.published_at
      ),
      last_seen_at = greatest(job_offers.last_seen_at, p_observed_at),
      canonical_url = coalesce(v_canonical_url, job_offers.canonical_url),
      canonical_url_is_reliable = (
        job_offers.canonical_url_is_reliable or v_canonical_url_is_reliable
      ),
      status = coalesce(
        nullif(p_offer->>'status', '')::public.job_offer_status,
        job_offers.status
      )
    where id = v_offer_id;

    update public.job_offer_sources
    set
      external_job_id = coalesce(
        job_offer_sources.external_job_id,
        v_external_job_id
      ),
      source_url = v_source_url,
      canonical_source_url = v_canonical_source_url,
      last_seen_at = greatest(job_offer_sources.last_seen_at, p_observed_at),
      raw_payload = p_offer->'raw_payload'
    where id = v_offer_source_id;

    return jsonb_build_object(
      'job_offer_id', v_offer_id,
      'job_offer_source_id', v_offer_source_id,
      'offer_created', false,
      'source_created', false
    );
  end if;

  if v_canonical_url_is_reliable then
    select id into v_offer_id
    from public.job_offers
    where job_offers.canonical_url = v_canonical_url
      and job_offers.canonical_url_is_reliable;
  end if;

  if v_offer_id is null then
    insert into public.job_offers (
      company_id, title, description, location_text, country_code, region, city,
      work_mode, seniority, employment_type, salary_min, salary_max,
      salary_currency, published_at, first_seen_at, last_seen_at, canonical_url,
      canonical_url_is_reliable, status
    ) values (
      v_company_id,
      p_offer->>'title',
      p_offer->>'description',
      p_offer->>'location_text',
      p_offer->>'country_code',
      p_offer->>'region',
      p_offer->>'city',
      coalesce(nullif(p_offer->>'work_mode', '')::public.job_work_mode, 'UNKNOWN'),
      p_offer->>'seniority',
      p_offer->>'employment_type',
      nullif(p_offer->>'salary_min', '')::numeric,
      nullif(p_offer->>'salary_max', '')::numeric,
      p_offer->>'salary_currency',
      nullif(p_offer->>'published_at', '')::timestamptz,
      p_observed_at,
      p_observed_at,
      v_canonical_url,
      v_canonical_url_is_reliable,
      coalesce(nullif(p_offer->>'status', '')::public.job_offer_status, 'ACTIVE')
    )
    returning id into v_offer_id;
    v_offer_created := true;
  else
    update public.job_offers
    set
      company_id = coalesce(v_company_id, job_offers.company_id),
      description = coalesce(p_offer->>'description', job_offers.description),
      last_seen_at = greatest(job_offers.last_seen_at, p_observed_at)
    where id = v_offer_id;
  end if;

  insert into public.job_offer_sources (
    job_offer_id, job_source_id, external_job_id, source_url,
    canonical_source_url, first_seen_at, last_seen_at, raw_payload
  ) values (
    v_offer_id,
    v_source_id,
    v_external_job_id,
    v_source_url,
    v_canonical_source_url,
    p_observed_at,
    p_observed_at,
    p_offer->'raw_payload'
  )
  returning id into v_offer_source_id;
  v_source_created := true;

  return jsonb_build_object(
    'job_offer_id', v_offer_id,
    'job_offer_source_id', v_offer_source_id,
    'offer_created', v_offer_created,
    'source_created', v_source_created
  );
end;
$$;

revoke all on function public.find_existing_job_offer(text, text, text, text, boolean)
from public, anon, authenticated;
revoke all on function public.ingest_job_offer(jsonb, timestamptz)
from public, anon, authenticated;

grant execute on function public.find_existing_job_offer(text, text, text, text, boolean)
to service_role;
grant execute on function public.ingest_job_offer(jsonb, timestamptz)
to service_role;

commit;

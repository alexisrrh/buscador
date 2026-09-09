-- Runtime validation for catalog pagination and observation semantics. All synthetic data rolls back.
begin;

set local role service_role;

do $$
declare
  source_id uuid := '2c000000-0000-4000-8000-000000000001';
  offer_id uuid;
  first_seen timestamptz;
  second_seen timestamptz;
  source_seen timestamptz;
  first_result jsonb;
  second_result jsonb;
  payload jsonb;
begin
  insert into public.companies (id, name, website_url)
  values ('2c000000-0000-4000-8000-000000000002', 'Synthetic Jobicy', 'https://jobicy.example.invalid');

  insert into public.company_career_sources (
    id, company_id, platform, identifier, careers_url, enabled, status
  ) values (
    source_id, '2c000000-0000-4000-8000-000000000002', 'JOBICY',
    'synthetic-europe-engineering', 'https://jobicy.example.invalid/jobs', true, 'UNKNOWN'
  );

  payload := jsonb_build_array(jsonb_build_object(
    'batch_index', 0,
    'company_career_source_id', source_id,
    'source_code', 'JOBICY',
    'source_name', 'Jobicy',
    'source_base_url', 'https://jobicy.example.invalid',
    'external_job_id', 'unchanged-observation',
    'source_url', 'https://jobicy.example.invalid/offer/unchanged-observation',
    'canonical_source_url', 'https://jobicy.example.invalid/offer/unchanged-observation',
    'title', 'Synthetic Frontend Developer',
    'work_mode', 'REMOTE',
    'canonical_url', 'https://jobicy.example.invalid/offer/unchanged-observation',
    'canonical_url_is_reliable', true,
    'status', 'ACTIVE',
    'raw_payload', jsonb_build_object('fixture', 'unchanged-observation')
  ));

  first_result := public.ingest_company_career_job_offers_batch(payload, '2026-09-09T10:00:00Z');
  offer_id := (first_result->'results'->0->>'job_offer_id')::uuid;

  select last_seen_at into first_seen from public.job_offers where id = offer_id;
  second_result := public.ingest_company_career_job_offers_batch(payload, '2026-09-09T11:00:00Z');
  select last_seen_at into second_seen from public.job_offers where id = offer_id;
  select jos.last_seen_at into source_seen from public.job_offer_sources jos where jos.job_offer_id = offer_id;

  if first_seen <> '2026-09-09T10:00:00Z'::timestamptz
     or second_seen <> '2026-09-09T11:00:00Z'::timestamptz
     or source_seen <> '2026-09-09T11:00:00Z'::timestamptz
     or second_result->'results'->0->>'outcome' <> 'UNCHANGED'
     or (second_result->'results'->0->>'source_created')::boolean is not false then
    raise exception 'UNCHANGED_OBSERVATION_FAILED first=% second=% source=% result=%',
      first_seen, second_seen, source_seen, second_result;
  end if;

  raise notice 'PASS UNCHANGED_REINGESTION_REFRESHES_LAST_SEEN';
end;
$$;

rollback;

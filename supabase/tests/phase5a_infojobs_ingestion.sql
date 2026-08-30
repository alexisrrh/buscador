-- Runtime validation for Phase 5A. All synthetic data is rolled back.
begin;

set local role service_role;

do $$
declare
  first_result jsonb;
  second_result jsonb;
  source_count integer;
  offer_count integer;
  link_count integer;
  stored_first_seen timestamptz;
  stored_last_seen timestamptz;
begin
  first_result := public.ingest_job_offer(
    jsonb_build_object(
      'source_code', 'INFOJOBS',
      'source_name', 'InfoJobs',
      'source_base_url', 'https://www.infojobs.net',
      'external_job_id', 'synthetic-infojobs-001',
      'source_url', 'https://www.infojobs.net/synthetic/of-i001?utm_source=first',
      'canonical_source_url', 'https://www.infojobs.net/synthetic/of-i001',
      'company_name', '  Synthetic   Source Company  ',
      'company_website_url', 'https://source-company.example.invalid',
      'title', 'Synthetic API Engineer',
      'description', 'Synthetic InfoJobs fixture description.',
      'location_text', 'Synthetic City, Synthetic Province',
      'country_code', 'ES',
      'region', 'Synthetic Province',
      'city', 'Synthetic City',
      'work_mode', 'UNKNOWN',
      'employment_type', 'Synthetic contract',
      'salary_min', 30000,
      'salary_max', 40000,
      'salary_currency', 'EUR',
      'published_at', '2026-08-28T09:00:00Z',
      'canonical_url', 'https://www.infojobs.net/synthetic/of-i001',
      'canonical_url_is_reliable', true,
      'status', 'ACTIVE',
      'raw_payload', jsonb_build_object('fixture', true, 'run', 1)
    ),
    '2026-08-30T08:00:00Z'
  );

  second_result := public.ingest_job_offer(
    jsonb_build_object(
      'source_code', 'INFOJOBS',
      'source_name', 'InfoJobs',
      'source_base_url', 'https://www.infojobs.net',
      'external_job_id', 'synthetic-infojobs-001',
      'source_url', 'https://www.infojobs.net/synthetic/of-i001?utm_medium=second',
      'canonical_source_url', 'https://www.infojobs.net/synthetic/of-i001',
      'company_name', 'SYNTHETIC SOURCE COMPANY',
      'title', 'Synthetic API Engineer',
      'description', 'Synthetic InfoJobs fixture description.',
      'work_mode', 'UNKNOWN',
      'canonical_url', 'https://www.infojobs.net/synthetic/of-i001',
      'canonical_url_is_reliable', true,
      'status', 'ACTIVE',
      'raw_payload', jsonb_build_object('fixture', true, 'run', 2)
    ),
    '2026-08-30T09:00:00Z'
  );

  select count(*) into source_count
  from public.job_sources where code = 'INFOJOBS';

  select count(*), min(first_seen_at), max(last_seen_at)
  into offer_count, stored_first_seen, stored_last_seen
  from public.job_offers
  where canonical_url = 'https://www.infojobs.net/synthetic/of-i001';

  select count(*) into link_count
  from public.job_offer_sources jos
  join public.job_sources js on js.id = jos.job_source_id
  where js.code = 'INFOJOBS'
    and jos.external_job_id = 'synthetic-infojobs-001';

  if source_count <> 1
     or offer_count <> 1
     or link_count <> 1
     or stored_first_seen <> '2026-08-30T08:00:00Z'::timestamptz
     or stored_last_seen <> '2026-08-30T09:00:00Z'::timestamptz
     or (first_result->>'offer_created')::boolean is not true
     or (first_result->>'source_created')::boolean is not true
     or (second_result->>'offer_created')::boolean is not false
     or (second_result->>'source_created')::boolean is not false then
    raise exception
      'IDEMPOTENT_INGESTION_FAILED sources=% offers=% links=% first=% last=% first_result=% second_result=%',
      source_count,
      offer_count,
      link_count,
      stored_first_seen,
      stored_last_seen,
      first_result,
      second_result;
  end if;

  raise notice 'PASS INFOJOBS_IDEMPOTENT_INGESTION';
end;
$$;

reset role;
set local role authenticated;

do $$
begin
  begin
    perform public.find_existing_job_offer(
      'INFOJOBS',
      'synthetic-infojobs-001',
      'https://www.infojobs.net/synthetic/of-i001',
      'https://www.infojobs.net/synthetic/of-i001',
      true
    );
    raise exception 'AUTHENTICATED_INGESTION_RPC_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    raise notice 'PASS AUTHENTICATED_INGESTION_RPC_BLOCKED';
  end;
end;
$$;

reset role;

select array[
  'INFOJOBS_SOURCE_REUSED',
  'EXTERNAL_JOB_ID_DEDUP',
  'CANONICAL_SOURCE_URL_DEDUP',
  'TWO_RUNS_ONE_JOB_OFFER_SOURCE',
  'FIRST_LAST_SEEN_MAINTAINED',
  'AUTHENTICATED_INGESTION_RPC_BLOCKED'
] as passed_runtime_checks;

rollback;

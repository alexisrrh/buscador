-- Runtime validation for Phase 5B. All synthetic data is rolled back.
begin;

set local role service_role;

insert into public.companies (id, name, website_url, careers_url)
values (
  'a0000000-0000-0000-0000-000000000001',
  'Synthetic Careers Company',
  'https://synthetic-careers.example.invalid',
  'https://synthetic-careers.example.invalid/jobs'
);

insert into public.company_career_sources (
  id, company_id, platform, identifier, careers_url
) values
  (
    'a1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'LEVER',
    'synthetic-lever-site',
    'https://jobs.lever.co/synthetic-lever-site'
  ),
  (
    'a2000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'ASHBY',
    'synthetic-ashby-board',
    'https://jobs.ashbyhq.com/synthetic-ashby-board'
  );

do $$
declare
  lever_result jsonb;
  lever_repeat jsonb;
  ashby_result jsonb;
  ashby_repeat jsonb;
  offer_count integer;
  source_link_count integer;
  official_link_count integer;
  source_count integer;
  stored_company_id uuid;
  stored_first_seen timestamptz;
  stored_last_seen timestamptz;
begin
  lever_result := public.ingest_company_career_job_offer(
    jsonb_build_object(
      'company_career_source_id', 'a1000000-0000-0000-0000-000000000001',
      'source_code', 'LEVER',
      'source_name', 'Lever',
      'source_base_url', 'https://api.lever.co',
      'external_job_id', 'lever-synthetic-shared',
      'source_url', 'https://jobs.lever.co/synthetic-lever-site/shared?utm_source=first',
      'canonical_source_url', 'https://jobs.lever.co/synthetic-lever-site/shared',
      'title', 'Synthetic Shared ATS Engineer',
      'description', 'Synthetic public ATS description.',
      'location_text', 'Remote',
      'work_mode', 'REMOTE',
      'employment_type', 'Full-time',
      'canonical_url', 'https://synthetic-careers.example.invalid/jobs/shared',
      'canonical_url_is_reliable', true,
      'status', 'ACTIVE',
      'raw_payload', jsonb_build_object('fixture', 'lever')
    ),
    '2026-08-30T08:00:00Z'
  );

  lever_repeat := public.ingest_company_career_job_offer(
    jsonb_build_object(
      'company_career_source_id', 'a1000000-0000-0000-0000-000000000001',
      'source_code', 'LEVER',
      'source_name', 'Lever',
      'source_base_url', 'https://api.lever.co',
      'external_job_id', 'lever-synthetic-shared',
      'source_url', 'https://jobs.lever.co/synthetic-lever-site/shared?utm_medium=repeat',
      'canonical_source_url', 'https://jobs.lever.co/synthetic-lever-site/shared',
      'title', 'Synthetic Shared ATS Engineer',
      'work_mode', 'REMOTE',
      'canonical_url', 'https://synthetic-careers.example.invalid/jobs/shared',
      'canonical_url_is_reliable', true,
      'status', 'ACTIVE'
    ),
    '2026-08-30T09:00:00Z'
  );

  ashby_result := public.ingest_company_career_job_offer(
    jsonb_build_object(
      'company_career_source_id', 'a2000000-0000-0000-0000-000000000002',
      'source_code', 'ASHBY',
      'source_name', 'Ashby',
      'source_base_url', 'https://api.ashbyhq.com',
      'external_job_id', 'ashby-synthetic-shared',
      'source_url', 'https://jobs.ashbyhq.com/synthetic-ashby-board/shared?utm_campaign=first',
      'canonical_source_url', 'https://jobs.ashbyhq.com/synthetic-ashby-board/shared',
      'title', 'Synthetic Shared ATS Engineer',
      'description', 'Synthetic public ATS description.',
      'location_text', 'Remote',
      'work_mode', 'REMOTE',
      'employment_type', 'FullTime',
      'canonical_url', 'https://synthetic-careers.example.invalid/jobs/shared',
      'canonical_url_is_reliable', true,
      'status', 'ACTIVE',
      'raw_payload', jsonb_build_object('fixture', 'ashby')
    ),
    '2026-08-30T08:30:00Z'
  );

  ashby_repeat := public.ingest_company_career_job_offer(
    jsonb_build_object(
      'company_career_source_id', 'a2000000-0000-0000-0000-000000000002',
      'source_code', 'ASHBY',
      'source_name', 'Ashby',
      'source_base_url', 'https://api.ashbyhq.com',
      'external_job_id', 'ashby-synthetic-shared',
      'source_url', 'https://jobs.ashbyhq.com/synthetic-ashby-board/shared?utm_term=repeat',
      'canonical_source_url', 'https://jobs.ashbyhq.com/synthetic-ashby-board/shared',
      'title', 'Synthetic Shared ATS Engineer',
      'work_mode', 'REMOTE',
      'canonical_url', 'https://synthetic-careers.example.invalid/jobs/shared',
      'canonical_url_is_reliable', true,
      'status', 'ACTIVE'
    ),
    '2026-08-30T09:00:00Z'
  );

  select count(*), (array_agg(company_id))[1], min(first_seen_at), max(last_seen_at)
  into offer_count, stored_company_id, stored_first_seen, stored_last_seen
  from public.job_offers
  where canonical_url = 'https://synthetic-careers.example.invalid/jobs/shared';

  select count(*), count(company_career_source_id), count(distinct job_source_id)
  into source_link_count, official_link_count, source_count
  from public.job_offer_sources
  where job_offer_id = (lever_result->>'job_offer_id')::uuid;

  if offer_count <> 1
     or source_link_count <> 2
     or official_link_count <> 2
     or source_count <> 2
     or stored_company_id <> 'a0000000-0000-0000-0000-000000000001'::uuid
     or stored_first_seen <> '2026-08-30T08:00:00Z'::timestamptz
     or stored_last_seen <> '2026-08-30T09:00:00Z'::timestamptz
     or (lever_result->>'offer_created')::boolean is not true
     or (lever_repeat->>'source_created')::boolean is not false
     or (ashby_result->>'offer_created')::boolean is not false
     or (ashby_result->>'source_created')::boolean is not true
     or (ashby_repeat->>'source_created')::boolean is not false then
    raise exception
      'ATS_DEDUP_FAILED offers=% links=% official=% sources=% company=% first=% last=%',
      offer_count,
      source_link_count,
      official_link_count,
      source_count,
      stored_company_id,
      stored_first_seen,
      stored_last_seen;
  end if;

  raise notice 'PASS ATS_OFFICIAL_CROSS_SOURCE_IDEMPOTENT_DEDUP';
end;
$$;

select public.record_company_career_source_check(
  'a1000000-0000-0000-0000-000000000001',
  true,
  null,
  '2026-08-30T09:05:00Z'
);

select public.record_company_career_source_check(
  'a2000000-0000-0000-0000-000000000002',
  false,
  'SYNTHETIC_UPSTREAM_ERROR',
  '2026-08-30T09:05:00Z'
);

do $$
declare
  lever_status public.company_career_status;
  lever_success timestamptz;
  ashby_status public.company_career_status;
  ashby_error text;
begin
  select status, last_success_at
  into lever_status, lever_success
  from public.company_career_sources
  where id = 'a1000000-0000-0000-0000-000000000001';

  select status, last_error_code
  into ashby_status, ashby_error
  from public.company_career_sources
  where id = 'a2000000-0000-0000-0000-000000000002';

  if lever_status <> 'ACTIVE'
     or lever_success <> '2026-08-30T09:05:00Z'::timestamptz
     or ashby_status <> 'DEGRADED'
     or ashby_error <> 'SYNTHETIC_UPSTREAM_ERROR' then
    raise exception
      'CAREER_CHECK_STATUS_FAILED lever=% success=% ashby=% error=%',
      lever_status,
      lever_success,
      ashby_status,
      ashby_error;
  end if;
  raise notice 'PASS CAREER_SOURCE_CHECK_STATUS';
end;
$$;

reset role;
set local role authenticated;

do $$
begin
  begin
    update public.company_career_sources set status = 'ACTIVE';
    raise exception 'AUTHENTICATED_CAREER_SOURCE_UPDATE_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    null;
  end;

  begin
    update public.job_offers set status = 'REMOVED';
    raise exception 'AUTHENTICATED_JOB_OFFER_UPDATE_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    raise notice 'PASS AUTHENTICATED_GLOBAL_WRITES_BLOCKED';
  end;
end;
$$;

reset role;

select array[
  'COMPANY_CAREER_SOURCE_MULTI_PLATFORM',
  'LEVER_ASHBY_JOB_SOURCES',
  'OFFICIAL_SOURCE_DERIVED_BY_FOREIGN_KEY',
  'EXTERNAL_ID_AND_URL_DEDUP',
  'CROSS_SOURCE_CANONICAL_URL_DEDUP',
  'DOUBLE_EXECUTION_IDEMPOTENT',
  'CAREER_SOURCE_STATUS_TRACKING',
  'AUTHENTICATED_GLOBAL_WRITES_BLOCKED'
] as passed_runtime_checks;

rollback;

-- Runtime validation for the Phase 3 database API. All synthetic data rolls back.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'phase3-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'phase3-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.candidate_profiles (
  id, user_id, name, headline, job_family, seniority
)
values (
  '51000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  'Synthetic A',
  'Synthetic headline',
  'Engineering',
  'MID'
);

select set_config(
  'phase3.search_id',
  public.save_search_profile(
    null,
    '51000000-0000-0000-0000-000000000001',
    '{"name":"Synthetic search","frequency_type":"DAILY","frequency_value":{"time":"09:00"},"timezone":"Europe/Madrid","notification_min_score":70,"semi_auto_min_score":80,"auto_apply_min_score":90,"daily_application_limit":0}'::jsonb,
    '{"keywords":["typescript"],"target_titles":["Frontend Developer"],"excluded_titles":[],"locations":[{"label":"Spain"}],"work_modes":["REMOTE"],"minimum_salary":30000,"currency":"EUR","accepted_seniorities":["MID"],"minimum_experience_years":1,"maximum_experience_years":4,"required_technologies":["TypeScript"],"excluded_technologies":[],"languages":[{"code":"es"}],"contract_types":["FULL_TIME"]}'::jsonb
  )->>'id',
  true
);

do $$
declare
  search_id uuid := current_setting('phase3.search_id')::uuid;
  search_version integer;
  preferences_count integer;
begin
  select version into search_version
  from public.search_profiles
  where id = search_id;

  select count(*) into preferences_count
  from public.job_preferences
  where search_profile_id = search_id;

  if search_version <> 1 or preferences_count <> 1 then
    raise exception 'SEARCH_CREATE_FAILED version=% preferences=%', search_version, preferences_count;
  end if;
  raise notice 'PASS SEARCH_CREATE_ATOMIC';
end;
$$;

select public.save_search_profile(
  current_setting('phase3.search_id')::uuid,
  '51000000-0000-0000-0000-000000000001',
  '{"name":"Synthetic search edited","frequency_type":"WEEKDAYS","frequency_value":{"time":"10:00","days":[1,2,3,4,5]},"timezone":"Europe/Madrid","notification_min_score":65,"semi_auto_min_score":80,"auto_apply_min_score":95,"daily_application_limit":2}'::jsonb,
  '{"keywords":["typescript","react"],"target_titles":["Frontend Developer"],"excluded_titles":[],"locations":[{"label":"Spain"}],"work_modes":["REMOTE","HYBRID"],"minimum_salary":32000,"currency":"EUR","accepted_seniorities":["MID"],"minimum_experience_years":1,"maximum_experience_years":5,"required_technologies":["TypeScript"],"excluded_technologies":[],"languages":[{"code":"es"}],"contract_types":["FULL_TIME"]}'::jsonb
);

do $$
declare
  search_id uuid := current_setting('phase3.search_id')::uuid;
  search_version integer;
  preference_versions integer[];
begin
  select version into search_version from public.search_profiles where id = search_id;
  select array_agg(search_profile_version order by search_profile_version)
  into preference_versions
  from public.job_preferences
  where search_profile_id = search_id;

  if search_version <> 2 or preference_versions <> array[1, 2] then
    raise exception 'SEARCH_VERSIONING_FAILED version=% preferences=%', search_version, preference_versions;
  end if;
  raise notice 'PASS SEARCH_VERSIONING';
end;
$$;

insert into public.resumes (
  id, user_id, candidate_profile_id, version, status, original_filename,
  mime_type, file_size_bytes, content_sha256
)
values
  ('52000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 1, 'READY', 'a-v1.pdf', 'application/pdf', 100, repeat('a', 64)),
  ('52000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 2, 'READY', 'a-v2.pdf', 'application/pdf', 100, repeat('b', 64));

select public.approve_resume('52000000-0000-0000-0000-000000000001');
select public.approve_resume('52000000-0000-0000-0000-000000000002');

do $$
declare
  approved_id uuid;
  archived_count integer;
begin
  select id into approved_id from public.resumes where status = 'APPROVED';
  select count(*) into archived_count from public.resumes where status = 'ARCHIVED';
  if approved_id <> '52000000-0000-0000-0000-000000000002' or archived_count <> 1 then
    raise exception 'APPROVAL_RPC_FAILED approved=% archived=%', approved_id, archived_count;
  end if;
  raise notice 'PASS APPROVAL_RPC';
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.candidate_profiles (id, user_id, name)
values ('61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 'Synthetic B');

do $$
begin
  begin
    perform public.save_search_profile(
      null,
      '51000000-0000-0000-0000-000000000001',
      '{"name":"Forbidden","frequency_type":"DAILY","frequency_value":{},"timezone":"UTC","notification_min_score":70,"semi_auto_min_score":80,"auto_apply_min_score":90,"daily_application_limit":0}'::jsonb,
      '{}'::jsonb
    );
    raise exception 'CROSS_TENANT_SEARCH_UNEXPECTED_SUCCESS';
  exception when no_data_found then
    raise notice 'PASS CROSS_TENANT_SEARCH_RPC sqlstate=%', sqlstate;
  end;
end;
$$;

do $$
begin
  begin
    perform public.approve_resume('52000000-0000-0000-0000-000000000001');
    raise exception 'CROSS_TENANT_APPROVAL_UNEXPECTED_SUCCESS';
  exception when no_data_found then
    raise notice 'PASS CROSS_TENANT_APPROVAL_RPC sqlstate=%', sqlstate;
  end;
end;
$$;

select array[
  'CANDIDATE_PROFILE_WEB_FIELDS',
  'SEARCH_CREATE_ATOMIC',
  'SEARCH_VERSIONED_EDIT',
  'APPROVAL_ATOMIC_ROTATION',
  'RPC_CROSS_TENANT_BLOCKED'
] as passed_runtime_checks;

reset role;
rollback;

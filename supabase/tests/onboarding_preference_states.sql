-- Runtime validation for explicit onboarding preference states. All synthetic data rolls back.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '94000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'onboarding-state-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '94000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'onboarding-state-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.candidate_profiles (id, user_id, name)
values ('94000000-0000-0000-0000-000000000011', '94000000-0000-0000-0000-000000000001', 'Onboarding A');

select set_config('onboarding.search_id', public.save_search_profile(
  null,
  '94000000-0000-0000-0000-000000000011',
  '{"name":"Frontend Developer","frequency_type":"DAILY","frequency_value":{"time":"09:00"},"timezone":"Europe/Madrid","notification_min_score":70,"semi_auto_min_score":80,"auto_apply_min_score":90,"daily_application_limit":0}'::jsonb,
  '{"keywords":["typescript"],"target_titles":["Frontend Developer"],"excluded_titles":[],"locations":[],"work_modes":[],"minimum_salary":null,"currency":null,"accepted_seniorities":[],"minimum_experience_years":null,"maximum_experience_years":null,"required_technologies":["TypeScript"],"excluded_technologies":[],"languages":[{"code":"es"}],"contract_types":["FULL_TIME"]}'::jsonb
)->>'id', true);

do $$
declare
  location_state public.onboarding_preference_state;
  mode_state public.onboarding_preference_state;
  salary_state public.onboarding_preference_state;
  technologies text[];
begin
  select location_preference_state, work_mode_preference_state, salary_preference_state, required_technologies
  into location_state, mode_state, salary_state, technologies
  from public.job_preferences
  where search_profile_id = current_setting('onboarding.search_id')::uuid;
  if location_state <> 'UNKNOWN' or mode_state <> 'UNKNOWN' or salary_state <> 'UNKNOWN' or technologies <> array['TypeScript'] then
    raise exception 'DEFAULT_OR_COMPATIBILITY_FAILED location=% mode=% salary=% technologies=%', location_state, mode_state, salary_state, technologies;
  end if;
  raise notice 'PASS DEFAULT_UNKNOWN_AND_LEGACY_RPC';
end;
$$;

select public.save_search_profile(
  current_setting('onboarding.search_id')::uuid,
  '94000000-0000-0000-0000-000000000011',
  '{"name":"Frontend Developer","frequency_type":"DAILY","frequency_value":{"time":"09:00"},"timezone":"Europe/Madrid","notification_min_score":70,"semi_auto_min_score":80,"auto_apply_min_score":90,"daily_application_limit":0}'::jsonb,
  '{"keywords":["typescript"],"target_titles":["Frontend Developer"],"excluded_titles":[],"locations":[],"work_modes":[],"minimum_salary":null,"currency":null,"accepted_seniorities":[],"minimum_experience_years":null,"maximum_experience_years":null,"required_technologies":["TypeScript"],"excluded_technologies":[],"languages":[{"code":"es"}],"contract_types":["FULL_TIME"],"location_preference_state":"UNRESTRICTED","work_mode_preference_state":"UNRESTRICTED","salary_preference_state":"UNRESTRICTED"}'::jsonb
);

do $$
declare states public.onboarding_preference_state[];
begin
  select array[location_preference_state, work_mode_preference_state, salary_preference_state]
  into states
  from public.job_preferences
  where search_profile_id = current_setting('onboarding.search_id')::uuid
  order by search_profile_version desc limit 1;
  if states <> array['UNRESTRICTED', 'UNRESTRICTED', 'UNRESTRICTED']::public.onboarding_preference_state[] then
    raise exception 'UNRESTRICTED_STATE_FAILED states=%', states;
  end if;
  raise notice 'PASS UNRESTRICTED_STATES';
end;
$$;

do $$
begin
  begin
    update public.job_preferences
    set location_preference_state = 'SPECIFIED'
    where search_profile_id = current_setting('onboarding.search_id')::uuid
      and search_profile_version = 2;
    raise exception 'SPECIFIED_EMPTY_LOCATION_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS SPECIFIED_LOCATION_CONSTRAINT';
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '94000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.candidate_profiles (id, user_id, name)
values ('94000000-0000-0000-0000-000000000012', '94000000-0000-0000-0000-000000000002', 'Onboarding B');

do $$
begin
  begin
    perform public.save_search_profile(
      null,
      '94000000-0000-0000-0000-000000000011',
      '{"name":"Forbidden","frequency_type":"DAILY","frequency_value":{},"timezone":"UTC","notification_min_score":70,"semi_auto_min_score":80,"auto_apply_min_score":90,"daily_application_limit":0}'::jsonb,
      '{}'::jsonb
    );
    raise exception 'CROSS_TENANT_RPC_UNEXPECTED_SUCCESS';
  exception when no_data_found then
    raise notice 'PASS OWNERSHIP_UNCHANGED';
  end;
end;
$$;

select array['DEFAULT_UNKNOWN_AND_LEGACY_RPC', 'UNRESTRICTED_STATES', 'SPECIFIED_LOCATION_CONSTRAINT', 'OWNERSHIP_UNCHANGED'] as passed_runtime_checks;
reset role;
rollback;

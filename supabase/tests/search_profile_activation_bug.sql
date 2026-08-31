-- Regression for DRAFT -> ACTIVE onboarding. Synthetic data only; rolled back.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '71000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'activation-owner@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'activation-other@example.invalid', '', now(), '{}', '{}', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.candidate_profiles (id, user_id, name)
values ('71100000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'Synthetic activation profile');

select set_config(
  'activation.search_id',
  public.save_search_profile(
    null,
    '71100000-0000-0000-0000-000000000001',
    '{"name":"Synthetic draft","frequency_type":"INTERVAL","frequency_value":{"minutes":60},"timezone":"Europe/Madrid","notification_min_score":70,"semi_auto_min_score":80,"auto_apply_min_score":90,"daily_application_limit":0}',
    '{"keywords":["frontend"],"target_titles":["Frontend Developer"],"excluded_titles":[],"locations":[],"work_modes":["REMOTE"],"minimum_salary":null,"currency":"EUR","accepted_seniorities":["MID"],"minimum_experience_years":0,"maximum_experience_years":5,"required_technologies":["TypeScript"],"excluded_technologies":[],"languages":[{"code":"es"}],"contract_types":["FULL_TIME"]}'
  )->>'id',
  true
);

do $$
declare
  search_id uuid := current_setting('activation.search_id')::uuid;
  before_activation timestamptz := clock_timestamp();
  original_version integer;
  preference_count integer;
begin
  select version into original_version from public.search_profiles where id = search_id and status = 'DRAFT';
  if original_version is null then
    raise exception 'SAVE_ACTIVATED_SILENTLY';
  end if;

  perform public.transition_search_profile_status(search_id, 'ACTIVE');
  if not exists (
    select 1 from public.search_profiles
    where id = search_id
      and status = 'ACTIVE'
      and version = original_version
      and next_run_at between before_activation + interval '59 minutes' and before_activation + interval '61 minutes'
  ) then
    raise exception 'DRAFT_ACTIVATION_OR_NEXT_RUN_FAILED';
  end if;

  select count(*) into preference_count from public.job_preferences where search_profile_id = search_id;
  if preference_count <> 1 then
    raise exception 'ACTIVATION_CHANGED_PREFERENCES count=%', preference_count;
  end if;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '72000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  begin
    perform public.transition_search_profile_status(current_setting('activation.search_id')::uuid, 'PAUSED');
    raise exception 'CROSS_USER_ACTIVATION_UNEXPECTED_SUCCESS';
  exception when no_data_found then
    null;
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  search_id uuid := current_setting('activation.search_id')::uuid;
begin
  perform public.transition_search_profile_status(search_id, 'PAUSED');
  if not exists (select 1 from public.search_profiles where id = search_id and status = 'PAUSED' and next_run_at is null) then
    raise exception 'ACTIVE_TO_PAUSED_FAILED';
  end if;

  perform public.transition_search_profile_status(search_id, 'ACTIVE');
  if not exists (select 1 from public.search_profiles where id = search_id and status = 'ACTIVE' and next_run_at is not null) then
    raise exception 'PAUSED_TO_ACTIVE_FAILED';
  end if;

  raise notice 'PASS SEARCH_PROFILE_ACTIVATION_REGRESSION';
end;
$$;

rollback;

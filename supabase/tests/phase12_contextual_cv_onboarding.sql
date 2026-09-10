-- Runtime validation for contextual CV onboarding. All synthetic data rolls back.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '92000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'phase12-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '92000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'phase12-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '92000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'phase12-c@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000001', true);

do $$
declare
  first_id uuid;
  second_id uuid;
  created_count integer;
begin
  select candidate_profile_id into first_id from public.ensure_contextual_candidate_profile();
  select candidate_profile_id into second_id from public.ensure_contextual_candidate_profile();
  select count(*) into created_count from public.candidate_profiles where user_id = auth.uid() and deleted_at is null;
  if first_id is null or first_id <> second_id or created_count <> 1 then
    raise exception 'ENSURE_NOT_IDEMPOTENT first=% second=% count=%', first_id, second_id, created_count;
  end if;
  raise notice 'PASS ENSURE_IDEMPOTENT profile=%', first_id;
end;
$$;

select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000002', true);
do $$
declare
  b_id uuid;
  visible_count integer;
begin
  select candidate_profile_id into b_id from public.ensure_contextual_candidate_profile();
  select count(*) into visible_count from public.candidate_profiles;
  if b_id is null or visible_count <> 1 then
    raise exception 'CROSS_USER_ISOLATION_FAILED profile=% visible=%', b_id, visible_count;
  end if;
  raise notice 'PASS CROSS_USER_ISOLATION profile=%', b_id;
end;
$$;

select set_config('request.jwt.claim.sub', '92000000-0000-4000-8000-000000000003', true);
insert into public.candidate_profiles (user_id, name)
values (auth.uid(), 'Trayectoria A'), (auth.uid(), 'Trayectoria B');

do $$
declare
  result_id uuid;
  result_resolution text;
begin
  select candidate_profile_id, resolution into result_id, result_resolution
  from public.ensure_contextual_candidate_profile();
  if result_id is not null or result_resolution <> 'AMBIGUOUS' then
    raise exception 'AMBIGUITY_NOT_REPORTED id=% resolution=%', result_id, result_resolution;
  end if;
  raise notice 'PASS AMBIGUITY_REPORTED';
end;
$$;

reset role;
do $$
begin
  if not has_function_privilege('authenticated', 'public.ensure_contextual_candidate_profile()', 'EXECUTE')
     or has_function_privilege('anon', 'public.ensure_contextual_candidate_profile()', 'EXECUTE') then
    raise exception 'FUNCTION_GRANTS_INVALID';
  end if;
  raise notice 'PASS MINIMUM_EXECUTE_GRANT';
end;
$$;

rollback;

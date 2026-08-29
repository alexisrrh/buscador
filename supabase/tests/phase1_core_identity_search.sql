-- Runtime validation for Phase 1.
-- Run only against the dedicated test project. All synthetic data is rolled back.
begin;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'phase1-user-a@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'phase1-user-b@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

-- Explicitly verifies auth.users -> public.profiles despite FORCE ROW LEVEL SECURITY.
do $$
declare
  created_profiles integer;
begin
  select count(*) into created_profiles
  from public.profiles
  where id in (
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002'
  );

  if created_profiles <> 2 then
    raise exception 'AUTH_TRIGGER_FAILED expected=2 actual=%', created_profiles;
  end if;
  raise notice 'PASS AUTH_TRIGGER profiles=2';
end;
$$;

-- User A creates only A-owned data.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.candidate_profiles (id, user_id, name)
values (
  '11000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Synthetic profile A'
);

-- User B creates only B-owned data.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.candidate_profiles (id, user_id, name)
values (
  '22000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000002',
  'Synthetic profile B'
);

-- User A: SELECT isolation, forged INSERT, cross-tenant UPDATE and physical DELETE.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  visible_profiles integer;
begin
  select count(*) into visible_profiles from public.candidate_profiles;
  if visible_profiles <> 1 then
    raise exception 'RLS_A_SELECT_FAILED expected=1 actual=%', visible_profiles;
  end if;
  raise notice 'PASS RLS_A_SELECT rows=1';
end;
$$;

do $$
begin
  begin
    insert into public.candidate_profiles (user_id, name)
    values (
      '20000000-0000-0000-0000-000000000002',
      'Forbidden forged owner from A'
    );
    raise exception 'RLS_A_INSERT_UNEXPECTED_SUCCESS';
  exception
    when insufficient_privilege then
      raise notice 'PASS RLS_A_INSERT sqlstate=%', sqlstate;
  end;
end;
$$;

do $$
declare
  affected_rows integer;
begin
  update public.candidate_profiles
  set name = 'Forbidden update from A'
  where id = '22000000-0000-0000-0000-000000000002';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'RLS_A_UPDATE_FAILED affected=%', affected_rows;
  end if;
  raise notice 'PASS RLS_A_UPDATE affected=0';
end;
$$;

do $$
begin
  begin
    delete from public.candidate_profiles
    where id = '11000000-0000-0000-0000-000000000001';
    raise exception 'RLS_A_DELETE_UNEXPECTED_SUCCESS';
  exception
    when insufficient_privilege then
      raise notice 'PASS RLS_A_DELETE sqlstate=%', sqlstate;
  end;
end;
$$;

-- User B verifies the same isolation in the inverse direction.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  visible_profiles integer;
begin
  select count(*) into visible_profiles from public.candidate_profiles;
  if visible_profiles <> 1 then
    raise exception 'RLS_B_SELECT_FAILED expected=1 actual=%', visible_profiles;
  end if;
  raise notice 'PASS RLS_B_SELECT rows=1';
end;
$$;

do $$
begin
  begin
    insert into public.candidate_profiles (user_id, name)
    values (
      '10000000-0000-0000-0000-000000000001',
      'Forbidden forged owner from B'
    );
    raise exception 'RLS_B_INSERT_UNEXPECTED_SUCCESS';
  exception
    when insufficient_privilege then
      raise notice 'PASS RLS_B_INSERT sqlstate=%', sqlstate;
  end;
end;
$$;

do $$
declare
  affected_rows integer;
begin
  update public.candidate_profiles
  set name = 'Forbidden update from B'
  where id = '11000000-0000-0000-0000-000000000001';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'RLS_B_UPDATE_FAILED affected=%', affected_rows;
  end if;
  raise notice 'PASS RLS_B_UPDATE affected=0';
end;
$$;

do $$
begin
  begin
    delete from public.candidate_profiles
    where id = '22000000-0000-0000-0000-000000000002';
    raise exception 'RLS_B_DELETE_UNEXPECTED_SUCCESS';
  exception
    when insufficient_privilege then
      raise notice 'PASS RLS_B_DELETE sqlstate=%', sqlstate;
  end;
end;
$$;

-- User A owns one runnable search and four deliberately non-runnable searches.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.search_profiles (
  id, user_id, candidate_profile_id, name, status, next_run_at
)
values
  (
    '12000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    'A active and due',
    'ACTIVE',
    now() - interval '1 minute'
  ),
  (
    '12000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    'A active but future',
    'ACTIVE',
    now() + interval '1 day'
  ),
  (
    '12000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    'A paused and due',
    'PAUSED',
    now() - interval '1 minute'
  ),
  (
    '12000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    'A active due but deleted',
    'ACTIVE',
    now() - interval '1 minute'
  ),
  (
    '12000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    'A active without next run',
    'ACTIVE',
    null
  );

update public.search_profiles
set deleted_at = now()
where id = '12000000-0000-0000-0000-000000000004';

insert into public.job_preferences (
  user_id,
  candidate_profile_id,
  search_profile_id,
  search_profile_version,
  keywords,
  locations,
  work_modes,
  minimum_salary,
  currency,
  minimum_experience_years,
  maximum_experience_years,
  languages
)
values (
  '10000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001',
  1,
  array['synthetic keyword'],
  '[{"country":"ES","city":"Test City"}]'::jsonb,
  array['REMOTE'],
  25000,
  'EUR',
  0,
  2,
  '[{"code":"en","minimum_level":"B1"}]'::jsonb
);

-- User B owns a separate runnable search.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.search_profiles (
  id, user_id, candidate_profile_id, name, status, next_run_at
)
values (
  '23000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000002',
  '22000000-0000-0000-0000-000000000002',
  'B active and due',
  'ACTIVE',
  now() - interval '1 minute'
);

do $$
declare
  runnable_count integer;
begin
  select count(*) into runnable_count from public.runnable_search_profiles;
  if runnable_count <> 1 then
    raise exception 'RUNNABLE_B_FAILED expected=1 actual=%', runnable_count;
  end if;
  raise notice 'PASS RUNNABLE_B rows=1';
end;
$$;

-- Return to A for FK, CHECK, runnable and logical-delete tests.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  runnable_count integer;
  invalid_count integer;
begin
  select count(*) into runnable_count from public.runnable_search_profiles;
  select count(*) into invalid_count
  from public.runnable_search_profiles
  where status <> 'ACTIVE'
     or deleted_at is not null
     or next_run_at is null
     or next_run_at > now();

  if runnable_count <> 1 or invalid_count <> 0 then
    raise exception
      'RUNNABLE_A_FAILED expected=1 actual=% invalid=%',
      runnable_count,
      invalid_count;
  end if;
  raise notice 'PASS RUNNABLE_A rows=1 invalid=0';
end;
$$;

-- Cross-tenant SearchProfile must fail through the composite owner FK.
do $$
begin
  begin
    insert into public.search_profiles (
      user_id, candidate_profile_id, name
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000002',
      'Forbidden cross-tenant search'
    );
    raise exception 'FK_SEARCH_UNEXPECTED_SUCCESS';
  exception
    when foreign_key_violation then
      raise notice 'PASS FK_SEARCH sqlstate=%', sqlstate;
  end;
end;
$$;

-- Cross-tenant JobPreferences must fail through RLS or the composite FK as applicable.
do $$
begin
  begin
    insert into public.job_preferences (
      user_id, candidate_profile_id, search_profile_id, search_profile_version
    )
    values (
      '20000000-0000-0000-0000-000000000002',
      '22000000-0000-0000-0000-000000000002',
      '23000000-0000-0000-0000-000000000002',
      1
    );
    raise exception 'RLS_PREFERENCES_UNEXPECTED_SUCCESS';
  exception
    when insufficient_privilege then
      raise notice 'PASS RLS_PREFERENCES sqlstate=%', sqlstate;
  end;

  begin
    insert into public.job_preferences (
      user_id, candidate_profile_id, search_profile_id, search_profile_version
    )
    values (
      '10000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000002',
      '12000000-0000-0000-0000-000000000002',
      1
    );
    raise exception 'FK_PREFERENCES_UNEXPECTED_SUCCESS';
  exception
    when foreign_key_violation then
      raise notice 'PASS FK_PREFERENCES sqlstate=%', sqlstate;
  end;
end;
$$;

-- SearchProfile CHECK constraints: bounds, ordering, daily limit and version.
do $$
begin
  begin
    insert into public.search_profiles (
      user_id, candidate_profile_id, name, notification_min_score
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '11000000-0000-0000-0000-000000000001',
      'Invalid score below zero', -1
    );
    raise exception 'CHECK_SCORE_LOW_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS CHECK_SCORE_LOW sqlstate=%', sqlstate;
  end;

  begin
    insert into public.search_profiles (
      user_id, candidate_profile_id, name, auto_apply_min_score
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '11000000-0000-0000-0000-000000000001',
      'Invalid score above one hundred', 101
    );
    raise exception 'CHECK_SCORE_HIGH_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS CHECK_SCORE_HIGH sqlstate=%', sqlstate;
  end;

  begin
    insert into public.search_profiles (
      user_id, candidate_profile_id, name,
      notification_min_score, semi_auto_min_score, auto_apply_min_score
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '11000000-0000-0000-0000-000000000001',
      'Invalid notification ordering', 81, 80, 90
    );
    raise exception 'CHECK_NOTIFICATION_ORDER_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS CHECK_NOTIFICATION_ORDER sqlstate=%', sqlstate;
  end;

  begin
    insert into public.search_profiles (
      user_id, candidate_profile_id, name,
      notification_min_score, semi_auto_min_score, auto_apply_min_score
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '11000000-0000-0000-0000-000000000001',
      'Invalid semi ordering', 70, 91, 90
    );
    raise exception 'CHECK_SEMI_ORDER_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS CHECK_SEMI_ORDER sqlstate=%', sqlstate;
  end;

  begin
    insert into public.search_profiles (
      user_id, candidate_profile_id, name, daily_application_limit
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '11000000-0000-0000-0000-000000000001',
      'Invalid daily limit', -1
    );
    raise exception 'CHECK_DAILY_LIMIT_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS CHECK_DAILY_LIMIT sqlstate=%', sqlstate;
  end;

  begin
    insert into public.search_profiles (
      user_id, candidate_profile_id, name, version
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '11000000-0000-0000-0000-000000000001',
      'Invalid search version', 0
    );
    raise exception 'CHECK_SEARCH_VERSION_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS CHECK_SEARCH_VERSION sqlstate=%', sqlstate;
  end;
end;
$$;

-- JobPreferences CHECK constraints are tested by invalid updates to the valid row.
do $$
begin
  begin
    update public.job_preferences
    set minimum_experience_years = 3,
        maximum_experience_years = 2
    where search_profile_id = '12000000-0000-0000-0000-000000000001';
    raise exception 'CHECK_EXPERIENCE_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS CHECK_EXPERIENCE sqlstate=%', sqlstate;
  end;

  begin
    update public.job_preferences
    set minimum_salary = -1
    where search_profile_id = '12000000-0000-0000-0000-000000000001';
    raise exception 'CHECK_SALARY_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS CHECK_SALARY sqlstate=%', sqlstate;
  end;

  begin
    update public.job_preferences
    set currency = 'EURO'
    where search_profile_id = '12000000-0000-0000-0000-000000000001';
    raise exception 'CHECK_CURRENCY_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS CHECK_CURRENCY sqlstate=%', sqlstate;
  end;

  begin
    update public.job_preferences
    set search_profile_version = 0
    where search_profile_id = '12000000-0000-0000-0000-000000000001';
    raise exception 'CHECK_PREFERENCES_VERSION_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS CHECK_PREFERENCES_VERSION sqlstate=%', sqlstate;
  end;
end;
$$;

-- Future JobPreferences versions are rejected by the cross-row trigger.
do $$
begin
  begin
    insert into public.job_preferences (
      user_id, candidate_profile_id, search_profile_id, search_profile_version
    ) values (
      '10000000-0000-0000-0000-000000000001',
      '11000000-0000-0000-0000-000000000001',
      '12000000-0000-0000-0000-000000000001',
      2
    );
    raise exception 'FUTURE_VERSION_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS FUTURE_VERSION sqlstate=%', sqlstate;
  end;
end;
$$;

-- Logical deletion is allowed and immediately removes the search from runnable results.
update public.search_profiles
set deleted_at = now()
where id = '12000000-0000-0000-0000-000000000001';

do $$
declare
  deleted_at_value timestamptz;
  runnable_count integer;
begin
  select deleted_at into deleted_at_value
  from public.search_profiles
  where id = '12000000-0000-0000-0000-000000000001';

  select count(*) into runnable_count
  from public.runnable_search_profiles;

  if deleted_at_value is null or runnable_count <> 0 then
    raise exception
      'SOFT_DELETE_FAILED deleted_at=% runnable=%',
      deleted_at_value,
      runnable_count;
  end if;
  raise notice 'PASS SOFT_DELETE runnable=0';
end;
$$;

select array[
  'AUTH_TRIGGER',
  'RLS_A_SELECT_INSERT_UPDATE_DELETE',
  'RLS_B_SELECT_INSERT_UPDATE_DELETE',
  'FK_SEARCH_CROSS_TENANT',
  'FK_PREFERENCES_CROSS_TENANT',
  'CHECK_SCORE_BOUNDS',
  'CHECK_SCORE_ORDER',
  'CHECK_DAILY_LIMIT',
  'CHECK_EXPERIENCE_ORDER',
  'CHECK_SALARY',
  'CHECK_CURRENCY',
  'CHECK_VERSION',
  'FUTURE_PREFERENCES_VERSION',
  'RUNNABLE_SEARCH_PROFILES',
  'SOFT_DELETE'
] as passed_runtime_checks;

reset role;
rollback;

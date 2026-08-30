-- Runtime validation for Phase 6. All data is synthetic and rolled back.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '61000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'phase6-a@example.invalid', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '62000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'phase6-b@example.invalid', '', now(), '{}', '{}', now(), now());

set local role service_role;

insert into public.candidate_profiles (id, user_id, name, seniority) values
  ('61100000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'Synthetic A', 'MID'),
  ('62200000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000002', 'Synthetic B', 'JUNIOR');

insert into public.search_profiles (
  id, user_id, candidate_profile_id, name, status, notification_min_score,
  semi_auto_min_score, auto_apply_min_score
) values
  ('61110000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001',
   '61100000-0000-0000-0000-000000000001', 'Synthetic frontend A', 'ACTIVE', 70, 80, 90),
  ('62220000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000002',
   '62200000-0000-0000-0000-000000000002', 'Synthetic frontend B', 'ACTIVE', 60, 80, 90);

insert into public.job_preferences (
  user_id, candidate_profile_id, search_profile_id, search_profile_version,
  target_titles, keywords, work_modes, required_technologies
) values
  ('61000000-0000-0000-0000-000000000001', '61100000-0000-0000-0000-000000000001',
   '61110000-0000-0000-0000-000000000001', 1, array['Frontend Engineer'], array['web'],
   array['REMOTE'], array['React']),
  ('62000000-0000-0000-0000-000000000002', '62200000-0000-0000-0000-000000000002',
   '62220000-0000-0000-0000-000000000002', 1, array['Frontend Engineer'], array['web'],
   array['REMOTE'], array['React']);

insert into public.companies (id, name)
values ('63000000-0000-0000-0000-000000000003', 'Synthetic Phase Six Company');

insert into public.job_offers (
  id, company_id, title, description, location_text, work_mode, seniority,
  employment_type, canonical_url, canonical_url_is_reliable
) values (
  '64000000-0000-0000-0000-000000000004',
  '63000000-0000-0000-0000-000000000003',
  'Synthetic Frontend Engineer', 'React web role with 2 years experience',
  'Remote', 'REMOTE', 'MID', 'FULL_TIME',
  'https://phase6.example.invalid/jobs/frontend', true
);

do $$
declare
  first_result jsonb;
  repeat_result jsonb;
  second_user_result jsonb;
  match_count integer;
begin
  first_result := public.upsert_job_match(
    '61110000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000004',
    91, 'ELIGIBLE', '{"title":25,"keywords":18,"technologies":20,"location":15,"seniority":8,"contract":5,"salary":0}',
    '{"offerActive":"PASS","searchActive":"PASS"}', '["Synthetic high match"]'
  );
  repeat_result := public.upsert_job_match(
    '61110000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000004',
    89, 'ELIGIBLE', '{"title":25,"keywords":16,"technologies":20,"location":15,"seniority":8,"contract":5,"salary":0}',
    '{"offerActive":"PASS","searchActive":"PASS"}', '["Synthetic recalculation"]'
  );
  second_user_result := public.upsert_job_match(
    '62220000-0000-0000-0000-000000000002', '64000000-0000-0000-0000-000000000004',
    72, 'REVIEW', '{"title":20,"keywords":12,"technologies":15,"location":15,"seniority":5,"contract":5,"salary":0}',
    '{"offerActive":"PASS","searchActive":"PASS","seniority":"UNKNOWN"}', '["Synthetic review"]'
  );

  select count(*) into match_count
  from public.job_matches
  where job_offer_id = '64000000-0000-0000-0000-000000000004';

  if match_count <> 2
     or (first_result->>'created')::boolean is not true
     or (repeat_result->>'created')::boolean is not false
     or (second_user_result->>'created')::boolean is not true then
    raise exception 'MATCH_IDEMPOTENCY_FAILED count=% first=% repeat=% second=%',
      match_count, first_result, repeat_result, second_user_result;
  end if;
  raise notice 'PASS MATCH_IDEMPOTENCY_AND_PER_PROFILE_SCORE';
end;
$$;

create temporary table phase6_match_ids as
select user_id, id from public.job_matches;
grant select on phase6_match_ids to authenticated;

do $$
begin
  begin
    perform public.upsert_job_match(
      '61110000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000004',
      101, 'ELIGIBLE', '{}', '{}', '[]'
    );
    raise exception 'SCORE_BOUND_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS SCORE_BOUND_0_100';
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  visible_count integer;
  own_match uuid;
  other_match uuid;
begin
  select count(*) into visible_count from public.job_matches;
  select id into own_match from public.job_matches limit 1;
  if visible_count <> 1 then
    raise exception 'RLS_MATCH_SELECT_A_FAILED count=%', visible_count;
  end if;

  perform public.set_job_match_status(own_match, 'SAVED');
  if (select status from public.job_matches where id = own_match) <> 'SAVED' then
    raise exception 'OWN_SAVE_FAILED';
  end if;

  select id into other_match from phase6_match_ids
  where user_id = '62000000-0000-0000-0000-000000000002';

  begin
    perform public.set_job_match_status(other_match, 'DISMISSED');
    raise exception 'CROSS_USER_STATUS_UNEXPECTED_SUCCESS';
  exception when no_data_found then
    null;
  end;

  begin
    update public.job_matches set status = 'DISMISSED' where id = own_match;
    raise exception 'DIRECT_MATCH_UPDATE_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.job_matches (
      user_id, candidate_profile_id, search_profile_id, search_profile_version,
      job_offer_id, score, eligibility_status, score_components, hard_gates, reasons
    ) values (
      '61000000-0000-0000-0000-000000000001', '61100000-0000-0000-0000-000000000001',
      '61110000-0000-0000-0000-000000000001', 1,
      '64000000-0000-0000-0000-000000000004', 50, 'REVIEW', '{}', '{}', '[]'
    );
    raise exception 'DIRECT_MATCH_INSERT_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    raise notice 'PASS MATCH_RLS_AND_CONTROLLED_STATUS';
  end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '62000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  own_match uuid;
begin
  select id into own_match from public.job_matches;
  if own_match is null or (select count(*) from public.job_matches) <> 1 then
    raise exception 'RLS_MATCH_SELECT_B_FAILED';
  end if;
  perform public.set_job_match_status(own_match, 'DISMISSED');
  if (select status from public.job_matches where id = own_match) <> 'DISMISSED' then
    raise exception 'OWN_DISMISS_FAILED';
  end if;
  raise notice 'PASS SECOND_USER_ISOLATION_AND_DISMISS';
end;
$$;

reset role;
select array[
  'PRIVATE_JOB_MATCH_WITH_FORCE_RLS',
  'DETERMINISTIC_V1_IDEMPOTENCY',
  'SAME_OFFER_DIFFERENT_PROFILES',
  'SCORE_BOUND_0_100',
  'OWN_SAVE_AND_DISMISS_ONLY'
] as passed_runtime_checks;

rollback;

-- Runtime validation for deterministic-v2 status preservation. Synthetic data only.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '76000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'phase66@example.invalid', '', now(), '{}', '{}', now(), now()
);

set local role service_role;

insert into public.candidate_profiles (id, user_id, name, job_family, seniority)
values (
  '76100000-0000-0000-0000-000000000001',
  '76000000-0000-0000-0000-000000000001',
  'Synthetic frontend profile', 'Frontend', 'MID'
);

insert into public.search_profiles (
  id, user_id, candidate_profile_id, name, status
) values (
  '76110000-0000-0000-0000-000000000001',
  '76000000-0000-0000-0000-000000000001',
  '76100000-0000-0000-0000-000000000001',
  'Synthetic frontend search', 'ACTIVE'
);

insert into public.job_preferences (
  user_id, candidate_profile_id, search_profile_id, search_profile_version,
  target_titles, work_modes
) values (
  '76000000-0000-0000-0000-000000000001',
  '76100000-0000-0000-0000-000000000001',
  '76110000-0000-0000-0000-000000000001',
  1, array['Frontend Developer'], array['REMOTE']
);

insert into public.job_offers (id, title, location_text, work_mode)
values (
  '76200000-0000-0000-0000-000000000001',
  'Synthetic Frontend Engineer', 'Spain', 'REMOTE'
);

select public.upsert_job_match(
  '76110000-0000-0000-0000-000000000001',
  '76200000-0000-0000-0000-000000000001',
  75, 'ELIGIBLE', '{}', '{}', '["v1"]', 'deterministic-v1'
);

update public.job_matches
set status = 'SAVED'
where search_profile_id = '76110000-0000-0000-0000-000000000001'
  and scoring_version = 'deterministic-v1';

select public.upsert_job_match(
  '76110000-0000-0000-0000-000000000001',
  '76200000-0000-0000-0000-000000000001',
  91, 'ELIGIBLE', '{"title":35}', '{"roleFamily":"PASS"}', '["v2"]', 'deterministic-v2'
);

select public.upsert_job_match(
  '76110000-0000-0000-0000-000000000001',
  '76200000-0000-0000-0000-000000000001',
  89, 'ELIGIBLE', '{"title":33}', '{"roleFamily":"PASS"}', '["v2 repeat"]', 'deterministic-v2'
);

do $$
declare
  total_matches integer;
  v2_matches integer;
  v2_status public.job_match_status;
  v2_score integer;
begin
  select count(*) into total_matches from public.job_matches;
  select count(*) into v2_matches
  from public.job_matches
  where scoring_version = 'deterministic-v2';
  select status, score into v2_status, v2_score
  from public.job_matches
  where scoring_version = 'deterministic-v2';

  if total_matches <> 2 or v2_matches <> 1 or v2_status <> 'SAVED' or v2_score <> 89 then
    raise exception 'V2_RECALCULATION_FAILED total=% v2=% status=% score=%',
      total_matches, v2_matches, v2_status, v2_score;
  end if;
  raise notice 'PASS V2_RECALCULATION_PRESERVES_USER_STATUS';
end;
$$;

rollback;

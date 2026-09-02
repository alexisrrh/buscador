begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('80000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase8-a@example.test', ''),
  ('80000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase8-b@example.test', '');

set local role service_role;
insert into public.candidate_profiles (id, user_id, name) values
  ('81000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'Synthetic A'),
  ('81000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000002', 'Synthetic B');
insert into public.search_profiles (
  id, user_id, candidate_profile_id, name, status, application_mode, daily_application_limit
) values ('82000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001', 'Frontend', 'ACTIVE', 'AUTO', 1);
insert into public.resumes (
  id, user_id, candidate_profile_id, version, status, original_filename, mime_type,
  file_size_bytes, content_sha256, approved_at
) values ('83000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001', 1, 'APPROVED', 'synthetic.pdf', 'application/pdf',
  100, repeat('c', 64), now());
insert into public.job_offers (id, title, canonical_url, status) values
  ('84000000-0000-4000-8000-000000000001', 'Frontend One', 'https://example.test/jobs/one', 'ACTIVE'),
  ('84000000-0000-4000-8000-000000000002', 'Frontend Two', 'https://example.test/jobs/two', 'ACTIVE');
insert into public.job_sources (id, code, name, auto_apply_enabled)
values ('86000000-0000-4000-8000-000000000001', 'PHASE8_TEST', 'Phase 8 Test', true);
insert into public.job_offer_sources (id, job_offer_id, job_source_id, source_url, canonical_source_url) values
  ('87000000-0000-4000-8000-000000000001', '84000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000001', 'https://example.test/jobs/one', 'https://example.test/jobs/one'),
  ('87000000-0000-4000-8000-000000000002', '84000000-0000-4000-8000-000000000002', '86000000-0000-4000-8000-000000000001', 'https://example.test/jobs/two', 'https://example.test/jobs/two');
insert into public.application_user_settings (user_id, auto_apply_enabled)
values ('80000000-0000-4000-8000-000000000001', true);
insert into public.application_drafts (
  id, user_id, candidate_profile_id, search_profile_id, job_offer_id, source_resume_id,
  status, job_analysis, profile_analysis, match_summary, resume_adaptation
) values
  ('85000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001',
    'APPROVED', '{}', '{}', '{"score":95,"eligibility":"ELIGIBLE"}', '{}'),
  ('85000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001',
    '84000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000001',
    'APPROVED', '{}', '{}', '{"score":95,"eligibility":"ELIGIBLE"}', '{}');

select public.create_prepared_application(
  '80000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001',
  'REVIEW', 'https://example.test/jobs/one', 'PREPARED', '["USER_CONFIRMATION_REQUIRED"]',
  '{"draft":"PASS"}', null, null,
  '[{"question_key":"sponsorship","question_text":"Do you require sponsorship?","answer_type":"BOOLEAN","answer_value":null,"source":"PORTAL_DISCOVERY","confidence":0,"requires_confirmation":true,"classification":"LEGAL_SENSITIVE"}]'
);
select public.create_prepared_application(
  '80000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000001', '87000000-0000-4000-8000-000000000001',
  'REVIEW', 'https://example.test/jobs/one', 'PREPARED', '[]', '{}', null, null, '[]'
);

do $$
begin
  if (select count(*) from public.applications) <> 1 then raise exception 'Application duplicate was created'; end if;
  if (select count(*) from public.application_events where event_type in ('CREATED', 'MODE_DECIDED', 'REVIEW_REQUIRED')) <> 3 then
    raise exception 'Application audit events missing';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-4000-8000-000000000002', true);
do $$
begin
  if (select count(*) from public.applications) <> 0 then raise exception 'User B sees User A Application'; end if;
  if (select count(*) from public.application_answers) <> 0 then raise exception 'User B sees User A answers'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '80000000-0000-4000-8000-000000000001', true);
select public.confirm_application_answer((select id from public.application_answers where question_key = 'sponsorship'), 'false'::jsonb);
do $$
begin
  if not exists (select 1 from public.application_answers where question_key = 'sponsorship'
    and source = 'USER_APPROVED' and requires_confirmation = false and answer_value = 'false'::jsonb) then
    raise exception 'Sensitive answer was not explicitly approved';
  end if;
  if not exists (select 1 from public.user_application_answers where question_key = 'sponsorship') then
    raise exception 'Reusable answer was not stored';
  end if;
  begin
    update public.applications set status = 'SUBMITTED';
    raise exception 'Authenticated user changed Application status directly';
  exception when insufficient_privilege then null;
  end;
end;
$$;

set local role service_role;
select public.create_prepared_application(
  '80000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000002', '87000000-0000-4000-8000-000000000002',
  'AUTO', 'https://example.test/jobs/two', 'PREPARED', '[]', '{}', null, null, '[]'
);
update public.applications set apply_mode = 'AUTO', status = 'READY';
select public.reserve_application_attempt((select id from public.applications where job_offer_id = '84000000-0000-4000-8000-000000000001'), '80000000-0000-4000-8000-000000000001');
select public.reserve_application_attempt((select id from public.applications where job_offer_id = '84000000-0000-4000-8000-000000000002'), '80000000-0000-4000-8000-000000000001');
do $$
begin
  if not exists (select 1 from public.applications where job_offer_id = '84000000-0000-4000-8000-000000000002'
    and status = 'BLOCKED' and failure_code = 'DAILY_LIMIT_REACHED') then
    raise exception 'Daily limit did not block second attempt';
  end if;
end;
$$;

rollback;

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


insert into public.derived_resumes (id,user_id,candidate_profile_id,application_draft_id,source_resume_id,job_offer_id)
values ('89000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001');
insert into storage.objects (bucket_id,name) select storage_bucket,storage_path from public.derived_resumes;
update public.derived_resumes set status='READY',sha256=repeat('a',64),size_bytes=1500,pages=1,content_snapshot='{}';
insert into public.derived_resumes (id,user_id,candidate_profile_id,application_draft_id,source_resume_id,job_offer_id)
select '89000000-0000-4000-8000-000000000002',user_id,candidate_profile_id,application_draft_id,source_resume_id,job_offer_id from public.derived_resumes;
update public.derived_resumes set status='FAILED',failure_code='INVALID_ADAPTATION' where status='GENERATING';
select public.create_prepared_application('80000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001',null,'MANUAL','https://example.test/jobs/one','PREPARED','[]','{}',null,null,'[]');
update public.applications set derived_resume_id='89000000-0000-4000-8000-000000000001';
do $$
begin
  if (select count(distinct storage_path) from public.derived_resumes) <> 2 then raise exception 'Regeneration reused path'; end if;
  if not exists(select 1 from public.applications where derived_resume_id='89000000-0000-4000-8000-000000000001') then raise exception 'Application reference missing'; end if;
  begin
    update public.applications set derived_resume_id='89000000-0000-4000-8000-000000000002';
    raise exception 'FAILED derivative accepted';
  exception when check_violation then null; end;
  begin
    update public.derived_resumes set sha256=repeat('b',64) where status='READY';
    raise exception 'READY metadata mutable';
  exception when check_violation then null; end;
  begin
    update storage.objects set metadata='{}' where bucket_id='derived-resumes';
    raise exception 'Bytes overwrite permitted';
  exception when check_violation then null; end;
  begin
    insert into public.derived_resumes (user_id,candidate_profile_id,application_draft_id,source_resume_id,job_offer_id)
    values ('80000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000002');
    raise exception 'Wrong offer accepted';
  exception when foreign_key_violation then null; end;
  update public.application_drafts set status='READY_FOR_REVIEW' where id='85000000-0000-4000-8000-000000000001';
  begin
    insert into public.derived_resumes (user_id,candidate_profile_id,application_draft_id,source_resume_id,job_offer_id)
    select user_id,candidate_profile_id,application_draft_id,source_resume_id,job_offer_id from public.derived_resumes limit 1;
    raise exception 'Unapproved draft accepted';
  exception when check_violation then null; end;
  update public.application_drafts set status='APPROVED' where id='85000000-0000-4000-8000-000000000001';
  update public.resumes set status='ARCHIVED',archived_at=now();
  begin
    insert into public.derived_resumes (user_id,candidate_profile_id,application_draft_id,source_resume_id,job_offer_id)
    select user_id,candidate_profile_id,application_draft_id,source_resume_id,job_offer_id from public.derived_resumes limit 1;
    raise exception 'Unapproved source accepted';
  exception when check_violation then null; end;
end;
$$;
reset role;
do $$
begin
  if not exists (select 1 from pg_class where oid='public.derived_resumes'::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'Missing FORCE RLS'; end if;
  if not exists (select 1 from storage.buckets where id='derived-resumes' and public=false) then raise exception 'Public bucket'; end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000002',true);
do $$
begin
  if exists (select 1 from public.derived_resumes) then raise exception 'User B can read User A'; end if;
  if exists (select 1 from storage.objects where bucket_id='derived-resumes') then raise exception 'User B can read storage'; end if;
end;
$$;
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000001',true);
do $$
begin
  if (select count(*) from public.derived_resumes) <> 2 then raise exception 'Owner cannot read'; end if;
  begin
    update public.derived_resumes set status='ARCHIVED';
    raise exception 'Client lifecycle allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.derived_resumes (user_id) values (auth.uid());
    raise exception 'Client create allowed';
  exception when insufficient_privilege then null; end;
  if exists (select 1 from storage.objects where bucket_id='derived-resumes') then raise exception 'Direct storage read allowed'; end if;
end;
$$;
rollback;

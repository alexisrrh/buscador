-- Local-only runtime validation for offer-specific evidence confirmations.
-- All identities and data are synthetic and this script always rolls back.
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password) values
  ('9b000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase9b-a@example.test', ''),
  ('9b000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase9b-b@example.test', '');

set local role service_role;

insert into public.candidate_profiles (id, user_id, name) values
  ('9b100000-0000-4000-8000-000000000001', '9b000000-0000-4000-8000-000000000001', 'Confirmation A'),
  ('9b100000-0000-4000-8000-000000000002', '9b000000-0000-4000-8000-000000000002', 'Confirmation B');
insert into public.search_profiles (id, user_id, candidate_profile_id, name, status) values
  ('9b200000-0000-4000-8000-000000000001', '9b000000-0000-4000-8000-000000000001', '9b100000-0000-4000-8000-000000000001', 'Synthetic confirmation search', 'ACTIVE');
insert into public.resumes (id, user_id, candidate_profile_id, version, status, original_filename, mime_type, file_size_bytes, content_sha256, approved_at) values
  ('9b300000-0000-4000-8000-000000000001', '9b000000-0000-4000-8000-000000000001', '9b100000-0000-4000-8000-000000000001', 1, 'APPROVED', 'confirmation.pdf', 'application/pdf', 100, repeat('c', 64), now());
insert into public.job_offers (id, title, status) values
  ('9b400000-0000-4000-8000-000000000001', 'TypeScript Developer', 'ACTIVE');
insert into public.professional_evidence_profiles (id, user_id, candidate_profile_id, subject_type, display_name) values
  ('9b500000-0000-4000-8000-000000000001', '9b000000-0000-4000-8000-000000000001', '9b100000-0000-4000-8000-000000000001', 'PROJECT', 'Synthetic Portal');
insert into public.application_drafts (
  id, user_id, candidate_profile_id, search_profile_id, job_offer_id, source_resume_id,
  status, job_analysis, profile_analysis, match_summary, resume_adaptation
) values (
  '9b600000-0000-4000-8000-000000000001', '9b000000-0000-4000-8000-000000000001',
  '9b100000-0000-4000-8000-000000000001', '9b200000-0000-4000-8000-000000000001',
  '9b400000-0000-4000-8000-000000000001', '9b300000-0000-4000-8000-000000000001',
  'READY_FOR_REVIEW', '{}'::jsonb, '{}'::jsonb,
  '{"gaps":{"requirement_resolution":[{"requirement":"TypeScript","status":"CONFIRMABLE"}]}}'::jsonb,
  '{}'::jsonb
);

-- YES: authenticated ownership and the USER_CONFIRMED invariant are enforced.
set local role authenticated;
select set_config('request.jwt.claim.sub', '9b000000-0000-4000-8000-000000000001', true);
insert into public.professional_evidence_items (
  user_id, candidate_profile_id, profile_id, category, exact_claim, source_type,
  source_reference, verification_status, confirmed_at, relevance_tags
) values (
  '9b000000-0000-4000-8000-000000000001', '9b100000-0000-4000-8000-000000000001',
  '9b500000-0000-4000-8000-000000000001', 'TECHNOLOGY', 'Built TypeScript interfaces for the synthetic portal.',
  'USER_CONFIRMED', 'Synthetic Portal UI work', 'VERIFIED', now(), array['TypeScript']
);
do $$ begin
  if not exists (select 1 from public.professional_evidence_items where source_type = 'USER_CONFIRMED' and verification_status = 'VERIFIED' and confirmed_at is not null) then
    raise exception 'USER_CONFIRMED evidence invariant failed';
  end if;
end $$;

-- Cross-user reads and writes are blocked; B cannot create evidence under A's subject.
select set_config('request.jwt.claim.sub', '9b000000-0000-4000-8000-000000000002', true);
do $$ begin
  if exists (select 1 from public.application_drafts where id = '9b600000-0000-4000-8000-000000000001') then raise exception 'Cross-user draft visible'; end if;
  if exists (select 1 from public.professional_evidence_items where profile_id = '9b500000-0000-4000-8000-000000000001') then raise exception 'Cross-user evidence visible'; end if;
  begin
    insert into public.professional_evidence_items (user_id, candidate_profile_id, profile_id, category, exact_claim, source_type, source_reference, verification_status, confirmed_at)
    values ('9b000000-0000-4000-8000-000000000001', '9b100000-0000-4000-8000-000000000001', '9b500000-0000-4000-8000-000000000001', 'TECHNOLOGY', 'TypeScript', 'USER_CONFIRMED', 'forbidden', 'VERIFIED', now());
    raise exception 'Cross-user evidence insert succeeded';
  exception when insufficient_privilege then null;
  end;
end $$;

-- NO is draft-local: it records a decline and creates no additional evidence.
set local role service_role;
update public.application_drafts set match_summary = match_summary || '{"confirmation_decisions":{"typescript":"DECLINED"}}'::jsonb
where id = '9b600000-0000-4000-8000-000000000001' and status in ('DRAFT', 'READY_FOR_REVIEW');
do $$ begin
  if (select match_summary #>> '{confirmation_decisions,typescript}' from public.application_drafts where id = '9b600000-0000-4000-8000-000000000001') <> 'DECLINED' then raise exception 'Decline was not retained'; end if;
  if (select count(*) from public.professional_evidence_items where profile_id = '9b500000-0000-4000-8000-000000000001') <> 1 then raise exception 'Decline created evidence'; end if;
end $$;

-- A guarded update cannot change an approved draft, matching the server action's predicate.
update public.application_drafts set status = 'APPROVED' where id = '9b600000-0000-4000-8000-000000000001';
do $$ declare changed_count integer; begin
  update public.application_drafts set match_summary = '{}'::jsonb
  where id = '9b600000-0000-4000-8000-000000000001' and status in ('DRAFT', 'READY_FOR_REVIEW');
  get diagnostics changed_count = row_count;
  if changed_count <> 0 then raise exception 'Approved draft confirmation update succeeded'; end if;
end $$;

rollback;

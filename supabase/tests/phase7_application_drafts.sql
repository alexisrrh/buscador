begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values
  ('70000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase7-a@example.test', ''),
  ('70000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase7-b@example.test', '');

set local role service_role;

insert into public.candidate_profiles (id, user_id, name)
values
  ('71000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', 'Synthetic A'),
  ('71000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', 'Synthetic B');

insert into public.search_profiles (id, user_id, candidate_profile_id, name, status)
values ('72000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'Frontend synthetic', 'ACTIVE');

insert into public.resumes (id, user_id, candidate_profile_id, version, status, original_filename, mime_type, file_size_bytes, content_sha256, approved_at)
values
  ('73000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 1, 'APPROVED', 'synthetic-a.pdf', 'application/pdf', 100, repeat('a', 64), now()),
  ('73000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', '71000000-0000-4000-8000-000000000002', 1, 'APPROVED', 'synthetic-b.pdf', 'application/pdf', 100, repeat('b', 64), now());

insert into public.job_offers (id, title, status)
values ('74000000-0000-4000-8000-000000000001', 'Frontend Developer', 'ACTIVE');

insert into public.application_drafts (
  id, user_id, candidate_profile_id, search_profile_id, job_offer_id, source_resume_id,
  status, job_analysis, profile_analysis, match_summary, resume_adaptation, recruiter_message
) values (
  '75000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001',
  'READY_FOR_REVIEW', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'Synthetic message'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', true);

do $$
begin
  if (select count(*) from public.application_drafts) <> 1 then
    raise exception 'Owner cannot read ApplicationDraft';
  end if;
  begin
    insert into public.application_drafts (
      user_id, candidate_profile_id, search_profile_id, job_offer_id, source_resume_id,
      job_analysis, profile_analysis, match_summary, resume_adaptation
    ) values (
      '70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000001', '74000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000001', '{}', '{}', '{}', '{}'
    );
    raise exception 'Authenticated user inserted ApplicationDraft directly';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select public.set_application_draft_status('75000000-0000-4000-8000-000000000001', 'APPROVED');

do $$
begin
  if (select status from public.application_drafts where id = '75000000-0000-4000-8000-000000000001') <> 'APPROVED' then
    raise exception 'Approval did not update draft';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000002', true);

do $$
begin
  if (select count(*) from public.application_drafts) <> 0 then
    raise exception 'User B can read user A draft';
  end if;
  begin
    perform public.set_application_draft_status('75000000-0000-4000-8000-000000000001', 'ARCHIVED');
    raise exception 'User B changed user A draft';
  exception when no_data_found then null;
  end;
end;
$$;

set local role service_role;

do $$
begin
  begin
    insert into public.application_drafts (
      user_id, candidate_profile_id, search_profile_id, job_offer_id, source_resume_id,
      job_analysis, profile_analysis, match_summary, resume_adaptation
    ) values (
      '70000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000001', '74000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000001', '{}', '{}', '{}', '{}'
    );
    raise exception 'Duplicate current draft was allowed';
  exception when unique_violation then null;
  end;
end;
$$;

rollback;

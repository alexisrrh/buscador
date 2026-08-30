-- Runtime validation for Phase 3.5. All synthetic data is rolled back.
begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'phase35-a@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'phase35-b@example.invalid', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.candidate_profiles (id, user_id, name)
values ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Synthetic profile A');

select set_config(
  'phase35.resume_a1',
  (public.create_resume_upload(
    '71000000-0000-0000-0000-000000000001',
    'a-v1.pdf',
    'application/pdf',
    100,
    repeat('a', 64)
  )).id::text,
  true
);

select set_config(
  'phase35.resume_a2',
  (public.create_resume_upload(
    '71000000-0000-0000-0000-000000000001',
    'a-v2.pdf',
    'application/pdf',
    200,
    repeat('b', 64)
  )).id::text,
  true
);

do $$
declare
  allocated_versions integer[];
begin
  select array_agg(version order by version)
  into allocated_versions
  from public.resumes
  where candidate_profile_id = '71000000-0000-0000-0000-000000000001';

  if allocated_versions <> array[1, 2] then
    raise exception 'VERSION_ALLOCATION_FAILED versions=%', allocated_versions;
  end if;
  raise notice 'PASS VERSION_ALLOCATION versions={1,2}';
end;
$$;

-- Direct metadata creation and lifecycle mutation are not client capabilities.
do $$
begin
  begin
    insert into public.resumes (
      user_id, candidate_profile_id, version, status, original_filename,
      mime_type, file_size_bytes, content_sha256
    ) values (
      '70000000-0000-0000-0000-000000000001',
      '71000000-0000-0000-0000-000000000001',
      99,
      'APPROVED',
      'forged.pdf',
      'application/pdf',
      10,
      repeat('f', 64)
    );
    raise exception 'DIRECT_INSERT_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    raise notice 'PASS DIRECT_INSERT_BLOCKED sqlstate=%', sqlstate;
  end;

  begin
    update public.resumes
    set status = 'APPROVED'
    where id = current_setting('phase35.resume_a1')::uuid;
    raise exception 'DIRECT_STATUS_UPDATE_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    raise notice 'PASS DIRECT_STATUS_UPDATE_BLOCKED sqlstate=%', sqlstate;
  end;
end;
$$;

-- A PROCESSING row cannot become READY before its exact object exists.
do $$
begin
  begin
    perform public.complete_resume_upload(current_setting('phase35.resume_a1')::uuid);
    raise exception 'READY_WITHOUT_OBJECT_UNEXPECTED_SUCCESS';
  exception when no_data_found then
    raise notice 'PASS READY_WITHOUT_OBJECT_BLOCKED sqlstate=%', sqlstate;
  end;
end;
$$;

insert into storage.objects (bucket_id, name, metadata, user_metadata)
select
  storage_bucket,
  storage_path,
  jsonb_build_object('mimetype', mime_type, 'size', file_size_bytes),
  jsonb_build_object('contentSha256', content_sha256)
from public.resumes
where id = current_setting('phase35.resume_a1')::uuid;

select public.complete_resume_upload(current_setting('phase35.resume_a1')::uuid);

do $$
declare
  ready_status public.resume_status;
  affected_rows integer;
begin
  select status into ready_status
  from public.resumes
  where id = current_setting('phase35.resume_a1')::uuid;
  if ready_status <> 'READY' then
    raise exception 'VALID_UPLOAD_NOT_READY status=%', ready_status;
  end if;

  update storage.objects
  set metadata = metadata || '{"overwritten":true}'::jsonb
  where bucket_id = 'private-resumes'
    and name = (
      select storage_path from public.resumes
      where id = current_setting('phase35.resume_a1')::uuid
    );
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'STORAGE_OVERWRITE_UNEXPECTED_SUCCESS affected=%', affected_rows;
  end if;
  raise notice 'PASS VALID_UPLOAD_READY_AND_STORAGE_IMMUTABLE';
end;
$$;

insert into storage.objects (bucket_id, name, metadata, user_metadata)
select
  storage_bucket,
  storage_path,
  jsonb_build_object('mimetype', mime_type, 'size', file_size_bytes),
  jsonb_build_object('contentSha256', content_sha256)
from public.resumes
where id = current_setting('phase35.resume_a2')::uuid;

select public.complete_resume_upload(current_setting('phase35.resume_a2')::uuid);
select public.approve_resume(current_setting('phase35.resume_a1')::uuid);
select public.approve_resume(current_setting('phase35.resume_a2')::uuid);

do $$
declare
  approved_count integer;
  approved_id uuid;
  first_status public.resume_status;
begin
  select count(*), (array_agg(id))[1]
  into approved_count, approved_id
  from public.resumes
  where candidate_profile_id = '71000000-0000-0000-0000-000000000001'
    and status = 'APPROVED'
    and deleted_at is null;

  select status into first_status
  from public.resumes
  where id = current_setting('phase35.resume_a1')::uuid;

  if approved_count <> 1
     or approved_id <> current_setting('phase35.resume_a2')::uuid
     or first_status <> 'ARCHIVED' then
    raise exception
      'APPROVAL_ROTATION_FAILED count=% approved=% first_status=%',
      approved_count, approved_id, first_status;
  end if;
  raise notice 'PASS APPROVAL_ROTATION_AND_SINGLE_APPROVED';
end;
$$;

-- Failed uploads remain metadata-only REJECTED records; no object is deleted.
select set_config(
  'phase35.resume_failed',
  (public.create_resume_upload(
    '71000000-0000-0000-0000-000000000001',
    'failed.pdf',
    'application/pdf',
    300,
    repeat('c', 64)
  )).id::text,
  true
);
select public.reject_resume_upload(current_setting('phase35.resume_failed')::uuid);

-- User B receives an isolated profile and Resume.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '80000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.candidate_profiles (id, user_id, name)
values ('81000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'Synthetic profile B');

select set_config(
  'phase35.resume_b1',
  (public.create_resume_upload(
    '81000000-0000-0000-0000-000000000002',
    'b-v1.pdf',
    'application/pdf',
    400,
    repeat('d', 64)
  )).id::text,
  true
);

do $$
declare
  visible_resumes integer;
begin
  select count(*) into visible_resumes from public.resumes;
  if visible_resumes <> 1 then
    raise exception 'RLS_B_SELECT_FAILED rows=%', visible_resumes;
  end if;

  begin
    perform public.create_resume_upload(
      '71000000-0000-0000-0000-000000000001',
      'cross-tenant.pdf',
      'application/pdf',
      10,
      repeat('e', 64)
    );
    raise exception 'CROSS_TENANT_CREATE_UNEXPECTED_SUCCESS';
  exception when no_data_found then
    raise notice 'PASS CROSS_TENANT_CREATE_BLOCKED sqlstate=%', sqlstate;
  end;

  begin
    perform public.approve_resume(current_setting('phase35.resume_a2')::uuid);
    raise exception 'CROSS_TENANT_APPROVAL_UNEXPECTED_SUCCESS';
  exception when no_data_found then
    raise notice 'PASS CROSS_TENANT_APPROVAL_BLOCKED sqlstate=%', sqlstate;
  end;

  raise notice 'PASS RLS_B_SELECT rows=1';
end;
$$;

-- Soft deletion hides A1's object but preserves it physically and leaves A2 intact.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.soft_delete_resume(current_setting('phase35.resume_a1')::uuid);

do $$
declare
  visible_deleted_object integer;
  active_second integer;
begin
  select count(*) into visible_deleted_object
  from storage.objects
  where name = (
    select storage_path from public.resumes
    where id = current_setting('phase35.resume_a1')::uuid
  );

  select count(*) into active_second
  from public.resumes
  where id = current_setting('phase35.resume_a2')::uuid
    and status = 'APPROVED'
    and deleted_at is null;

  if visible_deleted_object <> 0 or active_second <> 1 then
    raise exception
      'SOFT_DELETE_VISIBILITY_FAILED object=% active_second=%',
      visible_deleted_object, active_second;
  end if;
  raise notice 'PASS SOFT_DELETE_PRESERVES_OTHER_RESUMES';
end;
$$;

reset role;
do $$
declare
  physical_object integer;
begin
  select count(*) into physical_object
  from storage.objects
  where name = (
    select storage_path from public.resumes
    where id = current_setting('phase35.resume_a1')::uuid
  );
  if physical_object <> 1 then
    raise exception 'SOFT_DELETE_REMOVED_OBJECT count=%', physical_object;
  end if;
  raise notice 'PASS SOFT_DELETE_RETAINS_PHYSICAL_OBJECT';
end;
$$;

select array[
  'RLS_A_B',
  'DIRECT_METADATA_MUTATION_BLOCKED',
  'STORAGE_OBJECT_IMMUTABLE',
  'READY_REQUIRES_OBJECT',
  'VALID_UPLOAD_READY',
  'CONTROLLED_APPROVAL',
  'SINGLE_APPROVED_ROTATION',
  'ADVISORY_LOCK_VERSION_ALLOCATION',
  'SOFT_DELETE_RETAINS_OBJECT',
  'CROSS_TENANT_BLOCKED'
] as passed_runtime_checks;

rollback;

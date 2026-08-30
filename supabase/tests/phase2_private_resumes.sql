-- Runtime validation for Phase 2.
-- Run only against the dedicated project. Synthetic rows are rolled back.
begin;

-- Supabase Storage blocks direct table deletes unless its API-scoped transaction
-- flag is enabled. LOCAL keeps this simulation confined to this rollback-only test.
select set_config('storage.allow_delete_query', 'true', true);

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
    '30000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'phase2-user-a@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'phase2-user-b@example.invalid',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.candidate_profiles (id, user_id, name)
values
  (
    '31000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'Synthetic candidate A1'
  ),
  (
    '31000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    'Synthetic candidate A2'
  );

reset role;
insert into public.resumes (
  id,
  user_id,
  candidate_profile_id,
  version,
  status,
  original_filename,
  mime_type,
  file_size_bytes,
  content_sha256,
  updated_at
)
values
  (
    '32000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    1,
    'READY',
    'synthetic-a-v1.pdf',
    'application/pdf',
    1024,
    repeat('a', 64),
    now() - interval '1 day'
  ),
  (
    '32000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    2,
    'READY',
    'synthetic-a-v2.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    2048,
    repeat('b', 64),
    now() - interval '1 day'
  ),
  (
    '32000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000002',
    1,
    'READY',
    'same-content-different-profile.pdf',
    'application/pdf',
    1024,
    repeat('a', 64),
    now() - interval '1 day'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-0000-0000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.candidate_profiles (id, user_id, name)
values (
  '41000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000002',
  'Synthetic candidate B'
);

-- The same content hash and version are valid in a different tenant.
reset role;
insert into public.resumes (
  id,
  user_id,
  candidate_profile_id,
  version,
  status,
  original_filename,
  mime_type,
  file_size_bytes,
  content_sha256,
  updated_at
)
values (
  '42000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000002',
  '41000000-0000-0000-0000-000000000002',
  1,
  'READY',
  'synthetic-b-v1.pdf',
  'application/pdf',
  1024,
  repeat('a', 64),
  now() - interval '1 day'
);

-- Bucket configuration is validated independently from object policies.
reset role;
do $$
declare
  bucket_public boolean;
  bucket_limit bigint;
  bucket_mimes text[];
begin
  select public, file_size_limit, allowed_mime_types
  into bucket_public, bucket_limit, bucket_mimes
  from storage.buckets
  where id = 'private-resumes';

  if bucket_public is distinct from false
     or bucket_limit <> 10485760
     or not bucket_mimes @> array[
       'application/pdf',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
     ]::text[] then
    raise exception
      'BUCKET_CONFIGURATION_FAILED public=% limit=% mimes=%',
      bucket_public,
      bucket_limit,
      bucket_mimes;
  end if;
  raise notice 'PASS BUCKET_PRIVATE_AND_LIMITED';
end;
$$;

-- User A: own read, forged ownership, cross-tenant update and physical delete.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  visible_resumes integer;
begin
  select count(*) into visible_resumes from public.resumes;
  if visible_resumes <> 3 then
    raise exception 'RLS_A_SELECT_FAILED expected=3 actual=%', visible_resumes;
  end if;
  raise notice 'PASS RLS_A_SELECT rows=3';
end;
$$;

do $$
begin
  begin
    insert into public.resumes (
      user_id, candidate_profile_id, version, original_filename,
      mime_type, file_size_bytes, content_sha256
    ) values (
      '40000000-0000-0000-0000-000000000002',
      '41000000-0000-0000-0000-000000000002',
      2,
      'forged-owner.pdf',
      'application/pdf',
      100,
      repeat('c', 64)
    );
    raise exception 'RLS_A_INSERT_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    raise notice 'PASS RLS_A_INSERT sqlstate=%', sqlstate;
  end;
end;
$$;

do $$
begin
  begin
  update public.resumes
  set original_filename = 'forbidden-update.pdf'
  where id = '42000000-0000-0000-0000-000000000002';
    raise exception 'RLS_A_UPDATE_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    raise notice 'PASS RLS_A_UPDATE sqlstate=%', sqlstate;
  end;
end;
$$;

do $$
begin
  begin
    delete from public.resumes
    where id = '32000000-0000-0000-0000-000000000001';
    raise exception 'RLS_A_DELETE_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    raise notice 'PASS RLS_A_DELETE sqlstate=%', sqlstate;
  end;
end;
$$;

-- A cannot bind an A-owned Resume to B's CandidateProfile.
reset role;
do $$
begin
  begin
    insert into public.resumes (
      user_id, candidate_profile_id, version, original_filename,
      mime_type, file_size_bytes, content_sha256
    ) values (
      '30000000-0000-0000-0000-000000000001',
      '41000000-0000-0000-0000-000000000002',
      3,
      'cross-tenant.pdf',
      'application/pdf',
      100,
      repeat('d', 64)
    );
    raise exception 'FK_CROSS_TENANT_UNEXPECTED_SUCCESS';
  exception when foreign_key_violation then
    raise notice 'PASS FK_CROSS_TENANT sqlstate=%', sqlstate;
  end;
end;
$$;

-- Version, hash, deduplication, MIME, size and path constraints.
do $$
begin
  begin
    insert into public.resumes (
      user_id, candidate_profile_id, version, original_filename,
      mime_type, file_size_bytes, content_sha256
    ) values (
      '30000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      0,
      'invalid-version.pdf',
      'application/pdf',
      100,
      repeat('c', 64)
    );
    raise exception 'VERSION_CHECK_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS VERSION_CHECK sqlstate=%', sqlstate;
  end;

  begin
    insert into public.resumes (
      user_id, candidate_profile_id, version, original_filename,
      mime_type, file_size_bytes, content_sha256
    ) values (
      '30000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      1,
      'duplicate-version.pdf',
      'application/pdf',
      100,
      repeat('c', 64)
    );
    raise exception 'VERSION_UNIQUE_UNEXPECTED_SUCCESS';
  exception when unique_violation then
    raise notice 'PASS VERSION_UNIQUE sqlstate=%', sqlstate;
  end;

  begin
    insert into public.resumes (
      user_id, candidate_profile_id, version, original_filename,
      mime_type, file_size_bytes, content_sha256
    ) values (
      '30000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      3,
      'invalid-hash.pdf',
      'application/pdf',
      100,
      'NOT-A-SHA256'
    );
    raise exception 'SHA256_CHECK_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS SHA256_CHECK sqlstate=%', sqlstate;
  end;

  begin
    insert into public.resumes (
      user_id, candidate_profile_id, version, original_filename,
      mime_type, file_size_bytes, content_sha256
    ) values (
      '30000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      3,
      'duplicate-content.pdf',
      'application/pdf',
      100,
      repeat('a', 64)
    );
    raise exception 'CONTENT_DEDUP_UNEXPECTED_SUCCESS';
  exception when unique_violation then
    raise notice 'PASS CONTENT_DEDUP sqlstate=%', sqlstate;
  end;

  begin
    insert into public.resumes (
      user_id, candidate_profile_id, version, original_filename,
      mime_type, file_size_bytes, content_sha256
    ) values (
      '30000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      3,
      'invalid-mime.txt',
      'text/plain',
      100,
      repeat('c', 64)
    );
    raise exception 'MIME_CHECK_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS MIME_CHECK sqlstate=%', sqlstate;
  end;

  begin
    insert into public.resumes (
      user_id, candidate_profile_id, version, original_filename,
      mime_type, file_size_bytes, content_sha256
    ) values (
      '30000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      3,
      'empty.pdf',
      'application/pdf',
      0,
      repeat('c', 64)
    );
    raise exception 'SIZE_ZERO_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS SIZE_ZERO sqlstate=%', sqlstate;
  end;

  begin
    insert into public.resumes (
      user_id, candidate_profile_id, version, original_filename,
      mime_type, file_size_bytes, content_sha256
    ) values (
      '30000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      3,
      'too-large.pdf',
      'application/pdf',
      10485761,
      repeat('c', 64)
    );
    raise exception 'SIZE_MAX_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS SIZE_MAX sqlstate=%', sqlstate;
  end;

  begin
    insert into public.resumes (
      user_id, candidate_profile_id, version, original_filename,
      mime_type, file_size_bytes, content_sha256
    ) values (
      '30000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      3,
      '../traversal.pdf',
      'application/pdf',
      100,
      repeat('c', 64)
    );
    raise exception 'FILENAME_TRAVERSAL_UNEXPECTED_SUCCESS';
  exception when check_violation then
    raise notice 'PASS FILENAME_TRAVERSAL sqlstate=%', sqlstate;
  end;
end;
$$;

do $$
begin
  begin
    insert into public.resumes (
      user_id, candidate_profile_id, version, original_filename,
      storage_path, mime_type, file_size_bytes, content_sha256
    ) values (
      '30000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      3,
      'spoofed-path.pdf',
      '40000000-0000-0000-0000-000000000002/spoofed.pdf',
      'application/pdf',
      100,
      repeat('c', 64)
    );
    raise exception 'STORAGE_PATH_SPOOF_UNEXPECTED_SUCCESS';
  exception when generated_always then
    raise notice 'PASS STORAGE_PATH_GENERATED sqlstate=%', sqlstate;
  end;
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Approval is the active pointer: only one non-deleted APPROVED Resume per profile.
select public.approve_resume('32000000-0000-0000-0000-000000000001');

do $$
declare
  approval_count integer;
  approval_time timestamptz;
begin
  select count(*), max(approved_at)
  into approval_count, approval_time
  from public.resumes
  where candidate_profile_id = '31000000-0000-0000-0000-000000000001'
    and status = 'APPROVED'
    and deleted_at is null;

  if approval_count <> 1 or approval_time is null then
    raise exception
      'APPROVAL_INITIAL_FAILED count=% approved_at=%',
      approval_count,
      approval_time;
  end if;
  raise notice 'PASS APPROVAL_INITIAL count=1';
end;
$$;

do $$
begin
  begin
    update public.resumes
    set status = 'APPROVED'
    where id = '32000000-0000-0000-0000-000000000002';
    raise exception 'APPROVAL_DIRECT_UPDATE_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    raise notice 'PASS APPROVAL_DIRECT_UPDATE_BLOCKED sqlstate=%', sqlstate;
  end;
end;
$$;

select public.approve_resume('32000000-0000-0000-0000-000000000002');

do $$
declare
  approved_id uuid;
  archived_time timestamptz;
begin
  select id into approved_id
  from public.resumes
  where candidate_profile_id = '31000000-0000-0000-0000-000000000001'
    and status = 'APPROVED'
    and deleted_at is null;

  select archived_at into archived_time
  from public.resumes
  where id = '32000000-0000-0000-0000-000000000001';

  if approved_id <> '32000000-0000-0000-0000-000000000002'
     or archived_time is null then
    raise exception
      'APPROVAL_ROTATION_FAILED approved=% archived_at=%',
      approved_id,
      archived_time;
  end if;
  raise notice 'PASS APPROVAL_ROTATION';
end;
$$;

-- updated_at is maintained by the shared Phase 1 trigger function.
do $$
declare
  changed_at timestamptz;
begin
  select updated_at into changed_at
  from public.resumes
  where id = '32000000-0000-0000-0000-000000000002';

  if changed_at <= now() - interval '1 hour' then
    raise exception 'UPDATED_AT_TRIGGER_FAILED value=%', changed_at;
  end if;
  raise notice 'PASS UPDATED_AT_TRIGGER';
end;
$$;

-- Insert physical Storage rows through RLS. The object names must exactly match Resume metadata.
insert into storage.objects (bucket_id, name, metadata)
select storage_bucket, storage_path, jsonb_build_object('mimetype', mime_type)
from public.resumes
where id = '32000000-0000-0000-0000-000000000002';

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values (
      'private-resumes',
      '40000000-0000-0000-0000-000000000002/41000000-0000-0000-0000-000000000002/42000000-0000-0000-0000-000000000002/v1/resume.pdf',
      '{}'::jsonb
    );
    raise exception 'STORAGE_A_INSERT_B_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    raise notice 'PASS STORAGE_A_INSERT_B sqlstate=%', sqlstate;
  end;
end;
$$;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values (
      'private-resumes',
      '30000000-0000-0000-0000-000000000001/../unregistered/resume.pdf',
      '{}'::jsonb
    );
    raise exception 'STORAGE_UNREGISTERED_PATH_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    raise notice 'PASS STORAGE_UNREGISTERED_PATH sqlstate=%', sqlstate;
  end;
end;
$$;

-- User B inserts B's object and can see only that object.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-0000-0000-000000000002',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into storage.objects (bucket_id, name, metadata)
select storage_bucket, storage_path, jsonb_build_object('mimetype', mime_type)
from public.resumes
where id = '42000000-0000-0000-0000-000000000002';

do $$
declare
  visible_resumes integer;
  visible_objects integer;
begin
  select count(*) into visible_resumes from public.resumes;
  select count(*) into visible_objects
  from storage.objects
  where bucket_id = 'private-resumes';

  if visible_resumes <> 1 or visible_objects <> 1 then
    raise exception
      'RLS_B_SELECT_FAILED resumes=% objects=%',
      visible_resumes,
      visible_objects;
  end if;
  raise notice 'PASS RLS_B_SELECT resumes=1 objects=1';
end;
$$;

do $$
declare
  affected_rows integer;
begin
  update storage.objects
  set metadata = '{"forbidden":true}'::jsonb
  where name = '30000000-0000-0000-0000-000000000001/31000000-0000-0000-0000-000000000001/32000000-0000-0000-0000-000000000002/v2/resume.docx';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'STORAGE_B_UPDATE_A_FAILED affected=%', affected_rows;
  end if;
  raise notice 'PASS STORAGE_B_UPDATE_A affected=0';
end;
$$;

do $$
declare
  affected_rows integer;
begin
  delete from storage.objects
  where name like '30000000-0000-0000-0000-000000000001/%';
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'STORAGE_B_DELETE_A_FAILED affected=%', affected_rows;
  end if;
  raise notice 'PASS STORAGE_B_DELETE_A affected=0';
end;
$$;

-- B cannot forge A metadata, update A's Resume, or physically delete B's Resume.
do $$
begin
  begin
    insert into public.resumes (
      user_id, candidate_profile_id, version, original_filename,
      mime_type, file_size_bytes, content_sha256
    ) values (
      '30000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      3,
      'forged-by-b.pdf',
      'application/pdf',
      100,
      repeat('c', 64)
    );
    raise exception 'RLS_B_INSERT_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    raise notice 'PASS RLS_B_INSERT sqlstate=%', sqlstate;
  end;
end;
$$;

do $$
begin
  begin
  update public.resumes
  set original_filename = 'forbidden-by-b.pdf'
  where id = '32000000-0000-0000-0000-000000000002';
    raise exception 'RLS_B_UPDATE_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    raise notice 'PASS RLS_B_UPDATE sqlstate=%', sqlstate;
  end;
end;
$$;

do $$
begin
  begin
    delete from public.resumes
    where id = '42000000-0000-0000-0000-000000000002';
    raise exception 'RLS_B_DELETE_UNEXPECTED_SUCCESS';
  exception when insufficient_privilege then
    raise notice 'PASS RLS_B_DELETE sqlstate=%', sqlstate;
  end;
end;
$$;

-- Resume objects are immutable and cannot be physically deleted by clients.
do $$
declare
  affected_rows integer;
begin
  update storage.objects
  set metadata = '{"owner":"B","mimetype":"application/pdf"}'::jsonb
  where name = (
    select storage_path
    from public.resumes
    where id = '42000000-0000-0000-0000-000000000002'
  );
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'STORAGE_B_UPDATE_UNEXPECTED_SUCCESS affected=%', affected_rows;
  end if;

  delete from storage.objects
  where name = (
    select storage_path
    from public.resumes
    where id = '42000000-0000-0000-0000-000000000002'
  );
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then
    raise exception 'STORAGE_B_DELETE_UNEXPECTED_SUCCESS affected=%', affected_rows;
  end if;
  raise notice 'PASS STORAGE_B_OBJECT_IMMUTABLE';
end;
$$;

-- A soft-deletes an archived Resume; its object becomes unreadable but remains deletable for cleanup.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.soft_delete_resume('32000000-0000-0000-0000-000000000002');

do $$
declare
  deleted_value timestamptz;
  visible_object_count integer;
begin
  select deleted_at into deleted_value
  from public.resumes
  where id = '32000000-0000-0000-0000-000000000002';

  select count(*) into visible_object_count
  from storage.objects
  where name like '30000000-0000-0000-0000-000000000001/%';

  if deleted_value is null or visible_object_count <> 0 then
    raise exception
      'SOFT_DELETE_FAILED deleted_at=% visible_objects=%',
      deleted_value,
      visible_object_count;
  end if;
  raise notice 'PASS SOFT_DELETE_AND_STORAGE_HIDE';
end;
$$;

select array[
  'RESUME_OWN_CREATE',
  'RLS_A_B_SELECT_INSERT_UPDATE_DELETE',
  'CROSS_TENANT_FK',
  'VERSION_POSITIVE_AND_UNIQUE',
  'SHA256_FORMAT_AND_TENANT_SCOPED_DEDUP',
  'MIME_AND_SIZE_LIMITS',
  'PRIVATE_BUCKET',
  'GENERATED_STORAGE_PATH',
  'STORAGE_RLS_A_B',
  'SOFT_DELETE',
  'SINGLE_ACTIVE_APPROVAL',
  'UPDATED_AT_TRIGGER'
] as passed_runtime_checks;

reset role;
rollback;

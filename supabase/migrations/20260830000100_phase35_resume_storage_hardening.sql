begin;

-- Resume bytes are immutable. A new file must always receive a new Resume row
-- and generated object path; authenticated clients may no longer update or
-- physically delete existing objects.
drop policy if exists resume_objects_update_own on storage.objects;
drop policy if exists resume_objects_delete_own on storage.objects;

-- Direct metadata mutation would bypass lifecycle and version allocation.
-- Authenticated clients retain owner-scoped reads; all writes use the narrow
-- SECURITY DEFINER functions below, which derive ownership from auth.uid().
drop policy if exists resumes_insert_own on public.resumes;
drop policy if exists resumes_update_own on public.resumes;
revoke insert, update, delete on public.resumes from authenticated;

create or replace function public.create_resume_upload(
  p_candidate_profile_id uuid,
  p_original_filename text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_content_sha256 text
)
returns public.resumes
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  next_version integer;
  created_resume public.resumes;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform 1
  from public.candidate_profiles
  where id = p_candidate_profile_id
    and user_id = current_user_id
    and deleted_at is null;

  if not found then
    raise exception 'CandidateProfile not found' using errcode = 'P0002';
  end if;

  -- Serializes version allocation per tenant/profile without another table.
  -- Hash collisions only serialize unrelated profiles; they cannot duplicate a
  -- version because the existing unique constraint remains authoritative.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'resume-version:' || current_user_id::text || ':' || p_candidate_profile_id::text,
      0
    )
  );

  select coalesce(max(version), 0) + 1
  into next_version
  from public.resumes
  where user_id = current_user_id
    and candidate_profile_id = p_candidate_profile_id;

  insert into public.resumes (
    user_id,
    candidate_profile_id,
    version,
    status,
    original_filename,
    mime_type,
    file_size_bytes,
    content_sha256
  ) values (
    current_user_id,
    p_candidate_profile_id,
    next_version,
    'PROCESSING',
    p_original_filename,
    p_mime_type,
    p_file_size_bytes,
    p_content_sha256
  )
  returning * into created_resume;

  return created_resume;
end;
$$;

create or replace function public.complete_resume_upload(p_resume_id uuid)
returns public.resumes
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_resume public.resumes;
  object_metadata jsonb;
  object_user_metadata jsonb;
  object_mime_type text;
  object_size_text text;
  object_hash text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
  into target_resume
  from public.resumes
  where id = p_resume_id
    and user_id = current_user_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Resume not found' using errcode = 'P0002';
  end if;

  if target_resume.status <> 'PROCESSING' then
    raise exception 'Resume is not processing' using errcode = '23514';
  end if;

  select metadata, user_metadata
  into object_metadata, object_user_metadata
  from storage.objects
  where bucket_id = target_resume.storage_bucket
    and name = target_resume.storage_path
    and coalesce(is_delete_marker, false) = false;

  if not found then
    raise exception 'Resume object not found' using errcode = 'P0002';
  end if;

  object_mime_type := object_metadata->>'mimetype';
  object_size_text := coalesce(
    object_metadata->>'size',
    object_metadata->>'contentLength'
  );
  object_hash := object_user_metadata->>'contentSha256';

  if object_mime_type is distinct from target_resume.mime_type then
    raise exception 'Resume object MIME mismatch' using errcode = '23514';
  end if;

  if object_size_text is not null
     and object_size_text ~ '^[0-9]+$'
     and object_size_text::bigint <> target_resume.file_size_bytes then
    raise exception 'Resume object size mismatch' using errcode = '23514';
  end if;

  if object_hash is distinct from target_resume.content_sha256 then
    raise exception 'Resume object hash metadata mismatch' using errcode = '23514';
  end if;

  update public.resumes
  set status = 'READY'
  where id = target_resume.id
  returning * into target_resume;

  return target_resume;
end;
$$;

create or replace function public.reject_resume_upload(p_resume_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.resumes
  set status = 'REJECTED'
  where id = p_resume_id
    and user_id = current_user_id
    and status = 'PROCESSING'
    and deleted_at is null;

  if not found then
    raise exception 'Processing Resume not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.approve_resume(p_resume_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_candidate_profile_id uuid;
  target_status public.resume_status;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select candidate_profile_id, status
  into target_candidate_profile_id, target_status
  from public.resumes
  where id = p_resume_id
    and user_id = current_user_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Resume not found' using errcode = 'P0002';
  end if;

  if target_status <> 'READY' then
    raise exception 'Only READY resumes can be approved' using errcode = '23514';
  end if;

  update public.resumes
  set status = 'ARCHIVED'
  where user_id = current_user_id
    and candidate_profile_id = target_candidate_profile_id
    and status = 'APPROVED'
    and deleted_at is null
    and id <> p_resume_id;

  update public.resumes
  set status = 'APPROVED'
  where id = p_resume_id
    and user_id = current_user_id;
end;
$$;

create or replace function public.archive_resume(p_resume_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.resumes
  set status = 'ARCHIVED'
  where id = p_resume_id
    and user_id = current_user_id
    and status in ('READY', 'APPROVED')
    and deleted_at is null;

  if not found then
    raise exception 'Archivable Resume not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.soft_delete_resume(p_resume_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.resumes
  set deleted_at = now()
  where id = p_resume_id
    and user_id = current_user_id
    and deleted_at is null;

  if not found then
    raise exception 'Resume not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.create_resume_upload(uuid, text, text, bigint, text) from public;
revoke all on function public.complete_resume_upload(uuid) from public;
revoke all on function public.reject_resume_upload(uuid) from public;
revoke all on function public.approve_resume(uuid) from public;
revoke all on function public.archive_resume(uuid) from public;
revoke all on function public.soft_delete_resume(uuid) from public;

grant execute on function public.create_resume_upload(uuid, text, text, bigint, text)
  to authenticated;
grant execute on function public.complete_resume_upload(uuid) to authenticated;
grant execute on function public.reject_resume_upload(uuid) to authenticated;
grant execute on function public.approve_resume(uuid) to authenticated;
grant execute on function public.archive_resume(uuid) to authenticated;
grant execute on function public.soft_delete_resume(uuid) to authenticated;

commit;

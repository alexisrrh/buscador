begin;

create type public.resume_status as enum (
  'DRAFT',
  'PROCESSING',
  'READY',
  'APPROVED',
  'ARCHIVED',
  'REJECTED'
);

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  candidate_profile_id uuid not null,
  version integer not null,
  status public.resume_status not null default 'DRAFT',
  original_filename text not null,
  storage_bucket text not null default 'private-resumes',
  mime_type text not null,
  storage_path text generated always as (
    user_id::text
    || '/' || candidate_profile_id::text
    || '/' || id::text
    || '/v' || version::text
    || '/resume.'
    || case mime_type
      when 'application/pdf' then 'pdf'
      when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        then 'docx'
    end
  ) stored,
  file_size_bytes bigint not null,
  content_sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  archived_at timestamptz,
  deleted_at timestamptz,
  constraint resumes_candidate_owner_fk
    foreign key (user_id, candidate_profile_id)
    references public.candidate_profiles (user_id, id)
    on delete cascade,
  constraint resumes_version_check check (version > 0),
  constraint resumes_original_filename_check check (
    btrim(original_filename) <> ''
    and length(original_filename) <= 255
    and original_filename !~ '[/\\]'
  ),
  constraint resumes_storage_bucket_check
    check (storage_bucket = 'private-resumes'),
  constraint resumes_mime_type_check check (
    mime_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),
  constraint resumes_file_size_check check (
    file_size_bytes > 0
    and file_size_bytes <= 10485760
  ),
  constraint resumes_content_sha256_check check (
    content_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint resumes_approved_timestamp_check check (
    approved_at is null or status in ('APPROVED', 'ARCHIVED')
  ),
  constraint resumes_approved_status_check check (
    status <> 'APPROVED' or approved_at is not null
  ),
  constraint resumes_archived_timestamp_check check (
    archived_at is null or status = 'ARCHIVED'
  ),
  constraint resumes_archived_status_check check (
    status <> 'ARCHIVED' or archived_at is not null
  ),
  unique (user_id, candidate_profile_id, id),
  unique (user_id, candidate_profile_id, version),
  unique (user_id, candidate_profile_id, content_sha256)
);

create index resumes_user_id_idx
  on public.resumes (user_id);

create index resumes_candidate_profile_id_idx
  on public.resumes (candidate_profile_id);

create index resumes_status_idx
  on public.resumes (status);

create index resumes_user_candidate_created_idx
  on public.resumes (user_id, candidate_profile_id, created_at desc);

create unique index resumes_one_approved_per_candidate_idx
  on public.resumes (user_id, candidate_profile_id)
  where status = 'APPROVED' and deleted_at is null;

create or replace function public.set_resume_lifecycle_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'APPROVED' then
    if tg_op = 'INSERT' or old.status <> 'APPROVED' then
      new.approved_at = coalesce(new.approved_at, now());
    end if;
    new.archived_at = null;
  elsif new.status = 'ARCHIVED' then
    new.archived_at = coalesce(new.archived_at, now());
  end if;

  return new;
end;
$$;

create trigger resumes_set_lifecycle_timestamps
before insert or update of status on public.resumes
for each row execute function public.set_resume_lifecycle_timestamps();

create trigger resumes_set_updated_at
before update on public.resumes
for each row execute function public.set_updated_at();

alter table public.resumes enable row level security;
alter table public.resumes force row level security;

create policy resumes_select_own
on public.resumes for select
to authenticated
using (user_id = (select auth.uid()));

create policy resumes_insert_own
on public.resumes for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy resumes_update_own
on public.resumes for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on public.resumes from anon;
grant select, insert, update on public.resumes to authenticated;
revoke delete on public.resumes from authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'private-resumes',
  'private-resumes',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
);

create policy resume_objects_select_own
on storage.objects for select
to authenticated
using (
  bucket_id = 'private-resumes'
  and exists (
    select 1
    from public.resumes as resume
    where resume.user_id = (select auth.uid())
      and resume.storage_bucket = storage.objects.bucket_id
      and resume.storage_path = storage.objects.name
      and resume.deleted_at is null
  )
);

create policy resume_objects_insert_own
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'private-resumes'
  and exists (
    select 1
    from public.resumes as resume
    where resume.user_id = (select auth.uid())
      and resume.storage_bucket = storage.objects.bucket_id
      and resume.storage_path = storage.objects.name
      and resume.deleted_at is null
  )
);

create policy resume_objects_update_own
on storage.objects for update
to authenticated
using (
  bucket_id = 'private-resumes'
  and exists (
    select 1
    from public.resumes as resume
    where resume.user_id = (select auth.uid())
      and resume.storage_bucket = storage.objects.bucket_id
      and resume.storage_path = storage.objects.name
      and resume.deleted_at is null
  )
)
with check (
  bucket_id = 'private-resumes'
  and exists (
    select 1
    from public.resumes as resume
    where resume.user_id = (select auth.uid())
      and resume.storage_bucket = storage.objects.bucket_id
      and resume.storage_path = storage.objects.name
      and resume.deleted_at is null
  )
);

create policy resume_objects_delete_own
on storage.objects for delete
to authenticated
using (
  bucket_id = 'private-resumes'
  and exists (
    select 1
    from public.resumes as resume
    where resume.user_id = (select auth.uid())
      and resume.storage_bucket = storage.objects.bucket_id
      and resume.storage_path = storage.objects.name
  )
);

commit;

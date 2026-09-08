begin;

create type public.derived_resume_status as enum ('GENERATING', 'READY', 'FAILED', 'ARCHIVED');
create type public.derived_resume_format as enum ('PDF', 'DOCX');
alter table public.application_drafts add constraint application_drafts_render_identity
  unique (user_id, candidate_profile_id, id, source_resume_id, job_offer_id);
create table public.derived_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  candidate_profile_id uuid not null,
  application_draft_id uuid not null,
  source_resume_id uuid not null,
  job_offer_id uuid not null,
  status public.derived_resume_status not null default 'GENERATING',
  format public.derived_resume_format not null default 'PDF',
  storage_bucket text not null default 'derived-resumes' check (storage_bucket = 'derived-resumes'),
  storage_path text generated always as (user_id::text || '/' || candidate_profile_id::text || '/' || application_draft_id::text || '/' || id::text || '/resume.' || case format when 'PDF' then 'pdf' else 'docx' end) stored,
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint check (size_bytes between 512 and 10485760),
  mime_type text not null default 'application/pdf',
  pages integer check (pages between 1 and 30),
  generation_version text not null default 'resume-renderer-v1',
  content_snapshot jsonb,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, candidate_profile_id, application_draft_id, source_resume_id, job_offer_id)
    references public.application_drafts (user_id, candidate_profile_id, id, source_resume_id, job_offer_id),
  unique (user_id, candidate_profile_id, application_draft_id, source_resume_id, job_offer_id, id),
  check ((format = 'PDF' and mime_type = 'application/pdf') or (format = 'DOCX' and mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  check (status not in ('READY', 'ARCHIVED') or (sha256 is not null and size_bytes is not null and pages is not null and content_snapshot is not null)),
  check (status <> 'FAILED' or failure_code is not null)
);
create index derived_resumes_draft_idx on public.derived_resumes (user_id, application_draft_id, created_at desc);
alter table public.derived_resumes enable row level security;
alter table public.derived_resumes force row level security;
revoke all on public.derived_resumes from anon, authenticated;
grant select on public.derived_resumes to authenticated;
grant select, insert, update on public.derived_resumes to service_role;
create policy derived_resumes_select_own on public.derived_resumes for select to authenticated using (user_id = (select auth.uid()));

create function public.guard_derived_resume() returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' and (new.status <> 'GENERATING' or new.sha256 is not null or new.size_bytes is not null or new.content_snapshot is not null) then
    raise exception 'New render must start GENERATING' using errcode = '23514';
  end if;
  if TG_OP = 'INSERT' or (old.status = 'GENERATING' and new.status = 'READY') then
    perform 1 from public.application_drafts d join public.resumes r on r.id = d.source_resume_id
      where d.id = new.application_draft_id and d.status = 'APPROVED' and r.status = 'APPROVED' and r.deleted_at is null for share of d, r;
    if not found then raise exception 'Approved draft and source required' using errcode = '23514'; end if;
  end if;
  if TG_OP = 'UPDATE' then
    if (to_jsonb(new) - array['status','sha256','size_bytes','pages','content_snapshot','failure_code','updated_at','storage_path'])
      is distinct from (to_jsonb(old) - array['status','sha256','size_bytes','pages','content_snapshot','failure_code','updated_at','storage_path']) then
      raise exception 'Immutable derived identity' using errcode = '23514';
    end if;
    if old.status <> 'GENERATING' and not (old.status = 'READY' and new.status = 'ARCHIVED' and
      (to_jsonb(new) - array['status','updated_at','storage_path']) = (to_jsonb(old) - array['status','updated_at','storage_path'])) then
      raise exception 'Immutable derived artifact' using errcode = '23514';
    end if;
    if old.status = 'GENERATING' and new.status not in ('READY','FAILED') then raise exception 'Invalid lifecycle' using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;
create trigger derived_resume_guard before insert or update on public.derived_resumes for each row execute function public.guard_derived_resume();
create trigger derived_resume_updated before update on public.derived_resumes for each row execute function public.set_updated_at();

alter table public.applications add column derived_resume_id uuid;
alter table public.applications add constraint applications_derived_identity foreign key
  (user_id, candidate_profile_id, application_draft_id, resume_id, job_offer_id, derived_resume_id)
  references public.derived_resumes (user_id, candidate_profile_id, application_draft_id, source_resume_id, job_offer_id, id);
create function public.guard_application_derived_resume() returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and old.derived_resume_id is distinct from new.derived_resume_id and
    (old.attempt_count > 0 or old.status in ('SUBMITTING','SUBMITTED','WITHDRAWN')) then
    raise exception 'Application artifact already frozen' using errcode = '23514';
  end if;
  if new.derived_resume_id is not null and (TG_OP = 'INSERT' or old.derived_resume_id is distinct from new.derived_resume_id) then
    perform 1 from public.derived_resumes where id = new.derived_resume_id and status = 'READY' for share;
    if not found then raise exception 'READY derived resume required' using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;
create trigger application_derived_guard before insert or update on public.applications for each row execute function public.guard_application_derived_resume();

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('derived-resumes','derived-resumes',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
-- No client storage policies: download is authenticated and proxied by the server.
create function public.guard_derived_storage() returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    if old.bucket_id = 'derived-resumes' then raise exception 'Derived artifact deletion forbidden' using errcode = '23514'; end if;
    return old;
  end if;
  if TG_OP = 'UPDATE' and (old.bucket_id = 'derived-resumes' or new.bucket_id = 'derived-resumes') then
    raise exception 'Derived bytes cannot be overwritten' using errcode = '23514';
  end if;
  if TG_OP = 'INSERT' and new.bucket_id = 'derived-resumes' then
    perform 1 from public.derived_resumes where storage_path = new.name and status = 'GENERATING';
    if not found then raise exception 'Generating derived resume required' using errcode = '23514'; end if;
  end if;
  return new;
end;
$$;
create trigger derived_storage_guard before insert or update or delete on storage.objects for each row execute function public.guard_derived_storage();
commit;

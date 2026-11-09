-- 06E2: private derived artifacts; no Storage provider activation.
create type public.derived_resume_status as enum ('GENERATING', 'READY', 'FAILED', 'ARCHIVED');
create type public.derived_resume_format as enum ('PDF', 'DOCX');
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
ALTER TABLE public.derived_resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.derived_resumes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.derived_resumes FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.derived_resumes TO bv_app;
CREATE POLICY derived_resumes_owner ON public.derived_resumes TO bv_app USING (user_id=(SELECT app.current_user_id())) WITH CHECK (user_id=(SELECT app.current_user_id()));
ALTER TABLE public.derived_resumes ADD CONSTRAINT derived_snapshot_object CHECK(content_snapshot IS NULL OR jsonb_typeof(content_snapshot)='object');
ALTER TABLE public.derived_resumes ADD CONSTRAINT derived_generation_version CHECK(btrim(generation_version)<>'');
ALTER TABLE public.derived_resumes ADD CONSTRAINT derived_ready_no_failure CHECK(status<>'READY' OR failure_code IS NULL);
create function app.guard_derived_resume() returns trigger language plpgsql SECURITY INVOKER set search_path = '' as $$
begin
  if TG_OP = 'INSERT' and (new.status <> 'GENERATING' or new.sha256 is not null or new.size_bytes is not null or new.content_snapshot is not null) then
    raise exception 'New render must start GENERATING' using errcode = '23514';
  end if;
  if TG_OP = 'INSERT' or (old.status = 'GENERATING' and new.status = 'READY') then
    perform 1 from public.application_drafts d join public.resumes r on r.id = d.source_resume_id
      where d.id = new.application_draft_id and d.status = 'APPROVED' and r.status = 'APPROVED' and r.deleted_at is null and d.deleted_at is null
      and d.user_id=new.user_id and d.candidate_profile_id=new.candidate_profile_id
      and d.source_resume_id=new.source_resume_id and d.job_offer_id=new.job_offer_id
      and exists(select 1 from public.candidate_profiles c join public.profiles u on u.id=c.user_id
        where c.id=d.candidate_profile_id and c.user_id=d.user_id and c.deleted_at is null and u.deleted_at is null)
      for share of d, r;
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
create trigger derived_resume_guard before insert or update on public.derived_resumes for each row execute function app.guard_derived_resume();
create trigger derived_resume_updated before update on public.derived_resumes for each row execute function app.set_catalog_updated_at();

alter table public.applications add column derived_resume_id uuid;
alter table public.applications add constraint applications_derived_identity foreign key
  (user_id, candidate_profile_id, application_draft_id, resume_id, job_offer_id, derived_resume_id)
  references public.derived_resumes (user_id, candidate_profile_id, application_draft_id, source_resume_id, job_offer_id, id);
create function app.guard_application_derived_resume() returns trigger language plpgsql SECURITY INVOKER set search_path = '' as $$
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
create trigger application_derived_guard before insert or update on public.applications for each row execute function app.guard_application_derived_resume();


REVOKE ALL ON FUNCTION app.guard_derived_resume() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.guard_application_derived_resume() FROM PUBLIC;

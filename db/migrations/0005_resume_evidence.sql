-- 06E1: base CV and evidence. Derived CVs require application_drafts (06F).
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
    ON DELETE RESTRICT,
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


create table public.resume_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) ON DELETE RESTRICT,
  candidate_profile_id uuid not null,
  source_resume_id uuid not null,
  extractor_version text not null,
  extracted_text text not null check (btrim(extracted_text) <> ''),
  structured_content jsonb not null check (jsonb_typeof(structured_content) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resume_extractions_resume_owner_fk
    foreign key (user_id, candidate_profile_id, source_resume_id)
    references public.resumes (user_id, candidate_profile_id, id)
    ON DELETE RESTRICT,
  unique (source_resume_id, extractor_version)
);


create type public.professional_evidence_subject as enum ('PROJECT', 'EMPLOYMENT');
create type public.professional_evidence_category as enum ('PROBLEM', 'RESPONSIBILITY', 'FEATURE', 'FRONTEND', 'BACKEND', 'API_INTEGRATION', 'AUTH', 'DATABASE', 'STORAGE', 'ARCHITECTURE', 'TESTING', 'DEPLOYMENT', 'TECHNOLOGY', 'RESULT', 'METRIC', 'OTHER');
create type public.professional_evidence_source as enum ('APPROVED_RESUME', 'USER_CONFIRMED', 'VERIFIED_TRAINING');
create type public.professional_evidence_verification as enum ('VERIFIED', 'CONFIRMABLE', 'MISSING', 'UNKNOWN');

create table public.professional_evidence_profiles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) ON DELETE RESTRICT,
  candidate_profile_id uuid not null, subject_type public.professional_evidence_subject not null,
  display_name text not null check (btrim(display_name) <> ''), description text,
  employment_role text, employment_company text, employment_dates text, employment_location text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (user_id, candidate_profile_id) references public.candidate_profiles(user_id, id) ON DELETE RESTRICT,
  unique(user_id,candidate_profile_id,id), check ((subject_type = 'PROJECT' and employment_role is null and employment_company is null) or subject_type = 'EMPLOYMENT')
);
create table public.professional_evidence_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, candidate_profile_id uuid not null, profile_id uuid not null,
  category public.professional_evidence_category not null, exact_claim text not null check (btrim(exact_claim) <> ''),
  source_type public.professional_evidence_source not null, source_reference text not null check (btrim(source_reference) <> ''),
  verification_status public.professional_evidence_verification not null default 'UNKNOWN', confirmed_at timestamptz,
  relevance_tags text[] not null default '{}'::text[], created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (user_id, candidate_profile_id) references public.candidate_profiles(user_id, id) ON DELETE RESTRICT,
  foreign key (user_id,candidate_profile_id,profile_id) references public.professional_evidence_profiles(user_id,candidate_profile_id,id) ON DELETE RESTRICT,
  check ((source_type <> 'USER_CONFIRMED' or (verification_status = 'VERIFIED' and confirmed_at is not null)) and (verification_status <> 'VERIFIED' or source_type <> 'USER_CONFIRMED' or confirmed_at is not null))
);
create table public.professional_evidence_urls (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, candidate_profile_id uuid not null, profile_id uuid not null,
  url text not null check (url ~ '^https?://'), url_type text not null check (url_type in ('DEMO', 'REPOSITORY', 'PORTFOLIO')),
  source_type public.professional_evidence_source not null, source_reference text not null check (btrim(source_reference) <> ''),
  verification_status public.professional_evidence_verification not null default 'UNKNOWN', confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (user_id, candidate_profile_id) references public.candidate_profiles(user_id, id) ON DELETE RESTRICT,
  foreign key (user_id,candidate_profile_id,profile_id) references public.professional_evidence_profiles(user_id,candidate_profile_id,id) ON DELETE RESTRICT,
  unique(profile_id, url), check (source_type <> 'USER_CONFIRMED' or (verification_status = 'VERIFIED' and confirmed_at is not null))
);

ALTER TABLE public.resume_extractions ADD COLUMN deleted_at timestamptz;

ALTER TABLE public.professional_evidence_profiles ADD COLUMN deleted_at timestamptz;

ALTER TABLE public.professional_evidence_items ADD COLUMN deleted_at timestamptz;

ALTER TABLE public.professional_evidence_urls ADD COLUMN deleted_at timestamptz;

ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.resumes FROM PUBLIC;
CREATE POLICY resumes_owner ON public.resumes TO bv_app USING (user_id=(SELECT app.current_user_id())) WITH CHECK (user_id=(SELECT app.current_user_id()));
GRANT SELECT,INSERT,UPDATE ON public.resumes TO bv_app;

ALTER TABLE public.resume_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_extractions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.resume_extractions FROM PUBLIC;
CREATE POLICY resume_extractions_owner ON public.resume_extractions TO bv_app USING (user_id=(SELECT app.current_user_id())) WITH CHECK (user_id=(SELECT app.current_user_id()));
GRANT SELECT,INSERT,UPDATE ON public.resume_extractions TO bv_app;

ALTER TABLE public.professional_evidence_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_evidence_profiles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.professional_evidence_profiles FROM PUBLIC;
CREATE POLICY professional_evidence_profiles_owner ON public.professional_evidence_profiles TO bv_app USING (user_id=(SELECT app.current_user_id())) WITH CHECK (user_id=(SELECT app.current_user_id()));
GRANT SELECT,INSERT,UPDATE ON public.professional_evidence_profiles TO bv_app;

ALTER TABLE public.professional_evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_evidence_items FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.professional_evidence_items FROM PUBLIC;
CREATE POLICY professional_evidence_items_owner ON public.professional_evidence_items TO bv_app USING (user_id=(SELECT app.current_user_id())) WITH CHECK (user_id=(SELECT app.current_user_id()));
GRANT SELECT,INSERT,UPDATE ON public.professional_evidence_items TO bv_app;

ALTER TABLE public.professional_evidence_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_evidence_urls FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.professional_evidence_urls FROM PUBLIC;
CREATE POLICY professional_evidence_urls_owner ON public.professional_evidence_urls TO bv_app USING (user_id=(SELECT app.current_user_id())) WITH CHECK (user_id=(SELECT app.current_user_id()));
GRANT SELECT,INSERT,UPDATE ON public.professional_evidence_urls TO bv_app;

-- Metadata and extraction snapshots cannot be rewritten or resurrected.
CREATE FUNCTION app.guard_resume_metadata() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'DRAFT' OR NEW.approved_at IS NOT NULL OR NEW.archived_at IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN
   RAISE EXCEPTION 'Resume must start staged' USING ERRCODE='23514';
  END IF;
 ELSE
  IF (to_jsonb(NEW)-ARRAY['status','approved_at','archived_at','deleted_at','updated_at','storage_path']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['status','approved_at','archived_at','deleted_at','updated_at','storage_path'])
     OR OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Immutable resume metadata' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION app.guard_resume_metadata() FROM PUBLIC;
CREATE TRIGGER resumes_metadata_guard BEFORE INSERT OR UPDATE ON public.resumes FOR EACH ROW EXECUTE FUNCTION app.guard_resume_metadata();

CREATE FUNCTION app.guard_evidence_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF OLD.deleted_at IS NOT NULL OR (to_jsonb(NEW)-ARRAY['deleted_at','updated_at']) IS DISTINCT FROM
   (to_jsonb(OLD)-ARRAY['deleted_at','updated_at']) THEN
   RAISE EXCEPTION 'Immutable evidence snapshot' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION app.guard_evidence_snapshot() FROM PUBLIC;
CREATE TRIGGER resume_extractions_snapshot_guard BEFORE UPDATE ON public.resume_extractions FOR EACH ROW EXECUTE FUNCTION app.guard_evidence_snapshot();
CREATE TRIGGER professional_evidence_profiles_snapshot_guard BEFORE UPDATE ON public.professional_evidence_profiles FOR EACH ROW EXECUTE FUNCTION app.guard_evidence_snapshot();
CREATE TRIGGER professional_evidence_items_snapshot_guard BEFORE UPDATE ON public.professional_evidence_items FOR EACH ROW EXECUTE FUNCTION app.guard_evidence_snapshot();
CREATE TRIGGER professional_evidence_urls_snapshot_guard BEFORE UPDATE ON public.professional_evidence_urls FOR EACH ROW EXECUTE FUNCTION app.guard_evidence_snapshot();

CREATE INDEX professional_evidence_profiles_owner_idx ON public.professional_evidence_profiles(user_id,candidate_profile_id);
CREATE INDEX professional_evidence_items_owner_idx ON public.professional_evidence_items(user_id,candidate_profile_id,profile_id);
CREATE INDEX professional_evidence_urls_owner_idx ON public.professional_evidence_urls(user_id,candidate_profile_id,profile_id);

-- 06F: private application persistence; no external submission procedures.
create type public.application_draft_status as enum (
  'DRAFT',
  'READY_FOR_REVIEW',
  'APPROVED',
  'ARCHIVED'
);

create table public.application_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) ON DELETE RESTRICT,
  candidate_profile_id uuid not null,
  search_profile_id uuid not null,
  job_offer_id uuid not null references public.job_offers (id) ON DELETE RESTRICT,
  source_resume_id uuid not null,
  status public.application_draft_status not null default 'DRAFT',
  job_analysis jsonb not null check (jsonb_typeof(job_analysis) = 'object'),
  profile_analysis jsonb not null check (jsonb_typeof(profile_analysis) = 'object'),
  match_summary jsonb not null check (jsonb_typeof(match_summary) = 'object'),
  resume_adaptation jsonb not null check (jsonb_typeof(resume_adaptation) = 'object'),
  recruiter_message text,
  cover_letter text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_drafts_candidate_owner_fk
    foreign key (user_id, candidate_profile_id)
    references public.candidate_profiles (user_id, id)
    ON DELETE RESTRICT,
  constraint application_drafts_search_owner_fk
    foreign key (user_id, candidate_profile_id, search_profile_id)
    references public.search_profiles (user_id, candidate_profile_id, id)
    ON DELETE RESTRICT,
  constraint application_drafts_resume_owner_fk
    foreign key (user_id, candidate_profile_id, source_resume_id)
    references public.resumes (user_id, candidate_profile_id, id)
);

create unique index application_drafts_one_current_idx
on public.application_drafts (user_id, job_offer_id, candidate_profile_id, source_resume_id)
where status <> 'ARCHIVED';

create index application_drafts_user_status_idx
on public.application_drafts (user_id, status, updated_at desc);

create index application_drafts_search_idx
on public.application_drafts (search_profile_id, updated_at desc);

create type public.application_status as enum (
  'PREPARED', 'READY', 'SUBMITTING', 'SUBMITTED', 'FAILED', 'BLOCKED', 'WITHDRAWN'
);
create type public.application_answer_type as enum (
  'TEXT', 'BOOLEAN', 'NUMBER', 'SELECT', 'MULTISELECT', 'DATE', 'FILE', 'UNKNOWN'
);
create type public.application_answer_source as enum (
  'PROFILE', 'SEARCH_PREFERENCES', 'USER_APPROVED', 'GENERATED', 'PORTAL_DISCOVERY'
);
create type public.application_question_classification as enum (
  'SAFE_STRUCTURED', 'USER_CONFIRMATION', 'OPEN_TEXT', 'LEGAL_SENSITIVE', 'UNSUPPORTED'
);
create type public.application_event_type as enum (
  'CREATED', 'MODE_DECIDED', 'REVIEW_REQUIRED', 'APPROVED_FOR_SUBMISSION',
  'SUBMISSION_STARTED', 'SUBMISSION_SUCCEEDED', 'SUBMISSION_FAILED', 'BLOCKED'
);

create table public.application_user_settings (
  user_id uuid primary key references public.profiles (id) ON DELETE RESTRICT,
  auto_apply_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_application_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) ON DELETE RESTRICT,
  question_key text not null check (btrim(question_key) <> ''),
  question_text text not null check (btrim(question_text) <> ''),
  answer_type public.application_answer_type not null,
  answer_value jsonb not null,
  classification public.application_question_classification not null,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_key)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) ON DELETE RESTRICT,
  candidate_profile_id uuid not null,
  search_profile_id uuid not null,
  job_offer_id uuid not null references public.job_offers (id) ON DELETE RESTRICT,
  job_offer_source_id uuid references public.job_offer_sources (id),
  application_draft_id uuid not null references public.application_drafts (id),
  resume_id uuid not null,
  status public.application_status not null default 'PREPARED',
  apply_mode public.application_apply_mode not null,
  target_url text not null check (target_url ~ '^https?://'),
  decision_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(decision_reasons) = 'array'),
  safety_checklist jsonb not null default '{}'::jsonb check (jsonb_typeof(safety_checklist) = 'object'),
  submitted_at timestamptz,
  last_attempt_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  failure_code text,
  failure_message_public text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint applications_candidate_owner_fk foreign key (user_id, candidate_profile_id)
    references public.candidate_profiles (user_id, id) ON DELETE RESTRICT,
  constraint applications_search_owner_fk foreign key (user_id, candidate_profile_id, search_profile_id)
    references public.search_profiles (user_id, candidate_profile_id, id) ON DELETE RESTRICT,
  constraint applications_resume_owner_fk foreign key (user_id, candidate_profile_id, resume_id)
    references public.resumes (user_id, candidate_profile_id, id),
  constraint applications_submission_timestamp_check check (
    (status = 'SUBMITTED' and submitted_at is not null) or
    (status <> 'SUBMITTED' and submitted_at is null)
  ),
  unique (user_id, job_offer_id, candidate_profile_id),
  unique (user_id, id)
);

create table public.application_answers (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  user_id uuid not null,
  question_key text not null check (btrim(question_key) <> ''),
  question_text text not null check (btrim(question_text) <> ''),
  answer_type public.application_answer_type not null,
  answer_value jsonb,
  source public.application_answer_source not null,
  confidence numeric(4, 3) not null default 0 check (confidence between 0 and 1),
  requires_confirmation boolean not null default true,
  classification public.application_question_classification not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_answers_application_owner_fk foreign key (user_id, application_id)
    references public.applications (user_id, id) ON DELETE RESTRICT,
  unique (application_id, question_key)
);

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  user_id uuid not null,
  event_type public.application_event_type not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint application_events_application_owner_fk foreign key (user_id, application_id)
    references public.applications (user_id, id) ON DELETE RESTRICT
);

create index applications_user_status_idx on public.applications (user_id, status, created_at desc);
create index applications_search_idx on public.applications (search_profile_id, created_at desc);
create index application_answers_user_idx on public.application_answers (user_id, application_id);
create index application_events_application_idx on public.application_events (application_id, created_at);


ALTER TABLE public.application_drafts ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision>0), ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.applications ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.application_drafts ADD CONSTRAINT application_drafts_render_identity UNIQUE(user_id,candidate_profile_id,id,source_resume_id,job_offer_id);
ALTER TABLE public.application_drafts ADD CONSTRAINT application_drafts_application_identity UNIQUE(user_id,candidate_profile_id,search_profile_id,id,source_resume_id,job_offer_id);
ALTER TABLE public.applications ADD CONSTRAINT applications_draft_context_fk FOREIGN KEY(user_id,candidate_profile_id,search_profile_id,application_draft_id,resume_id,job_offer_id)
 REFERENCES public.application_drafts(user_id,candidate_profile_id,search_profile_id,id,source_resume_id,job_offer_id);
ALTER TABLE public.job_offer_sources ADD CONSTRAINT job_offer_sources_offer_identity UNIQUE(job_offer_id,id);
ALTER TABLE public.applications ADD CONSTRAINT applications_offer_source_fk FOREIGN KEY(job_offer_id,job_offer_source_id) REFERENCES public.job_offer_sources(job_offer_id,id);

ALTER TABLE public.application_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_drafts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.application_drafts FROM PUBLIC;
CREATE POLICY application_drafts_owner ON public.application_drafts TO bv_app USING (user_id=(SELECT app.current_user_id())) WITH CHECK (user_id=(SELECT app.current_user_id()));
GRANT SELECT,INSERT,UPDATE ON public.application_drafts TO bv_app;

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.applications FROM PUBLIC;
CREATE POLICY applications_owner ON public.applications TO bv_app USING (user_id=(SELECT app.current_user_id())) WITH CHECK (user_id=(SELECT app.current_user_id()));
GRANT SELECT,INSERT,UPDATE ON public.applications TO bv_app;

ALTER TABLE public.application_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_answers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.application_answers FROM PUBLIC;
CREATE POLICY application_answers_owner ON public.application_answers TO bv_app USING (user_id=(SELECT app.current_user_id())) WITH CHECK (user_id=(SELECT app.current_user_id()));
GRANT SELECT,INSERT,UPDATE ON public.application_answers TO bv_app;

ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.application_events FROM PUBLIC;
CREATE POLICY application_events_owner ON public.application_events TO bv_app USING (user_id=(SELECT app.current_user_id())) WITH CHECK (user_id=(SELECT app.current_user_id()));
GRANT SELECT,INSERT ON public.application_events TO bv_app;

ALTER TABLE public.application_user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_user_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.application_user_settings FROM PUBLIC;
CREATE POLICY application_user_settings_owner ON public.application_user_settings TO bv_app USING (user_id=(SELECT app.current_user_id())) WITH CHECK (user_id=(SELECT app.current_user_id()));
GRANT SELECT,INSERT,UPDATE ON public.application_user_settings TO bv_app;

ALTER TABLE public.user_application_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_application_answers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_application_answers FROM PUBLIC;
CREATE POLICY user_application_answers_owner ON public.user_application_answers TO bv_app USING (user_id=(SELECT app.current_user_id())) WITH CHECK (user_id=(SELECT app.current_user_id()));
GRANT SELECT,INSERT,UPDATE ON public.user_application_answers TO bv_app;
CREATE TRIGGER application_drafts_updated BEFORE UPDATE ON public.application_drafts FOR EACH ROW EXECUTE FUNCTION app.set_catalog_updated_at();
CREATE TRIGGER applications_updated BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION app.set_catalog_updated_at();
CREATE TRIGGER application_answers_updated BEFORE UPDATE ON public.application_answers FOR EACH ROW EXECUTE FUNCTION app.set_catalog_updated_at();
CREATE TRIGGER application_user_settings_updated BEFORE UPDATE ON public.application_user_settings FOR EACH ROW EXECUTE FUNCTION app.set_catalog_updated_at();
CREATE TRIGGER user_application_answers_updated BEFORE UPDATE ON public.user_application_answers FOR EACH ROW EXECUTE FUNCTION app.set_catalog_updated_at();

CREATE FUNCTION app.guard_application_draft() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE changed boolean;
BEGIN
 IF OLD.deleted_at IS NOT NULL OR OLD.status='ARCHIVED' THEN RAISE EXCEPTION 'Archived draft' USING ERRCODE='23514'; END IF;
 IF (NEW.user_id,NEW.candidate_profile_id,NEW.search_profile_id,NEW.job_offer_id,NEW.source_resume_id,NEW.id,NEW.created_at)
  IS DISTINCT FROM (OLD.user_id,OLD.candidate_profile_id,OLD.search_profile_id,OLD.job_offer_id,OLD.source_resume_id,OLD.id,OLD.created_at) THEN
  RAISE EXCEPTION 'Immutable draft context' USING ERRCODE='23514'; END IF;
 changed := (NEW.job_analysis,NEW.profile_analysis,NEW.match_summary,NEW.resume_adaptation,NEW.recruiter_message,NEW.cover_letter)
  IS DISTINCT FROM (OLD.job_analysis,OLD.profile_analysis,OLD.match_summary,OLD.resume_adaptation,OLD.recruiter_message,OLD.cover_letter);
 IF changed AND (OLD.status='APPROVED' OR NEW.status<>'READY_FOR_REVIEW' OR NEW.revision<>OLD.revision+1) THEN
  RAISE EXCEPTION 'Draft approval/version conflict' USING ERRCODE='23514'; END IF;
 IF NOT changed AND NEW.revision NOT IN (OLD.revision,OLD.revision+1) THEN RAISE EXCEPTION 'Invalid draft revision' USING ERRCODE='23514'; END IF;
 IF OLD.status='APPROVED' AND NEW.status NOT IN ('APPROVED','ARCHIVED') THEN RAISE EXCEPTION 'Approved draft frozen' USING ERRCODE='23514'; END IF;
 IF NEW.status='APPROVED' AND OLD.status NOT IN ('READY_FOR_REVIEW','APPROVED') THEN RAISE EXCEPTION 'Draft must be reviewed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION app.guard_application_draft() FROM PUBLIC;
CREATE TRIGGER application_draft_guard BEFORE UPDATE ON public.application_drafts FOR EACH ROW EXECUTE FUNCTION app.guard_application_draft();

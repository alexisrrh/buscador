begin;

create type public.application_status as enum (
  'PREPARED', 'READY', 'SUBMITTING', 'SUBMITTED', 'FAILED', 'BLOCKED', 'WITHDRAWN'
);
create type public.application_apply_mode as enum ('AUTO', 'REVIEW', 'MANUAL');
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

alter table public.search_profiles
add column application_mode public.application_apply_mode not null default 'MANUAL';

alter table public.job_sources
add column auto_apply_enabled boolean not null default false;

create table public.application_user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  auto_apply_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_application_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
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
  user_id uuid not null references public.profiles (id) on delete cascade,
  candidate_profile_id uuid not null,
  search_profile_id uuid not null,
  job_offer_id uuid not null references public.job_offers (id) on delete cascade,
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
    references public.candidate_profiles (user_id, id) on delete cascade,
  constraint applications_search_owner_fk foreign key (user_id, candidate_profile_id, search_profile_id)
    references public.search_profiles (user_id, candidate_profile_id, id) on delete cascade,
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
    references public.applications (user_id, id) on delete cascade,
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
    references public.applications (user_id, id) on delete cascade
);

create index applications_user_status_idx on public.applications (user_id, status, created_at desc);
create index applications_search_idx on public.applications (search_profile_id, created_at desc);
create index application_answers_user_idx on public.application_answers (user_id, application_id);
create index application_events_application_idx on public.application_events (application_id, created_at);

create trigger application_user_settings_set_updated_at before update on public.application_user_settings
for each row execute function public.set_updated_at();
create trigger user_application_answers_set_updated_at before update on public.user_application_answers
for each row execute function public.set_updated_at();
create trigger applications_set_updated_at before update on public.applications
for each row execute function public.set_updated_at();
create trigger application_answers_set_updated_at before update on public.application_answers
for each row execute function public.set_updated_at();

alter table public.application_user_settings enable row level security;
alter table public.application_user_settings force row level security;
alter table public.user_application_answers enable row level security;
alter table public.user_application_answers force row level security;
alter table public.applications enable row level security;
alter table public.applications force row level security;
alter table public.application_answers enable row level security;
alter table public.application_answers force row level security;
alter table public.application_events enable row level security;
alter table public.application_events force row level security;

create policy application_user_settings_own on public.application_user_settings for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_application_answers_own on public.user_application_answers for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy applications_select_own on public.applications for select to authenticated
using (user_id = (select auth.uid()));
create policy application_answers_select_own on public.application_answers for select to authenticated
using (user_id = (select auth.uid()));
create policy application_events_select_own on public.application_events for select to authenticated
using (user_id = (select auth.uid()));

revoke all on public.application_user_settings, public.user_application_answers,
  public.applications, public.application_answers, public.application_events from anon, authenticated;
grant select, insert, update on public.application_user_settings to authenticated;
grant select, insert, update on public.user_application_answers to authenticated;
grant select on public.applications, public.application_answers, public.application_events to authenticated;
grant all on public.application_user_settings, public.user_application_answers,
  public.applications, public.application_answers, public.application_events to service_role;

create or replace function public.create_prepared_application(
  p_user_id uuid,
  p_application_draft_id uuid,
  p_job_offer_source_id uuid,
  p_apply_mode public.application_apply_mode,
  p_target_url text,
  p_status public.application_status,
  p_decision_reasons jsonb,
  p_safety_checklist jsonb,
  p_failure_code text,
  p_failure_message_public text,
  p_answers jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_draft public.application_drafts;
  target_application_id uuid;
  was_created boolean := false;
begin
  select * into target_draft from public.application_drafts
  where id = p_application_draft_id and user_id = p_user_id for share;
  if not found then raise exception 'ApplicationDraft not found' using errcode = 'P0002'; end if;
  if target_draft.status <> 'APPROVED' then
    raise exception 'ApplicationDraft must be approved' using errcode = '23514';
  end if;
  perform 1 from public.resumes where id = target_draft.source_resume_id
    and user_id = p_user_id and candidate_profile_id = target_draft.candidate_profile_id
    and status = 'APPROVED' and deleted_at is null;
  if not found then raise exception 'Approved Resume not found' using errcode = 'P0002'; end if;
  if p_job_offer_source_id is not null then
    perform 1 from public.job_offer_sources where id = p_job_offer_source_id
      and job_offer_id = target_draft.job_offer_id;
    if not found then raise exception 'JobOfferSource does not belong to JobOffer' using errcode = '23514'; end if;
  end if;

  insert into public.applications (
    user_id, candidate_profile_id, search_profile_id, job_offer_id, job_offer_source_id,
    application_draft_id, resume_id, status, apply_mode, target_url,
    decision_reasons, safety_checklist, failure_code, failure_message_public
  ) values (
    p_user_id, target_draft.candidate_profile_id, target_draft.search_profile_id,
    target_draft.job_offer_id, p_job_offer_source_id, target_draft.id,
    target_draft.source_resume_id, p_status, p_apply_mode, p_target_url,
    p_decision_reasons, p_safety_checklist, p_failure_code, p_failure_message_public
  )
  on conflict (user_id, job_offer_id, candidate_profile_id) do nothing
  returning id into target_application_id;

  if target_application_id is null then
    select id into target_application_id from public.applications
    where user_id = p_user_id and job_offer_id = target_draft.job_offer_id
      and candidate_profile_id = target_draft.candidate_profile_id;
    return jsonb_build_object('id', target_application_id, 'created', false);
  end if;
  was_created := true;

  insert into public.application_answers (
    application_id, user_id, question_key, question_text, answer_type, answer_value,
    source, confidence, requires_confirmation, classification
  )
  select target_application_id, p_user_id, item->>'question_key', item->>'question_text',
    (item->>'answer_type')::public.application_answer_type, item->'answer_value',
    (item->>'source')::public.application_answer_source,
    coalesce((item->>'confidence')::numeric, 0),
    coalesce((item->>'requires_confirmation')::boolean, true),
    (item->>'classification')::public.application_question_classification
  from jsonb_array_elements(p_answers) as item;

  insert into public.application_events (application_id, user_id, event_type, metadata)
  values
    (target_application_id, p_user_id, 'CREATED', '{}'::jsonb),
    (target_application_id, p_user_id, 'MODE_DECIDED', jsonb_build_object('mode', p_apply_mode, 'reasons', p_decision_reasons));
  if p_apply_mode = 'REVIEW' then
    insert into public.application_events (application_id, user_id, event_type, metadata)
    values (target_application_id, p_user_id, 'REVIEW_REQUIRED', jsonb_build_object('reasons', p_decision_reasons));
  elsif p_status = 'BLOCKED' then
    insert into public.application_events (application_id, user_id, event_type, metadata)
    values (target_application_id, p_user_id, 'BLOCKED', jsonb_build_object('code', p_failure_code));
  end if;
  return jsonb_build_object('id', target_application_id, 'created', was_created);
end;
$$;

create or replace function public.reserve_application_attempt(p_application_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.applications;
  daily_limit integer;
  used_today integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'application-limit:' || p_user_id::text || ':' || current_date::text, 0));
  select * into target from public.applications where id = p_application_id and user_id = p_user_id for update;
  if not found then raise exception 'Application not found' using errcode = 'P0002'; end if;
  if target.status <> 'READY' or target.apply_mode <> 'AUTO' then
    raise exception 'Application is not ready for automatic submission' using errcode = '23514';
  end if;
  perform 1
  from public.application_user_settings as settings
  join public.search_profiles as search on search.id = target.search_profile_id
  join public.job_offer_sources as offer_source on offer_source.id = target.job_offer_source_id
  join public.job_sources as source on source.id = offer_source.job_source_id
  where settings.user_id = p_user_id and settings.auto_apply_enabled
    and search.user_id = p_user_id and search.application_mode = 'AUTO'
    and source.auto_apply_enabled;
  if not found then
    raise exception 'Automatic application is not enabled by every policy' using errcode = '23514';
  end if;
  select daily_application_limit into daily_limit from public.search_profiles
  where id = target.search_profile_id and user_id = p_user_id;
  select count(*) into used_today from public.applications
  where user_id = p_user_id and last_attempt_at >= current_date
    and status in ('SUBMITTING', 'SUBMITTED', 'FAILED');
  if daily_limit <= 0 or used_today >= daily_limit then
    update public.applications set status = 'BLOCKED', failure_code = 'DAILY_LIMIT_REACHED',
      failure_message_public = 'Se alcanzó el límite diario de candidaturas.' where id = target.id;
    insert into public.application_events (application_id, user_id, event_type, metadata)
    values (target.id, p_user_id, 'BLOCKED', jsonb_build_object('code', 'DAILY_LIMIT_REACHED'));
    return false;
  end if;
  update public.applications set status = 'SUBMITTING', last_attempt_at = now(),
    attempt_count = attempt_count + 1, failure_code = null, failure_message_public = null
  where id = target.id;
  insert into public.application_events (application_id, user_id, event_type)
  values (target.id, p_user_id, 'SUBMISSION_STARTED');
  return true;
end;
$$;

create or replace function public.confirm_application_answer(p_application_answer_id uuid, p_answer_value jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target public.application_answers;
begin
  if current_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_answer_value is null or p_answer_value = 'null'::jsonb then
    raise exception 'Answer value is required' using errcode = '23514';
  end if;
  select * into target from public.application_answers
  where id = p_application_answer_id and user_id = current_user_id for update;
  if not found then raise exception 'ApplicationAnswer not found' using errcode = 'P0002'; end if;
  update public.application_answers set answer_value = p_answer_value, source = 'USER_APPROVED',
    confidence = 1, requires_confirmation = false where id = target.id;
  insert into public.user_application_answers (
    user_id, question_key, question_text, answer_type, answer_value, classification, approved_at
  ) values (
    current_user_id, target.question_key, target.question_text, target.answer_type,
    p_answer_value, target.classification, now()
  ) on conflict (user_id, question_key) do update set
    question_text = excluded.question_text, answer_type = excluded.answer_type,
    answer_value = excluded.answer_value, classification = excluded.classification,
    approved_at = now();
end;
$$;

revoke all on function public.create_prepared_application(uuid, uuid, uuid, public.application_apply_mode,
  text, public.application_status, jsonb, jsonb, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.reserve_application_attempt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.confirm_application_answer(uuid, jsonb) from public, anon;
grant execute on function public.create_prepared_application(uuid, uuid, uuid, public.application_apply_mode,
  text, public.application_status, jsonb, jsonb, text, text, jsonb) to service_role;
grant execute on function public.reserve_application_attempt(uuid, uuid) to service_role;
grant execute on function public.confirm_application_answer(uuid, jsonb) to authenticated;

commit;

begin;

create type public.application_draft_status as enum (
  'DRAFT',
  'READY_FOR_REVIEW',
  'APPROVED',
  'ARCHIVED'
);

create table public.resume_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
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
    on delete cascade,
  unique (source_resume_id, extractor_version)
);

create table public.application_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  candidate_profile_id uuid not null,
  search_profile_id uuid not null,
  job_offer_id uuid not null references public.job_offers (id) on delete cascade,
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
    on delete cascade,
  constraint application_drafts_search_owner_fk
    foreign key (user_id, candidate_profile_id, search_profile_id)
    references public.search_profiles (user_id, candidate_profile_id, id)
    on delete cascade,
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

create trigger resume_extractions_set_updated_at
before update on public.resume_extractions
for each row execute function public.set_updated_at();

create trigger application_drafts_set_updated_at
before update on public.application_drafts
for each row execute function public.set_updated_at();

alter table public.resume_extractions enable row level security;
alter table public.resume_extractions force row level security;
alter table public.application_drafts enable row level security;
alter table public.application_drafts force row level security;

create policy resume_extractions_select_own
on public.resume_extractions for select to authenticated
using (user_id = (select auth.uid()));

create policy application_drafts_select_own
on public.application_drafts for select to authenticated
using (user_id = (select auth.uid()));

revoke all on public.resume_extractions from anon, authenticated;
revoke all on public.application_drafts from anon, authenticated;
grant select on public.resume_extractions to authenticated;
grant select on public.application_drafts to authenticated;
grant all on public.resume_extractions to service_role;
grant all on public.application_drafts to service_role;

create or replace function public.set_application_draft_status(
  p_application_draft_id uuid,
  p_status public.application_draft_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_status public.application_draft_status;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select status into current_status
  from public.application_drafts
  where id = p_application_draft_id
    and user_id = current_user_id
  for update;

  if not found then
    raise exception 'ApplicationDraft not found' using errcode = 'P0002';
  end if;

  if not (
    (current_status = 'READY_FOR_REVIEW' and p_status = 'APPROVED')
    or (current_status in ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED') and p_status = 'ARCHIVED')
  ) then
    raise exception 'Invalid ApplicationDraft status transition' using errcode = '23514';
  end if;

  update public.application_drafts
  set status = p_status
  where id = p_application_draft_id
    and user_id = current_user_id;
end;
$$;

create or replace function public.update_application_draft_text(
  p_application_draft_id uuid,
  p_recruiter_message text,
  p_cover_letter text
)
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

  update public.application_drafts
  set recruiter_message = nullif(btrim(p_recruiter_message), ''),
      cover_letter = nullif(btrim(p_cover_letter), '')
  where id = p_application_draft_id
    and user_id = current_user_id
    and status in ('DRAFT', 'READY_FOR_REVIEW');

  if not found then
    raise exception 'Editable ApplicationDraft not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_application_draft_status(uuid, public.application_draft_status)
from public, anon;
revoke all on function public.update_application_draft_text(uuid, text, text)
from public, anon;
grant execute on function public.set_application_draft_status(uuid, public.application_draft_status)
to authenticated;
grant execute on function public.update_application_draft_text(uuid, text, text)
to authenticated;

commit;

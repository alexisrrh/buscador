begin;

create type public.job_match_eligibility as enum (
  'ELIGIBLE',
  'REVIEW',
  'REJECTED'
);

create type public.job_match_status as enum (
  'NEW',
  'SAVED',
  'DISMISSED',
  'APPLIED'
);

create table public.job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  candidate_profile_id uuid not null,
  search_profile_id uuid not null,
  search_profile_version integer not null check (search_profile_version > 0),
  job_offer_id uuid not null references public.job_offers (id) on delete cascade,
  scoring_version text not null default 'deterministic-v1'
    check (btrim(scoring_version) <> ''),
  score integer not null check (score between 0 and 100),
  eligibility_status public.job_match_eligibility not null,
  score_components jsonb not null check (jsonb_typeof(score_components) = 'object'),
  hard_gates jsonb not null check (jsonb_typeof(hard_gates) = 'object'),
  reasons jsonb not null check (jsonb_typeof(reasons) = 'array'),
  status public.job_match_status not null default 'NEW',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_matches_search_owner_fk
    foreign key (user_id, candidate_profile_id, search_profile_id)
    references public.search_profiles (user_id, candidate_profile_id, id)
    on delete cascade,
  constraint job_matches_preferences_version_fk
    foreign key (user_id, search_profile_id, search_profile_version)
    references public.job_preferences (
      user_id,
      search_profile_id,
      search_profile_version
    )
    on delete cascade,
  constraint job_matches_identity_key unique (
    job_offer_id,
    user_id,
    candidate_profile_id,
    search_profile_id,
    search_profile_version,
    scoring_version
  )
);

create index job_matches_user_status_score_idx
on public.job_matches (user_id, status, score desc);

create index job_matches_search_profile_idx
on public.job_matches (search_profile_id, search_profile_version, score desc);

create index job_matches_job_offer_idx
on public.job_matches (job_offer_id);

create trigger job_matches_set_updated_at
before update on public.job_matches
for each row execute function public.set_updated_at();

alter table public.job_matches enable row level security;
alter table public.job_matches force row level security;

create policy job_matches_select_own
on public.job_matches for select to authenticated
using (user_id = (select auth.uid()));

revoke all on public.job_matches from anon, authenticated;
grant select on public.job_matches to authenticated;
grant all on public.job_matches to service_role;

create or replace function public.upsert_job_match(
  p_search_profile_id uuid,
  p_job_offer_id uuid,
  p_score integer,
  p_eligibility_status public.job_match_eligibility,
  p_score_components jsonb,
  p_hard_gates jsonb,
  p_reasons jsonb,
  p_scoring_version text default 'deterministic-v1'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_search public.search_profiles;
  saved_match_id uuid;
  was_created boolean;
begin
  select * into target_search
  from public.search_profiles
  where id = p_search_profile_id
    and status = 'ACTIVE'
    and deleted_at is null;

  if not found then
    raise exception 'Active SearchProfile not found' using errcode = 'P0002';
  end if;

  perform 1 from public.job_offers where id = p_job_offer_id;
  if not found then
    raise exception 'JobOffer not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.job_preferences
  where user_id = target_search.user_id
    and search_profile_id = target_search.id
    and search_profile_version = target_search.version
    and deleted_at is null;
  if not found then
    raise exception 'Current JobPreferences not found' using errcode = 'P0002';
  end if;

  insert into public.job_matches (
    user_id,
    candidate_profile_id,
    search_profile_id,
    search_profile_version,
    job_offer_id,
    scoring_version,
    score,
    eligibility_status,
    score_components,
    hard_gates,
    reasons
  ) values (
    target_search.user_id,
    target_search.candidate_profile_id,
    target_search.id,
    target_search.version,
    p_job_offer_id,
    p_scoring_version,
    p_score,
    p_eligibility_status,
    p_score_components,
    p_hard_gates,
    p_reasons
  )
  on conflict (
    job_offer_id,
    user_id,
    candidate_profile_id,
    search_profile_id,
    search_profile_version,
    scoring_version
  ) do update
  set
    score = excluded.score,
    eligibility_status = excluded.eligibility_status,
    score_components = excluded.score_components,
    hard_gates = excluded.hard_gates,
    reasons = excluded.reasons
  returning id, (xmax = 0) into saved_match_id, was_created;

  return jsonb_build_object('id', saved_match_id, 'created', was_created);
end;
$$;

create or replace function public.set_job_match_status(
  p_job_match_id uuid,
  p_status public.job_match_status
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
  if p_status not in ('SAVED', 'DISMISSED') then
    raise exception 'JobMatch status is not user-selectable' using errcode = '23514';
  end if;

  update public.job_matches
  set status = p_status
  where id = p_job_match_id
    and user_id = current_user_id;

  if not found then
    raise exception 'JobMatch not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.upsert_job_match(
  uuid, uuid, integer, public.job_match_eligibility, jsonb, jsonb, jsonb, text
) from public, anon, authenticated;
revoke all on function public.set_job_match_status(uuid, public.job_match_status)
from public, anon;

grant execute on function public.upsert_job_match(
  uuid, uuid, integer, public.job_match_eligibility, jsonb, jsonb, jsonb, text
) to service_role;
grant execute on function public.set_job_match_status(uuid, public.job_match_status)
to authenticated;

commit;

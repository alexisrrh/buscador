begin;

create extension if not exists pgcrypto;

create type public.search_profile_status as enum (
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'DISABLED',
  'ARCHIVED'
);

create type public.search_frequency_type as enum (
  'INTERVAL',
  'DAILY',
  'WEEKDAYS'
);

-- Application-owned extension of Supabase Auth. Authentication remains in auth.users.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, id)
);

create table public.search_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  candidate_profile_id uuid not null,
  name text not null check (btrim(name) <> ''),
  status public.search_profile_status not null default 'DRAFT',
  frequency_type public.search_frequency_type not null default 'DAILY',
  frequency_value jsonb not null default '{}'::jsonb
    check (jsonb_typeof(frequency_value) = 'object'),
  timezone text not null default 'UTC' check (btrim(timezone) <> ''),
  notification_min_score smallint not null default 70,
  semi_auto_min_score smallint not null default 80,
  auto_apply_min_score smallint not null default 90,
  daily_application_limit integer not null default 0,
  version integer not null default 1,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint search_profiles_candidate_owner_fk
    foreign key (user_id, candidate_profile_id)
    references public.candidate_profiles (user_id, id)
    on delete cascade,
  constraint search_profiles_score_order_check check (
    notification_min_score >= 0
    and notification_min_score <= semi_auto_min_score
    and semi_auto_min_score <= auto_apply_min_score
    and auto_apply_min_score <= 100
  ),
  constraint search_profiles_daily_limit_check
    check (daily_application_limit >= 0),
  constraint search_profiles_version_check check (version > 0),
  unique (user_id, candidate_profile_id, id)
);

-- Versioned child of SearchProfile. Arrays cover simple lists; JSONB is reserved for
-- structured MVP values such as locations and language proficiency.
create table public.job_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  candidate_profile_id uuid not null,
  search_profile_id uuid not null,
  search_profile_version integer not null,
  keywords text[] not null default '{}'::text[],
  target_titles text[] not null default '{}'::text[],
  excluded_titles text[] not null default '{}'::text[],
  locations jsonb not null default '[]'::jsonb
    check (jsonb_typeof(locations) = 'array'),
  work_modes text[] not null default '{}'::text[],
  minimum_salary numeric(14, 2),
  currency text,
  accepted_seniorities text[] not null default '{}'::text[],
  minimum_experience_years smallint,
  maximum_experience_years smallint,
  required_technologies text[] not null default '{}'::text[],
  excluded_technologies text[] not null default '{}'::text[],
  languages jsonb not null default '[]'::jsonb
    check (jsonb_typeof(languages) = 'array'),
  contract_types text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint job_preferences_search_profile_fk
    foreign key (user_id, candidate_profile_id, search_profile_id)
    references public.search_profiles (user_id, candidate_profile_id, id)
    on delete cascade,
  constraint job_preferences_version_check
    check (search_profile_version > 0),
  constraint job_preferences_work_modes_check check (
    work_modes <@ array['REMOTE', 'HYBRID', 'ONSITE']::text[]
  ),
  constraint job_preferences_salary_check
    check (minimum_salary is null or minimum_salary >= 0),
  constraint job_preferences_currency_check check (
    currency is null or currency ~ '^[A-Z]{3}$'
  ),
  constraint job_preferences_min_experience_check check (
    minimum_experience_years is null or minimum_experience_years >= 0
  ),
  constraint job_preferences_max_experience_check check (
    maximum_experience_years is null or maximum_experience_years >= 0
  ),
  constraint job_preferences_experience_order_check check (
    minimum_experience_years is null
    or maximum_experience_years is null
    or minimum_experience_years <= maximum_experience_years
  ),
  unique (user_id, search_profile_id, search_profile_version)
);

create index candidate_profiles_user_id_idx
  on public.candidate_profiles (user_id);

create index search_profiles_user_id_idx
  on public.search_profiles (user_id);

create index search_profiles_candidate_profile_id_idx
  on public.search_profiles (candidate_profile_id);

create index search_profiles_status_idx
  on public.search_profiles (status);

create index search_profiles_next_run_at_idx
  on public.search_profiles (next_run_at);

create index search_profiles_active_due_idx
  on public.search_profiles (next_run_at, user_id)
  where status = 'ACTIVE' and deleted_at is null;

create index job_preferences_user_id_idx
  on public.job_preferences (user_id);

create index job_preferences_candidate_profile_id_idx
  on public.job_preferences (candidate_profile_id);

create index job_preferences_search_profile_id_idx
  on public.job_preferences (search_profile_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger candidate_profiles_set_updated_at
before update on public.candidate_profiles
for each row execute function public.set_updated_at();

create trigger search_profiles_set_updated_at
before update on public.search_profiles
for each row execute function public.set_updated_at();

create trigger job_preferences_set_updated_at
before update on public.job_preferences
for each row execute function public.set_updated_at();

create or replace function public.validate_job_preferences_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_search_version integer;
begin
  select search.version
  into current_search_version
  from public.search_profiles as search
  where search.id = new.search_profile_id
    and search.user_id = new.user_id
    and search.candidate_profile_id = new.candidate_profile_id
  for key share;

  if current_search_version is not null
     and new.search_profile_version > current_search_version then
    raise exception
      'JobPreferences version % exceeds current SearchProfile version %',
      new.search_profile_version,
      current_search_version
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger job_preferences_validate_version
before insert or update on public.job_preferences
for each row execute function public.validate_job_preferences_version();

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger auth_user_created_create_profile
after insert on auth.users
for each row execute function public.create_profile_for_auth_user();

-- Ensure pre-existing Supabase Auth users receive their application profile.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.candidate_profiles enable row level security;
alter table public.search_profiles enable row level security;
alter table public.job_preferences enable row level security;

alter table public.profiles force row level security;
alter table public.candidate_profiles force row level security;
alter table public.search_profiles force row level security;
alter table public.job_preferences force row level security;

create policy profiles_select_own
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

create policy profiles_insert_own
on public.profiles for insert
to authenticated
with check (id = (select auth.uid()));

create policy profiles_update_own
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy candidate_profiles_select_own
on public.candidate_profiles for select
to authenticated
using (user_id = (select auth.uid()));

create policy candidate_profiles_insert_own
on public.candidate_profiles for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy candidate_profiles_update_own
on public.candidate_profiles for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy search_profiles_select_own
on public.search_profiles for select
to authenticated
using (user_id = (select auth.uid()));

create policy search_profiles_insert_own
on public.search_profiles for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy search_profiles_update_own
on public.search_profiles for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy job_preferences_select_own
on public.job_preferences for select
to authenticated
using (user_id = (select auth.uid()));

create policy job_preferences_insert_own
on public.job_preferences for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy job_preferences_update_own
on public.job_preferences for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

revoke all on public.profiles from anon;
revoke all on public.candidate_profiles from anon;
revoke all on public.search_profiles from anon;
revoke all on public.job_preferences from anon;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.candidate_profiles to authenticated;
grant select, insert, update on public.search_profiles to authenticated;
grant select, insert, update on public.job_preferences to authenticated;

revoke delete on public.profiles from authenticated;
revoke delete on public.candidate_profiles from authenticated;
revoke delete on public.search_profiles from authenticated;
revoke delete on public.job_preferences from authenticated;

-- A search is runnable only when all three scheduling predicates hold.
create view public.runnable_search_profiles
with (security_invoker = true)
as
select *
from public.search_profiles
where status = 'ACTIVE'
  and deleted_at is null
  and next_run_at <= now();

revoke all on public.runnable_search_profiles from anon;
grant select on public.runnable_search_profiles to authenticated;

commit;

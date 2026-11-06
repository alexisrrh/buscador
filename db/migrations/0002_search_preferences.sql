-- Portable search/preferences model, preserving legacy columns and versions.
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


create type public.onboarding_preference_state as enum (
  'UNKNOWN',
  'UNRESTRICTED',
  'SPECIFIED'
);

alter table public.job_preferences
  add column location_preference_state public.onboarding_preference_state not null default 'UNKNOWN',
  add column work_mode_preference_state public.onboarding_preference_state not null default 'UNKNOWN',
  add column salary_preference_state public.onboarding_preference_state not null default 'UNKNOWN',
  add constraint job_preferences_location_preference_state_check check (
    location_preference_state <> 'UNRESTRICTED' or locations = '[]'::jsonb
  ),
  add constraint job_preferences_location_specified_check check (
    location_preference_state <> 'SPECIFIED' or jsonb_array_length(locations) > 0
  ),
  add constraint job_preferences_work_mode_preference_state_check check (
    work_mode_preference_state <> 'UNRESTRICTED' or cardinality(work_modes) = 0
  ),
  add constraint job_preferences_work_mode_specified_check check (
    work_mode_preference_state <> 'SPECIFIED' or cardinality(work_modes) > 0
  ),
  add constraint job_preferences_salary_preference_state_check check (
    salary_preference_state <> 'UNRESTRICTED' or (minimum_salary is null and currency is null)
  ),
  add constraint job_preferences_salary_specified_check check (
    salary_preference_state <> 'SPECIFIED' or (minimum_salary is not null and minimum_salary > 0 and currency is not null)
  );


CREATE TYPE public.application_apply_mode AS ENUM ('AUTO', 'REVIEW', 'MANUAL');
ALTER TABLE public.search_profiles ADD COLUMN application_mode public.application_apply_mode NOT NULL DEFAULT 'MANUAL';

create or replace function app.validate_job_preferences_version()
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
for each row execute function app.validate_job_preferences_version();


create or replace function app.calculate_search_next_run(
  p_frequency_type public.search_frequency_type,
  p_frequency_value jsonb,
  p_timezone text,
  p_from timestamptz default now()
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  interval_minutes integer;
  local_now timestamp;
  scheduled_time time;
  candidate_local timestamp;
  day_offset integer;
begin
  if p_frequency_type = 'INTERVAL' then
    interval_minutes := nullif(p_frequency_value->>'minutes', '')::integer;
    if interval_minutes is null or interval_minutes <= 0 then
      raise exception 'Search interval must be a positive number of minutes'
        using errcode = '23514';
    end if;
    return p_from + make_interval(mins => interval_minutes);
  end if;

  local_now := p_from at time zone p_timezone;
  scheduled_time := coalesce(nullif(p_frequency_value->>'time', '')::time, time '09:00');

  for day_offset in 0..7 loop
    candidate_local := (local_now::date + day_offset) + scheduled_time;
    if candidate_local <= local_now then
      continue;
    end if;
    if p_frequency_type = 'DAILY'
       or extract(isodow from candidate_local) between 1 and 5 then
      return candidate_local at time zone p_timezone;
    end if;
  end loop;

  raise exception 'Could not calculate next search execution'
    using errcode = '22023';
end;
$$;


REVOKE ALL ON FUNCTION app.validate_job_preferences_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.calculate_search_next_run(public.search_frequency_type,jsonb,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.calculate_search_next_run(public.search_frequency_type,jsonb,text,timestamptz) TO bv_app;
ALTER TABLE public.search_profiles ADD CONSTRAINT search_current_preferences_fk
  FOREIGN KEY (user_id,id,version) REFERENCES public.job_preferences(user_id,search_profile_id,search_profile_version)
  DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX search_profiles_active_due_idx ON public.search_profiles(next_run_at,user_id) WHERE status='ACTIVE' AND deleted_at IS NULL;
ALTER TABLE public.search_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.job_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY search_profiles_owner ON public.search_profiles TO bv_app
  USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));
CREATE POLICY job_preferences_owner ON public.job_preferences TO bv_app
  USING (user_id = (SELECT app.current_user_id())) WITH CHECK (user_id = (SELECT app.current_user_id()));
REVOKE ALL ON public.search_profiles, public.job_preferences FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.search_profiles TO bv_app;
-- Historical preference rows are append-only for the application role.
GRANT SELECT,INSERT ON public.job_preferences TO bv_app;

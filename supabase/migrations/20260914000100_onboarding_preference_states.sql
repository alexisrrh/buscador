begin;

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
    salary_preference_state <> 'SPECIFIED' or (minimum_salary > 0 and currency is not null)
  );

create or replace function public.save_search_profile(
  p_search_profile_id uuid,
  p_candidate_profile_id uuid,
  p_search jsonb,
  p_preferences jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  saved_search_id uuid;
  saved_version integer;
  location_state public.onboarding_preference_state := coalesce(
    nullif(p_preferences->>'location_preference_state', '')::public.onboarding_preference_state,
    'UNKNOWN'::public.onboarding_preference_state
  );
  work_mode_state public.onboarding_preference_state := coalesce(
    nullif(p_preferences->>'work_mode_preference_state', '')::public.onboarding_preference_state,
    'UNKNOWN'::public.onboarding_preference_state
  );
  salary_state public.onboarding_preference_state := coalesce(
    nullif(p_preferences->>'salary_preference_state', '')::public.onboarding_preference_state,
    'UNKNOWN'::public.onboarding_preference_state
  );
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform 1
  from public.candidate_profiles
  where id = p_candidate_profile_id
    and user_id = current_user_id
    and deleted_at is null
  for key share;

  if not found then
    raise exception 'CandidateProfile not found' using errcode = 'P0002';
  end if;

  if p_search_profile_id is null then
    insert into public.search_profiles (
      user_id, candidate_profile_id, name, frequency_type, frequency_value,
      timezone, notification_min_score, semi_auto_min_score,
      auto_apply_min_score, daily_application_limit
    ) values (
      current_user_id, p_candidate_profile_id, p_search->>'name',
      (p_search->>'frequency_type')::public.search_frequency_type,
      coalesce(p_search->'frequency_value', '{}'::jsonb), p_search->>'timezone',
      (p_search->>'notification_min_score')::smallint,
      (p_search->>'semi_auto_min_score')::smallint,
      (p_search->>'auto_apply_min_score')::smallint,
      (p_search->>'daily_application_limit')::integer
    ) returning id, version into saved_search_id, saved_version;
  else
    select id, version into saved_search_id, saved_version
    from public.search_profiles
    where id = p_search_profile_id and user_id = current_user_id
      and candidate_profile_id = p_candidate_profile_id and deleted_at is null
    for update;
    if not found then
      raise exception 'SearchProfile not found' using errcode = 'P0002';
    end if;

    saved_version := saved_version + 1;
    update public.search_profiles set
      name = p_search->>'name',
      frequency_type = (p_search->>'frequency_type')::public.search_frequency_type,
      frequency_value = coalesce(p_search->'frequency_value', '{}'::jsonb),
      timezone = p_search->>'timezone',
      notification_min_score = (p_search->>'notification_min_score')::smallint,
      semi_auto_min_score = (p_search->>'semi_auto_min_score')::smallint,
      auto_apply_min_score = (p_search->>'auto_apply_min_score')::smallint,
      daily_application_limit = (p_search->>'daily_application_limit')::integer,
      version = saved_version
    where id = saved_search_id;
  end if;

  insert into public.job_preferences (
    user_id, candidate_profile_id, search_profile_id, search_profile_version,
    keywords, target_titles, excluded_titles, locations, work_modes,
    minimum_salary, currency, accepted_seniorities, minimum_experience_years,
    maximum_experience_years, required_technologies, excluded_technologies,
    languages, contract_types, location_preference_state,
    work_mode_preference_state, salary_preference_state
  ) values (
    current_user_id, p_candidate_profile_id, saved_search_id, saved_version,
    public.jsonb_text_array(p_preferences->'keywords'),
    public.jsonb_text_array(p_preferences->'target_titles'),
    public.jsonb_text_array(p_preferences->'excluded_titles'),
    coalesce(p_preferences->'locations', '[]'::jsonb),
    public.jsonb_text_array(p_preferences->'work_modes'),
    nullif(p_preferences->>'minimum_salary', '')::numeric,
    nullif(p_preferences->>'currency', ''),
    public.jsonb_text_array(p_preferences->'accepted_seniorities'),
    nullif(p_preferences->>'minimum_experience_years', '')::smallint,
    nullif(p_preferences->>'maximum_experience_years', '')::smallint,
    public.jsonb_text_array(p_preferences->'required_technologies'),
    public.jsonb_text_array(p_preferences->'excluded_technologies'),
    coalesce(p_preferences->'languages', '[]'::jsonb),
    public.jsonb_text_array(p_preferences->'contract_types'),
    location_state, work_mode_state, salary_state
  );

  return jsonb_build_object('id', saved_search_id, 'version', saved_version);
end;
$$;

revoke all on function public.save_search_profile(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.save_search_profile(uuid, uuid, jsonb, jsonb) to authenticated;

commit;

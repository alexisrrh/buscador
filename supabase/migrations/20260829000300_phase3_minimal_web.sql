begin;

alter table public.candidate_profiles
  add column headline text,
  add column job_family text,
  add column seniority text,
  add constraint candidate_profiles_headline_check
    check (headline is null or length(headline) <= 160),
  add constraint candidate_profiles_job_family_check
    check (job_family is null or length(job_family) <= 100),
  add constraint candidate_profiles_seniority_check
    check (seniority is null or length(seniority) <= 50);

create or replace function public.jsonb_text_array(value jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(element), '{}'::text[])
  from jsonb_array_elements_text(coalesce(value, '[]'::jsonb)) as items(element);
$$;

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
      user_id,
      candidate_profile_id,
      name,
      frequency_type,
      frequency_value,
      timezone,
      notification_min_score,
      semi_auto_min_score,
      auto_apply_min_score,
      daily_application_limit
    ) values (
      current_user_id,
      p_candidate_profile_id,
      p_search->>'name',
      (p_search->>'frequency_type')::public.search_frequency_type,
      coalesce(p_search->'frequency_value', '{}'::jsonb),
      p_search->>'timezone',
      (p_search->>'notification_min_score')::smallint,
      (p_search->>'semi_auto_min_score')::smallint,
      (p_search->>'auto_apply_min_score')::smallint,
      (p_search->>'daily_application_limit')::integer
    )
    returning id, version into saved_search_id, saved_version;
  else
    select id, version
    into saved_search_id, saved_version
    from public.search_profiles
    where id = p_search_profile_id
      and user_id = current_user_id
      and candidate_profile_id = p_candidate_profile_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'SearchProfile not found' using errcode = 'P0002';
    end if;

    saved_version := saved_version + 1;

    update public.search_profiles
    set name = p_search->>'name',
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
    user_id,
    candidate_profile_id,
    search_profile_id,
    search_profile_version,
    keywords,
    target_titles,
    excluded_titles,
    locations,
    work_modes,
    minimum_salary,
    currency,
    accepted_seniorities,
    minimum_experience_years,
    maximum_experience_years,
    required_technologies,
    excluded_technologies,
    languages,
    contract_types
  ) values (
    current_user_id,
    p_candidate_profile_id,
    saved_search_id,
    saved_version,
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
    public.jsonb_text_array(p_preferences->'contract_types')
  );

  return jsonb_build_object('id', saved_search_id, 'version', saved_version);
end;
$$;

create or replace function public.approve_resume(p_resume_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_candidate_profile_id uuid;
  target_status public.resume_status;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select candidate_profile_id, status
  into target_candidate_profile_id, target_status
  from public.resumes
  where id = p_resume_id
    and user_id = current_user_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Resume not found' using errcode = 'P0002';
  end if;

  if target_status not in ('READY', 'ARCHIVED', 'APPROVED') then
    raise exception 'Only READY or ARCHIVED resumes can be approved'
      using errcode = '23514';
  end if;

  update public.resumes
  set status = 'ARCHIVED'
  where user_id = current_user_id
    and candidate_profile_id = target_candidate_profile_id
    and status = 'APPROVED'
    and deleted_at is null
    and id <> p_resume_id;

  update public.resumes
  set status = 'APPROVED'
  where id = p_resume_id
    and user_id = current_user_id;
end;
$$;

revoke all on function public.jsonb_text_array(jsonb) from public;
revoke all on function public.save_search_profile(uuid, uuid, jsonb, jsonb) from public;
revoke all on function public.approve_resume(uuid) from public;

grant execute on function public.save_search_profile(uuid, uuid, jsonb, jsonb)
  to authenticated;
grant execute on function public.approve_resume(uuid)
  to authenticated;
grant execute on function public.jsonb_text_array(jsonb)
  to authenticated;

commit;

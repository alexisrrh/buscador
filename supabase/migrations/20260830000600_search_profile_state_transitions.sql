begin;

create or replace function public.calculate_search_next_run(
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

create or replace function public.transition_search_profile_status(
  p_search_profile_id uuid,
  p_status public.search_profile_status
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target public.search_profiles;
  calculated_next_run timestamptz;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into target
  from public.search_profiles
  where id = p_search_profile_id
    and user_id = current_user_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'SearchProfile not found' using errcode = 'P0002';
  end if;

  if not (
    (target.status = 'DRAFT' and p_status in ('ACTIVE', 'ARCHIVED'))
    or (target.status = 'ACTIVE' and p_status in ('PAUSED', 'ARCHIVED'))
    or (target.status = 'PAUSED' and p_status in ('ACTIVE', 'ARCHIVED'))
  ) then
    raise exception 'Invalid SearchProfile status transition: % -> %', target.status, p_status
      using errcode = '23514';
  end if;

  calculated_next_run := case
    when p_status = 'ACTIVE' then public.calculate_search_next_run(
      target.frequency_type,
      target.frequency_value,
      target.timezone,
      now()
    )
    else null
  end;

  update public.search_profiles
  set
    status = p_status,
    next_run_at = calculated_next_run,
    deleted_at = case when p_status = 'ARCHIVED' then now() else null end
  where id = target.id;

  return jsonb_build_object(
    'id', target.id,
    'status', p_status,
    'next_run_at', calculated_next_run
  );
end;
$$;

revoke all on function public.calculate_search_next_run(
  public.search_frequency_type, jsonb, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.transition_search_profile_status(
  uuid, public.search_profile_status
) from public, anon;

grant execute on function public.transition_search_profile_status(
  uuid, public.search_profile_status
) to authenticated;

commit;

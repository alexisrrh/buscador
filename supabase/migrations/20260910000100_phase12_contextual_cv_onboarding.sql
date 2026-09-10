begin;

-- A contextual resume handoff may need a CandidateProfile solely because the
-- existing private-resume model owns every Resume through one.  This function
-- derives the tenant from auth.uid(); callers never provide a user id.
create or replace function public.ensure_contextual_candidate_profile()
returns table(candidate_profile_id uuid, resolution text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  active_profile_ids uuid[];
  created_profile_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Serialise the no-profile path for one tenant.  Candidate profiles have no
  -- global uniqueness constraint because users may intentionally own several.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('contextual-candidate-profile:' || current_user_id::text, 0)
  );

  select array_agg(id order by created_at asc, id asc)
  into active_profile_ids
  from public.candidate_profiles
  where user_id = current_user_id
    and deleted_at is null;

  if coalesce(cardinality(active_profile_ids), 0) = 1 then
    return query select active_profile_ids[1], 'REUSED'::text;
    return;
  end if;

  if coalesce(cardinality(active_profile_ids), 0) > 1 then
    return query select null::uuid, 'AMBIGUOUS'::text;
    return;
  end if;

  insert into public.candidate_profiles (user_id, name)
  values (current_user_id, 'Perfil principal')
  returning id into created_profile_id;

  return query select created_profile_id, 'CREATED'::text;
end;
$$;

revoke all on function public.ensure_contextual_candidate_profile() from public;
revoke all on function public.ensure_contextual_candidate_profile() from anon, service_role;
grant execute on function public.ensure_contextual_candidate_profile() to authenticated;

commit;

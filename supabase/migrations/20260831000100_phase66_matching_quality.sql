begin;

create or replace function public.inherit_job_match_user_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  previous_status public.job_match_status;
begin
  if new.status <> 'NEW' then
    return new;
  end if;

  select match.status
  into previous_status
  from public.job_matches as match
  where match.job_offer_id = new.job_offer_id
    and match.user_id = new.user_id
    and match.candidate_profile_id = new.candidate_profile_id
    and match.search_profile_id = new.search_profile_id
    and match.search_profile_version = new.search_profile_version
    and match.scoring_version <> new.scoring_version
    and match.status in ('SAVED', 'DISMISSED', 'APPLIED')
  order by match.updated_at desc
  limit 1;

  new.status := coalesce(previous_status, new.status);
  return new;
end;
$$;

create trigger job_matches_inherit_user_status
before insert on public.job_matches
for each row execute function public.inherit_job_match_user_status();

commit;

-- Runtime validation for Phase 6.7 public ATS platforms. Synthetic data only.
begin;

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'company_career_platform' and e.enumlabel = 'GREENHOUSE'
  ) or not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'company_career_platform' and e.enumlabel = 'SMARTRECRUITERS'
  ) then
    raise exception 'PUBLIC_ATS_ENUM_VALUES_MISSING';
  end if;
end;
$$;

set local role service_role;

insert into public.companies (id, name)
values
  ('77000000-0000-0000-0000-000000000001', 'Synthetic Greenhouse Company'),
  ('77000000-0000-0000-0000-000000000002', 'Synthetic SmartRecruiters Company');

insert into public.company_career_sources (company_id, platform, identifier, careers_url)
values
  ('77000000-0000-0000-0000-000000000001', 'GREENHOUSE', 'synthetic-greenhouse', 'https://job-boards.greenhouse.io/synthetic-greenhouse'),
  ('77000000-0000-0000-0000-000000000002', 'SMARTRECRUITERS', 'synthetic-smart', 'https://careers.smartrecruiters.com/synthetic-smart');

do $$
begin
  if (select count(*) from public.company_career_sources where platform in ('GREENHOUSE', 'SMARTRECRUITERS')) <> 2 then
    raise exception 'PUBLIC_ATS_SOURCE_INSERT_FAILED';
  end if;
  raise notice 'PASS PUBLIC_ATS_PLATFORMS';
end;
$$;

rollback;

begin;

create type public.company_career_platform as enum (
  'LEVER',
  'ASHBY'
);

create type public.company_career_status as enum (
  'ACTIVE',
  'DEGRADED',
  'DISABLED',
  'UNKNOWN'
);

create table public.company_career_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  platform public.company_career_platform not null,
  identifier text not null check (btrim(identifier) <> ''),
  careers_url text not null check (btrim(careers_url) <> ''),
  enabled boolean not null default true,
  status public.company_career_status not null default 'UNKNOWN',
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error_code text check (
    last_error_code is null or (
      btrim(last_error_code) <> '' and length(last_error_code) <= 100
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_career_sources_identity_key
    unique (company_id, platform, identifier),
  constraint company_career_sources_status_check
    check (
      (enabled and status <> 'DISABLED')
      or (not enabled and status = 'DISABLED')
    ),
  constraint company_career_sources_check_order
    check (
      last_success_at is null
      or last_checked_at is null
      or last_success_at <= last_checked_at
    )
);

alter table public.job_offer_sources
add column company_career_source_id uuid
references public.company_career_sources (id) on delete set null;

create index company_career_sources_enabled_idx
on public.company_career_sources (platform, enabled)
where enabled;

create index job_offer_sources_company_career_source_id_idx
on public.job_offer_sources (company_career_source_id)
where company_career_source_id is not null;

create trigger company_career_sources_set_updated_at
before update on public.company_career_sources
for each row execute function public.set_updated_at();

alter table public.company_career_sources enable row level security;

create policy company_career_sources_authenticated_read
on public.company_career_sources for select to authenticated
using (true);

revoke all on public.company_career_sources from anon, authenticated;
grant select on public.company_career_sources to authenticated;
grant all on public.company_career_sources to service_role;

create or replace function public.ingest_company_career_job_offer(
  p_offer jsonb,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  career_source_id uuid := nullif(
    p_offer->>'company_career_source_id',
    ''
  )::uuid;
  career_company_name text;
  career_company_website text;
  career_platform public.company_career_platform;
  career_enabled boolean;
  enriched_offer jsonb;
  ingest_result jsonb;
  affected_rows integer;
begin
  if career_source_id is null then
    raise exception 'Company career source is required' using errcode = '23502';
  end if;

  select c.name, c.website_url, ccs.platform, ccs.enabled
  into career_company_name, career_company_website, career_platform, career_enabled
  from public.company_career_sources ccs
  join public.companies c on c.id = ccs.company_id
  where ccs.id = career_source_id;

  if not found then
    raise exception 'Company career source not found' using errcode = 'P0002';
  end if;
  if not career_enabled then
    raise exception 'Company career source is disabled' using errcode = '42501';
  end if;
  if career_platform::text <> p_offer->>'source_code' then
    raise exception 'Career platform and job source do not match' using errcode = '23514';
  end if;

  enriched_offer := p_offer || jsonb_build_object(
    'company_name', career_company_name,
    'company_website_url', career_company_website
  );
  ingest_result := public.ingest_job_offer(enriched_offer, p_observed_at);

  update public.job_offer_sources
  set company_career_source_id = career_source_id
  where id = (ingest_result->>'job_offer_source_id')::uuid
    and (
      company_career_source_id is null
      or company_career_source_id = career_source_id
    );
  get diagnostics affected_rows = row_count;

  if affected_rows <> 1 then
    raise exception 'Job offer source belongs to another career source'
      using errcode = '23505';
  end if;

  return ingest_result;
end;
$$;

create or replace function public.record_company_career_source_check(
  p_company_career_source_id uuid,
  p_success boolean,
  p_error_code text default null,
  p_checked_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.company_career_sources
  set
    last_checked_at = p_checked_at,
    last_success_at = case
      when p_success then p_checked_at
      else last_success_at
    end,
    last_error_code = case
      when p_success then null
      else coalesce(nullif(btrim(p_error_code), ''), 'UNSPECIFIED_ERROR')
    end,
    status = case
      when not enabled then 'DISABLED'::public.company_career_status
      when p_success then 'ACTIVE'::public.company_career_status
      else 'DEGRADED'::public.company_career_status
    end
  where id = p_company_career_source_id;

  if not found then
    raise exception 'Company career source not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.ingest_company_career_job_offer(jsonb, timestamptz)
from public, anon, authenticated;
revoke all on function public.record_company_career_source_check(uuid, boolean, text, timestamptz)
from public, anon, authenticated;

grant execute on function public.ingest_company_career_job_offer(jsonb, timestamptz)
to service_role;
grant execute on function public.record_company_career_source_check(uuid, boolean, text, timestamptz)
to service_role;

commit;

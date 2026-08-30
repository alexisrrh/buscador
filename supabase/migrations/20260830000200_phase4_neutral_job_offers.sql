begin;

create type public.job_offer_status as enum (
  'ACTIVE',
  'EXPIRED',
  'REMOVED'
);

create type public.job_work_mode as enum (
  'REMOTE',
  'HYBRID',
  'ONSITE',
  'UNKNOWN'
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  normalized_name text generated always as (
    lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
  ) stored,
  website_url text,
  careers_url text,
  linkedin_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_normalized_name_key unique (normalized_name)
);

create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null check (btrim(name) <> ''),
  base_url text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_sources_code_key unique (code),
  constraint job_sources_code_format_check
    check (code ~ '^[A-Z][A-Z0-9_]*$')
);

create table public.job_offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete set null,
  title text not null check (btrim(title) <> ''),
  normalized_title text generated always as (
    lower(regexp_replace(btrim(title), '[[:space:]]+', ' ', 'g'))
  ) stored,
  description text,
  description_hash text generated always as (
    case
      when description is null then null
      else encode(digest(description, 'sha256'), 'hex')
    end
  ) stored,
  location_text text,
  country_code text,
  region text,
  city text,
  work_mode public.job_work_mode,
  seniority text,
  employment_type text,
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  published_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz,
  canonical_url text,
  canonical_url_is_reliable boolean not null default false,
  status public.job_offer_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_offers_country_code_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint job_offers_salary_check
    check (
      (salary_min is null or salary_min >= 0)
      and (salary_max is null or salary_max >= 0)
      and (salary_min is null or salary_max is null or salary_min <= salary_max)
    ),
  constraint job_offers_salary_currency_check
    check (salary_currency is null or salary_currency ~ '^[A-Z]{3}$'),
  constraint job_offers_seen_order_check check (first_seen_at <= last_seen_at),
  constraint job_offers_reliable_url_check
    check (not canonical_url_is_reliable or canonical_url is not null)
);

create table public.job_offer_sources (
  id uuid primary key default gen_random_uuid(),
  job_offer_id uuid not null
    references public.job_offers (id) on delete cascade,
  job_source_id uuid not null
    references public.job_sources (id) on delete restrict,
  external_job_id text,
  source_url text not null check (btrim(source_url) <> ''),
  canonical_source_url text not null check (btrim(canonical_source_url) <> ''),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_offer_sources_external_job_id_check
    check (external_job_id is null or btrim(external_job_id) <> ''),
  constraint job_offer_sources_seen_order_check check (first_seen_at <= last_seen_at),
  constraint job_offer_sources_source_url_key
    unique (job_source_id, canonical_source_url)
);

create unique index job_offer_sources_external_job_id_key
on public.job_offer_sources (job_source_id, external_job_id)
where external_job_id is not null;

create unique index job_offers_reliable_canonical_url_key
on public.job_offers (canonical_url)
where canonical_url is not null and canonical_url_is_reliable;

create index job_offers_company_id_idx
on public.job_offers (company_id);

create index job_offers_status_last_seen_idx
on public.job_offers (status, last_seen_at desc);

create index job_offer_sources_job_offer_id_idx
on public.job_offer_sources (job_offer_id);

create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

create trigger job_sources_set_updated_at
before update on public.job_sources
for each row execute function public.set_updated_at();

create trigger job_offers_set_updated_at
before update on public.job_offers
for each row execute function public.set_updated_at();

create trigger job_offer_sources_set_updated_at
before update on public.job_offer_sources
for each row execute function public.set_updated_at();

alter table public.companies enable row level security;
alter table public.job_sources enable row level security;
alter table public.job_offers enable row level security;
alter table public.job_offer_sources enable row level security;

create policy companies_authenticated_read
on public.companies for select to authenticated
using (true);

create policy job_sources_authenticated_read
on public.job_sources for select to authenticated
using (true);

create policy job_offers_authenticated_read
on public.job_offers for select to authenticated
using (true);

create policy job_offer_sources_authenticated_read
on public.job_offer_sources for select to authenticated
using (true);

revoke all on public.companies from anon, authenticated;
revoke all on public.job_sources from anon, authenticated;
revoke all on public.job_offers from anon, authenticated;
revoke all on public.job_offer_sources from anon, authenticated;

grant select on public.companies to authenticated;
grant select on public.job_sources to authenticated;
grant select on public.job_offers to authenticated;
grant select on public.job_offer_sources to authenticated;

grant all on public.companies to service_role;
grant all on public.job_sources to service_role;
grant all on public.job_offers to service_role;
grant all on public.job_offer_sources to service_role;

commit;

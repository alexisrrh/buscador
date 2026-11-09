-- Portable neutral catalogue. Identity across boards remains task 14.
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
      else encode(extensions.digest(description, 'sha256'), 'hex')
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

create type public.company_career_platform as enum (
  'LEVER',
  'ASHBY', 'GREENHOUSE', 'SMARTRECRUITERS', 'JOBGETHER', 'JOBICY'
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


ALTER TABLE public.job_sources ADD COLUMN auto_apply_enabled boolean NOT NULL DEFAULT false;

CREATE FUNCTION app.set_catalog_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TRIGGER companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION app.set_catalog_updated_at();
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies FORCE ROW LEVEL SECURITY;
CREATE POLICY companies_ingest ON public.companies TO bv_ingest USING (true) WITH CHECK (true);
REVOKE ALL ON public.companies FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.companies TO bv_ingest;
CREATE TRIGGER job_sources_updated_at BEFORE UPDATE ON public.job_sources FOR EACH ROW EXECUTE FUNCTION app.set_catalog_updated_at();
ALTER TABLE public.job_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY job_sources_ingest ON public.job_sources TO bv_ingest USING (true) WITH CHECK (true);
REVOKE ALL ON public.job_sources FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.job_sources TO bv_ingest;
CREATE TRIGGER job_offers_updated_at BEFORE UPDATE ON public.job_offers FOR EACH ROW EXECUTE FUNCTION app.set_catalog_updated_at();
ALTER TABLE public.job_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_offers FORCE ROW LEVEL SECURITY;
CREATE POLICY job_offers_ingest ON public.job_offers TO bv_ingest USING (true) WITH CHECK (true);
REVOKE ALL ON public.job_offers FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.job_offers TO bv_ingest;
CREATE TRIGGER job_offer_sources_updated_at BEFORE UPDATE ON public.job_offer_sources FOR EACH ROW EXECUTE FUNCTION app.set_catalog_updated_at();
ALTER TABLE public.job_offer_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_offer_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY job_offer_sources_ingest ON public.job_offer_sources TO bv_ingest USING (true) WITH CHECK (true);
REVOKE ALL ON public.job_offer_sources FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.job_offer_sources TO bv_ingest;
CREATE TRIGGER company_career_sources_updated_at BEFORE UPDATE ON public.company_career_sources FOR EACH ROW EXECUTE FUNCTION app.set_catalog_updated_at();
ALTER TABLE public.company_career_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_career_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY company_career_sources_ingest ON public.company_career_sources TO bv_ingest USING (true) WITH CHECK (true);
REVOKE ALL ON public.company_career_sources FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON public.company_career_sources TO bv_ingest;

create or replace function app.find_existing_job_offer(
  p_source_code text,
  p_external_job_id text,
  p_canonical_source_url text,
  p_canonical_url text,
  p_canonical_url_is_reliable boolean default false
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  source_id uuid;
  matched_offer_id uuid;
  matched_source_id uuid;
  matched_by text;
begin
  select id into source_id
  from public.job_sources
  where code = p_source_code;

  if source_id is not null and p_external_job_id is not null then
    select job_offer_id, id
    into matched_offer_id, matched_source_id
    from public.job_offer_sources
    where job_source_id = source_id
      and external_job_id = p_external_job_id;

    if found then matched_by := 'external_job_id'; end if;
  end if;

  if matched_offer_id is null
     and source_id is not null
     and p_canonical_source_url is not null then
    select job_offer_id, id
    into matched_offer_id, matched_source_id
    from public.job_offer_sources
    where job_source_id = source_id
      and canonical_source_url = p_canonical_source_url;

    if found then matched_by := 'canonical_source_url'; end if;
  end if;

  if matched_offer_id is null
     and p_canonical_url_is_reliable
     and p_canonical_url is not null then
    select id into matched_offer_id
    from public.job_offers
    where canonical_url = p_canonical_url
      and canonical_url_is_reliable;

    if found then matched_by := 'canonical_url'; end if;
  end if;

  if matched_offer_id is null then return null; end if;

  return jsonb_build_object(
    'job_offer_id', matched_offer_id,
    'job_offer_source_id', matched_source_id,
    'matched_by', matched_by
  );
end;
$$;

create or replace function app.ingest_job_offer(
  p_offer jsonb,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source_code text := nullif(btrim(p_offer->>'source_code'), '');
  v_source_name text := nullif(btrim(p_offer->>'source_name'), '');
  v_external_job_id text := nullif(btrim(p_offer->>'external_job_id'), '');
  v_source_url text := nullif(btrim(p_offer->>'source_url'), '');
  v_canonical_source_url text := nullif(btrim(p_offer->>'canonical_source_url'), '');
  v_canonical_url text := nullif(btrim(p_offer->>'canonical_url'), '');
  v_canonical_url_is_reliable boolean := coalesce(
    (p_offer->>'canonical_url_is_reliable')::boolean,
    false
  );
  v_source_id uuid;
  v_company_id uuid;
  v_offer_id uuid;
  v_offer_source_id uuid;
  v_offer_created boolean := false;
  v_source_created boolean := false;
begin
  if v_source_code is null
     or v_source_name is null
     or v_source_url is null
     or v_canonical_source_url is null
     or nullif(btrim(p_offer->>'title'), '') is null then
    raise exception 'Missing required normalized offer fields' using errcode = '23502';
  end if;

  if v_canonical_url_is_reliable and v_canonical_url is null then
    raise exception 'Reliable canonical URL is missing' using errcode = '23514';
  end if;

  insert into public.job_sources (code, name, base_url)
  values (v_source_code, v_source_name, nullif(btrim(p_offer->>'source_base_url'), ''))
  on conflict (code) do update
  set
    name = excluded.name,
    base_url = coalesce(excluded.base_url, public.job_sources.base_url)
  returning id into v_source_id;
  IF NOT EXISTS (SELECT 1 FROM public.job_sources WHERE id=v_source_id AND enabled) THEN
    RAISE EXCEPTION 'Job source disabled' USING errcode='42501';
  END IF;

  if nullif(btrim(p_offer->>'company_name'), '') is not null then
    insert into public.companies (name, website_url)
    values (
      btrim(p_offer->>'company_name'),
      nullif(btrim(p_offer->>'company_website_url'), '')
    )
    on conflict (normalized_name) do update
    set website_url = coalesce(
      public.companies.website_url,
      excluded.website_url
    )
    returning id into v_company_id;
  end if;

  -- A stable lock order makes concurrent retries deterministic.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'job-source-url:' || v_source_id::text || ':' || v_canonical_source_url,
      0
    )
  );
  if v_external_job_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'job-external-id:' || v_source_id::text || ':' || v_external_job_id,
        0
      )
    );
  end if;
  if v_canonical_url_is_reliable then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('job-canonical-url:' || v_canonical_url, 0)
    );
  end if;

  if v_external_job_id is not null then
    select id, job_offer_id
    into v_offer_source_id, v_offer_id
    from public.job_offer_sources
    where job_source_id = v_source_id
      and job_offer_sources.external_job_id = v_external_job_id;
  end if;

  if v_offer_source_id is null then
    select id, job_offer_id
    into v_offer_source_id, v_offer_id
    from public.job_offer_sources
    where job_source_id = v_source_id
      and job_offer_sources.canonical_source_url = v_canonical_source_url;
  end if;

  if v_offer_source_id is not null then
    update public.job_offers
    set
      company_id = coalesce(v_company_id, job_offers.company_id),
      title = p_offer->>'title',
      description = coalesce(p_offer->>'description', job_offers.description),
      location_text = coalesce(p_offer->>'location_text', job_offers.location_text),
      country_code = coalesce(p_offer->>'country_code', job_offers.country_code),
      region = coalesce(p_offer->>'region', job_offers.region),
      city = coalesce(p_offer->>'city', job_offers.city),
      work_mode = coalesce(
        nullif(p_offer->>'work_mode', '')::public.job_work_mode,
        job_offers.work_mode
      ),
      seniority = coalesce(p_offer->>'seniority', job_offers.seniority),
      employment_type = coalesce(
        p_offer->>'employment_type',
        job_offers.employment_type
      ),
      salary_min = coalesce(
        nullif(p_offer->>'salary_min', '')::numeric,
        job_offers.salary_min
      ),
      salary_max = coalesce(
        nullif(p_offer->>'salary_max', '')::numeric,
        job_offers.salary_max
      ),
      salary_currency = coalesce(
        p_offer->>'salary_currency',
        job_offers.salary_currency
      ),
      published_at = coalesce(
        nullif(p_offer->>'published_at', '')::timestamptz,
        job_offers.published_at
      ),
      last_seen_at = greatest(job_offers.last_seen_at, p_observed_at),
      canonical_url = coalesce(v_canonical_url, job_offers.canonical_url),
      canonical_url_is_reliable = (
        job_offers.canonical_url_is_reliable or v_canonical_url_is_reliable
      ),
      status = coalesce(
        nullif(p_offer->>'status', '')::public.job_offer_status,
        job_offers.status
      )
    where id = v_offer_id;

    update public.job_offer_sources
    set
      external_job_id = coalesce(
        job_offer_sources.external_job_id,
        v_external_job_id
      ),
      source_url = v_source_url,
      canonical_source_url = v_canonical_source_url,
      last_seen_at = greatest(job_offer_sources.last_seen_at, p_observed_at),
      raw_payload = p_offer->'raw_payload'
    where id = v_offer_source_id;

    return jsonb_build_object(
      'job_offer_id', v_offer_id,
      'job_offer_source_id', v_offer_source_id,
      'offer_created', false,
      'source_created', false
    );
  end if;

  if v_canonical_url_is_reliable then
    select id into v_offer_id
    from public.job_offers
    where job_offers.canonical_url = v_canonical_url
      and job_offers.canonical_url_is_reliable;
  end if;

  if v_offer_id is null then
    insert into public.job_offers (
      company_id, title, description, location_text, country_code, region, city,
      work_mode, seniority, employment_type, salary_min, salary_max,
      salary_currency, published_at, first_seen_at, last_seen_at, canonical_url,
      canonical_url_is_reliable, status
    ) values (
      v_company_id,
      p_offer->>'title',
      p_offer->>'description',
      p_offer->>'location_text',
      p_offer->>'country_code',
      p_offer->>'region',
      p_offer->>'city',
      coalesce(nullif(p_offer->>'work_mode', '')::public.job_work_mode, 'UNKNOWN'),
      p_offer->>'seniority',
      p_offer->>'employment_type',
      nullif(p_offer->>'salary_min', '')::numeric,
      nullif(p_offer->>'salary_max', '')::numeric,
      p_offer->>'salary_currency',
      nullif(p_offer->>'published_at', '')::timestamptz,
      p_observed_at,
      p_observed_at,
      v_canonical_url,
      v_canonical_url_is_reliable,
      coalesce(nullif(p_offer->>'status', '')::public.job_offer_status, 'ACTIVE')
    )
    returning id into v_offer_id;
    v_offer_created := true;
  else
    update public.job_offers
    set
      company_id = coalesce(v_company_id, job_offers.company_id),
      description = coalesce(p_offer->>'description', job_offers.description),
      last_seen_at = greatest(job_offers.last_seen_at, p_observed_at)
    where id = v_offer_id;
  end if;

  insert into public.job_offer_sources (
    job_offer_id, job_source_id, external_job_id, source_url,
    canonical_source_url, first_seen_at, last_seen_at, raw_payload
  ) values (
    v_offer_id,
    v_source_id,
    v_external_job_id,
    v_source_url,
    v_canonical_source_url,
    p_observed_at,
    p_observed_at,
    p_offer->'raw_payload'
  )
  returning id into v_offer_source_id;
  v_source_created := true;

  return jsonb_build_object(
    'job_offer_id', v_offer_id,
    'job_offer_source_id', v_offer_source_id,
    'offer_created', v_offer_created,
    'source_created', v_source_created
  );
end;
$$;

create or replace function app.ingest_company_career_job_offer(
  p_offer jsonb,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
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
  ingest_result := app.ingest_job_offer(enriched_offer, p_observed_at);

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

create or replace function app.record_company_career_source_check(
  p_company_career_source_id uuid,
  p_success boolean,
  p_error_code text default null,
  p_checked_at timestamptz default now()
)
returns void
language plpgsql
security invoker
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

create or replace function app.job_offer_matching_fingerprint(
  p_job_offer_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'company_id', offer.company_id,
    'title', offer.title,
    'description_hash', offer.description_hash,
    'location_text', offer.location_text,
    'country_code', offer.country_code,
    'region', offer.region,
    'city', offer.city,
    'work_mode', offer.work_mode,
    'seniority', offer.seniority,
    'employment_type', offer.employment_type,
    'salary_min', offer.salary_min,
    'salary_max', offer.salary_max,
    'salary_currency', offer.salary_currency,
    'status', offer.status
  )
  from public.job_offers offer
  where offer.id = p_job_offer_id;
$$;

create or replace function app.find_existing_job_offers_batch(
  p_source_code text,
  p_offers jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  existing jsonb;
  results jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_offers) <> 'array' then
    raise exception 'Offers batch must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_offers) > 500 then
    raise exception 'Offers batch exceeds 500 items' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_offers)
  loop
    existing := app.find_existing_job_offer(
      p_source_code,
      nullif(btrim(item->>'external_job_id'), ''),
      nullif(btrim(item->>'canonical_source_url'), ''),
      nullif(btrim(item->>'canonical_url'), ''),
      coalesce((item->>'canonical_url_is_reliable')::boolean, false)
    );
    results := results || jsonb_build_array(
      jsonb_build_object(
        'batch_index', (item->>'batch_index')::integer,
        'job_offer_id', existing->>'job_offer_id',
        'job_offer_source_id', existing->>'job_offer_source_id',
        'matched_by', existing->>'matched_by'
      )
    );
  end loop;

  return results;
end;
$$;

create or replace function app.ingest_company_career_job_offers_batch(
  p_offers jsonb,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  existing jsonb;
  ingested jsonb;
  before_fingerprint jsonb;
  after_fingerprint jsonb;
  offer_id uuid;
  outcome text;
  results jsonb := '[]'::jsonb;
  created_count integer := 0;
  updated_count integer := 0;
  unchanged_count integer := 0;
  error_count integer := 0;
begin
  if jsonb_typeof(p_offers) <> 'array' then
    raise exception 'Offers batch must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_offers) = 0 then
    return jsonb_build_object(
      'results', results,
      'created', 0,
      'updated', 0,
      'unchanged', 0
    );
  end if;
  if jsonb_array_length(p_offers) > 500 then
    raise exception 'Offers batch exceeds 500 items' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_offers)
  loop
    BEGIN
    existing := app.find_existing_job_offer(
      item->>'source_code',
      nullif(btrim(item->>'external_job_id'), ''),
      nullif(btrim(item->>'canonical_source_url'), ''),
      nullif(btrim(item->>'canonical_url'), ''),
      coalesce((item->>'canonical_url_is_reliable')::boolean, false)
    );
    if existing is not null then
      before_fingerprint := app.job_offer_matching_fingerprint(
        (existing->>'job_offer_id')::uuid
      );
    else
      before_fingerprint := null;
    end if;

    IF nullif(item->>'company_career_source_id','') IS NULL THEN
      ingested := app.ingest_job_offer(item,p_observed_at);
    ELSE
      ingested := app.ingest_company_career_job_offer(item,p_observed_at);
    END IF;
    offer_id := (ingested->>'job_offer_id')::uuid;
    after_fingerprint := app.job_offer_matching_fingerprint(offer_id);

    if (ingested->>'offer_created')::boolean then
      outcome := 'CREATED';
      created_count := created_count + 1;
    elsif before_fingerprint is distinct from after_fingerprint then
      outcome := 'UPDATED';
      updated_count := updated_count + 1;
    else
      outcome := 'UNCHANGED';
      unchanged_count := unchanged_count + 1;
    end if;

    results := results || jsonb_build_array(
      jsonb_build_object(
        'batch_index', (item->>'batch_index')::integer,
        'job_offer_id', offer_id,
        'job_offer_source_id', ingested->>'job_offer_source_id',
        'outcome', outcome,
        'source_created', (ingested->>'source_created')::boolean,
        'matched_existing', existing is not null
      )
    );
    EXCEPTION WHEN OTHERS THEN error_count := error_count + 1;
    END;
  end loop;

  return jsonb_build_object(
    'results', results,
    'errors', error_count,
    'created', created_count,
    'updated', updated_count,
    'unchanged', unchanged_count
  );
end;
$$;
REVOKE ALL ON FUNCTION app.find_existing_job_offer(text,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.find_existing_job_offer(text,text,text,text,boolean) TO bv_ingest;
REVOKE ALL ON FUNCTION app.ingest_job_offer(jsonb,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ingest_job_offer(jsonb,timestamptz) TO bv_ingest;
REVOKE ALL ON FUNCTION app.ingest_company_career_job_offer(jsonb,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ingest_company_career_job_offer(jsonb,timestamptz) TO bv_ingest;
REVOKE ALL ON FUNCTION app.record_company_career_source_check(uuid,boolean,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_company_career_source_check(uuid,boolean,text,timestamptz) TO bv_ingest;
REVOKE ALL ON FUNCTION app.job_offer_matching_fingerprint(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.job_offer_matching_fingerprint(uuid) TO bv_ingest;
REVOKE ALL ON FUNCTION app.find_existing_job_offers_batch(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.find_existing_job_offers_batch(text,jsonb) TO bv_ingest;
REVOKE ALL ON FUNCTION app.ingest_company_career_job_offers_batch(jsonb,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ingest_company_career_job_offers_batch(jsonb,timestamptz) TO bv_ingest;

REVOKE ALL ON FUNCTION app.set_catalog_updated_at() FROM PUBLIC;
ALTER TABLE public.job_offer_sources ADD CONSTRAINT job_offer_sources_http_urls CHECK (source_url ~ '^https?://' AND canonical_source_url ~ '^https?://');
ALTER TABLE public.job_offers ADD CONSTRAINT job_offers_http_canonical CHECK (canonical_url IS NULL OR canonical_url ~ '^https?://');
CREATE POLICY companies_catalog ON public.companies FOR SELECT TO bv_catalog USING (true);
CREATE POLICY job_sources_catalog ON public.job_sources FOR SELECT TO bv_catalog USING (enabled);
CREATE POLICY career_sources_catalog ON public.company_career_sources FOR SELECT TO bv_catalog USING (enabled AND status <> 'DISABLED');
CREATE POLICY job_offers_catalog ON public.job_offers FOR SELECT TO bv_catalog
  USING (status='ACTIVE' AND (expires_at IS NULL OR expires_at > now()));
CREATE POLICY job_offer_sources_catalog ON public.job_offer_sources FOR SELECT TO bv_catalog USING (
  EXISTS (SELECT 1 FROM public.job_sources js WHERE js.id=job_source_id AND js.enabled)
  AND EXISTS (SELECT 1 FROM public.job_offers o WHERE o.id=job_offer_id)
  AND (company_career_source_id IS NULL OR EXISTS (SELECT 1 FROM public.company_career_sources c WHERE c.id=company_career_source_id))
);
GRANT SELECT(id,name) ON public.companies TO bv_catalog;
GRANT SELECT(id,name,enabled) ON public.job_sources TO bv_catalog;
GRANT SELECT(id,enabled,status) ON public.company_career_sources TO bv_catalog;
GRANT SELECT(id,job_offer_id,job_source_id,source_url,company_career_source_id) ON public.job_offer_sources TO bv_catalog;
GRANT SELECT(id,company_id,title,description,location_text,country_code,region,city,work_mode,seniority,employment_type,
  salary_min,salary_max,salary_currency,published_at,canonical_url,status,last_seen_at,expires_at) ON public.job_offers TO bv_catalog;

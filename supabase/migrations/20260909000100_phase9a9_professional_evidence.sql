begin;

create type public.professional_evidence_subject as enum ('PROJECT', 'EMPLOYMENT');
create type public.professional_evidence_category as enum ('PROBLEM', 'RESPONSIBILITY', 'FEATURE', 'FRONTEND', 'BACKEND', 'API_INTEGRATION', 'AUTH', 'DATABASE', 'STORAGE', 'ARCHITECTURE', 'TESTING', 'DEPLOYMENT', 'TECHNOLOGY', 'RESULT', 'METRIC', 'OTHER');
create type public.professional_evidence_source as enum ('APPROVED_RESUME', 'USER_CONFIRMED', 'VERIFIED_TRAINING');
create type public.professional_evidence_verification as enum ('VERIFIED', 'CONFIRMABLE', 'MISSING', 'UNKNOWN');

create table public.professional_evidence_profiles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  candidate_profile_id uuid not null, subject_type public.professional_evidence_subject not null,
  display_name text not null check (btrim(display_name) <> ''), description text,
  employment_role text, employment_company text, employment_dates text, employment_location text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (user_id, candidate_profile_id) references public.candidate_profiles(user_id, id) on delete cascade,
  check ((subject_type = 'PROJECT' and employment_role is null and employment_company is null) or subject_type = 'EMPLOYMENT')
);
create table public.professional_evidence_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, candidate_profile_id uuid not null, profile_id uuid not null,
  category public.professional_evidence_category not null, exact_claim text not null check (btrim(exact_claim) <> ''),
  source_type public.professional_evidence_source not null, source_reference text not null check (btrim(source_reference) <> ''),
  verification_status public.professional_evidence_verification not null default 'UNKNOWN', confirmed_at timestamptz,
  relevance_tags text[] not null default '{}'::text[], created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (user_id, candidate_profile_id) references public.candidate_profiles(user_id, id) on delete cascade,
  foreign key (profile_id) references public.professional_evidence_profiles(id) on delete cascade,
  check ((source_type <> 'USER_CONFIRMED' or (verification_status = 'VERIFIED' and confirmed_at is not null)) and (verification_status <> 'VERIFIED' or source_type <> 'USER_CONFIRMED' or confirmed_at is not null))
);
create table public.professional_evidence_urls (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, candidate_profile_id uuid not null, profile_id uuid not null,
  url text not null check (url ~ '^https?://'), url_type text not null check (url_type in ('DEMO', 'REPOSITORY', 'PORTFOLIO')),
  source_type public.professional_evidence_source not null, source_reference text not null check (btrim(source_reference) <> ''),
  verification_status public.professional_evidence_verification not null default 'UNKNOWN', confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (user_id, candidate_profile_id) references public.candidate_profiles(user_id, id) on delete cascade,
  foreign key (profile_id) references public.professional_evidence_profiles(id) on delete cascade,
  unique(profile_id, url), check (source_type <> 'USER_CONFIRMED' or (verification_status = 'VERIFIED' and confirmed_at is not null))
);
create index professional_evidence_profiles_owner_idx on public.professional_evidence_profiles(user_id, candidate_profile_id);
create index professional_evidence_items_profile_idx on public.professional_evidence_items(profile_id, verification_status);
create trigger professional_evidence_profiles_updated before update on public.professional_evidence_profiles for each row execute function public.set_updated_at();
create trigger professional_evidence_items_updated before update on public.professional_evidence_items for each row execute function public.set_updated_at();
alter table public.professional_evidence_profiles enable row level security; alter table public.professional_evidence_profiles force row level security;
alter table public.professional_evidence_items enable row level security; alter table public.professional_evidence_items force row level security;
alter table public.professional_evidence_urls enable row level security; alter table public.professional_evidence_urls force row level security;
create policy professional_evidence_profiles_own on public.professional_evidence_profiles for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy professional_evidence_items_own on public.professional_evidence_items for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy professional_evidence_urls_own on public.professional_evidence_urls for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.professional_evidence_profiles, public.professional_evidence_items, public.professional_evidence_urls from anon;
grant select, insert, update, delete on public.professional_evidence_profiles, public.professional_evidence_items, public.professional_evidence_urls to authenticated;
grant all on public.professional_evidence_profiles, public.professional_evidence_items, public.professional_evidence_urls to service_role;
commit;

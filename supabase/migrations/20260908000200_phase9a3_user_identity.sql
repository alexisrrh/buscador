-- Explicit user-owned identity for derived-resume headers. Existing profiles
-- remain NULL/NULL until the user supplies both values in the application.
alter table public.profiles
  add column first_name text,
  add column last_name text,
  add constraint profiles_identity_complete_check check (
    (first_name is null and last_name is null)
    or (
      first_name is not null and last_name is not null
      and first_name = btrim(regexp_replace(first_name, '[[:space:]]+', ' ', 'g')) and first_name <> ''
      and last_name = btrim(regexp_replace(last_name, '[[:space:]]+', ' ', 'g')) and last_name <> ''
    )
  );

-- profiles already has ENABLE/FORCE ROW LEVEL SECURITY and own-row policies.
-- No additional policy is needed: the new columns inherit that isolation.

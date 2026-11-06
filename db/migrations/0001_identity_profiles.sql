-- Portable target foundation only. No auth.users, Storage or PostgREST.
-- The identity FK is added with Better Auth in task 07 before target activation.
CREATE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT nullif(pg_catalog.current_setting('app.user_id', true), '')::uuid $$;
REVOKE ALL ON FUNCTION app.current_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.current_user_id() TO bv_app;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  first_name text,
  last_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT profiles_identity_complete_check CHECK (
    (first_name IS NULL AND last_name IS NULL) OR (
      first_name IS NOT NULL AND last_name IS NOT NULL
      AND first_name = btrim(regexp_replace(first_name, '[[:space:]]+', ' ', 'g')) AND first_name <> ''
      AND last_name = btrim(regexp_replace(last_name, '[[:space:]]+', ' ', 'g')) AND last_name <> ''
    )
  )
);
CREATE TABLE public.candidate_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  headline text CHECK (headline IS NULL OR length(headline) <= 160),
  job_family text CHECK (job_family IS NULL OR length(job_family) <= 100),
  seniority text CHECK (seniority IS NULL OR length(seniority) <= 50),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (user_id, id)
);
-- The composite unique index also supports owner lookups (leftmost user_id).
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY profiles_owner ON public.profiles TO bv_app
  USING (id = (SELECT app.current_user_id()))
  WITH CHECK (id = (SELECT app.current_user_id()));
CREATE POLICY candidate_profiles_owner ON public.candidate_profiles TO bv_app
  USING (user_id = (SELECT app.current_user_id()))
  WITH CHECK (user_id = (SELECT app.current_user_id()));
REVOKE ALL ON public.profiles, public.candidate_profiles FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.candidate_profiles TO bv_app;

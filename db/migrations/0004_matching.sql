CREATE TYPE public.job_match_eligibility AS ENUM ('ELIGIBLE','REVIEW','REJECTED');
CREATE TYPE public.job_match_status AS ENUM ('NEW','SAVED','DISMISSED','APPLIED');

CREATE TABLE public.job_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  candidate_profile_id uuid NOT NULL,
  search_profile_id uuid NOT NULL,
  search_profile_version integer NOT NULL CHECK (search_profile_version > 0),
  job_offer_id uuid NOT NULL REFERENCES public.job_offers(id),
  scoring_version text NOT NULL CHECK (btrim(scoring_version) <> ''),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  eligibility_status public.job_match_eligibility NOT NULL,
  score_components jsonb NOT NULL CHECK (jsonb_typeof(score_components)='object'),
  hard_gates jsonb NOT NULL CHECK (jsonb_typeof(hard_gates)='object'),
  reasons jsonb NOT NULL CHECK (jsonb_typeof(reasons)='array'),
  status public.job_match_status NOT NULL DEFAULT 'NEW',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_matches_search_owner_fk FOREIGN KEY (user_id,candidate_profile_id,search_profile_id)
    REFERENCES public.search_profiles(user_id,candidate_profile_id,id),
  CONSTRAINT job_matches_preferences_version_fk FOREIGN KEY (user_id,search_profile_id,search_profile_version)
    REFERENCES public.job_preferences(user_id,search_profile_id,search_profile_version),
  CONSTRAINT job_matches_identity_key UNIQUE (job_offer_id,user_id,candidate_profile_id,search_profile_id,search_profile_version,scoring_version)
);
CREATE INDEX job_matches_user_status_score_idx ON public.job_matches(user_id,status,score DESC);
CREATE INDEX job_matches_search_profile_idx ON public.job_matches(search_profile_id,search_profile_version,score DESC);
CREATE INDEX job_matches_job_offer_idx ON public.job_matches(job_offer_id);
ALTER TABLE public.job_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_matches FORCE ROW LEVEL SECURITY;
CREATE POLICY job_matches_own ON public.job_matches TO bv_app
  USING (user_id=(SELECT app.current_user_id())) WITH CHECK (user_id=(SELECT app.current_user_id()));
GRANT SELECT,INSERT,UPDATE ON public.job_matches TO bv_app;

-- Preserve the legacy rule: decisions carry across scoring versions within the
-- same preference snapshot, never across different search versions.
CREATE FUNCTION app.inherit_job_match_user_status() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.status='NEW' THEN
    NEW.status := COALESCE((SELECT m.status FROM public.job_matches m
      WHERE m.user_id=NEW.user_id AND m.candidate_profile_id=NEW.candidate_profile_id
        AND m.search_profile_id=NEW.search_profile_id AND m.search_profile_version=NEW.search_profile_version
        AND m.job_offer_id=NEW.job_offer_id AND m.scoring_version<>NEW.scoring_version
        AND m.status IN ('SAVED','DISMISSED','APPLIED')
      ORDER BY m.updated_at DESC,m.id LIMIT 1),NEW.status);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.inherit_job_match_user_status() FROM PUBLIC;
CREATE TRIGGER job_matches_inherit_user_status BEFORE INSERT ON public.job_matches
  FOR EACH ROW EXECUTE FUNCTION app.inherit_job_match_user_status();
CREATE TRIGGER job_matches_set_updated_at BEFORE UPDATE ON public.job_matches
  FOR EACH ROW EXECUTE FUNCTION app.set_catalog_updated_at();

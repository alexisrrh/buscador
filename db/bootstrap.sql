-- Only an explicit provisioning step in a dedicated target database.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bv_owner') THEN
    CREATE ROLE bv_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bv_app') THEN
    CREATE ROLE bv_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bv_ingest') THEN
    CREATE ROLE bv_ingest NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bv_catalog') THEN
    CREATE ROLE bv_catalog NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname IN ('bv_owner', 'bv_app', 'bv_ingest', 'bv_catalog')
    AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
  ) OR pg_has_role('bv_app', 'bv_owner', 'MEMBER') THEN
    RAISE EXCEPTION 'Unsafe existing BuscaVacante roles';
  END IF;
  IF pg_has_role('bv_ingest','bv_owner','MEMBER') OR pg_has_role('bv_ingest','bv_app','MEMBER')
     OR pg_has_role('bv_catalog','bv_owner','MEMBER') OR pg_has_role('bv_catalog','bv_app','MEMBER')
     OR pg_has_role('bv_catalog','bv_ingest','MEMBER') OR pg_has_role('bv_ingest','bv_catalog','MEMBER') THEN
    RAISE EXCEPTION 'Catalogue roles must be separate from private, owner and each other';
  END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO bv_owner;
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION bv_owner;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app, public TO bv_app;
GRANT USAGE ON SCHEMA app, public TO bv_ingest, bv_catalog;
CREATE SCHEMA IF NOT EXISTS extensions AUTHORIZATION bv_owner;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto' AND n.nspname='extensions') THEN
    RAISE EXCEPTION 'Expected pgcrypto in dedicated extensions schema';
  END IF;
END $$;
GRANT USAGE ON SCHEMA extensions TO bv_owner,bv_ingest;
ALTER DEFAULT PRIVILEGES FOR ROLE bv_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
COMMIT;

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
  IF EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname IN ('bv_owner', 'bv_app')
    AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
  ) OR pg_has_role('bv_app', 'bv_owner', 'MEMBER') THEN
    RAISE EXCEPTION 'Unsafe existing BuscaVacante roles';
  END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO bv_owner;
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION bv_owner;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app, public TO bv_app;
ALTER DEFAULT PRIVILEGES FOR ROLE bv_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
COMMIT;

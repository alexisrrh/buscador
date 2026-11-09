-- Better Auth 1.7.18 core schema. Domain identity FK is staged in 07B before activation.
CREATE TABLE identity.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 80),
 email text NOT NULL UNIQUE CHECK(email=lower(btrim(email)) AND length(email)<=254),
 email_verified boolean NOT NULL DEFAULT false, image text,
 disabled boolean NOT NULL DEFAULT false, deleted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE identity.sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
 token text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, ip_address text, user_agent text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON identity.sessions(user_id);
CREATE TABLE identity.accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
 account_id text NOT NULL, provider_id text NOT NULL, password text,
 access_token text, refresh_token text, id_token text, access_token_expires_at timestamptz, refresh_token_expires_at timestamptz, scope text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider_id,account_id)
);
CREATE INDEX accounts_user_idx ON identity.accounts(user_id);
CREATE TABLE identity.verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), identifier text NOT NULL, value text NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verifications_identifier_idx ON identity.verifications(identifier);
CREATE TABLE identity.rate_limits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE, count integer NOT NULL, last_request bigint NOT NULL
);

ALTER TABLE identity.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.users FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.verifications FORCE ROW LEVEL SECURITY;
ALTER TABLE identity.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.rate_limits FORCE ROW LEVEL SECURITY;
-- Central identity backend must resolve accounts before there is an authenticated
-- actor. These policies grant only the isolated server role, never browser/domain roles.
CREATE POLICY auth_backend ON identity.users TO bv_auth USING(true) WITH CHECK(true);
CREATE POLICY auth_backend ON identity.sessions TO bv_auth USING(true) WITH CHECK(true);
CREATE POLICY auth_backend ON identity.accounts TO bv_auth USING(true) WITH CHECK(true);
CREATE POLICY auth_backend ON identity.verifications TO bv_auth USING(true) WITH CHECK(true);
CREATE POLICY auth_backend ON identity.rate_limits TO bv_auth USING(true) WITH CHECK(true);
REVOKE ALL ON ALL TABLES IN SCHEMA identity FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON identity.users,identity.sessions,identity.accounts,identity.verifications,identity.rate_limits TO bv_auth;

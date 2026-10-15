-- Lane 1, WP 1.2: the Qelvora-owned sign-in (option D, confirmed by the
-- founder on 2026-10-15). Pending source: the integrator allocates the number,
-- registers it and regenerates the pinned catalogues.
-- No Pantopus data is stored (INV-14). These tables are read before a session
-- exists, like auth_continuation and identity_session, so they carry no RLS;
-- only creator_runtime is granted.
BEGIN;
SET LOCAL ROLE creator_owner;
-- The Domain Model's Account.id for a Qelvora account: a random UUID, never
-- derived from a provider subject or a Pantopus id.
CREATE TABLE creator.account(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','deleted')), created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, CHECK((state='deleted')=(deleted_at IS NOT NULL)));
-- A provider subject is kept only as an HMAC with a server key. Deleting the
-- row on account deletion makes a later sign-in create a new account.
CREATE TABLE creator.account_identity(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES creator.account(id), provider text NOT NULL CHECK(provider IN ('apple','google')), subject_hmac text NOT NULL CHECK(subject_hmac ~ '^[a-f0-9]{64}$'), email_cipher text, provider_refresh_cipher text, created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz NOT NULL DEFAULT now(), UNIQUE(provider,subject_hmac));
CREATE INDEX account_identity_account ON creator.account_identity(account_id);
-- One single-use step of a sign-in: the web redirect, the native nonce, or the
-- age step between a verified provider identity and a session.
CREATE TABLE creator.sign_in_continuation(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('web','native','age')), provider text NOT NULL CHECK(provider IN ('apple','google')), platform text NOT NULL CHECK(platform IN ('web','ios','android')), return_to text NOT NULL, state_hash text, nonce text, reauthenticate boolean NOT NULL DEFAULT false, account_id uuid REFERENCES creator.account(id), identity_id uuid REFERENCES creator.account_identity(id) ON DELETE CASCADE, authenticated_at timestamptz, expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), CHECK((kind='age')=(account_id IS NOT NULL AND identity_id IS NOT NULL AND authenticated_at IS NOT NULL)));
CREATE INDEX sign_in_continuation_expiry ON creator.sign_in_continuation(expires_at);
-- The opaque token behind a Qelvora session, resolved on every request.
CREATE TABLE creator.identity_grant(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES creator.account(id), identity_id uuid REFERENCES creator.account_identity(id) ON DELETE SET NULL, token_hash text NOT NULL UNIQUE, authenticated_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX identity_grant_account ON creator.identity_grant(account_id) WHERE revoked_at IS NULL;
-- The 18+ gate. Append-only; no date of birth is stored. An under_18 result
-- from any source wins over every adult result.
CREATE TABLE creator.age_signal(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES creator.account(id), source text NOT NULL CHECK(source IN ('attestation','apple_declared_age_range','google_play_age_signals','ops_review')), result text NOT NULL CHECK(result IN ('adult','under_18')), copy_version text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX age_signal_account ON creator.age_signal(account_id);
-- Survives account deletion, so another date or a new account cannot pass.
CREATE TABLE creator.age_lock(provider text NOT NULL CHECK(provider IN ('apple','google')), subject_hmac text NOT NULL CHECK(subject_hmac ~ '^[a-f0-9]{64}$'), locked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(provider,subject_hmac));
ALTER TABLE creator.identity_session DROP CONSTRAINT identity_session_mode_check;
ALTER TABLE creator.identity_session ADD CONSTRAINT identity_session_mode_check CHECK(mode IN ('development','pantopus','qelvora'));
GRANT SELECT,INSERT,UPDATE ON creator.account,creator.sign_in_continuation,creator.identity_grant TO creator_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON creator.account_identity TO creator_runtime;
GRANT SELECT,INSERT ON creator.age_signal,creator.age_lock TO creator_runtime;
COMMIT;

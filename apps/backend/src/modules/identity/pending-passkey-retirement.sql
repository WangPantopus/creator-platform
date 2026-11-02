-- Lane 1, WP 1.5: a lost device retires its passkey (founder, 2026-10-15).
-- Pending source: the integrator allocates the number, registers it and
-- regenerates the pinned catalogues.
-- A retired passkey can never sign again, but its past signatures stay valid:
-- every reader of past acts checks revoked_at (a compromised key), never
-- retired_at. A retired key found to be compromised is then also revoked.
-- creator_runtime's table grants already cover the new column.
BEGIN;
SET LOCAL ROLE creator_owner;
ALTER TABLE creator.passkey_credential ADD COLUMN retired_at timestamptz;
COMMIT;

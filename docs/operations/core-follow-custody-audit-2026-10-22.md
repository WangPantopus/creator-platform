# Core follower audience — read-only qualification audit

The operated follower pagination fixture cannot read its signed followers Notes.
On the separate `presence1022` stack (API 56661, web 56662, PostgreSQL 56660),
Growth follow PUT and GET succeeded, but Content presence returned
`503 growth_core_follow_unconfigured` with “Current account authority is required.”
The browser concealed the projection. The 52 genuine Studio publications were
subsequently unpublished through the API, retaining their records and signatures;
the scenario's follow was undone. This is a follower acceptance failure, not
successful pagination evidence.

## Exact missing boundary

- `infra/migrations.json` reserves `0185_w7_core_follow_metadata` as
  `reserved_unapplied`. The registry explicitly leaves held-session/fan/context,
  strict role custody, unrelated-account, contention, denial and deletion
  qualification outstanding.
- The owned database returned no corresponding `creator.schema_migration` row
  and `to_regprocedure('creator_growth_metadata.core_follow(uuid,uuid,uuid)')`
  returned null. A successful ordinary Growth follow does not install this core
  metadata reader.
- `server.ts` composes Content on `runtime.pool` and supplies
  `features.growth.coreContentFollows`. `configureGrowthForBackend` constructs
  that callback from `input.coreFollowMigration`; the stock host supplies no
  qualified receipt. `canonicalCoreContentFollows` therefore refuses before a
  positive metadata read. It also independently verifies the installed migration
  checksum and exact function definition, so adding an invented configuration
  value would not solve the missing custody.

The source is
`apps/backend/src/modules/growth/migrations/pending_w7_core_follow_metadata.sql`
(SHA-256 `29c0261cdfce50be434d8b8b49c21e23df6057613d521c8e40a13c3928d63796`).
The current adapter is `apps/backend/src/modules/growth/core-follows.ts`
(SHA-256 `ee1712b5babc563817d8ccf52b586158982b161ea1fbd3a3a6c2cb00e94b9cf7`).
The older October 2 receipt describes different source hashes and is historical
evidence, not a qualification of these bytes.

## Minimal source and authority closure

The proposed SQL directly depends on existing Foundation roles/schema owners,
`creator.identity_session` (originally 0002), and the forced-RLS `growth.follow`
table (originally 0007), plus their actual current definitions. It names no other
held migration or reaction-review table. That is a source-level dependency
inventory; it does not establish an executable activation order or authorize
skipping a registered wave.

The proposal creates one dedicated NOLOGIN/NOINHERIT role, one isolated schema and
one Boolean SECURITY DEFINER function. Its owner receives only four session
metadata SELECT columns, Follow account/creator SELECT columns and a lock-only
UPDATE privilege on `created_at`. Core gets schema USAGE and exact function
EXECUTE, without raw Growth table privileges. The UPDATE policy has `WITH CHECK
(false)`. The function verifies caller/session/account/creator context and live
session metadata, then holds the exact Follow pair with `FOR SHARE NOWAIT`.
Verified absence returns false; invalid context or lock contention returns null,
which the adapter refuses. No body, recipient list, bearer credential or content
permission is returned.

The adapter requires the genuine request-authority account/session, the original
explicit READ COMMITTED core client, literal safe `creator_runtime`, and the
opaque current-session lease. It checks creator/account context and that the
account has a fan profile, verifies the complete role/function/schema/grant
catalogue, and rechecks the held lease before and after the call. The caller must
already retain Content/Trust restoration, participant and negative gates on that
same transaction. Qualification must demonstrate the actual fan context through
this composition; the adapter's fan-exists check alone is not proof of those
caller-held gates. Do not substitute a Growth pool, fabricated Actor/GUC, copied
authority callback or looser session check.

## Required next qualification

Keep this separate from the in-progress 0253 activation wave. After that wave's
result is integrated, use a newly owned scratch stack at the resulting exact
source head and take a before catalogue snapshot. Preserve these currently held
SQL bytes and obtain the actual migration/source review and registration through
the repository's activation workflow; this audit does not change the registry,
SQL or any authority receipt.

The isolated qualification must review every effective privilege change for the
new role, the function's exact `pg_get_functiondef` digest, forced RLS and policy
definitions, owner flags/membership/ownership, PUBLIC and all-role ACLs, and the
unchanged private session-table behavior. Run the repository's final role-safety
and privacy catalogue assertions. Use the catalogue tool's before/after diff;
the intended column grants are real reach changes and must be reviewed rather
than accepted as a mechanical pin update. Regenerate only the actually qualified
head variant and rerun `check`; restored/populated and Growth-login alternatives
need their own qualification. Immutable source/function digests are separately
reviewed and are not generated by the catalogue tool.

Only then can the stock host supply an actual version/checksum/function-digest
receipt through its existing configured seam. Re-run a current backend startup,
the required existing suites and export/message regression checks, then actual
follower-content access: current follow, verified non-follow, different account,
expired/revoked session, unfollow/content retraction, busy Follow row, creator/fan
denial and deletion. Prove rollback/commit, cross-client and stale lease refusal
without installing fake metadata. Finally run the existing scenario's explicit
`followers` pagination mode through real registration/signing and browser reads.
Until those observations exist, follower Note access and pagination remain
unverified and the existing refusal must remain.

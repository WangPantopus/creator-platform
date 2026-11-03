# Migrations

How a SQL migration becomes part of the product today, and the Wave 6 plan to make that cheaper.
The rules that never bend: applied SQL never changes, checksums stay, and a used database is never
reset.

## What exists

- **SQL files** live with their module, for example `apps/backend/migrations/0001_foundation.sql` or
  `apps/backend/src/modules/identity/pending-passkey-retirement.sql`. A file keeps its name and its
  bytes when it is registered.
- **The registry**, `infra/migrations.json`: 126 registered migrations, `0001_foundation` to
  `0258_w4_provider_inbox_worker`. Each entry has a version, the file's path and owner, and for wave
  migrations the file's SHA-256 and its wave. `reserved` holds version numbers set aside for files
  not yet registered.
- **Waves**, `infra/migrations/waves/<id>.json`: the unit of registration. Each lists its `baseline`
  (every source registered before it, with its checksum) and its `wave` (the new sources). The
  newest is `20261101-pilot-columns` (#527): a baseline of 123 sources and a wave of three.
- **Reviews**, `infra/migrations/reviews/<id>.json`: the reviewed head for each wave, mainly the
  catalogue pins (who can reach which tables, columns and functions) that the product checks at
  startup and that the operator checks before it applies anything.
- **The operator**, in `apps/backend/scripts/`: `activate-wave.ts` applies one reviewed wave to a
  database that holds data (with a private backup and a closed restore), and `migrate-trust.ts`
  verifies a database and bootstraps the base schema. The role checks (`migration-*-roles.ts`) are
  beside them.
- **The local installer**, `apps/backend/src/operations/local/fresh-install.ts`: for a new, empty
  database only. It applies every wave in `FRESH_WAVES` order, in one transaction, checks every
  pinned checksum and the final role-safety and privacy-catalogue assertions, and refuses any
  database that holds a business row. The [local stack](local-stack.md) uses it.

## Registering a file today

#527 registered three small files, and that took about 1,000 hand-written lines. The steps, roughly:

1. Add each file to `infra/migrations.json` with its next version, owner, checksum and wave.
2. Write the wave file: copy the previous baseline, add the previous wave's sources to it by hand,
   and list the new sources.
3. Regenerate the catalogue pins on scratch databases with the catalogue tool (snapshot at the old
   head, apply, `diff`, `write`; [the procedure](../lanes/status/lane-2-catalogue-pins.md)), and
   write the review file. Measure the populated variants on a restored copy when the wave changes
   them.
4. Teach the operator and the runtime the new wave: `activate-wave.ts`, `migrate-trust.ts`, the
   generation and privacy role checks, the head profile, the trust catalogue modules and
   `FRESH_WAVES`.
5. Make the backend tests install the exact registered bytes where a test needs the new schema
   (`apps/backend/tests/support/registered-source.ts`), because the test fixtures bootstrap only the
   base schema.
6. Prove it: a fresh install with the catalogue check, the scenarios that use the new schema, and
   for a populated database a restored copy moved forward by `activate-wave`.

A file that is not registered is never installed anywhere. Code that reads its tables or columns
must not ship before it is registered, or it fails on every real database.

## What CI checks

CI's `web-and-backend` job runs the backend suite on a fresh PostgreSQL 17 with pgvector: each
fixture database is bootstrapped by `migrate-trust.ts`, and tests that need a wave's schema install
its registered bytes. The full install of every wave and the catalogue check run on the local stack
and in the integrator scenarios, not in CI today. Restore and update drills are deferred until a
production database exists.

## Wave 6: the plan

From [STATUS](../STATUS.md#next) and the [consolidation plan](../CONSOLIDATION_PLAN.md):

1. **Triage the 42 unregistered SQL files** listed in #527's description (18 of them hold reserved
   numbers, among them lane 1's #472, #475 and #478): which are still needed, and which are
   obsolete.
2. **Make registration data-driven.** Generate the wave and review files with a script, and stop
   hand-editing baseline arrays, so a wave is a small mechanical pull request.
3. **Register files only as features need them**, one wave per feature.
4. Keep the fresh install and the catalogue check, and automate restore drills once a production
   database exists.

The detailed operator procedure from October, including restores, is in the archived
[Trust operation and recovery runbook](../archive/operations/W8-runbook.md).

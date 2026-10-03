# Preserved W5 migration adoption

Published as [merged PR15](https://github.com/WangPantopus/creator-platform/pull/15), main `ad369bd5a0935c09da2687bf69a6a2d0f0a6da18`, reviewed source `5d1adc831eac7501d322a93e9ce8f2901d3d6973`. [Actual merge verification](../../artifacts/workstreams/W8/takeover/20260930/pr15-merged.json) confirms no application/native/test/CI/active-registry change relative to its main parent.

The `w5-20260930` operator profile reconciles the exact published 35-row W5 ledger without rewriting its history. It is implemented by `apps/backend/scripts/adopt-w5-migrations.ts`, using the pinned profile in `infra/migrations/adoptions/w5-20260930.json`. The normal canonical runner does not perform this adoption automatically.

W8 restored a read-only backup of the actual preserved database into its own traffic-closed database. Its schema matched an independently created reference from the 35 original SQL files. The upgrade preserved all 35 ledger records, including timestamps, and all 277 original rows across 136 tables. Its final schema matched a separate fresh canonical reference. [Actual operator evidence](../../artifacts/workstreams/W8/takeover/20260930/w5-adoption-operator.json) distinguishes this rehearsal from an upgrade of the original W5 database, which remains unchanged.

## Exact disposition

| Preserved version              | Canonical identity             | Action                                                                         |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------ |
| 0032_w5_content                | 0035_w5_content                | Append canonical ledger record; preserve original; execute no content SQL.     |
| 0033_w5_content_reconciliation | 0036_w5_content_reconciliation | Same.                                                                          |
| 0034_w5_studio_drafts          | 0037_w5_studio_drafts          | Same.                                                                          |
| 0035_w5_content_consent        | 0038_w5_content_consent        | Same.                                                                          |
| 0036_w5_content_thread_privacy | 0039_w5_content_thread_privacy | Same.                                                                          |
| 0037_w5_content_fan_effects    | 0040_w5_content_fan_effects    | Same.                                                                          |
| 0038_w5_reply_review           | 0045_w5_reply_review           | Append exact historical installed-schema custody; execute no reply-review SQL. |

The six missing active migrations are `0032_growth_continuation`, `0033_growth_prompt_claims`, `0034_growth_erasure_fence`, `0041_w3_conversations`, `0042_w3_wellbeing` and `0043_w8_relationship_backfill`. Only their existing checksum-pinned SQL executes, in that order, in the same transaction as the seven ledger additions. No generic out-of-order switch exists.

The result has 48 ledger rows: 40 canonical active entries, seven preserved historical aliases and the canonical identity of already-installed reply review. The `0045` checksum is `636763eac2f10091d0291007bd9252b80ccc5631b3930f19804a82ec064a6b06`. Its exact original bytes from source `15730d79c0c3da7076b7ac517a82d3e8ec2873cc` are archived unchanged at `infra/migrations/history/0045_w5_reply_review.sql` for custody checking; the adopter never executes them.

This makes the existing `ContentService.replyReviewInstalled` lookup authoritative on the adopted database: canonical0045 plus both actual FORCE RLS relations are present. It does not claim that reply-review SQL ran twice. Global0045 remains reserved; fresh canonical databases still receive only the 40 active migrations and do not satisfy that lookup. No0044/0051/signing/media/provider capability is activated.

## Operator procedure

The database owner first preserves a private custom-format `pg_dump`, restores it in a separate closed database and retains the successful restore evidence. Stop that owner's application traffic before adoption. Set the target database's connection limit to0 through the existing migration-administrator channel; no application pool may use a superuser. There must be no other client connections. W8 has not stopped or altered another owner's running database or application.

Use the reviewed source with a privately loaded `DATABASE_MIGRATION_URL` for a PostgreSQL17 migration administrator. Do not place the URL or password in command arguments, shell history, Git or runtime configuration. From the repository root, first inspect:

```sh
node --import tsx apps/backend/scripts/adopt-w5-migrations.ts
```

The default command runs a read-only transaction. It verifies every original checksum and the full reviewed catalog fingerprint: schemas, relation ownership/RLS/grants, columns, constraints, indexes, policies, functions, triggers, relevant roles and memberships. Its plan binds the cluster system identifier, database identity, exact ledger timestamps/checksums, schema and source profile. Changed or missing checksums, incomplete cohorts and schema drift are refusals, never checksum repair or inferred adoption.

After reviewing that exact plan, use its `planSha256`, the absolute private backup path and a new absolute receipt path:

```sh
node --import tsx apps/backend/scripts/adopt-w5-migrations.ts \
  --apply=PLAN_SHA256 \
  --backup=/absolute/private/preserved.dump \
  --receipt=/absolute/private/adoption-receipt.jsonl
```

The backup must be a private regular PostgreSQL custom-format file. Its hash and size are recorded; a file header alone does not prove a successful restore. The receipt is created exclusively with mode0600 and receives append-only started/terminal JSON lines. Existing receipts cannot be overwritten. The command takes the shared migration advisory lock and a ledger lock, rechecks the plan, verifies original ledger preservation and compares the final schema before committing. A failure before commit rolls the transaction back. After an ambiguous disconnect, inspect the read-only plan and private receipt; do not replay SQL or remove old ledger rows.

Finally run the ordinary `apps/backend/scripts/migrate-trust.ts`. It recognizes the seven historical aliases only when their entire 48-row adopted cohort and exact source checksums are present. In the actual rehearsal it reported all 40 canonical files already applied. Unknown aliases and future out-of-order migrations remain refused. The adopter leaves traffic closed; only the database owner can reopen after current application acceptance.

## Acceptance limits

The isolated rehearsal establishes the exact preserved-data upgrade and current non-owner metadata guard. Unscoped reply-review/read queries still return zero. A stale plan was refused before any receipt or mutation. The current live W8 database remains at its original40 entries, and the original W5 ledger remains at35. No test, golden, immutable applied SQL, existing runtime credential or original database was changed. Source snapshots and raw data/dumps are private; the checked-in evidence is sanitized.

This operator does not merge PR9, integrate its remaining product changes, approve source licensing/retention, activate pending migrations elsewhere or establish W5's final browser/native acceptance. It supplies the previously missing supported reconciliation path; the owner must apply the verified procedure to its separately quiesced target and verify the final combined apps.

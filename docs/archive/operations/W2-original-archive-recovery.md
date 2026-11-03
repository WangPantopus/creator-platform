# Recover the retained W2 archive into canonical source history

`apps/backend/scripts/recover-w2-archive.ts` recovers only the exact October 1
W2 archive identified by `infra/migrations/recoveries/w2-20261001.json`.
It preserves its 28 checksummed migration records, including their timestamps,
and all 1,001 rows in its 120 original business tables. It restores reviewed
source-defined grants and executes the 12 missing sources to reach the original
canonical 40-source baseline in one transaction. It never opens traffic.

The supplied custom archive is 650,776 bytes with SHA-256
`a021c26165b343c162ccc7dbfdc19dd5e779cdd198ab30439d65e83c626bb69a`.
It contains neither global roles nor ACL entries. The pinned grants come from an
independent installation of the exact first 28 canonical sources. They restore
those source-defined permissions; unavailable historical role/password/ACL
evidence is not reconstructed or asserted to match. Preserve the original
archive and raw restored copies.

## Prepare a closed isolated candidate

Use an isolated PostgreSQL 17/vector cluster and the eight source-defined roles:
`creator_owner`, `creator_runtime`, `creator_trust_owner`,
`creator_trust_runtime`, `creator_trust_worker`, `growth_owner`, `growth_runtime`
and `growth_worker`. Restore with `pg_restore --single-transaction --exit-on-error`
into a new database, retaining owners. Keep application credentials separate from
the migration administrator. The checked-in profile rejects any different role,
schema, effective permission, original ledger or business-data digest.

Set the candidate's connection limit to zero and its database comment to
`creator-platform:restored-traffic-closed`. Stop all other clients. Supply the
administrator URL privately as `DATABASE_MIGRATION_URL`, the exact database name
as `RESTORED_DATABASE_NAME`, and `RESTORED_TRAFFIC_DISABLED=true`. Never expose
credentials, raw rows, dumps or private manifests in Git or terminal output.

Run from `apps/backend` using the installed Node and frozen dependencies:

```sh
pnpm exec tsx scripts/recover-w2-archive.ts > /absolute/private/plan.json
```

This is a read-only, database-bound plan. It checks all 40 source files against
the immutable packet and executable registry. Review the twelve `applySources`,
source-defined grant restoration, database identity, all six before digests and
`planSha256`. Any mismatch requires investigation, never ledger edits or changed
pins. A complete canonical 40-source database receives an empty plan; applying
recovery to it is refused.

## Bind a real backup and independent restore

Create a current custom-format backup of this exact closed candidate. Restore it
into a separate closed database and compare ledger, schema, roles, effective
security, sequences and business data using `migration-custody.ts` and
`migration-wave-custody.ts`. Record the actual observations in a private manifest:

```json
{
  "schemaVersion": 1,
  "database": "exact_candidate_database",
  "createdAt": "actual UTC backup timestamp",
  "backupSha256": "actual backup SHA-256",
  "ledgerSha256": "actual live digest",
  "schemaSha256": "actual live digest",
  "rolesSha256": "actual live digest",
  "securitySha256": "actual live digest",
  "sequenceSha256": "actual live digest",
  "dataSha256": "actual live digest",
  "restored": {
    "database": "different_independent_restore_database",
    "ledgerSha256": "actual restored digest",
    "schemaSha256": "actual restored digest",
    "rolesSha256": "actual restored digest",
    "securitySha256": "actual restored digest",
    "sequenceSha256": "actual restored digest",
    "dataSha256": "actual restored digest"
  }
}
```

Ledger, schema and role digests hash the complete canonical helper result;
security, sequence and data digests use their helper result's `sha256` field.
The profile's schema pins hash the inner schema catalogue and therefore differ
from the manifest's outer schema digest. The manifest is operator evidence,
not an automatic independent restore: perform and inspect that restore first.

All inputs must be absolute, real paths outside the checkout, private 0600
regular files in unshared directories. Backups expire after one hour. The
receipt must be a new path; existing receipts cannot be replaced.

```sh
pnpm exec tsx scripts/recover-w2-archive.ts \
  --apply=REVIEWED_PLAN_SHA256 \
  --archive=/absolute/private/original.pgdump \
  --backup=/absolute/private/current.dump \
  --manifest=/absolute/private/backup-manifest.json \
  --receipt=/absolute/private/new-recovery-receipt.jsonl
```

The operator locks the migration ledger, rechecks closure, verifies the private
archive/backup and six independently restored digests, restores only pinned
grants, then executes the actual missing sources. Before its sole COMMIT it
checks exact canonical schema/security, unchanged original history, roles,
sequences and every original business column/row. The receipt is fsynced before
and after COMMIT. For `commit_uncertain` or a receipt failure after commit,
inspect the retained target and receipt before any retry; never assume rollback.

After success, inspect the empty read-only plan and make another private backup
with an independent six-digest restore comparison. Preserve outstanding privacy
jobs and existing deadlines. The separate 40-to-57, 57-to-61 and later generation
wave procedures, registration, application composition and release qualification
remain required. This command does not create consent, licence approval,
missing historical usage rows, successful deletion or traffic authorization.

# W3 increment 34 — actual baseline backup and independent restore

The primary W3 operator personally reviewed W8 draft PR #95 at `58b59fa0e5b8937af7cd0cb7272ae5b5662d7ee7`, including the activation runner, custody reader, exact 57-entry wave packet and original migration checksums. No W8 source was edited or registry PR created by W3.

## Actual operation

On October 2, 2026, after stopping only the owned API on 4103 and web on 3003, the operator captured the actual PostgreSQL baseline ledger, original data, catalog and roles with W8's custody reader in read-only repeatable-read transactions. The source database was `creator_w3` in the owned `creator-platform-w3-20261001` container. A custom-format backup was written outside Git with private directory/file permissions. The first restore preparation failed because the installed `createdb` has no `--connection-limit` option; no target database was created. The operator read the installed help, corrected the operation to actual SQL `CREATE DATABASE ... CONNECTION LIMIT 0`, added the required traffic-closed comment, and restored the genuine dump with `pg_restore --exit-on-error`.

The independently restored database `creator_w3_restore95_1790928374123` had the same 40 ledger entries, 145 original tables, 12 original rows, catalog, data and roles as the source. Re-reading the live source confirmed it was unchanged. There were no other application clients. The restore target stays traffic closed and is not connected to any application. The complete backup and manifest stay private; the safe receipt is `backup-restore.json`.

## Review finding and limit

The ordinary migration runner could have consumed pending entries from a nonempty 40-entry ledger with per-file commits, bypassing the wave's backup and closed, single-transaction activation fence. W3 reported this to W8. W8 confirmed a refusal will be added for existing databases with pending initial-wave migrations; fresh empty installations and fully applied verification remain supported. Before activation, W3 must review that fix on its actual published head and wait for the registry's normal merge, as directed by the human.

No 0044–0062 wave SQL or reserved migration was applied by W3. No 57-migration fresh-install or upgraded-application result is claimed. The backup's one-hour freshness requirement must be satisfied by another genuine capture/restore verification when activation occurs; the timestamp must never be changed to imply freshness. The provider key, generation host composition and genuine creator source/evaluation/publication journey remain pending. W3 is not complete.

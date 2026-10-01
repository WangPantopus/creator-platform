# W8 recovery after resource cleanup

**Mac Studio note, 2026-10-01:** the private inputs this procedure names are on the iMac, not on the Mac Studio, and PR17's recovery container and volume don't exist here either. The [Mac Studio re-verification](../../artifacts/workstreams/W8/recovery/20261001-mac-studio/README.md) exercises the same closure mechanics on a labeled synthetic database and its closed copy. That is not a restoration of preserved data. Repeat the steps below only after the iMac material is copied here and its hashes verified.

The human resumed implementation on 2026-10-01. The [actual recovery receipt](../../artifacts/workstreams/W8/recovery/20261001/receipt.json) supersedes historical resource availability, not the original R1–R10 release requirements. PR7 is already merged. No historical container, volume, PID, device or build identity is reusable.

## Preserve and identify the input

The original manifest and compressed SQL remain under `/Users/yingpengwang/.config/creator-platform/cleanup-20261001`; retained W8 state remains under `/Users/yingpengwang/.config/creator-platform/w8-local`. A separately hash-verified copy of both directories is under `/Users/yingpengwang/.config/creator-platform/recovery-20261001-active/preserved`. Keep all originals and verified copies. Private contents, credentials, SQL, journal records and exports must never enter Git or terminal output.

Both cleanup archives are gzip-compressed **plain `pg_dumpall` cluster SQL**, including global roles and multiple historical databases. They are not custom-format dumps. Decompress privately and verify the supplied SHA-256 first. Select the exact complete global-role section and needed database section, retaining balanced `\restrict`/`\unrestrict` commands. Use a fresh isolated PostgreSQL 17/pgvector cluster and a distinctly named recovery operator so original role creation does not collide. Never feed the cluster dump to a shared database or recreate all historical databases as running resources.

Apply selected plain SQL with `psql -X -v ON_ERROR_STOP=1`, redirecting input/output to private files. The 2026-10-01 operator restored only `creator_w8`, the empty Foundation baseline and the retained `creator_w8_alias_final_20261001` adoption result. The separate review/replay/checkpoint databases were freshly created, traffic-closed verification copies. Retained `.dump` files beginning with `PGDMP` are custom archives and use `pg_restore --exit-on-error` into a fresh database instead.

## Keep restoration closed across restarts

Before starting any host, the recovery operator installs this database-level marker:

```sql
COMMENT ON DATABASE creator_w8 IS 'creator-platform:restored-traffic-closed';
```

The W8 local host reads this owner-controlled marker through its non-owner connection. It also accepts `RESTORED_DATABASE_NAME=creator_w8` with `RESTORED_TRAFFIC_DISABLED=true`. Naming a restored local database without that flag refuses startup. The marker alone keeps the host closed even when both flags are accidentally omitted. Runtime roles cannot clear it, and removing it does not reopen an already running process: closure is fixed at startup.

In closed mode the host permits only GET/HEAD liveness, readiness, identity capabilities, public help and public status. All other HTTP paths return correlated `restoration_pending` 503; WebSocket session/actor callbacks refuse; sign-in capabilities report false with no development actors; the privacy worker does not start. Its non-owner role is still checked while paused. WAL observation remains read-only. Readiness includes the required unavailable `restoration_denial` probe. The privacy form disables submission while verification capability is missing, failed or unconfigured.

Fresh isolated login passwords are written only into the new private runtime env. Original runtime env, session/encryption keys, backups and ciphertext are preserved. No missing growth key is replaced. API, worker and conversation pools retain their original non-owner roles, grants and budgets. A privileged recovery credential is never an application connection.

## Verify durable data and journal ordering

Compare all original COPY rows with read-only restored COPY exports, allowing only row ordering. Verify every canonical migration against the checked-in registry/file SHA-256; do not change checksums, adopt ambiguous aliases, reseed data, or apply reserved proposals. Compare original RLS, full policy definitions, grants/revokes and owners against schema exports. Confirm runtime roles have no superuser/bypass/ownership/owner membership and that unscoped private reads remain empty.

The recovered runtime has 40 checksum-matching migrations, four cases, one block, one tombstone and three blocked privacy jobs. All 210 original rows across 146 tables match. Its 24 tasks retain 13 complete/11 blocked states. Preserve verified-empty ownership `[]` separately from unknown `null`; the current three account jobs contain two verified-empty snapshots and one verified nonempty snapshot. Do not reconstruct ownership from erased profiles.

The Foundation adoption result retains all 325 archived rows across 148 tables and all 48 ledger records. The ordinary canonical runner recognizes 40 active migrations without replay. This is restoration of the recorded adoption result, not a new rollout or activation of reserved migrations on the W8 runtime.

Use the existing `apps/backend/scripts/tombstone-journal.ts` operator on a separate closed copy. Export uses the existing non-owner worker; replay requires a **dedicated recovery credential** with the existing owner/recovery rights. The worker correctly cannot lock/insert the tombstone table, so a worker replay refusal must not be solved by widening its grants. Supply the exact target in `RESTORED_DATABASE_NAME`, `RESTORED_TRAFFIC_DISABLED=true` and the independently trusted `JOURNAL_EXPECTED_SHA256`. Replay always returns `trafficReady:false` and requeues all eight domains.

The retained custom backup was created at 2026-09-30T23:18:12Z; its schema-2 journal is newer at 23:24:02.528Z. Actual older-backup restoration and newer-journal replay preserve denial and immutable ownership. A second replay on another closed copy retains one tombstone/eight pending domains. Neither proves completed purge. Obtain actual domain denial/purge acknowledgments and approved policy/adapter capability readiness before any traffic reopen. A local logical restoration duration is not a production WAL/RPO/RTO measurement.

## Current custody and remaining gates

The new W8-only cluster is `creator-platform-w8-recovery-20261001`, loopback 55438, with durable volume `creator-platform-w8-recovery-20261001-data`, pinned to the image digest in the receipt and limited to one CPU/768 MiB. The private recovery root contains the isolated env, preservation copy, selected SQL, operator logs, journal receipts and independently restored post-recovery logical checkpoint. Directories are 0700; private files are 0600 and the temporary CLI executable is 0700. No live secrets or raw records are tracked.

Only W8-owned API/web/container services are stopped after verification; the durable volume and backups remain. Preserve other owners' resources and Docker Desktop. Any subsequent native acceptance must reserve fresh owned simulator/emulator identities. No native device was necessary for the traffic-closed recovery exercise.

Full R1–R10 remains assigned. The [required input register](W8-required-inputs.md) still requires approved staging/HTTPS/RP, a reviewed real identity/domain adapter bundle, Q05/Q16 retention/departure authority, protected export custody and the original growth key, enabled provider projects/budgets/consent, staffed safety response, physical/signing/distribution devices and consented pilot criteria. Missing inputs keep dependent capabilities closed; archives, compilation or local status pages cannot establish their readiness.

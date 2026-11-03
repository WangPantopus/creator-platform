# Preserved-target reconciliation and reopening

This procedure follows a verified backup/separate restore, canonical migration custody and any independently trusted newer deletion-journal replay. It does not replace those prerequisites. PR95 activates the initial57 only; future purpose proposals remain held. A migration receipt, empty query, success toast, build, peer report or process health cannot establish recovery or release readiness.

## Hold the target

Stop the target's API, feature workers, scheduled jobs, provider dispatch and web clients. Keep its actual owner marker `creator-platform:restored-traffic-closed` and database `CONNECTION LIMIT 0`. Use the target's dedicated recovery credential, never widen runtime grants or substitute an owner for application acceptance. Keep originals, private backup manifests, journals and independently restored copies; never reseed, erase obligations or change historical checksums/timestamps.

Record the exact source revision, active migration packet, backup SHA/time, separate-restore result, journal SHA/time/provenance, closure and worker/device ownership. Publish only sanitized hashes, aggregate counts and capability results. Credentials, object keys, receipts containing private content, session tokens, raw journals and row dumps remain outside Git/output.

## Inventory without mutation

From `apps/backend`, run `node --env-file=<private0600-recovery-env> --import tsx scripts/reconcile-restored-trust.ts`. That env must set `DATABASE_RECOVERY_URL`, `RESTORED_DATABASE_NAME` to the actual URL database and `RESTORED_TRAFFIC_DISABLED=true`. The operator checks the actual marker/limit, exact active source/ledger and initial-wave role/ACL custody in a read-only transaction. It returns counts/hashes and **always** `trafficReady:false`; it never clears the marker, changes a task, invents a receipt or contacts a provider.

Investigate any mismatched tombstone/job tuple, unknown account ownership, missing domain, inconsistent complete job, invalid complete receipt, expired running task, indefinite/expired retention, transient scope residue or unsafe role/ACL. Verified-empty ownership `[]` differs from unknown `null`; preserve the original verification/ownership reference. Do not reconstruct ownership from deleted profiles. Diagnose failures with private operator inputs; connection errors are intentionally not printed.

Zero rows establish only the observed inventory. They do not establish that a domain was never used, a provider has no external obligation, a source was fully exhausted or the latest deletion journal is complete. Domain owners must reconcile against the real durable source and provider facts.

## Replay and reconcile the real lifecycle

1. Independently authenticate the newest journal's provenance and checksum. Use `tombstone-journal.ts restore` on the closed target with its exact name, disabled traffic and `JOURNAL_EXPECTED_SHA256`. Preserve original deletion kind/scope/family and immutable ownership. A replay requeues all eight domains and returns no reopening grant. Missing historical material remains a named dependency.
2. Before domain locks, the actual coordinator claim supplies its exact job, domain, current token and cancellation signal. On the held non-owner domain client, `privacyTaskAuthorityInTransaction(client, actualJob)` locks job/task metadata and installs the0087 deferred separate-COMMIT check. A UUID, fabricated Actor/adult eligibility, request ThreadScope, separate-pool verification or empty query cannot replace that authority. Abandonment, takeover, expiry and abort must roll back, without ACK.
3. Reconcile **identity, conversation, agent, commerce, content, media, growth and trust**. Each owner exhausts its actual authorized source, performs its real purge/revocation or export, verifies durable storage/provider effects and returns its idempotent owner receipt. Streams must be exhausted, sealed and independently verified; private artifact data must match the exact job/account/domain and approved expiry. Inspect what was saved. Do not mark a domain complete from hook registration or a fence-only probe.
4. Preserve original financial reservations, provider attempts, unknown costs, refund/payment/call obligations and visible output prefixes. Reconcile current durable facts with the appropriate owner before original settlement/release. An expired/revoked generation may reconcile its original custody through the reviewed terminal purpose; it cannot regenerate output, read new source/context or make another provider call. No invented zero/no-request/provider-success receipt.
5. Apply only approved purpose-specific retention and expiry. D08 packet/delivery rules do not authorize blanket twelve-month retention. Unknown financial, consent/signature, nonpacket media/Note/Post or licensed-voice policy blocks the affected acknowledgment. Sweep actual expired exceptions and verify source/object/vector/cache/key deletion without erasing tombstones or financial integrity.
6. Retry/restart the actual worker and verify idempotency, all eight durable task states and receipts, current cancellation/lease fencing, retained exceptions and transient scope cleanup. Re-run the read-only inventory. A retry is not a recovery until saved state and independent owner effects reconcile.

## Qualify the candidate and reopen its approved scope

Pin a candidate revision and exact activated purpose/source/role/function receipts. Verify fresh installation and preserved upgrade independently, without changing an applied SQL file. Required purpose contracts and capabilities must be mounted and ready for the enabled scope. Record unavailable capabilities honestly; health200/ready503 cannot certify release.

Operate the real web, Android emulator and iOS simulator against this backend. Verify canonical identity, preserved own data, report/Ops access boundaries, denied cross-account reads, current tombstone/block/restriction enforcement, actual privacy progress/download/delete, saved backend state and restart/cold return. For an enabled generation journey, exercise genuine in-flight denial and final settlement against the real provider; no paid calls without real authorized credentials. Reconcile errors before approval of that scope.

Only the owning operator clears the marker and restores the explicitly approved connection limit after recording the evidence and scope disposition. Start the pinned application and workers with separate non-owner credentials, then repeat readiness, denial and saved-state checks. If they fail, stop dispatch/traffic and restore closure; preserve current transactions and obligations rather than replacing the database with an older snapshot.

A separately named, newly restored **labelled synthetic development copy** may be owner-opened for a bounded local journey with unavailable features still refusing and readiness503. Record that narrower disposition explicitly. W8's three-client Report acceptance on `creator_w8_wave_full_20261002` is such an experiment. It is not the original iMac recovery, W3's preserved-target reconciliation, complete C10, staging or release acceptance. A peer's zero-obligation local opening is likewise not W8 personal verification or a release grant.

## Current dispositions — 2026-10-02

- W8's final57 closed upgrade and independent restore retain closure. The original iMac archives/private keys/journal and recovery volume are absent on this host; no replacement recovery is claimed.
- W3 personally reports its original43-row/145-table40→57 canonical upgrade, verified private542383-byte backup/separate restore and unchanged history/roles/sequence. Its API/web/devices are stopped and actual target stays closed; this is peer evidence, not W8's personal application acceptance.
- W4 personally reports its original22-row/145-table upgrade and zero observed commerce obligations, then its explicitly bounded loopback development reopening. W8 has not inspected that target or accepted its provider/purge/release state.
- Future0087, generation/terminal/consumer purpose proposals, approved retention, complete eight-domain effects, original recovery, staging/providers/hardware/legal/pilot evidence remain open. Neither this procedure nor the audit marks R6 or G0–G5 complete.

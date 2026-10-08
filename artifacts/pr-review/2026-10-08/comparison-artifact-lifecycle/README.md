# Saved comparison export lifecycle — October 8, 2026

This is pending implementation and isolated source-operation evidence. It does
not activate the comparison producer, issue fan consent, qualify a sanitizer,
or establish application/release acceptance. All ten product finish milestones
remain open.

## Implemented source

- `PrivateFileArtifacts.remove` validates the original job/account/domain,
  manifest, private owned files and checksum before removing the exact binary
  and metadata. It settles both paths and syncs the directory; missing files
  allow retry after interrupted removal. This primitive supplies no authority.
- Pending SQL derives creator dependencies from the actual original held
  Conversation or Agent export scope. No caller creator array or interactive
  scope can create a capture. Existing EOF and COMMIT guards remain mandatory.
- The original workspace lock serializes capture with source withdrawal.
  Withdrawal invalidates saved dependencies. Source expiry uses real database
  time and the earliest retained consent/sample/result deadline, capped at seven
  days. Empty legacy results do not keep expiring later exports.
- The exact sealed manifest is durably retained even when withdrawal wins the
  gap after source COMMIT. A deferred trigger on the original task rejects a
  stale completion at actual COMMIT. Downloads additionally require matching
  completed job/task data, owner, current source lifetime and unrevoked artifact.
- Bounded purge claims survive retries; only the original token and manifest
  acknowledge removal. The prepared TypeScript owner calls physical removal
  before acknowledgment and refuses unregistered source.
- Trust gets schema usage and `version,checksum` ledger reads for preparation,
  not Conversation/Agent table reads. Independent full-graph review remains
  required; the captured metadata digest is not an approval.

Final pending SQL SHA-256:
`c1e1dfdb83fe002fbc060c1e0737811a24d39967e12a7a840164f22091c5d0ed`.
No existing applied migration or original review checksum was edited.

## Actual isolated operations

[Filesystem operation](filesystem-operation-01.json) sealed actual private files
and verified exact removal, repeated removal, both partial-pair recoveries,
wrong-account/cancellation refusal, checksum/manifest mismatch, symlink/private
permission refusal, and an unrelated surviving artifact.

[Final PostgreSQL/filesystem operation](graph-operation-07.json) uses a fresh
schema-only copy of the preserved 105-migration graph, with synthetic actors and
source rows. It operates the original SQL export scopes and cursors, including
Agent's fixed portal and database EOF probe. Both export domains pass capture,
source COMMIT, real file seal, completion and download checks. Source withdrawal
and genuinely elapsed three-second fixture expiry deny downloads and physically
remove files. Withdrawal between source COMMIT and seal refuses completion;
withdrawal cannot commit through a concurrently held capture and succeeds after
that capture settles. Null fields and manifest replacement are refused.
The synthetic task completion uses the actual Trust worker role and transaction.
It is not an app request, original fan choice or provider operation.

[Preparation operation](preparation-operation-07.json) observes the same metadata
hash under three search paths and restores each original path. Runtime
preparation correctly returns `reviewed_migration_unavailable`. Metadata hash
`2f23f6c6257594d9fce535e5c520a00ab4b4d36760f1a5ba081ba4d6093432e3`
covers seven functions, one storage table, six relevant triggers and fifty role
dependencies, together with effective relation/schema visibility.

Preserved failures:

- [Initial Agent harness refusal](graph-operation-05-failure.json): the original
  EOF guard refused the wrong portal. The corrected operation uses its exact
  fixed portal and exhausts it before end/COMMIT. Earlier successes remain in
  [operation 05](graph-operation-05.json).
- [Initial preparation refusal](preparation-operation-06-failure.json): the Trust
  worker lacked original schema/ledger metadata access. The pending source
  adds only the explicit minimum metadata grants. Database 06 is unchanged;
  final source was applied to fresh database 07. Its earlier successful data
  operation is retained in [operation 06](graph-operation-06.json).

All three applied source copies, original scripts, private synthetic files and
full metadata remain under:
`/Users/yingpengwang/.codex/visualizations/2026/10/08/01a11aa9-c32c-7821-bcaf-6675731d1ad9/comparison-artifact-review`.
Database names end in `artifact05_20261008`, `artifact06_20261008` and
`artifact07_20261008`, in the isolated source-review container on58297.
No original application database, creator export, generation or publication was
changed by these operations.

## Required next work

Before activation, add durable discovery and recovery of unsealed attempts and
sealed files whose host crashed before recording their manifest. Do not rely
on the normal seven-day orphan sweep to satisfy source withdrawal. Preserve the
original source/task locks while deciding removal. Then compose capture before
first source read, seal retention, original task ACK, manifest/chunk read checks
and owned purge scheduling. Existing Agent comparison-export refusal remains.

Review/allocate the complete original graph and restore profiles, including the
new scope metadata grants and task trigger. Finish the producer's original read
purpose and provider admission, separate actual consent UI, sanitizer operation,
consumer read/publication fences, and genuine existing-version upgrade.
No new unit tests were added. Scoped TypeScript/lint/format checks accompany
this increment; no new web/native flow is claimed because it is not composed.

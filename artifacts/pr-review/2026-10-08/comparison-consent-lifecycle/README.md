# Comparison consent and lifecycle source increment

This milestone prepares a separate comparison purpose and its privacy lifecycle.
It does **not** activate comparison, apply these migrations to a journey/archive,
record fan consent, call a sanitizer model, or qualify an AI upgrade.

## Implemented

- Separate explicit fan choice with a finite Trust-supplied policy. Repeating
  Allow preserves the original consent clock; withdrawal deletes the choice.
- Conversation-owned message eligibility, source fingerprint and deletion
  mapping. Agent receives an opaque sample ID and scrubbed paraphrase only.
  Off-the-record/deleted threads, withdrawn processor consent and every thread
  with a memory exclusion are ineligible. Sanitization has distinct proposal
  and privacy-review stages, plus conservative deterministic rejection.
- Pending forced-RLS storage and an isolated deletion/expiry role. Source
  withdrawal, processor withdrawal, message changes and exclusions invalidate
  the creator's cached cohort and stored comparison text atomically. Workspace
  contention refuses and rolls back instead of accepting a partial withdrawal.
- Additive privacy SQL preserves the original0233 source and complete0–18 export
  projection, appending consent/sample collections19–20 under the same held
  family, cursor snapshot and COMMIT fence. Deletion requires the original W8
  due-family purpose; it consumes bounded pages through an actual empty page.
- A prepared privacy adapter requires executable registration and independently
  reviewed function/trigger/storage/role custody. Installed comparison storage
  without that owner refuses a supposedly complete Conversation export/delete.
  Agent export also refuses this new storage until the saved-artifact source
  withdrawal owner is implemented. Existing schemas retain their export shape.

## Operated source review

All SQL review rows are explicitly synthetic fixtures, never real consent or
sanitizer evidence. The review container is separate from the preserved archive.

The [storage receipt](lifecycle-observation-03.json) records nine passing actual
PostgreSQL cases: explicit withdrawal, processor withdrawal, memory exclusion,
message edit, off-the-record exclusion, unrelated-creator preservation,
contention rollback and retry, elapsed wall-clock expiry, and refusal of expiry
by the ordinary runtime. Original source01 failed a trigger record-field check;
that database, applied bytes and failure log remain preserved. Source02/03 use
fresh databases. No applied source was overwritten.

The [schema custody](privacy04-schema-custody.json) uses the complete105-row
migration graph from closed copy46, copying schema and migration metadata only.
No original message, usage or consent data was copied. The
[application receipt](privacy04-application.json) pins both pending SQL hashes.
The [operation receipt](privacy04-operation.json) shows direct sample access
refused, unfenced export empty, actual held export of only the intended family
including both new collections, refusal of a not-yet-due deletion, and refusal
at COMMIT after a genuinely elapsed lease. No clock was backdated.

That operation's final harness assertion expected the wrong error name. The
application correctly rejected registration; the separate
[readiness receipt](privacy04-readiness-refusal.json) confirms its actual
`reviewed_migration_unavailable` code. The failed assertion is retained, and the
five successful preceding cases were not rerun or rewritten.
The [catalogue observation](privacy04-catalogue-observation.json) is read-only
review metadata, not runtime approval. Neither source is in the registry.

## Actual creator export and repairs

The original browser-created request `61e07c91-56b4-4dbe-835c-0714797b4b13`
now completes all eight domains on preserved journey43. The
[actual operation receipt](creator-export-operation.json) verifies all four UI
downloads against their saved byte counts/checksums. Conversation contains36
labelled messages,18 generations and69 generation usage rows. Agent contains
one original published version,123 total usage rows and18 generation receipts.
Commerce includes18 allowance reservations; this is not paid billing acceptance.
Media contains one family with no binary assets or calls.

Three real failures were repaired without editing original applied SQL or
replacing approved checksums:

1. PostgreSQL rendered `vector` versus `public.vector` according to search_path.
   The cursor metadata reader now uses pg_catalog within a restored savepoint.
   [Six read-only cases](export-catalogue-display-receipt.json) on copies43/46
   reproduce the original approved hash and restore the caller's setting.
2. Media incorrectly called a Conversation-only family capability. It now binds
   its own genuine W8 task, actual owned identity and exact relationship, retaining
   locks and the original COMMIT fence. This operated case is a creator account
   export; populated binary/call archives and additional scopes remain open.
3. Repeated complete authority checks around16-row pages exhausted the45s
   worker budget. The private trace preserves18 successful fetches without EOF.
   The repaired128-row bound retains every page/chunk/EOF/COMMIT check and the
   original deadlines. The actual request then completed with four Conversation
   fetches (including empty EOF) and four64KiB-or-smaller protected chunks.

[Initial failure](creator-export-incomplete-01.png),
[deadline failure](creator-export-timeout-02.png), and
[completed request](creator-export-complete-01.png) are retained. Private SQL
traces and raw downloads remain in the owned October8 native-e2e directory,
not Git. A download after verification expiry correctly returned401 but exposed
an unhelpful browser error; reconfirming the same account allowed every download.
The web recovery UX remains an explicit next repair.

The before/after receipt preserves the exact publication, evaluation, messages,
all18 generations, reservations and69 usage rows (36,815 microdollars,51 settled
units). Usage digest remains
`9b6d528acbc4a957ddfcdee0beb43e064668d655ae717ce41c0cd006285af345`.
No comparison consent, evaluation, publication or provider call occurred.
The owned iOS simulator and Android emulator remained stopped during this
backend-only increment; earlier actual native evidence remains separate.

## Validation and limits

Backend typecheck/build, changed-file lint/format and the existing46 backend
tests pass. Eleven PostgreSQL integration tests skip without their separate test
URL. No unit tests were added. The final compiled repair is
`5e5cd3abf853e0e97a1daeb0f4a5f4236f24c886`.

Still required before activation: original comparison selection/read purpose;
per-provider-call admission and accounting; current cohort fences for collection,
result read/persistence and publication; the saved-export withdrawal/physical
artifact owner; a finite expiry host lifetime; full original-graph review and
restore qualification; actual consent API/UI on web/iOS/Android; adversarial
sanitizer operation; genuine comparison and revision13→14 publication. Mature
privacy deletion remains open at its original due date. All ten milestones in
the [finish plan](../../../../docs/operations/product-finish-plan-2026-10-08.md)
remain in scope.

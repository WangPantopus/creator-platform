# Shadow comparison sample identity and eligibility

This is a bounded consumer repair toward the existing-version upgrade milestone.
It does not connect a sanitizer or qualify a real published-version upgrade.
The [full finish plan](../../../../docs/operations/product-finish-plan-2026-10-08.md)
preserves every remaining product workstream and the original evidence links.

## Findings and change

The original `collect` appended candidates and kept the newest 200; an empty or
reduced feed left omitted candidates available. The v2 comparison fingerprint
bound the live/draft engines but omitted the samples, and publication could reuse
a pass after its samples ceased to be eligible. A stale draft also reached the
feed before its revision was rejected.

- The feed contract now returns one complete bounded cohort. Parsing copies the
  input, rejects unknown fields, duplicates and more than 200 samples. Collection
  replaces that creator's candidate set, including clearing it on an empty
  response. An ID collision with different material rolls back the whole change.
- Shared sample reads apply creator scope, a seven-day lookback, no future dates,
  current expiry and at most 30 days of retention, using PostgreSQL wall time.
  They refuse an oversized stored cohort rather than silently choosing a subset.
- v3 fingerprints bind both engines and the sorted sample IDs, occurrence times,
  paraphrases and sanitizer references. Old v2 passes no longer authorize an
  upgrade. Running jobs must match the current cohort before provider stages;
  subsequent stage transitions, progress/final persistence and publication
  recheck the eligible cohort. An empty cohort cannot pass.
- Current published engines, their saved fingerprints, provider accounting,
  historical results and applied migrations are unchanged. No preserved database
  is opened or changed by this source increment.

## Validation and limits

Local validation on the continuation source:

- Backend typecheck and production build pass; the heavy-build lock is released.
- All **57 backend tests pass**, with **11 actual PostgreSQL cases**, none skipped.
  The two new database cases prove creator isolation, complete/empty replacement,
  conflict rollback and wall-clock/future/retention eligibility. Eight scripted
  tests cover sample identity, stale-draft ordering, malformed cohorts, obsolete
  jobs, mid-replay changes, successful unchanged comparison and publication denial.
- Scoped ESLint and Prettier pass. No API schema/generated client, frontend,
  native or applied SQL file changed, so unrelated platform builds were not repeated.
- [Validation receipt](validation.json) records source hashes and exact scope.

Orchestration tests use
scripted SQL/provider responses and are not permission, consent or sanitization
evidence. PostgreSQL cases use a separate disposable Foundation fixture and the
actual non-owner role; they do not touch an archive or journey copy.

The actual Conversation/Trust producer is still absent from host composition.
The reference string does not prove sanitization. This repair checks the stored
candidate cohort; the original owner's read/provider/commit revocation fences,
consent/exclusions, deletion provenance, physical 30-day purge of samples and
persisted comparison text, guarded result display/export, and shutdown ownership
remain prerequisites. A source-rights change during a provider stage also still
requires the original owner's checks. No live upgrade, rollback, latency,
paid-membership or production qualification is claimed.

The historical archive, closed journey copies, original 658 usage rows and
unknown-cost holds remain under the existing handoff custody; no fresh database
audit of them is claimed while the container is stopped.

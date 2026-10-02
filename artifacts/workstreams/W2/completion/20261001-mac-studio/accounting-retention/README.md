# W2 accounting custody increment — October 2, Mac Studio

Implemented complete keyset-paged family export with backpressure, cancellation, counts and a byte hash; it includes usage attached through the actual attempt cost hold. Existing bounded object export/purge adapters still refuse an oversized family rather than truncate it.

W8 allocated `0067_w2_usage_retention_expiry`. Its four-column plan requires a real policy version, reason, deadline and financial disposition reference, and refuses any remaining fan/thread/generation/attempt/hold link. No historical row receives an invented plan. `PreparedUsageRetention` binds the exact installed ledger checksum, FORCE RLS, database, pool, prepared journal policy and actual expiry authority. Expiry deletes bounded due known accounting outside the active cap day; unknown costs remain reconciliation-required. It never inserts a workspace after deletion.

Creator erasure now requires W8's actual completed conversation accounting boundary, refuses residual families/linked usage, preserves plan-bound minimal accounting, returns retained-category receipts, and revalidates the boundary before commit. Canonical coordinator export revalidates the same boundary and prepared custody on its held snapshot; the legacy artifact adapter remains refused when accounting lineage is installed. Identity/profile erasure remains a coordinated W8/W1 dependency, including foreign-key order and approved retention policy.

## Personally verified

Existing backend suite: **18/18 passed**, no new tests. T-11 retained **10,000 pairs / 30,000 scoped queries / 300,000 ms limit**, completing in **58,293 ms**. TypeScript, scoped ESLint and Prettier passed. A later export predicate correction includes hold-linked usage; TypeScript/lint/format were repeated for that change.

An explicitly synthetic SQL rehearsal ran on a private restored database under `creator_runtime` with FORCE RLS. Incomplete and still-linked plans were refused. A one-row expiry batch removed one due known row and preserved a due unknown row, a future known row, a current cap-day charge and another due known charge. The correct creator saw four remaining rows; another creator saw none. The entire rehearsal rolled back: no migration ledger, new column or usage row persisted. This checks schema/selection behavior; it is not a positive privacy-job or expiry-authority proof. The canonical runtime rejected preparation with `accounting_retention_schema_unconfigured`.

The fictional populated draft was exported through Studio's actual download control. The private JSON is 20,907 bytes, SHA256 `24dd188db09c93468560c910492aa30e4a9ef7d521d913e0f163a0481cc9e65d`, schema 2. It contains 20 examples and the persisted source/configuration, with no model usage, evaluation or published version. A new private dump was listed, checksummed and restored successfully: 541,029 bytes, SHA256 `8de5afc9bf2dfe6197befbdd762f7aacb33acb47b7fea180c11f3312e0d984f2`; restore confirms revision 15, 20 approved/fixed examples, $5 cap, 40 canonical migrations, one source, one synthetic license and zero usage/evaluations/versions. No private content or credential is committed.

## Still required

Actual W8 registration, current worker/task lease, immutable ownership scope, completed same-job conversation artifact/disposition, genuine settlement, approved policy and coordinated identity foreign-key handling must be composed and personally operated. Reserved SQL, supplied callbacks and successful compilation are insufficient. Unknown usage is never silently expired. Large-family deletion still needs complete bounded subjobs. Provider key/archive remain absent at their designated paths; model-dependent journeys remain unavailable. This increment is implemented and reviewable, with negative/schema checks; it does not close R07 or establish release readiness.

[Sanitized source/check/backup receipt](receipt.json).

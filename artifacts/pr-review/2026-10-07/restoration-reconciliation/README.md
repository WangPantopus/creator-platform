# Restoration protection reconciliation

Implementation: `8eff5fae5aba0b14f133a412b009096037343ee3`, based on PR132 `8c78e379900555abae37dddb31143c8a7defcd23`. Reuses PR145 `da0e2af95baa19280ddf3ebdae4ce8ead1a5eca7`. Only two product files change: 39 insertions and 8 deletions.

The held restoration reader now releases its savepoint only after a completed read. Runtime refusals retain the original private cause. The generation restoration helper leaves uncertain responses to the transaction owner, retains original and cleanup failures together, and does not attempt fallback cleanup when its success-path release fails. Its newer shutdown implementation is unchanged.

## Preservation

[Seven-path preservation proof](preservation-145-to-132.json) accounts for all implementation/configuration changes from #145:

- Worker/terminal SQL, query-settlement classifier and held restoration file are byte-identical.
- Operations runtime matches #145 apart from #132's retained newer idempotent shutdown declaration and implementation.
- Both original integration type/forwarding additions are identical.
- The same two SQL source paths, owners and SHA256 values were already registered by #132's reviewed generation wave. No migration, registration or privilege changed in this repair.

#145 was closed unmerged into #132 after the verified implementation and evidence were published. [Action receipts](actions.json) and [verified state](post-consolidation.json) record source preservation and the transferred requirements. Fifteen original drafts remain open. It does not qualify a complete generation, terminal result or privacy lifecycle.

## Actual operation

[Compact observations](operation-summary.json) record seven cases against source and seven against the built integration runtime. Bundle mode loads `dist/integration.mjs` for the backend/Trust runtime and uses the actual source development adapter and existing generation transaction owner. This is not a full standalone deployment acceptance claim.

| Case | Observed result in both runs |
| --- | --- |
| Successful restoration | Actual generation-worker login, original transaction and metadata read complete; owner commits and reuses the same healthy connection. |
| Wrong login | Actual core login is refused before held restoration; known cleanup completes and the same connection remains usable. |
| Known read error | A real PostgreSQL division error at the metadata-read boundary remains under the non-enumerable `restoration_pending.cause`; savepoint rollback and owner rollback succeed. |
| Unknown read response | A local TCP proxy withholds the real metadata response, causing a real 300ms client read timeout. The original timeout survives the wrapper; no further SQL is submitted; the transaction owner destroys/discards the original socket and its backend disappears. |
| Known release error | The operator removes the real savepoint before release. PostgreSQL returns `3B001`; the helper does not attempt fallback rollback-to-savepoint; owner rollback leaves the connection usable. |
| Unknown release response | The proxy withholds the real generation-savepoint release response. The timeout receives no later SQL; the owner destroys/discards the connection and its backend disappears. |
| Cleanup failure | A genuine wrong-login refusal is followed by deliberate removal of its actual savepoint. The ensuing PostgreSQL `3B001` is preserved alongside the original refusal in an AggregateError; owner rollback completes. |

Fault controls delay real responses or alter the operator's own transaction/savepoint. They do not fabricate query results, actors, tasks, scopes, provider outcomes or settlement. No generation nonce or task was issued. The host's normal development restoration-disabled setting prevented workers starting against the copied historical deletion; the setting was then cleared for the direct restoration operations. Repeated Trust `stop()` calls returned the same promise and actual host pools closed. Active-worker shutdown under load was not requalified by this operation; its source remains unchanged and the existing lifetime tests passed.

The labelled database `creator_pr132_restoration_20261007` was independently restored from the preserved 101-registration original before operation. All six custody digests match before/after for both the original and copy: ledger, schema, roles, security, sequences and data (177 business tables, 1,001 rows). Temporary passwords were removed; the copy is traffic-closed and has no remaining clients; `creator-w2-original-archive-20261007` was stopped with volumes preserved. No other container was started.

Private operator, full query observations and backup receipt remain under `/Users/yingpengwang/.codex/visualizations/2026/10/07/01a11784-60b1-7fe3-8855-82bddf4675b6/restoration-reconciliation/`. No private credentials, database dump or screenshot is committed.

## Validation and remaining acceptance

Backend shipping build/typecheck, scoped ESLint/Prettier and whitespace checks pass. All 17 existing contract/lifetime cases pass (9 contracts, 8 generation lifetime). No new unit-test source was added. The separate nine-case PostgreSQL foundation suite was not rerun locally; the targeted real PostgreSQL operation above covers this change. CI results remain associated with their actual head, separately from these observations.

Remaining requirements move with the preserved source: actual installed-consumer registration and original pool/callback lifetime, genuine issuer/private nonce and cancellation contract, current catalogue, original worker/task/provider/terminal operation, denial/expiry/races and settled receipts, all-domain privacy lifecycle, and actual application/design acceptance. Generation stays closed until its real owner graph is qualified.

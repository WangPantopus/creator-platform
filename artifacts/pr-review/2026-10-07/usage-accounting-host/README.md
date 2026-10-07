# Original privacy registration and accounting expiry host

Continues draft [PR132](https://github.com/WangPantopus/creator-platform/pull/132) with implementation `25cd72edab615f7aa6fb2bb3c12ae569f75d6acc` from `d7096bb60271a05d1fe3ab2784f2db0dc65f9143`, preserving its restoration reconciliation and current main. This increment connects the existing journal, retention producer and expiry worker to the standalone host. It does not enable generation or establish complete privacy acceptance.

## Change

`createPrivacyConsumers` records the original hook objects, callbacks, core pool and coordinator pool. The owning Trust runtime installs that registration on exactly one worker. Copies, replacements and domain-name lookalikes do not establish registration. Lazy owner resolution remains separate from each domain's readiness and task authority.

The configured backend exposes a narrow accounting preparation port. Trust verifies executable source custody and actual database custody, prepares the existing expiry owner, journal and approved retention policy, and binds them to the exact Agent repository and lifecycle used by privacy. The standalone Conversation host consumes that journal/retention pair independently of provider execution. Its old synthetic journal-registration callback is no longer used by the standalone server.

The same Trust lifetime starts expiry after feature composition, reports readiness only after an actual pass, observes worker failure, drains it before closing the original pools, and invalidates registration after shutdown. Journal and retention operations recheck that registration. The existing generation guard remains in place.

## Verification

- Backend TypeScript/shipping build, scoped ESLint/Prettier, and 17 existing contract/lifetime tests pass. No new test source, SQL registration, role grant, accounting record or task authority was invented.
- Independently restored `creator_pr132_accounting_20261007` from the preserved original101 archive. All six custody digests matched before operation. Original archive remained traffic-closed and unchanged afterward; application schema/roles/security/ledger remained unchanged.
- Source host and compiled `dist/server.mjs` both completed an actual expiry discovery pass. There were no due expiry jobs; this establishes wiring and lifetime operation, **not positive deletion of expired usage**.
- Both hosts accepted a genuine development-identity HTTP account export. Content completed with a protected artifact. Agent reached the real SQL accounting boundary and was refused because the original Conversation task had not completed. PostgreSQL recorded `Actual completed Conversation boundary required`. No replacement receipt or empty accounting success was supplied. Other unfinished domains and overall readiness remain unavailable.
- Source operation refused copied hook arrays, a replacement worker, another pool, a replaced hook callback, repository rebinding after start, and use after close. Repeated preparation retained the same owners; repeated shutdown returned the same promise. The standalone process exited cleanly on SIGTERM.
- An actual exclusive lock on the expiry job table blocked the worker's original database query. Failure changed readiness, invalidated accounting use, and remained in the shutdown aggregate. Both original pools still closed. This fault used no fabricated expiry job or cost data.

The compact [operation summary](operation-summary.json) records code hashes and the actual receipts. Private operator scripts, initial diagnostic attempts, logs and backups remain under `/Users/yingpengwang/.codex/visualizations/2026/10/07/01a11784-60b1-7fe3-8855-82bddf4675b6/usage-accounting-host/`. Initial operator assumptions about premature Agent completion were corrected to respect the original Conversation dependency; the product guard was retained.

## Continue

Complete the actual Conversation recording owner, reviewed cursor/provenance configuration and financial accounting composition. Decouple the approved attributed Commerce cost policy from provider/generation readiness, preserving original current/prior cost rules. Supply the actual protected financial writer and finish its cancellation/settlement handling. Then operate all-eight-domain export/download/deletion, genuine due-usage expiry and unresolved-cost escalation/breach behavior. The Agent boundary currently appears as generic `domain_hook_error`; improve that diagnostic with its original cause and dependency semantics when completing this path.

Do not merge PR132 or remove its generation guard based on this increment. Existing source ownership and the 15 remaining draft-PR dispositions remain as recorded in the reconciliation ledger.

# W3 increment 38 — complete paged privacy consumer, held-fence requirement

Primary-owner implementation source: `a641a2cb26197904efd402048ba11d4a50be95cf`, branch `codex/w3-paged-privacy-consumer`, based on the integrated W3 host. No new test code was written.

## Change and verified checks

W3 now consumes W2's actual `exportMetadataTo` and `purgeFamilyPaged`, carrying the original leased PrivacyHook job and its real cancellation signal. Deletion checks cancellation between mutations, rechecks current family authority through generation settlement and immediately before commit, and retains W2's actual counts/checksum/unknown-cost retention receipt. Large conversation deletion and more than 100 families still refuse pending genuine bounded lifecycle subjobs; no truncated success or permissive retention default was introduced.

Conversation export uses one held REPEATABLE READ snapshot, 50-row keyset pages and one pending 64-KiB chunk with backpressure. It includes all conversation messages and author labels, memories, access audit, provider and sensitive-memory consents, usage days, events, exclusions and generation metadata. Prepared lineage and recording associations have paged readers on that same client; W2 accounting supplies its own complete paged source and actual checksum/count summary. Message/event keys preserve sequence order. Every source page rechecks actual family authority, and buffer flushes and final completion recheck the actual leased family set. Iterator abandonment, abort, timeout or source failure rolls back and cannot attest source exhaustion. The coordinator retains ownership of protected durable storage, checksum verification and task acknowledgement.

Reviewed the old separate coordinator-pool verify: it did not atomically pin the actual task lease through a domain COMMIT. W8 confirmed this and reserved `0087_w8_privacy_task_fence`. The new optional authority member `fenceTaskInTransaction(client, actualJob)` must be bound to W8's genuine published task-lock/deferred-currentness port. Both export and deletion require it before domain locks. Absence returns 503 `privacy_commit_fence_unavailable`; there is no separate-pool replacement or invented ThreadScope. The current host does not have that port or migration, so the new work is explicitly unavailable for positive acceptance.

The host exposes its actual prepared lineage/recording instances. The coordinator accepts narrow owner ports resolved once for a genuine task after feature composition; its pool, family authority and reviewed retention remain fixed. No accounting, financial disposition, retention or commit-fence producer is fabricated. Backend typecheck, lint, repository formatting and generated API checks passed. An intermediate cancellation edit introduced a syntax error, which was fixed before commit and the relevant checks rerun.

## Actual runtime operation and limits

Restarted only W3's API at source `a641a2cb` on 4103, using the same private development environment and `creator_w3` database. Startup still lists missing provider credentials, held trust and registered journal/cost schema. The actual ledger remains 40 entries; no SQL or registry activation occurred.

In the built-in browser at 390 points, personally navigated kilnfire You → Export or delete my data and reloaded against this runtime. The page says fresh identity verification must be connected and its Request export control is disabled. Recorded that actual screen. No invented verification receipt, leased job, family, encrypted artifact, deletion, retention acceptance or completed privacy receipt was used. Thus the new paged source has not been consumed through a genuine job; positive large-export/deletion, interruption, checksum and lease-replacement operation remains required after W8's actual producers and reviewed policies are available.

Native binaries were unchanged by this backend increment and both owned devices remain shut down. iOS input remains blocked by DeviceHub and the pending human alternative-control answer. Populated A–I acceptance and the normal actual-head-green main merge sequence remain incomplete.

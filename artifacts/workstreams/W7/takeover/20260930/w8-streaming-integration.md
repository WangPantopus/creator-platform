# W7 account export continuation — September 30, 2026

The primary personally implemented this increment on `codex/w7-handoff`, continuing published139c156 and existing PR2. No implementation/acceptance was delegated, no new test case/suite/script was added and no paid AI call was made. The entire original assignment and [acceptance matrix](../../resume/20260930/acceptance.md) remain open.

## Actual owner contract and implementation

W8 published `PrivacyExportStream` and `consumePrivacyExport` at3240da0e74403c56ae0d13aa9e4c72ab47fdfc74. Its coordinator verifies the actual leased task before and during writes, protects/seals/verifies stored bytes, checks the owner's exhaustion/count/checksum attestation, and retains download authority. Its current884c35bb3e8725ee9f573531aacfe07c05fde71f contract was inspected for changes. W7 consumes the exact structural stream shape without copying W8's worker, storage, identity authority or SQL.

`createGrowthRuntime` and `configureGrowthForBackend` accept `privacyTaskAuthority`, supplied by W8's `privacyTaskAuthority(trustWorkerPool)`. It receives the complete leased hook input and returns the actual captured account ownership. A lease token or cancellation signal without this authority port fails503. The legacy callable job/account snapshot remains compatible for the older bounded worker; it cannot activate the new stream. Creator/thread scope continues to fail503 until the exact owner mapping exists.

The account NDJSON stream acquires sorted existing account/creator erasure session fences **before** beginning its repeatable-read/read-only transaction. This ordering prevents a snapshot taken before an in-flight erasure from treating its fence as absent after waiting. A dedicated connection holds those fences and one source snapshot through every internal cursor's explicit zero-row EOF. It fetches100 rows at a time with no source LIMIT/OFFSET, includes a source manifest for empty collections, produces contiguous chunks of at most512KiB, and attests the full byte/chunk count and SHA256 only after all sources finish and COMMIT succeeds. Cancellation or early iterator return destroys the dedicated connection and releases the transaction/session locks; `finish()` refuses incomplete or aborted iteration. W8 remains responsible for its actual45-second lease deadline and1GiB capacity refusal.

Own-account records cover the existing follow/preferences/inbox/share/metrics/feedback/prompt/attribution/invite/activation set, token-free device metadata, own decrypted email, delivery state, own categorical insight records and own Thanks. Captured owned-creator records cover current public content/profile, insight windows/snapshots/recommendations, Impact counts, Instagram state and experiment records. Creator Impact export omits other fans' saved quote text, identity and subject keys because this hook has no current permission proof for them. The same omission repairs the older bounded export. Requesters' own Thanks remain separately scoped to their own pseudonymous subject.

Leased privacy deletion now passes W8's signal into the existing Growth transaction. Abort destroys its connection, rolling back active writes/fences instead of allowing work to continue after the coordinator deadline. Existing callers without a signal retain the same transaction behavior. No migration, authority assertion, original image or source artboard changed.

## Verification and limits

- Full backend TypeScript/build passes: [build](stream-build.log).
- Growth ESLint and changed-source formatting pass: [lint](stream-lint.log), [format](stream-format.log).
- All nine original backend contract checks pass: [existing contracts](stream-contracts.log). These cover existing authority/delivery boundaries; they do not exercise a newly invented privacy job or establish streaming acceptance.
- The inspected own API process26804 was gracefully stopped and replaced by59003/exec session13294 with the same0600 managed configuration. Own container/volume, old and new databases, web16845, device data and peer resources were preserved. Current health reports foundationReady=true, ready=false, development identity, generation unconfigured and registeredFeatures=[growth]. The actual Trust BFF still returns503 trust_unconfigured.
- No real verified C10 task, encrypted large export/download, concurrent revoke/purge or production retention acceptance is claimed. The current host has no configured W8 task authority/protected storage; account export remains unavailable there. No fake task, creator, consent or producer outcome was inserted to obtain a success.

## Merge boundary

The founder requested resumed work and asked why PRs remain draft/unmerged. Incremental code merges can be distinct from production release acceptance. PR2 is technically mergeable and main has no branch protection, but the takeover explicitly says: “Merge PR #2 only when the actual repository and full workstream gates are satisfied.” This remains the applicable merge boundary until the founder revises it; repository write access does not waive it.

A concrete alternative is to make PR2 ready for review and merge reviewed implementation after **all current-head repository checks pass**, while externally dependent real creator/provider/native/design/release acceptance stays explicitly tracked and unavailable paths retain their gates. That alternative requires the founder's change to the earlier full-workstream merge condition. It does not authorize marking queued/canceled checks as passing, releasing public traffic or declaring W7 complete. No duplicate PR was created.

At parent139c156, Trust36795887445, Foundation backend/web and Android runtime pass. Web visual, iOS foundation and Android foundation remain queued with no assigned runner; their success is unknown. Existing hosted643 failures/cancellation and local macOS Light baseline failures remain preserved. Exact checkpoint CI is in [parent CI](stream-parent-ci.json); inspect the actual final pushed head before deciding to merge.

W1's bd3677c03ccb1b8225bd0d56f033f953ce7aa7aa source now registers actual Conversation and Content/Studio in its combined development host. This was personally inspected, but its newer runtime/authority/module dependencies were not blindly copied into W7 or run on W1's resources. Actual W7 combined-host installation, all19 producer/channel paths, sharing/revocation/credit, real insights/activation/Impact/measurement, and the full populated13-artboard/native/accessibility/performance matrix remain required.

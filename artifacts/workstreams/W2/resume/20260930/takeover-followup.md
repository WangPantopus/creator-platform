# W2 takeover continuation — September 30

This continues all nine original work packages and R01–R14. It supersedes the
earlier unavailable-runtime observations while retaining those receipts as history.
The initial clean, pushed source was `eb0f6a043c96459e34d85cbef4637402b068449b`,
two documentation commits after the supplied `489bbe9` repair. Main `2e337a1`
remains an ancestor. Only the specified W2 worktree was modified.

The founder's subsequent human reply authorized recovery judgment and direct
coordination with the seven active peers. Docker was already available on recheck;
only the retained W2 container was started. Its anonymous volume, 123 sources,
105 immutable versions and 28 canonical migration ledger entries survived. No
engine restart, pruning, reseeding, migration rewrite or peer resource change occurred.

Owned ignored runtime configuration was recovered under `tmp/w2-runtime-20260930`
(directory 700, files 600). Only the own non-owner runtime password was rotated;
privileges are unchanged. The supplied OpenAI key is still loaded directly by the
backend's env-file mechanism and was never printed, copied or committed. Studio
3002, API 4102 and PostgreSQL 55442 are retained. `resources.json` has the current
configuration references and listener observations.

Recovery uses the explicit synthetic policy reference
`founder-authorized-synthetic-review-recovery-20260930`; production policy remains
unapproved. That configuration change invalidated the old evaluation honestly.
An actual UI rerun passed seven cases at companion revision 16, receipt
`af133533-5259-4e0e-a4cd-96f9f1a28317`. Its complete transcript is
[recovered-companion-evaluation.json](recovered-companion-evaluation.json).

## Implementation and actual provider proof

`LiveAgentRuntime.assertReady/assertApproved` now operate inside W3's existing
scoped acceptance/sentence transaction. The validator retains shared locks on
current creator verification, workspace, license, exact immutable version, all
version sources and cited chunks until commit. It validates the issued scope,
live version/hash/pipeline, exact approved source revisions/hashes/expiry and
current cited audience. The temporary read-only creator-owner scope is restored
to the requesting actor before calling producers. No domain table writes,
broader privileges, new transactions or W3/W4 writes are introduced.

Durable delivery additionally requires canonical
`LicenseVerifier.isCurrentInTransaction(scope, license, client)` and
`AudiencePort.currentInTransaction(scope, client)`. A separate preflight cannot
substitute for those locks; absent methods fail closed. `createAgentDomain`
reports `readiness.atomicDelivery`. W1/W3/W4 have the proposed contract. The W4
owner reports an unpublished same-client audience implementation; authentic
W1 license authority is still absent. This is implemented integration source,
not licensed fan-delivery acceptance or distributed timing proof.

The grant-free safety classifier now uses the same durable pre-call uncertain
journal helper as other auxiliary operations. Actual invented deterministic and
indirect crisis inputs both routed safety. A real 50 ms abort persisted a
NULL-cost row; it was not treated as free or deleted. See
[safety-journal-followup.json](safety-journal-followup.json). No fan message or
paid allowance was created by these bounded operations.

Structured and streaming Responses requests now send a stable hashed
model/instruction/schema `prompt_cache_key`. The adapter fingerprint is
`responses-v3-cache-routing`, so previous evaluations are historical. Pinned
models and explicit tariffs are unchanged. Six prior real repeated adapter
requests still reported zero hits, preserved in
[cache-accounting-followup.json](cache-accounting-followup.json). Four bounded
new real structured requests produced:

| Request | Total input | Cached input | Output | Cost, microdollars | Observed duration |
| ------- | ----------: | -----------: | -----: | -----------------: | ----------------: |
| First   |      21,059 |            0 |      7 |              8,435 |          1,655 ms |
| Second  |      21,059 |       20,864 |      7 |              2,176 |            791 ms |
| Third   |      21,059 |       20,864 |      7 |              2,176 |            698 ms |
| Fourth  |      21,059 |       20,864 |      7 |              2,176 |            830 ms |

[cache-routing-provider.json](cache-routing-provider.json) records the actual
adapter results. The explicit-rate calculation retains cached/write subsets and
applies the discounted tariff. These individual invented requests establish a
nonzero cache/accounting observation, not fan latency p95, general cache
availability, production policy or a cache-counter journal migration.
[OpenAI's current caching documentation](https://developers.openai.com/api/docs/guides/prompt-caching)
describes the routing hint; it does not guarantee a hit.

The actual product console passed all seven new expert revision 17 cases,
receipt `17272e85-597d-4e57-b558-c6584621c651`, retained in
[expert-cache-routing-evaluation.json](expert-cache-routing-evaluation.json).
Restored companion revision 18 also passed all seven cases, receipt
`4173b485-8ff1-4943-ab01-cc3b27153824`, current fingerprint
`7730898f4a558fc127d31b8ec48e03cd7dee2054cd43beed8e6cc80a1f2dcf0c`.
[companion-cache-routing-evaluation.json](companion-cache-routing-evaluation.json)
and [current Studio capture](studio-companion-cache-routing.jpg) preserve the result.
Saved sources, corrections, versions and earlier receipts remain intact.

W3 actual browser operation found that an expired canonical session was mislabeled
as creator setup missing. Studio now reads the existing W1 session producer,
returns 401/session_required for denied sessions, 503/identity_unavailable for
unavailable or invalid authority, and retains 403/creator_required only for a
valid session without a creator. Loopback explicit actor selection remains scoped. W3 also reported invalid citation
HTML in its older web source. This checkpoint already has sentence paragraphs
and sibling disclosure details in the published CreatorAI component; the owner
was directed to consume that inspected correction. W3 independently reports
a real source-grounded draft preview and expanded exact fictional passage;
those browser receipts belong to the W3 producer, not licensed fan acceptance.

## Coordination, checks and remaining acceptance

All seven peers were contacted through their ongoing chats under the founder's
explicit authorization; none was delegated W2 implementation. W3 is consuming
the supplied memory kind/semantic key and preparing canonical draft-preview and
processor-consent seams. W4 is preparing cost-weighted known/unknown settlement
and same-client tier/group authority. W5 confirms publication alone never grants
AI reuse. W6 confirms no sanctioned transcription/voice provider. W7 confirms its
immutable publication relay and activation scheduler exist, but no genuine W3
outcome/sanitizer feed is registered. W1 confirms authentic licensing and
production identity inputs remain missing.

W8 was asked to allocate fresh additive cache-counter and generation/attempt
journal/terminal-receipt schema custody. No ID is guessed and no DDL was applied.
Current W2 usage JSON lacks durable per-generation lineage, so it must not be
accepted as W4's final settlement receipt. Unknown spending keeps its conservative
hold until actual reconciliation. Source/group authorization, protected trust
export/effect registration, authentic publish/rollback/expiry, scrubbed shadow,
72-hour actual digest, sanctioned connectors/voice, populated native/accessibility
and measured performance remain in the complete [finish matrix](finish-matrix.md).

Backend TypeScript, bundle build, changed-source lint/format, generated OpenAPI,
shared resources/native API drift checks and all nine unchanged contract cases
pass. No new engineering tests, suites, snapshot/load scripts or golden updates
were written. The historical full 18-case/10,000-pair repair receipt is preserved;
new complete required CI still must pass for the published increment.

At initial `eb0f6a0`, both root/backend and Android runtime contexts and Trust
compile passed; native/visual contexts remained queued/in progress. See
[ci-recovery-checkpoint.json](ci-recovery-checkpoint.json). The existing authenticated
local GitHub CLI can read PR1 even though connector metadata writes return403.
The draft must retain accurate scope and stay unmerged until all relevant
exact-head checks pass. Main integration is separate from full release readiness.

Phone console at390×844 has no horizontal overflow; transcript controls expose
44px minimum heights and keyboard Tab advances to the next case. This is bounded
browser observation, not 200% text, reduced-motion, VoiceOver/TalkBack or populated
artboard acceptance. The owned browser viewport override is reset after captures.

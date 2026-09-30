# W2 resumption — 2026-09-30

This record supersedes the September 29 runtime availability report. The primary personally implemented and operated this checkpoint. No new tests or test scripts were written. Existing tests and immutable migrations are preserved.

Workspace: `/Users/yingpengwang/.codex/worktrees/w2-resume/creator-platform`, branch `codex/w2-creator-ai-handoff`, existing draft [PR #1](https://github.com/WangPantopus/creator-platform/pull/1). Foundation checkpoint `22aa088` was integrated by merge `bae1fee`. Shared checkout and peer services remain untouched. `resources.json` records isolated ports/database/build ownership.

## Implementation checkpoint

- Scoped direct live/rollback lookup and paged history work independently of the newest 100 versions.
- HTTP and Next BFF export use backpressure and cancellation rather than buffering. W8 exports require a protected artifact sink and return descriptors only after completion.
- Purge uses durable W8 pre-deletion ownership, current task/effect leases, exact action binding, atomic deletion and an independent tombstone; replay does not recreate workspace/command state.
- Canonical trust actions wait for confirmed W4 settlement. Ingestion attempts fence stale workers. Abandoned cost holds remain uncertain until reconciled. Evaluation cancellation persists, and stale evaluations/shadow finalizers cannot restore success.
- Runtime polls durable version/source/license/audience/context/processor-consent authority while a provider is silent; sentence delivery also checks it. Semantic crisis classification precedes paid reservations. Actual provider usage distinguishes preview/evaluation/shadow from fan replies.
- `createAgentDomain` joins service, sources/invalidation, ingestion, runtime, shadow and trust adapters with explicit readiness. W4 projects actual membership tier IDs; absent group authority grants no group access. W7 adapters validate immutable numeric versions/timestamps, deliver/acknowledge outbox events and require genuine W3 outcome aggregates.
- Studio drafts are scoped to account + creator; writes bind the displayed actor to the current server session. Confirmation dialogs name their action and errors; rights confirmation binds the exact source revision.

## Actual observations so far

Fresh isolated PostgreSQL 17/pgvector database `creator_w2_resume` on 55442: every registered migration through 0031 applied successfully. API 4102 uses non-owner `creator_runtime` with forced RLS; Studio 3002 uses explicit loopback synthetic identity. No verified creator or license was fabricated.

Desktop 1280×900 browser: candidate → rights review → unavailable-embedding failure → revoke → explicitly reviewed restore → genuine embedding ingestion completed. Configuration and weekly update persisted. Screenshot `studio-sources-light.png` shows the pre-provider revocation state.

Founder supplied the server-only API-key file after initially leaving the provider undecided. Account model listing returned 200. Verification uses pinned `gpt-4.1-mini-2025-04-14`, `gpt-4.1-2025-04-14`, and `text-embedding-3-small`, with synthetic writing only. This is permission for isolated verification, not production processor/license approval. No key is copied into this record or repository.

Published rate references checked September 30: [Mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [GPT-4.1](https://developers.openai.com/api/docs/models/gpt-4.1), [embedding](https://developers.openai.com/api/docs/models/text-embedding-3-small). Standard input/output USD per million tokens: 0.40/1.60; 2.00/8.00; embedding 0.02 input. Cached input is conservatively charged at ordinary input rates. [Data controls](https://developers.openai.com/api/docs/guides/your-data) require separate project/policy review; `store:false` is not proof of zero retention.

Real cited preview: authorized passage offsets 0–134; one approved sentence; category null; four real usage records totaling 1,955 microdollars; duration 5,472 ms and first approved sentence 5,467 ms. Single local sequential observation, no p95 or warm/cold claim. An earlier preview fell back; the deterministic identity check was corrected to allow the creator’s AI disclosure while still rejecting a human-identity claim. Current pipeline fingerprint is revision `w2-context-guardrails-4`; evaluations are now running on it.

Separate synthetic export/history benchmark: 120 candidate sources, each within the source text/byte limit; 105 retired version rows bound to an explicitly failed synthetic evaluation. These are pagination/export inputs, not publication evidence. HTTP export returned 200, **72,088,072 bytes**, all 120 sources and 105 versions, in **1.359283 seconds**. History page 1 contains 105…6 (100 items), cursor 6; page 2 contains 5…1, cursor null. Large local JSON remains private temporary output, not a committed artifact.

Backend/web typechecks and changed-scope ESLint passed at this checkpoint. Final build, generated checks, existing tests, remaining browser operations and final evaluation outcomes will be added before final delivery.

## Remaining acceptance gates

Current reviewed license/signature policy and production processor configuration; W3 atomic off-record/consent/context and durable cited fan delivery; canonical group access and cost-weighted partial/unknown allowance settlement; protected W8 export artifact store and Q16 retention; real scrubbed shadow/outcome feed and W7 worker registration; approved OAuth reuse policy; W6 audio/AI voice provenance/provider; integrated web/iOS/Android fan flows and measured distributed cancellation/load targets. Native chat currently has no connected conversation service. Compilation or synthetic ownership fixtures do not establish these gates.

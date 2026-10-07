# Resume checkpoint — PR review and app fixes

## Current checkpoint

The founder authorized reviewing/merging good original open/draft PRs, following docs/source and exact design references, actual app/API/database verification, and continuing feasible app work. The latest steering requires checking every open/draft PR for overlap before implementation and reusing existing work. Commit, push, open and merge qualified increments without repeated approval. No unit or automated test code should be added or manually run. No subagents were used.

**30 merges are confirmed at this committed checkpoint; #320 is awaiting its final exact-head gate.** Read GitHub and the external final receipt below before trusting this pre-merge count. A successful #320 brings the total to31 (original16 plus focused306–320).

- #316 merged `de2a79148c9c1688a7cbaaf2bbd4c21e039d948b`: preserves shorter Growth SQL budgets and settles original connections. [Operation](growth-transaction-settlement-2026-10-06.md).
- #317 merged `9d9d894f152dc41ebb18b076b706364cab03f366`: reused #31 GrowthHeldClient/worker session custody, keeping the actual session through worker commit or cleanup. Real paused-COMMIT/logout races passed. [Operation](growth-worker-custody-2026-10-06.md).
- #318 merged `3c8d6882c3b6bfa40b39ed592a14fda97f1345db`: reused #31 Measurement page/form guards with the stronger merged original-session helpers. Real outage, same-/other-account replacement, stale-session409, save/stop and sign-out passed. [Operation](growth-measurement-session-2026-10-06.md).
- #319 merged `a6d69c3a91d8bcd6eb6a2a6ab8fc19a4cf29f0b4`: reused #31 Insights/Impact/Activation/Launch session guards and Producer/LaunchKit wiring. Actual four-view outage/recovery, replacement/sign-out and missing-tuple refusals passed. Current Impact rendering and newer Inbox preserved. Populated Producer remains source-reviewed/compiled only. [Operation](growth-studio-session-2026-10-06.md).
- **#320**, branch `codex/growth-unavailable-invitation-20261006`, starts from #319 main. [Invitation correction](growth-invitation-availability-2026-10-06.md): actual missing projection caused a raw FK503. The existing insert now selects only a published/verified creator, returning existing creator_unavailable404 when absent. All21 then-open createInvite methods were byte-identical before this new fix. Two genuine browser actions returned404 in about50ms, recovered the button, left zero rows and unchanged empty clipboard. Backend types/build/lint/format passed. First implementation commit `933c83a2281b53dcff7422a848feb27d2175c808`; this checkpoint is a subsequent documentation commit, so use the actual current PR head for the gate. PR320 is attached to the chat.

Each operation has committed exact-head overlap inventories, source hashes, real receipts and screenshots under `artifacts/pr-review/2026-10-06/`. The reused #31 source is `c052ef67fa85301562b5123b682c88b931107c9a`; Studio session wiring originated in `23b8339b9e1c1c60aeeae878e7d443faec03e663`. Preserve already merged improvements when extracting later code.

## Remaining original drafts and real limits

The original36 were assessed:16 merged and20 held. Original accepted:21,22,26,28,29,35,42,48,49,51,66,201,213,279,289,298. The20 original heads remain unchanged:31,36,63,74,131,132,145,182,192,200,242,247,262,282,284,288,301,302,303,305. [Original review and per-PR holds](pr-review-2026-10-06.md), `artifacts/pr-review/2026-10-06/review.json`.

Focused306–315 already merged: Support/Ops recovery, stable Support feedback, finite Trust transaction settlement, independent report/appeal intents, #288 Team editor extraction, Team reference alignment, invitation convergence, accurate Note draft status, private Growth views, stable optional feedback retries. [Continuation](pr-review-continuation-2026-10-06.md). #315 main Foundation run37551102625 completed successfully.

Broad holds still require genuine generation/licensed input/catalogue pins, signing/media and providers, populated Growth notifications/sharing/producer/retraction, all-domain privacy export/purge and native tap-through. The saved privacy result is four domains complete/four blocked. #301 sink callbacks still lack enforceable physical cancellation/settlement; timer races are not a fix. No purpose/grant/schema was activated to claim success. Missing designs (including private error/empty and notification controls) were not invented. Local Android lacks Java and native UI control is unavailable; local Xcode26.5 differs from hosted27. Do not claim all possible app work or the whole app is complete.

Existing public Follow/referral/entry session guards also live in #31 (`features/growth/public-session.ts`, `actions.tsx`, `engagement.tsx`). No extraction of those was started. Inspect all current open/draft heads before any continuation and reuse their implementation. Positive public journeys need a genuine published creator projection, absent in this isolated runtime; do not seed one as if it were a real owner publication.

## Actual safe cleanup

At this checkpoint, actual creator Sign out completed, all six review-created IAB5 tabs closed, Fetch interception cleared, no viewport/media override. API4206 PID33714 and web3106 PID30565 were identified and stopped. Review-only Docker container `creator-pr-review-20261006` is exited. Ports3106/4206/5547 have no listener. Only review resources were stopped; unrelated applications/data were untouched. External `runtime-final-state.json` confirms cleanup.

Preserved databases `creator_pr_review` and `creator_pr_review_full`; full has61 canonical immutable executable migrations. PostgreSQL17/pgvector publishes5546 when restarted. Private mode600 files `/tmp/creator-pr-review-growth.env` and `/tmp/creator-pr-review-growth.key` remain paired with the database. Never print credentials/key, regenerate the encryption key, remove data or grant extra authority. Dedicated non-owner/non-superuser/non-BYPASSRLS Growth API login inherits only creator_runtime and growth_runtime; core remains NOINHERIT, Growth worker separate NOINHERIT.

Temporary creator verification for synthetic actor three is restored pending/version9. Two review experiment proposals remain stopped/unapproved, nine feedback rows, zero invitations/public projections/insight snapshots/recommendations/activation jobs. The earlier unsigned Note has6 revisions/0 publications. Prior Team membership/invites/Ops leases are revoked. No provider receipts, external messages, approved experiments or publications were fabricated.

## Commands and merge gate

Node PATH prefix `/Users/yingpengwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`; gh `/Users/yingpengwang/.local/bin/gh`; Docker `/Applications/Docker.app/Contents/Resources/bin/docker`.

Restart only the review container if needed. API command: `node --env-file=/tmp/creator-pr-review-growth.env --import tsx apps/backend/src/server.ts`, port4206; last log `/tmp/creator-growth-invitation-api.log`. Web uses QELVORA_API_URL/W8_API_URL=http://localhost:4206, W8_LOCAL_DEVELOPMENT=true, QELVORA_PUBLIC_ORIGIN/WEB_ORIGIN=http://localhost:3106 and `pnpm --filter @qelvora/web exec next dev --webpack -p3106`. Last web log `/tmp/creator-growth-settlement-web.log`. Production validation used separate ignored Next output directories; restore only own generated next-env.d.ts changes. Read installed Next docs before web edits and installed Turbo docs before Turbo configuration/command changes. After compaction call cua.rewriteDocumentation; closed tab bindings are stale. Browser5 is the current IAB selection, not old browser2.

For320 or subsequent focused PRs: fresh OPEN/non-draft/MERGEABLE/base-main/current reviewed head, both affected web-and-backend jobs SUCCESS and no completed head failure. Reread current rulesets/protection; prior gate was rulesets[]/main404-unprotected. Never bypass required checks. Confirm native/reference inputs unchanged; queued unchanged jobs are pending, not passed. Normal `gh pr merge N --merge --match-head-commit SHA`; no admin, force, branch deletion or workflow cancellation. Reread merged receipt, fetch main, compare its tree to operated committed source and verify original20 heads. Record main CI truthfully. Attach every created PR.

External receipts directory:
`/Users/yingpengwang/.codex/visualizations/2026/10/06/01a112f6-a84b-7a01-8832-f9999f0dd63d/`

Inspect `pr-316-*.json` through the newest `pr-320-*.json`, `pr-review-final-receipt.json`, `review-current-pr-states.json` and `runtime-final-state.json`. The final receipt is updated after the last merge so it can supersede this necessarily pre-merge committed checkpoint without creating an endless documentation PR.

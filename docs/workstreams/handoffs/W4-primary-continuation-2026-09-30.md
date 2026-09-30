# W4 primary continuation — 2026-09-30

This continuation starts from `c4275d47e4bfc74e50e2851989a3b781abd9fc6c` on `codex/w4-commerce-handoff`, in `/Users/yingpengwang/.codex/worktrees/fa22/creator-platform`. The chat's initial detached-main checkout was left intact. All nine packages and original R01–R15 remain required; this record does not replace the original acceptance matrix.

The 42-file Studio integration and three-file pass/import manifests match pinned source `a16558c`. The historical ten-file Approval manifest matches its original `6873f09` exactly; four subsequent differences at `a16558c` are dated implementation changes, not checkpoint corruption. Fetched main remains `2e337a1`. The untracked prior `W4-resource-release-2026-09-30.json` is preserved separately and was not authored by this continuation.

## Implemented corrections

- Pass allowance reservations and settlement now read SQL calendar dates as text. The installed `pg` DATE parser returns two different JavaScript `Date` objects for the same cycle, so the former identity comparison skipped shared-counter settlement. Text comparison preserves same-cycle settlement and the prior-cycle fence. No counters, records or migration bytes were rewritten.
- `PassRoster.available(client, creatorId, fanId)` is required for current W2 AI/license and W8 denial truth. Published IDs and verification alone cannot enable choices, initial selection, next-cycle drafts or replacement. Missing current availability leaves the pass unavailable. The producer must use the held transaction without provider I/O.
- `createCommerceAudience(database, groups?)` exposes `current(scope)` and `currentInTransaction(scope, client)`, also returned as `createCommerceRuntime(...).audiences`. Current paid membership/grant rows are share-locked through W3's sentence insertion. Tier IDs remain domain tier IDs. A configured `GroupAudienceReader(scope, client)` must hold current group-rights/denial locks in that transaction; absent groups contribute no group IDs.
- Narrowly consumed W2's published `489bbe9` thread-before-idempotency repair in `Database.withThread`. The thread lock is taken before retry-key locks, avoiding a SHARE-to-UPDATE upgrade deadlock. Current W4 authority checks and later source were preserved.

## Personally performed supporting verification

Backend build and changed-source ESLint passed. Full `pnpm check` passed: generated consistency, all seven workspace typechecks, repository lint/format, the two existing shared-resource tests, all 18 existing backend tests, and production backend/Next builds. The existing PostgreSQL cases ran against only disposable `creator-platform-w4-ci-20260930`, database `creator_foundation_test`, loopback55445; no cases/assertions/goldens were added or weakened. The separate initial backend run passed18/18 in109.77s, including10,000 isolation pairs in107.06s. Full-check log: `/private/tmp/creator-w4-primary-check-20260930.log`.

The retained W4 app database was started only after exact container/mount/port ownership inspection: `creator-platform-w4-resume-20260930`, loopback55444, `creator_w4`. Read-only diagnostics find zero passes and zero commerce allowance reservations. SQL date comparisons return true for equal cycles and false for September versus October; the transaction rolls back. This is parser/SQL evidence, not a real paid-cycle race or provider outcome. API4104/web3004 and the old private configuration were absent at resumption. No provider/OpenAI key was loaded or provider request made. Native interaction remains unverified.

PR5 metadata was updated through the existing authenticated local GitHub CLI after the connector again returned403. PR remains draft and unmerged. At documentation head `c4275d4`, Trust passed; Foundation web/backend and Android runtime passed, while web visual/iOS foundation/Android foundation remained queued at inspection. These dated checks do not verify new source or paid release acceptance.

## Pending inputs saved for founder review

The founder asked to keep working and take notes while checking the inputs. No values below have been inferred or enabled.

| Decision | Exact unresolved input | Dependent acceptance |
| --- | --- | --- |
| Q03 | Approved Stripe/Connect collection/transfer topology, countries, processing/platform fees, taxes, reserves, refund/chargeback responsibility | Genuine card/Billing/Connect cash, current-money allocation, payouts and compensation |
| Q04 | Reviewed native distribution for asynchronous paid written/voice replies | Enabled native paid reply checkout |
| Q08 | Approved currencies/catalog/products/amounts/capabilities, model cost weighting/ceilings, trial budget, pass amount/slots/roster/calendar proration/net pool, public discount and noncash credit rules | Actual cost settlement, pass checkout/pool, spending/catalog/provider journeys |
| Q10 | Approved sandbox/store projects and product IDs, secure credential file paths, genuine verified creator/current passkey, provider guardrails | Genuine signing, payment/store/AI acceptance; secrets stay out of chat/Git |
| Q16 | Retention/deletion exceptions, external subscription consequences and reviewed termination/refund behavior | Erasure/job completion and departure refunds |

## Active contract and custody work

Founder peer-coordination authorization was verified in actual W2 user message `01a0f49b-f523-7081-b17c-67394c15a2bf` and W3 user message `01a0f49f-d743-7361-89b4-154f4892c63d`, not inferred from incoming agent requests. Published contracts were discussed with W2/W3/W5/W6/W8; implementation remains personal and no peer checkout/database is mutated.

W8 additive custody was requested for existing `commerce/schema-approval.sql`, W5 `content/schema-reply-review.sql`, and proposed weighted-settlement fields. No new ID or applied SQL is guessed. Local history still has28 migrations through0031; inspected W8 has40 through0043. Studio/Approval default activation remains off.

W2 confirmed `PipelineResult.usage[]` is not a trusted per-generation receipt: current journals have per-call IDs but lack generation/attempt attribution. R04 still needs immutable cost-policy/ceiling binding, a W2-owned attributed terminal receipt, actual bounded partial/cancelled settlement, separate W3-delivery first-use and durable unknown holds. Unknown usage cannot become zero cost or release/refund. A callback interface or green build cannot substitute for that journal.

W5 requested a canonical same-transaction content audience/continuous-tenure projection; membership-based groups must retain actual current paid/grant authority. W6's genuine both-absent call cannot be relabeled as creator/fan no-show; current C07 has no such discriminator or approved monetary policy. Initial signed packet acceptance/capture remains separate from subsequently signed times for an already-captured commitment. Unreviewed cancellation/both-absent economics remain resolution work.

Original R01–R15 implementation/provider/native/design/a11y/performance work remains open as detailed in the full handoff. No package is marked fully accepted or release-ready by these supporting checks.

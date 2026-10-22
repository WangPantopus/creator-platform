# Current state

Updated 2026-10-22 during the founder-authorized app-completion work. This is a
local implementation checkpoint, not launch acceptance. Earlier lane notes and
pull request maps are historical unless reverified here. Decisions come from the
founder in chat, not from this file.

## Current integration

The app branch is `codex/app-completion-2026-10-22`, based on `origin/main` at
`b154252e3806ba86aea06c1b7ad9dfb23acd9008`. The AI engine work is being qualified
on `codex/engine-qualification-2026-10-22`, carrying
`origin/lane-3/merge-wave-2026-10-16` plus current main and integration fixes.
GitHub PR #511 was still open and unmerged when checked this session; the older
lane 3 claim that its wave was already on main was incorrect.

The founder requested continued building and explicitly permitted parallel work.
Three isolated tasks handled commerce, native sign-in and Studio/AI verification.
No production deployment, provider purchase or merge to main has occurred.

**Hosting stays undecided**, as the founder explicitly requested. The
[hosting options](../lanes/status/lane-2-hosting-options.md) contain current
planning estimates, not an infrastructure choice.

## Implemented and operated

- Public sign-in contracts now expose Qelvora mode, enabled providers, web/native
  start/completion and age confirmation. Generated web/iOS/Android clients share
  those contracts. Creator onboarding returns directly to Studio setup.
- iOS Apple and Android Google sign-in run through backend nonce validation,
  age confirmation and secure session restoration. Birth dates and provider
  continuations stay in memory. Late or mismatched returned sessions receive
  bounded cleanup. See [native sign-in evidence](native-sign-in-2026-10-22.md).
- The stock development host composes commerce recovery with the canonical
  service and identity adapter, plus signed raw Stripe notification ingress.
  Expired requests release holds; overdue accepted commitments refund. Optional
  inbox credentials are restricted to the reviewed separate role.
  See [commerce evidence](commerce-host-completion-2026-10-22.md).
- Studio opens on Today. Note composition preserves paragraphs and direction,
  names the member audience, and retains Today navigation while composing.
- The AI wave adds bounded cost holds, refusal-path safety, wake-on-accept,
  streaming/reconnect improvements, FAQ-based publication and retrieval/citation
  improvements. Integration fixes round each billed call conservatively, retain
  known-zero cost until a provider call actually starts, drain wake connections,
  preserve incomplete FAQ drafts and prevent stale memory prompts from returning.
- Migration 0252 registers the unchanged workspace-lock proposal. Four bounded
  locks wait instead of immediately failing during concurrent workspace reads.
  Exact owner/source/definition checks remain in place. Fresh and restored
  qualification is in [workspace-lock evidence](workspace-lock-qualification-2026-10-22.md).

## Verification observed this session

| Area | Result and limit |
| --- | --- |
| Main app changes | Typecheck 7/7, lint, generated-contract check, backend build and web production build passed before AI integration |
| Existing backend regressions | 157/157 passed on both the app baseline and the 120-migration qualification environment |
| Identity web flows | E1.1 40/40, E1.2 28/28, sign-in 19/19, passkey 8/8; typed client HTTP checks passed |
| Studio | E6.1 26 Light/Night captures, Note 10/10, Today 10/10 |
| Native sign-in | iOS build and real-stack UI journey 1/1; Android build, existing contract tests 2/2, and five operated real-stack checkpoints passed |
| Commerce stock host | Eight workflow steps and nine invariant checks passed; signed duplicate webhook deduplicated; invalid/stale/wrong-account events and four invalid startup configurations refused |
| Database upgrade | Fresh 120-source install, separate canonical-61 bootstrap, independently restored 119 → 120 operator qualification with original data/security preserved |
| Catalogue checks | Fresh/restored without Growth 45/45; with Growth 44/45, solely the known single family-pin diagnostic; accepted runtime family profiles match |
| AI replies | Full-host smoke 14/14; five repeated short/maximum-length replies complete under unchanged $5 cap with Growth running; three adversarial cost-rounding checks pass |

These are synthetic local journeys. External identity, Stripe and model providers
were fakes. They do not establish production operation, real-model quality,
physical-device acceptance or real-provider cancellation/revocation behavior.
The full combined-tree gates and final runtime results are recorded in the linked
qualification reports as they complete.

## Work still required

- **Native:** iOS Google credential adapter, native platform age signals,
  configured provider sheets and device/store acceptance. Store accounts,
  provisioning, domain associations and push credentials are still needed.
- **Privacy:** whole-account deletion remains incomplete across conversation,
  commerce and content. Retention and redaction decisions and complete owner
  adapters are required. Existing preserved deletion clocks must not be advanced.
- **AI:** memory-writer and context-exclusion SQL proposals remain unregistered
  and inactive. Their full source/custody/privacy upgrade qualification and real
  UI workflows remain. Real-model safety, grounding and latency need the
  founder's capped gateway; embeddings need a provider decision.
- **Commerce and reach:** inbox claimant registration and background recipient
  authority for request notices remain unfinished. This host does not invent
  recipient authority to publish those notices. Real Stripe test acceptance is
  still needed.
- **Production:** the production host still fails closed where its real adapters
  are absent. Hosting, region, account, domain and budget remain undecided;
  production secrets, backups/restore drills and deployment acceptance follow.
- **Pilot:** real iPhone/Android journeys, accessibility and notification/link
  acceptance, creator onboarding and pilot quality gates still need completion.

## Continuation rules

Use the current worktree and preserve concurrent edits. New migrations require
exact source registration, regenerated reviewed profiles, fresh and independently
restored qualification, and actual export/delete operation. Do not rewrite
applied SQL, publication fingerprints, unknown costs, consent or preserved data.
Only task-owned disposable databases and devices may be reset or stopped. New
unit tests are not part of this project workflow; operate real entry points and
run the relevant existing suites.

The founder's current authorization permits parallel work and routine local
implementation. It does not choose policy, authorize purchases or supply missing
provider credentials. No real secret belongs in a report or commit.

## History

The [October 15 handoff](integrator-handoff-2026-10-15.md),
[launch plan](../LAUNCH_PLAN.md), [finish plan](product-finish-plan-2026-10-08.md)
and [lane status notes](../lanes/status/) preserve scope and earlier evidence.
The original deletion maturity remains 2026-10-30 08:48:22.966 UTC. Development
comparison authority and reply-feedback policy expire on 2026-11-01; renewing
those policies requires their actual authority, not a clock change.

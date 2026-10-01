# W8 resume prompt — complete the workstream

Updated 2026-10-01, America/Los_Angeles. This is the current assignment. It supersedes older continuation pauses, draft-only dispositions, and blanket test/fixture freezes in W8 records. The original product scope and historical evidence remain intact. The [handoff snapshot](../../../artifacts/workstreams/W8/handoff/20261001/snapshot.json) records the exact observed repository, recovery and PR state; refresh changing facts when starting.

## Mission and latest human direction

Take ownership of **W8: trust operations, reliability and release** in `WangPantopus/creator-platform`. Finish the entire original workstream, R1–R10, applicable approved opportunities and integrated G0–G5 demonstrations. Build an exceptional, polished, reliable app across web, native Android and native iOS. Do the implementation, integration, debugging, recovery and acceptance; do not stop at a plan, scaffolding, a checklist or a draft PR.

The human's latest direction is: **there are no artificial restrictions or holdbacks on completing the work. The testing restriction is that we do not need to write unit tests; coverage may be restricted. We do need to launch and test the web app, Android app in an emulator and iOS app in a simulator end to end. Create PRs when ready and merge them when ready, not just drafts.**

Apply that direction now:

- Do not write new unit tests or pursue coverage targets. Scope or reduce coverage work as appropriate. Existing tests may be maintained, and useful integration/E2E tooling may be used; the older blanket ban on every kind of test code and per-fixture permission process no longer govern this continuation. Do not alter product behavior or misreport a result just to obtain a green check.
- Personally launch and operate the actual apps and verify persisted outcomes. Builds, unit results and coverage numbers are supporting information, not end-to-end acceptance.
- Proceed with ordinary implementation, integration, tool/dependency setup, isolated resource recovery, builds, app launches, fixes, commits, pushes, PR creation and normal merges without asking again whether to continue. The earlier cleanup pause is not a reason to refuse the next explicitly started implementation session. This document itself was prepared without starting heavy runtimes.
- Replace administrative pauses with concrete work. Missing credentials, physical devices or policy decisions are specific dependencies to resolve, not reasons to shelve unrelated features. Prepare the dependent implementation and ask only for the exact unavailable input. Do not fabricate a credential, consent, real provider receipt or measurement.
- Own W8's implementation and actual acceptance. Consume peer source and evidence with attribution, preserving their current changes. The ambition is the whole product; source integrity, privacy, identity and truthful evidence are part of that product's quality.

## Start from the real current work

At this handoff's inspection, main was `c1c615e6ece53bff4bc6a47d7f4d332757df1295`. Fetch current main; do not assume this remains the tip.

**The existing W8 continuation to finish first is PR17:**
https://github.com/WangPantopus/creator-platform/pull/17

- Branch: `codex/w8-post-cleanup-recovery`.
- Observed head: `bc809085e22d997cf868071c5cedab2992187005`.
- Checkout: `/Users/yingpengwang/.codex/worktrees/f25f/creator-platform`.
- It was open/draft. It implements restored-database traffic closure, paused-worker role checking, and disabled privacy submission when verification is unavailable.
- Read its entire diff, actual recovery/browser evidence and current checks; reconcile current main, finish affected acceptance, mark ready and merge when ready. Do not duplicate or abandon this implementation just because it is a draft. Preserve this updated handoff authority when resolving its older documentation changes.
- Evidence/procedure in that branch: `artifacts/workstreams/W8/recovery/20261001/{README.md,receipt.json}` and `docs/operations/W8-post-cleanup-recovery.md`. These are not necessarily present on main until PR17 merges; read them directly from the published branch when needed.

The historical W8 implementation/evidence checkout is `/Users/yingpengwang/.codex/worktrees/28ed/creator-platform`, branch `codex/w8-trust-handoff`, last clean/pushed checkpoint `b77ad263ac5fd63ab48766c9659363328d57fdcb`. Preserve it. Its product work was merged through PR7 and PR15; its later branch-only changes include postmerge evidence. It is not the latest combined product tree. The old detached `99fa` checkout is not an implementation starting point.

Completed earlier merges include PR7 (`7052159`), PR15 (`ad369bd`), PR8 (`ebb24c7`), PR9 (`ad56fc7`) and PR2 (`2f0319d`). Do not recreate them. Later work has produced many new PRs; the previous “zero open PRs” observation is historical. Refresh the queue, identify W8 dependencies, and finish ready increments through merge. Relevant observed dependencies include W3 PR36 and W2 PR40; check their current heads and status instead of assuming completion.

Inspect checkout status and active ownership before writing. Reuse an appropriate W8 checkout or create an isolated continuation from current source if necessary. Reconcile without discarding source, private recovery material or other owners' work. Do not broadly reset, clean or force-push shared history.

## Read the full assignment and sources

Read applicable `AGENTS.md` and `CLAUDE.md`, then:

1. This prompt, `docs/workstreams/handoffs/W8.md`, current `docs/workstreams/status/W8.md`, `docs/workstreams/coordination/W8-contracts.md`, `W8-next-allocations.md`, the current PR17 records, and `artifacts/workstreams/W8/takeover/20260930/README.md`. Read postmerge receipts from the historical W8 branch where not merged.
2. `docs/workstreams/W8-trust-release.md` and `docs/workstreams/prompts/W8-trust-release.md`: all ten original packages, exact artboards, demonstrations and delivery standard. The latest human direction above supersedes their older execution restrictions.
3. `docs/operations/W8-{runbook,security,release,pilot,required-inputs,privacy-streaming,migration-adoption}.md`, PR17's post-cleanup recovery procedure, and their linked implementation and operator evidence.
4. `docs/workstreams/{README,STANDARDS,CONTRACTS,VERIFICATION,COVERAGE,DECISIONS,OPPORTUNITIES}.md`, current W1–W7 contracts/status and merged source. Research inventories are historical; inspect actual code before repeating missing-source claims.
5. `docs/{BRIEF,BUILD_PROMPT,NAMING,DESIGN_PLAN}.md`, `docs/audit/AUDIT.md`, relevant implementation/build records, and all four behavioral sources in `docs/source/`: Product_Design_Flows_Screens_and_Copy.md, Domain_Model_and_Behavioral_Contract.md, System_Architecture.md, Second_Review_Strategy_Behavior_and_Additions.md.
6. `design/handoff/README.md`, tokens, component contracts/guidelines, design-system documentation, applicable phase-4/phase-5 references and all five source prototypes. Read installed Next.js/Turborepo documentation before changing their configuration or commands.

The stack remains TypeScript/Node, Next.js, Swift/SwiftUI and Kotlin/Compose. Preserve canonical Pantopus account/session/eligibility authority and current participant checks. Keep Qelvora replaceable through `config/brand.json` and generated resources. Match exact source identity labels, copy, layout and accessibility: OpsQueue4H-01/OpsCase4H-02 are1280×900 with220 sidebar; Studio248 is distinct; phone390 uses16-unit gutters. BUILD_PROMPT §9 corrections and Light/Night apply.

## Recovery and durable state

Two cleanup rounds removed historical and regenerated resources. Inventory actual processes, tools, devices, volumes and backups; old names/PIDs are not proof of survival. At handoff verification, W8 ports3008/4108/55438 had no listeners. No heavy runtime was started to prepare this handoff.

Private locations that were verified present:

- `/Users/yingpengwang/.config/creator-platform/cleanup-20261001/manifest.json`
- `/Users/yingpengwang/.config/creator-platform/w8-local` and its `runtime.env`
- `/Users/yingpengwang/.config/creator-platform/recovery-20261001-active`, its `runtime.env`, `preserved` snapshot and `post-recovery-runtime.dump`

Original W8 runtime archive:
`/Users/yingpengwang/.config/creator-platform/cleanup-20261001/creator-platform-w8-resume-20260930.sql.gz`

SHA256: `fe09be665339e7333ee7afec6fbe7f2c48e9e96a53ad99ffc3cb4ab4c2581f71`;533459 bytes.

Foundation archive:
`/Users/yingpengwang/.config/creator-platform/cleanup-20261001/creator-platform-w8-foundation-20260930-takeover.sql.gz`

SHA256: `037c1b4d22be29fb7919b7e311e3c4ec029051c591bc81731a784551eb3d0ef4`;212725 bytes.

Both hashes and gzip readability were reverified for this handoff. These are plain cluster `pg_dumpall` SQL compressed with gzip, including roles and multiple databases, not custom-format `pg_restore` inputs. Inspect privately and restore only the needed complete sections into a fresh isolated PostgreSQL17/pgvector cluster using the documented procedure. Do not feed a cluster dump into a shared database. The newer553088-byte `post-recovery-runtime.dump` is custom format; PR17 records a successful independent restoration. Preserve all originals and verify the chosen backup before use.

PR17's published evidence reports all210 runtime rows/146 tables and325 Foundation adoption rows/148 tables preserved;40 canonical checksums; four cases, one block, one tombstone and three blocked privacy jobs;24 tasks with13 complete/11 blocked. Its older-backup/newer-journal and repeat replay remain closed with eight pending domains. It records a database closure marker surviving omitted environment flags and stopped services afterward. This handoff inspected that evidence, but did not rerun the restoration or independently establish whether its later Docker volume survives the second cleanup.

Recover existing data instead of reseeding. Preserve jobs, cases, denials, original receipts, ownership snapshots, timestamps and ciphertext. Keep null ownership distinct from verified empty `[]`. Application connections remain non-owner/non-bypass. Closed restoration is a correctness requirement until real tombstone/domain reconciliation permits reopening, not an administrative hold on implementing the required reconciliation.

The original Growth encryption key remains unavailable; do not silently replace it or claim old ciphertext was decrypted. Resolve recoverable inputs and keep independent privacy work moving.

W2 additionally reported that a later cleanup removed its newer live state before a complete backup. Its retained123-source/105-version/20-evaluation/658-usage archive does not include the later125/105/25/939 state. Treat this as owner-reported recovery loss, inspect actual retained evidence, and never claim the older archive restores the later state.

Use lightweight, isolated resources and run heavy native builds sensibly. Stop idle owned processes when finished. Before deleting any database volume or private state, preserve a fresh complete backup and verify its recovery value; do not repeat cleanup data loss. Recreate fresh simulator/emulator identities where old devices were deleted.

## Migration and integration work to finish

At the observed main, the active registry still has40 migrations;0044–0060 remain reserved proposals, alongside historical0005/0009. Reservation is not activation. Complete review, additive rollout and real acceptance rather than leaving proposals indefinitely blocked. Keep already applied SQL/checksums immutable and preserve current RLS/grants and canonical authority.

- **W5 adoption is already delivered in PR15.** Read `W8-migration-adoption.md`. It is an exact35-row historical profile, not a general recovery tool. W8 proved it on closed restored copies; W5 subsequently adopted its original database before PR9. Do not replay completed adoption or apply this profile to W3/W2/W8 databases.
- **W3 needs a distinct adoption solution.** Its archived127-table database has28 matching canonical ledger rows through0031, but conversation/wellbeing schema was installed without0041/0042 ledger custody. Do not infer safe replay from the ledger prefix. Published packet `23c74a29345f41a81ec08814da7caf49b38ed9cc` and PR36 contain the read-only restored catalog and consumer requirements. Compare schema/functions/policies/owners/grants/data against immutable source; implement and verify a W3-specific recovery/adoption path that preserves historical rows without inventing original application timestamps.
- **W2 recovery differs.** Its archived28 ledger rows match the first28 canonical entries. W2 reports upgrading only the remaining12 active migrations and reconstructing missing ACLs from a fresh canonical40 reference. Review current receipts. Include default privileges, role attributes/memberships, function/column/sequence/PUBLIC privileges, owners and forced RLS; the current W8 `schemaCustody` helper alone does not cover every privilege category.
- **0048 usage lineage** is still `reserved_unapplied`, SHA256 `16dddc80bebe32979f822104d8f411e0f545b4e212da6dc147c72f959e660f17`. Installing it changes privacy readiness: existing hooks detect accounting and refuse incomplete lifecycle processing. Complete actual account/thread export/delete/expiry registration, reviewed retention/financial custody and exact schema/checksum/pool verification before enabling its dependent paths. A generation-off flag alone does not isolate a schema rollout.
- **Signing/lineage/recording:**0044 personal Approval,0056/0057 lineage/consent,0058/0059 corrections/recordings and0060 composition must preserve the stricter original personal-Approval and current creator/key/version predicates.0060 has closed-clone compilation evidence, not complete activation. Finish ordered fresh/upgrade, non-owner, genuine signing/consumption and privacy/purge acceptance.
- **Missing producer contracts:** complete purpose-authorized generation discovery after process restart and approved offline-content authority/expiry. Interactive request scopes, cursor metadata and timers are not substitutes for durable worker authorization.
- **W2 Trust/export composition:** authority interfaces exist, but inspected default hosts do not configure full notice/settlement/protected-store/journal privacy readiness. Implement real host registration and demonstrate it; callback existence and a successful Studio preview do not complete C10.

## Finish R1–R10 without reducing scope

1. **R1 — Integration and authority.** Recover the correct source/data, finish PR17 and current-main integration, establish a source/contract/acceptance matrix, verify canonical session/fresh-auth/participant boundaries and valid/invalid arrivals. Complete current owner integrations and G0–G5 demonstrations.
2. **R2 — Runtime denial.** Verify≤5s denial during actual in-flight generation/context/reconnect/pause/license revocation/deletion, including stale authority and restored traffic. Preserve permitted history, receipts, support and privacy progress; keep current signed-subject and participant checks.
3. **R3 — Operations and durable effects.** Complete verification review, safety/commercial queues, scoped cases/evidence, disputes/refunds, suspension/pause/revocation, reasoned decisions, appeals and recipient-only notices with real W1/W2/W4/W7 receipts. Exercise purpose expiry, role revocation, stale versions, independent appeal and original-effect retry. A success toast cannot establish money or fulfillment.
4. **R4 — Complete C10.** Finish all eight domain export/erasure contributions, content purpose/retention/source-revoke, account closure, licensed departure and representative messages/memory/source/vector/cache/media/insights/notifications. Verify bounded large/binary streams, hashes, fresh reauth, browser/native system save, retries/restarts/lease fencing/timeout-after-success, post-erasure progress and restored-backup re-purge/reopen. Preserve packet/ledger exceptions and distinguish billing cancellation from account deletion.
5. **R5 — Safety/support.** Verify grant-free per-AI Report on all three clients, request/payment/account support, block semantics, real referral callback and anonymous stable deduplication. Complete reviewed regional contacts, staffed escalation, response ownership, abuse/heavy-use handling and legal/annual-report procedures. Resolve real operating inputs without inventing staffed service.
6. **R6 — Clients/design/accessibility.** Finish functional Ops/support/privacy/access/feedback/status and authenticated native flows, two actors, actual permission/share/save sheets,1280/390 Light/Night and every relevant loading/empty/offline/reconnect/duplicate/stale/expired/return/account-switch state. Verify keyboard/focus, safe areas,200% text, reduced motion, VoiceOver/TalkBack and authorship comprehension. Fix differences and retake actual evidence.
7. **R7 — Deployment/security.** Deliver reproducible same-revision isolated staging and real reviewed identity/domain/provider adapters, separate credentials/projects/pools/queues, private storage/CDN/TLS, pinned builds/actions, SBOM/signing, rotation/WAL/cost/circuits/drain/rollout/rollback. Exercise auth/passkeys, RLS/isolation, prompt injection, ingestion/SSRF, media URLs, XSS/CSRF/CORS, sockets, webhook signature/replay, quotas and break-glass in the actual environment.
8. **R8 — Observability/incidents.** Complete C12 client→acceptance→generation→visible→settlement correlation, frame/socket/backpressure/pool/queue/money/refund/call/license/privacy/notice/provider-cost/WAL signals. Use redacted bounded labels, actionable dashboards/thresholds, named responders and exercised alerts/status incidents. Server send callbacks are not client-visible completion receipts.
9. **R9 — Capacity/recovery.** Measure progressive realistic warm/cold p95/p99, errors, resource/leak/event-loop/socket/worker fairness and cost under named device/network/load/provider conditions. Exercise process/provider/DB outages, duplicates, missed scheduler/webhook and external-success recovery. Prove backup/WAL/newer-journal/all-domain receipts/reopen and measured RPO/RTO. Targets:99.9% availability; accepted p95≤300ms; first-approved p95≤2.5s warm/4s cold; takeover p95≤500ms; denial≤5s; RPO≤5min/RTO≤1h. Report misses and fix them rather than relabeling targets as achieved.
10. **R10 — Release/pilot.** Complete all five source prototypes, browser compatibility, signed native distribution/privacy declarations, physical passkey/push/call/background/Bluetooth/audio/store-sandbox purchase/restore evidence, review accounts and functional help/support/privacy/deletion/terms. Finish consented recruiting/onboarding/feedback, approved Q12 comprehension/usefulness bars, accountable triage/fixes/reopens and staged rollout/rollback. Continue later-stage features and applicable opportunities; ask for concrete unavailable distribution/provider/physical/policy inputs when needed.

## Actual-app proof and completion

Earlier W8 proof includes the canonical grant-free Report click with exact creator/message IDs, durable resolved CASE-004 and own notice, account-switch/session revocation fixes, selected Ops/privacy Light/Night/keyboard states, actual corrected socket drain/reconnect, bounded storage-only transfer and final existing iOS2/2 and Android4/4 on-device flows. Read their exact revisions and limitations. These do not establish current-main authenticated native privacy, full C10, provider, hardware or complete design acceptance. PR17 adds real restoration and browser-denial evidence, not whole-product completion.

For every meaningful increment, personally build/install/launch the affected web/iOS/Android apps against the actual backend and verify happy paths plus denied-role, invalid, stale, offline/reconnect, duplicate, failure/restart and return states. Inspect durable API/database/provider outcomes when needed. Use actual configured sandboxes/providers for their claims; distinguish local, simulator, physical and store-sandbox evidence. Fix observed issues and rerun the affected journey.

Keep exact revision/build/environment/role/device/OS/viewport/theme/provider/steps/results/CIDs/receipts/measurements/limitations under `artifacts/workstreams/W8/`. Maintain current status/contracts/runbooks and source coverage. Keep secrets, raw exports/database records and private journals outside Git/output.

The known approved OpenAI file is `/Users/yingpengwang/.config/creator-platform/secrets/openai.env`; use `OPENAI_API_KEY` server-side only when genuinely needed, never print/commit or expose it to clients. This historical W8 session used zero paid calls; peers' later provider work is separate. Resolve missing provider/licensing/retention inputs with actual evidence and avoid wasteful calls.

Commit and push coherent increments. Open focused, ready-for-review PRs when implementation is ready; use a draft only temporarily while a real acceptance item remains unfinished. Actively finish that item. Once actual affected-app acceptance, review and applicable required checks are satisfied, mark ready and merge normally without another generic permission question. Do not stop at drafting, leave ready PRs sitting, bypass required checks, or report queued/cancelled jobs as passed. Do not wait for unrelated future capabilities to finish before merging a safe verified increment.

Finish all feasible remaining work. Distinguish implemented, runnable, integrated, personally verified and release-ready. Whole-workstream completion requires the actual source-mapped scope and demonstrated release criteria, not merged code alone. If an external dependency truly remains, state its exact owner/input, affected capability, work already completed and acceptance needed, while continuing independent work.

Begin now: inspect current main and PR17, recover only the resources needed, finish the existing recovery increment through merge, then continue the complete W8 backlog.

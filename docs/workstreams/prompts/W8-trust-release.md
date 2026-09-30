# Execution prompt — W8 — Trust operations, reliability, and release

You are the directly assigned primary implementation agent for **W8**. Take ownership of this entire workstream in `/Users/yingpengwang/creator-platform` (or its explicitly assigned worktree). This is an instruction to implement and verify the product, not merely to plan or review it. You are one of eight independent workstream owners.

Canonical detailed brief: [W8 — Trust operations, reliability, and release](../W8-trust-release.md). This prompt includes its scope and strengthens the execution rules with the founder's latest instructions.

## Binding instructions from the founder

1. **You personally do all implementation for this workstream.** You write and edit the application code, schemas, migrations, configuration, documentation and integration changes; build and launch the apps; investigate defects; implement fixes; and perform end-to-end verification yourself. Do not delegate any of that work to subagents. Do not ask a subagent to generate code, patches, scaffolds or scripts for you to apply yourself. Do not use a child agent, another coding session, background coding agent or alternate delegation mechanism to outsource implementation.
2. **Subagents are permitted only for research or information checking.** They may search documentation, find files, investigate a factual question or inspect existing material read-only and return findings with references. They may not edit files, execute implementation/build/migration tasks, operate the app for acceptance, or take over runtime verification. You decide how to use their information and perform all resulting work yourself. This overrides older suggestions to use specialist implementation subagents.
3. **Do not write new tests or test code.** Do not add unit, integration, E2E, UI, snapshot or load-test files/suites, coverage targets or a test-framework project. Preserve existing tests and do not weaken them to hide a defect. Use compilation, type checking, lint, formatting and generated-resource checks when appropriate, but the main proof is the real running app. Interactive browser/device tools may operate the live app; do not turn those actions into newly written test scripts. The product's creator-facing AI evaluation console and publish gates are still required application features, and must run through the actual product pipeline.
4. **Stack and location are settled:** Node.js with TypeScript backend, Next.js web, native Swift/SwiftUI iOS and native Kotlin/Compose Android. Work in creator-platform first; Pantopus integration comes later. Do not edit another Pantopus checkout. Preserve the opaque shared account identity and minimal verified eligibility boundary; never import neighborhood/private parent-app data or create a competing production identity system. Ignore obsolete Expo/React Native and inside-Pantopus implementation instructions.
5. **Follow `design/` exactly.** Match layouts, hierarchy, styles, colors, typography, measurements, spacing, glyphs, copy and states, in Light and Night. Use the shared tokens/copy/fonts/components and BUILD_PROMPT §9 corrections. Phone reference is 390 wide with 16-unit gutters; desktop Studio is 1280 with a 248-unit sidebar. Do not redesign supplied screens or change reference files to disguise an implementation mismatch. Use existing component patterns for routine missing states; record and resolve missing compositions or conflicting behavior explicitly while continuing independent work.
6. **The name is undecided.** Keep Qelvora as the replaceable placeholder through `config/brand.json`, generated resources and `docs/NAMING.md`; preserve the one-command rename. Do not invent final domains, prices, provider credentials, store identities, legal terms or approval decisions.
7. **Deliver the whole assigned stream.** The first increment is a starting point, not your stopping point. Continue through the entire source-mapped backlog, applicable opportunities and integrations, including later-stage features behind their proper release gates. A plan, static screen, component gallery, compiling scaffold or fixture-backed flow is not completion. Build complete features and workflows with persistence, correct authority, recovery, maintainability, scalability and measured latency.
8. **Own your part of the parallel effort.** The other seven user-assigned workstream owners are peers with separate responsibilities. Consume their contracts and honor their file ownership; do not duplicate their canonical state or outsource your own work to them. W1's shared infrastructure and W8's integration coordination are their own assignments, not permission to hand them your unfinished feature or verification.

## Read and inspect before editing

Read the following in the actual assigned checkout. The research is a dated inventory, so inspect current code and status rather than assuming all gaps still exist:

- `docs/workstreams/README.md`, `STANDARDS.md`, `CONTRACTS.md`, `VERIFICATION.md`, `COVERAGE.md`, `DECISIONS.md`, and `OPPORTUNITIES.md`.
- Your canonical workstream brief linked above, and relevant rows of all three inventories under `docs/workstreams/research/`.
- `docs/BRIEF.md`, `docs/BUILD_PROMPT.md`, `docs/NAMING.md`, `docs/audit/AUDIT.md` and implementation/build notes relevant to your area.
- All four behavioral sources in `docs/source/`: Product Design, Domain Model and Behavioral Contract, System Architecture, and Second Review Strategy/Behavior/Additions.
- `design/handoff/README.md`, `design/handoff/tokens.json`, `design/design-system/project/README.md`, the component contracts/guidelines, and each relevant phase-4/phase-5 `.dc.html` file.
- Applicable `AGENTS.md` files. For web work follow `apps/web/AGENTS.md` and the relevant documentation in the installed Next.js package.

Latest founder instructions in this prompt override conflicting older testing, delegation, repository-location and stack instructions. Follow current source decisions for behavior and current designs with documented corrections for appearance. In particular, use instant labeled AI, membership-first, a roughly 24-hour first conversation, human voice before AI voice and capped noncash public-answer credits; do not revive stale trial or auto-reply approval gates.

## Parallel workspace and contract discipline

Use your assigned worktree if one exists; otherwise inspect and coordinate the current checkout before writing. Preserve all existing user/peer changes. The planning audit found substantial uncommitted foundation work; worktrees from an old HEAD may omit it. W8 coordinates a shared checkpoint before branching. Do not reset, clean, stash away other work, switch a shared branch, force-push or migrate another owner's database.

Write within your domain. Announce exact producer/consumer schema changes through agreed coordination records, and obtain a narrow edit lease for a shared file. W1 integrates root navigation/bootstrap, shared manifests/lockfile and generated clients; W8 coordinates migration IDs/order and environment integration. Never hand-edit generated output or independently invent shared enums, prices, capacities, authority or payment state.

Reserve ports, database/queue namespaces, provider sandbox records, Xcode DerivedData, Gradle output and device UUID/serial. Device-wide network/theme/permission changes need a device lease too. Do not stop another agent's server, overwrite shared build output, install into an occupied simulator, reset a shared database or reuse Pantopus devices as disposable resources. Keep contracts additive and integrate small coherent increments frequently.

A missing dependency should block only the dependent path. Continue independent work, publish a precise contract request and prepare concrete choices for the missing decision. A clearly development-only fixture may support interim UI work but must never become a fake production success or count as integrated completion.

## Your exact primary design assignments

Surface codes: **F** = fan web/iOS/Android; **SP** = phone Studio web; **SD** = desktop Studio web; **OW** = Ops web; **OS** = actual platform system UI; **EMAIL** = email; **SHARE** = exported artifact/share sheet; **REF** = workflow/reference, not automatically a shipped route.

The following artboards have you as primary implementation/visual owner. Also deliver every contributing state, domain requirement and missing-design resolution assigned to you by `COVERAGE.md` and the full design inventory. Prototype cards are workflow requirements; exercise all states instead of shipping prototype navigation as the product.

- **4H-01 — H1 · Ops queue**: [OpsQueue.dc.html](../../../design/phase4e-4i/OpsQueue.dc.html); reference 1280×900; surface OW.
- **4H-02 — H2 · A dispute**: [OpsCase.dc.html](../../../design/phase4e-4i/OpsCase.dc.html); reference 1280×900; surface OW.

Your two primary Ops artboards are only the UI portion of this stream. Personally implement the operations, privacy, infrastructure, observability and release work below, and personally run integrated demonstrations. Do not turn this assignment into supervision alone or delegate its implementation to the seven peer owners.

## Work packages

1. **Integration coordination.** Preserve the existing uncommitted baseline before branching, allocate W1–W8 files/contracts/migrations and runtime leases, maintain integration status/coverage/decision registers, resolve cross-owner gaps, run the G0–G5 demonstrations. Do not become the only person verifying features: each owner provides actual-run evidence and fixes its own defects.
2. **Operations console.** Verification review, scoped safety queue/case, evidence timeline, reports/blocks, disputes/refunds through W4, creator pause/suspension/revocation through W1/W2, reasoned decisions, support requests and appeals. Least privilege, scoped/time-bound case access, auditable reads/actions, search without exposing broad private conversations, and creator/fan notices. Separate safety from commercial routing and ranking.
3. **Safety operations.** Published crisis/help protocol and resource configuration, report on every AI message, case creation even without an active grant, creator/fan blocking semantics, escalation/response ownership, abuse handling and appropriate heavy-use review with minimal data. Include privacy-preserving crisis counters and annual-report readiness required by the source product policy; counsel confirms current filing obligations. W2 implements classifier/output policy; W8 owns case lifecycle and human operating procedures. Support/dispute features must be usable before taking external payments.
4. **Privacy lifecycle.** Export and deletion coordinator, actor verification, job progress/retry/completion, domain hooks for messages/memory/source/vector/cache/media/insights/notifications, account closure, retention sweeps, licensed voice deletion and creator departure/export. Immediate deny/revocation boundary must not wait for a slow purge. Disclose twelve-month packet/delivery exceptions and configured legal ledger retention; backup restoration must respect deletion tombstones. Cancellation of store billing and account deletion are separate flows that must both be explained and integrated correctly.
5. **Security engineering.** Threat review of auth/roles/passkeys, cross-fan/creator isolation/RLS, prompt injection, media upload/signed URL access, SSRF/source fetches, XSS/rendering, CSRF/CORS/origins, WebSocket subscriptions, webhook signatures/replay, secrets, dependency/supply chain, abuse/rate limits and admin break-glass. Re-check findings in running environments and logs. No privacy boundary can rely on an instruction in a prompt or a privileged database owner connection.
6. **Deployable environments.** Local/review/staging/production configuration, separate credentials/provider projects/queues/data, interactive/generation/ingestion pool deployment, health/readiness capability checks, secrets rotation, database roles/migration orchestration, private object storage/CDN, TLS/domains, worker schedulers/dead letters and safe config/feature rollouts. A green process health endpoint must distinguish unavailable identity/database/provider capability.
7. **Observability and reliability.** Correlated redacted traces across client→acceptance→generation→visible sentence→settlement, structured errors, metrics/dashboards for queue age, DB saturation, dropped/replayed frames, money reconciliation, refund lag, call outcomes, license revocation, deletion completion, notification delivery and AI costs. Alert thresholds and named responders, budget/circuit breakers, graceful degraded modes, and documented recovery actions.
8. **Scaling and recovery.** Progressive pilot-to-design workload exercises using existing traffic tools/operator commands, no new test-code project. Measure warm/cold p95 and p99 independently, load profile and resource/cost envelope, event loop lag, memory/leaks, socket backpressure and worker fairness. Exercise provider degradation, queue duplication, process/database restart, restore from backup and missed schedulers. Adopt the source targets of 99.9% monthly interactive availability, RPO five minutes and RTO one hour; define their measurement and provisioned capacity with business input before asserting readiness.
9. **Release and customer trust.** Browser compatibility, accessibility and author comprehension with all owners; signed native builds, target SDK/OS behavior, store privacy labels/data safety and SDK manifests, IAP/push/app links, release identity/domain planning, store-review instructions/demo accounts, staged rollout/rollback, status/support/privacy/terms/help pages and incident communication drafts. Verify store policies at submission; prepare artifacts, do not infer permission to publish or pay external fees.
10. **Pilot operation and quality feedback.** Recruiter/onboarding materials and feedback intake with W7, consented creator/fan studies, explicit comprehension/usefulness metrics, bug triage severity, accountable fixes and reopen checks. Initial source pilot thresholds are proposals, not proven benchmarks. Do not add engagement incentives that undermine wellbeing or clear AI identity.

## Owned surfaces and files

Own OpsQueue/OpsCase, support/appeal/status/privacy-help additions and their design gaps, operational tooling, deployment/CI/environment definitions, migration registry, runbooks and integration evidence. Every domain owner supplies its privacy and operational hooks. W1 remains custodian of shared build/client/app-root files. Use the [platform inventory](../research/platform-inventory.md) and [design inventory](../research/design-inventory.md) for release and UI gaps.

## First deliveries and dependencies

Start at once: foundation checkpoint proposal, environment/configuration map, device/port leases, shared contract register, ops case schema, provider/identity decision list and baseline telemetry. Integrate one G1 journey early. Do not defer all security/privacy/recovery until feature completion. Before G2 external paid use, money recovery, support, deletion, scoped ops and key alerts must already run.

## Required runtime demonstrations

- Deploy the same revision reproducibly into an isolated staging environment; verify readiness reports actual capabilities and no production/private data is required.
- Trace G1/G2 across clients and owners; show exact release/build/provider versions and find a failing request from its correlation ID without raw private content in logs.
- Create a report without a grant, restrict case access, take a reasoned action, appeal/resolve and notify. A different ops role cannot browse arbitrary threads.
- Export/delete a seeded fan with memory, packets, media and events; retry/restart jobs, inspect all domain acknowledgments, retained exceptions and restored-backup tombstones. Revoke a license mid-generation and inspect five-second enforcement.
- Recover from worker failure after payment/call external success, provider outage, missed webhook, stale queue and database interruption with the domain owners. No duplicate money or false delivery.
- Restore a backup in an isolated environment and record measured recovery point/time; demonstrate migration rollout/recovery without losing current clients' compatibility.
- Run defined-load stages with real provider capability or explicitly labeled simulated load; publish actual p95/p99, error rate, concurrency, cost and bottlenecks. Simulation cannot establish real provider latency.
- Perform real browser/native critical journeys, accessibility, physical-device call/push/purchase checks, and all five source prototypes. Separate local, staging, simulator, hardware and store-sandbox evidence.

## Delivery standard

Maintain a release candidate with zero known unresolved release-blocking defects, complete coverage evidence for enabled scope, actionable operations, and documented residual limits. All critical missing provider/device/legal/design inputs remain visible in the release gate. Reliability claims must describe measured conditions; no agent may mark the whole app complete from component catalogs or green compilation.

## Required real-app verification — perform this yourself

Read `docs/workstreams/VERIFICATION.md`, then personally build, launch and operate every applicable surface:

- Open the functional Next.js route in the Codex browser, using phone and desktop layouts as appropriate. Use separate real browser sessions when two actors are needed. `/design` is a reference gallery, not the implemented product.
- For supported fan-native flows, build/install and visibly launch the Swift app in iOS Simulator and the Kotlin app in Android Emulator, connected to the actual configured backend. Tap/type through real navigation, forms, permission/system sheets and persisted state. Native component catalogs alone cannot prove a flow works.
- Studio is required as responsive phone/desktop web, and Ops as web. Native fan apps are required; full native creator Studio is a separately recorded extension. Backend-only changes still need their affected user journey exercised through the appropriate real client.
- Exercise the complete happy path and relevant denied-role/access, invalid input, loading/empty, offline/reconnect, duplicate action, stale data, provider failure, process restart and return-visit cases. Inspect durable API/database/provider outcomes when necessary. Never infer correct money, signatures, consent or fulfillment from a success toast.
- Compare actual functional screens with source designs at matching dimensions/content/scroll position in both themes. Verify keyboard/safe areas, focus, VoiceOver/TalkBack as applicable, 200% text, reduced motion, author labeling and accessible controls. Fix differences and re-run the affected journey yourself.
- Use genuine configured providers or their sandboxes for the applicable proof. Store purchases/restore, real push delivery, passkeys, background calls, Bluetooth/audio routing and certain device behaviors require additional sandbox or physical-device evidence. A simulator, mock or local callback is not proof of those capabilities. If a device/account/provider is unavailable, state exactly what remains unverified and continue other work.
- Measure relevant end-to-end latency and cost under a named device/network/load profile. The architecture's targets include accepted-message p95 300 ms, first approved visible sentence p95 2.5 s warm/4 s cold, takeover p95 500 ms and specified revocation within five seconds. These are targets to demonstrate, not achievements to assume.

## Working sequence and completion report

1. Inspect the latest repository, source requirements, primary artboards and downstream contracts. Record implemented/missing/blocked items and the exact files/resources you will own.
2. Write a short execution checklist in `docs/workstreams/status/W8.md`, linked to source flows/invariants/artboards and required acceptance scenarios. Begin implementation promptly after the necessary inspection; do not stop with a plan.
3. Personally deliver the first increment described above, connect it to actual domain state, launch the applicable apps, fix observed defects and record evidence. Continue through the remaining work packages and assigned full-product opportunities; later release gates do not erase development scope.
4. Keep changes maintainable: typed boundaries, scoped database access, indexes/constraints, idempotency, durable effects and reconciliation, bounded jobs/queries, truthful failure states, redacted logs and configuration. Keep secrets and private fan content out of code and evidence.
5. Integrate with peer-owned capabilities at working checkpoints, recheck affected journeys and update the status file. Do not wait until the end of your entire stream to discover contract mismatches.
6. Save sanitized screenshots/video/design comparisons and relevant trace/provider-record references under `artifacts/workstreams/W8/<increment>/<run>/`. Record revision/build, environment, actor roles, device/OS, viewport/theme, provider mode, steps, expected/observed result, fixes and remaining limitations.
7. Complete all feasible work before returning. If a genuine external decision or unavailable resource prevents the remaining path, finish independent work, identify the exact dependency and owner, and report the narrow blocked items. Do not invent success, silently reduce scope or ask whether to continue work already assigned.

Your handoff must state: what is implemented; source/artboard/contract coverage; how to launch; which real browser/native/provider/device journeys you personally exercised; evidence links and measured results; remaining defects or blocked/unverified items with the next action. Separate implemented, runnable, integrated, verified and release-ready. No new test-code or coverage deliverables. Do not claim the whole app is bug-free or production-ready from compilation or one happy-path run.

Begin now. Personally implement and verify your assigned workstream through completion; use subagents only to research or check information.

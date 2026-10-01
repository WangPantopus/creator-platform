# Planning and coordination handoff

Prepared 2026-09-29 (America/Los_Angeles). This is the original planning/foundation session, not an assignment to W1–W8. The successor continues coordination and delivery tracking; the eight domain owners retain their implementation responsibilities.

## Original assignment and authoritative references

The original document for this work is [Parallel delivery plan](../README.md). The founder asked for exhaustive division into 3–8 parallel streams, then eight comprehensive standalone prompts, including exact design fidelity, personal implementation, research-only subagents and actual app verification without new test code. The founder has now started all eight sessions.

Read [Standards](../STANDARDS.md), [ownership/contracts](../CONTRACTS.md), [verification](../VERIFICATION.md), [coverage](../COVERAGE.md), [opportunities](../OPPORTUNITIES.md), and [decisions](../DECISIONS.md). Each stream's original brief and execution prompt are linked in [the prompt index](../prompts/README.md); [the combined prompt document](../prompts/ALL_WORKSTREAM_PROMPTS.md) contains all eight.

Product references: [Build prompt](../../BUILD_PROMPT.md), [Brief](../../BRIEF.md), [design plan](../../DESIGN_PLAN.md), [naming](../../NAMING.md), and all four documents in [source](../../source/). Source filenames are Domain_Model_and_Behavioral_Contract.md, Product_Design_Flows_Screens_and_Copy.md, System_Architecture.md, and Second_Review_Strategy_Behavior_and_Additions.md. Use their invariants, behavioral scenarios and fixed copy; newer founder instructions override obsolete stack/location/testing instructions.

Design references: [design inventory](../research/design-inventory.md) maps every artboard to its owner and exact source file. Read [design handoff](../../../design/handoff/README.md), the corresponding design-system component documentation and phase canvas/README beside each source artboard. Preserve source exports. Apply only the instructed BUILD_PROMPT §9 corrections unless a further design decision is approved. The /design gallery is reference content, not proof of functional product workflows.

## Binding instructions

- Standalone creator-platform first; integrate with Pantopus later. Do not modify either Pantopus checkout.
- Node.js/TypeScript backend; Next.js web; native Swift/SwiftUI iOS; native Kotlin/Compose Android. No React Native substitution.
- Exact supplied layouts, colors, typography, spacing, copy, states and Light/Night appearance. Resolve missing designs in the decision register rather than silently inventing accepted screens.
- Qelvora is a replaceable placeholder, not a final name. Preserve central brand configuration and one-command renaming.
- Each primary agent personally performs implementation, documentation, debugging, integration, builds, app launching and verification. Child agents may only research/check information. The eight owner sessions are peers.
- Write no new test code or coverage work. Preserve existing tests and evidence. Personally operate the real web app, iOS Simulator and Android Emulator as applicable; use hardware/provider sandboxes when necessary. A build or screenshot is not a completed interaction.
- Report implemented, runnable, integrated, verified and release-ready separately. Never fake providers, payment success, identity, licenses or product completion.

## Work completed in this session

1. Earlier foundation work established the workspace, shared resources/generation, Node backend skeleton, Next design catalog and initial entry screens, SwiftUI/Compose foundations, scoped persistence, signed-act and delivery primitives. Exact historical changes, verification results and limits are in [BUILD_LOG](../../BUILD_LOG.md), [foundation setup](../../implementation/FOUNDATION.md), [backend foundation](../../implementation/backend-foundation.md), [native foundation](../../implementation/native-foundation.md), [design verification](../../implementation/design-verification.md) and [Pantopus integration](../../implementation/pantopus-integration.md). These historical results are not a fresh verification of today's concurrently modified app. Earlier tests predate the founder's no-new-tests instruction.
2. Researched repository/source/design coverage; created backend, platform and design inventories under research/. Identified 64 artboards and 53 reference components, and distinguished previews from working features.
3. Produced the eight original workstream briefs, full scope mapping, additional beneficial opportunities, source conflicts/decision register, C01–C12 integration contracts, ownership boundaries, shared-file custodians, resource leases, integration gates and runtime evidence standards.
4. Produced eight self-contained agent prompts and their index/combined document. Each names its original brief, required references, owned screens, work packages, dependencies, standards and completion evidence. Validated all 64 primary artboard assignments exactly once and prompt work-package retention (W1–W8: 7/9/9/9/9/8/9/10), local references and combined-document consistency during preparation.
5. Updated repository README and BUILD_PROMPT execution overlay to point at the plan and current founder requirements. Clarified that the original eight owners must do their own work; research children cannot implement or perform acceptance.
6. Advised how to start eight existing sessions and continue them in Extra High without discarding progress. No model settings were changed and no messages were sent to those sessions by this planning agent.
7. Prepared this handoff and [successor prompt](planning-coordination-resume.md). No application code or new tests were written during this handoff pass.

## State inspected at handoff

The shared checkout was on main at ba2ee4f, with extensive modified/untracked foundation and peer implementation. Existing peer status files were read as reports, not independently verified. W1/W2/W4/W6/W7/W8 report substantial partial implementation and remaining integration/provider/runtime acceptance. W5's record still has all delivery checkboxes open and says not launched. No W3 status file was present. Missing status is not proof that no implementation exists: inspect current code/session before assigning work.

W1 records a late repair to thread authorization row locking and newly registered support/crisis/activation links. W8's earlier status still lists those producer issues as open. Reconcile using current revisions and actual integrated runs; do not repeat an outdated defect as established current fact. Several owners report broken interactive browser/device controls, despite successful builds/launches. Those reports do not waive interactive verification.

The plan's original 'what exists' and research inventories are initial snapshots. Preserve their historical context; use current owner status/evidence to update delivery state. No owner is certified release-ready by this handoff.

## Remaining work for the successor

1. Establish the actual repository/branch/worktree state without resetting, cleaning, stashing or overwriting peer work. Inspect current status and ownership before each mutation. This handoff commit deliberately excludes current peer implementation/status/coordination/evidence. Preserve the shared uncommitted foundation until its owners/W8 can create a reviewed implementation checkpoint; a checkout of this planning branch alone is not a runnable app snapshot.
2. Build a current coordination matrix for W1–W8: original requirement/artboard, owner, current revision, implemented/runnable/integrated/verified state, evidence, dependency, next action and acceptance gate. Read each existing status/WN.md, coordination record and linked implementation/evidence. Recover W3's actual state and verify W5's progress rather than assuming abandonment.
3. Reconcile C01–C12 producer/consumer contracts, migration allocation/checksums, shared bootstrap registration, generated clients and native routes with W1/W8. Do not absorb or duplicate peer domain implementations. Make owner-specific changes only within an explicitly assigned scope or agreed lease.
4. Drive the remaining whole-product gates in the original plan: G0 reproducible foundation; G1 creator publish/fan consent/cited chat/memory/takeover; G2 membership and signed human presence; subsequent commerce/fulfillment, calls/media, growth/privacy/operations and release gates exactly as defined in the plan. Keep every source requirement and every approved opportunity accounted for, with no silent scope deletion.
5. Prioritize the current major seams: genuine W2→W3→W4 generation/allowance; W5 signed content/Studio→W3 delivery→W4 fulfillment→W7 distribution; W6 real participant transport/outcomes→W4 settlement; W8 negative authority/privacy hooks across every domain; W1 host composition and cross-client role/session/navigation behavior.
6. Restore or find supported interactive browser/device control, respect owner leases, and personally verify coordination-owned integrated journeys. Record exact revisions, devices, commands, actors, screenshots and durable outcomes. Match reference viewport/theme before visual acceptance. Exercise retries, disconnect/reconnect, stale state, denied roles, account switching, duplicates, cancellation, accessibility and recovery. Never substitute mocks or CLI launch success for the missing user journey.
7. Resolve external dependencies Q01 onward with concrete options only when necessary: identity, model/embedding/classifier policies/credentials, payment/store/provider configuration, license/retention decisions, brand/RP/domains, deployment/signing/push/email, physical hardware and staffed operations. Continue independent work meanwhile. Do not invent credentials, legal approval, prices or performance claims.
8. Require measured performance/reliability evidence on the integrated runtime: warm/cold and tail latency, sockets/reconnect/backpressure, durable outbox/inbox recovery, money idempotency, provider failures, restore/deletion behavior and cost. Follow source budgets; local one-request or metadata-only timings cannot certify production scale.
9. Keep plan/coverage/decision and handoff records synchronized, distinguishing obsolete reports from retested repairs. Completion requires all original work packages and approved extensions accounted for and actual acceptance evidence, or precise external blockers with owner/required input. Do not label the product complete while provider/hardware/release gates remain open.

## Handoff boundaries and Git delivery

This branch packages planning and historical foundation documentation, not a combined commit of all eight owners' uncommitted code. Foundation code has since been modified by peers and cannot safely be attributed/staged wholesale as this session's work. Preserve it in place; W8's status references a local recovery archive, whose existence/integrity has not been revalidated here. The archive is not a remote implementation checkpoint.

Use a temporary Git index and a branch ref based on the inspected HEAD to commit only the explicit documentation allowlist without switching the live shared checkout. Do not force push. The final response records the actual branch/commit/push outcome. If a fresh successor checkout lacks runtime files or linked owner reports, obtain the reviewed owner/integration branches before trying to build; do not regenerate them from assumptions.

Thread inspection does not authorize messages: the founder has requested this handoff, not automatic messaging of the eight sessions. Ask for explicit authorization before sending another session instructions. The successor can inspect files and perform its own authorized coordination/documentation work immediately.

# Parallel delivery plan

Prepared 2026-09-29 from the repository, source documents, design exports, implementation notes, and the [research inventories](#research-and-coverage). This is a planning deliverable; it does not launch agents or claim the product is implemented.

## The decision: eight workstreams

Use eight persistent owners, each responsible for a coherent product area from storage and API through the applicable web, Swift, and Kotlin experience. Web, iOS, and Android are delivery surfaces within a workstream. This avoids three separate implementations inventing different product rules.

| ID | Workstream / agent instructions | Accountable result |
| --- | --- | --- |
| W1 | [Platform, identity, and app foundations](W1-platform-identity.md) | People can enter the right account and role, navigate all clients, and perform verifiable signed acts on a consistent design system. |
| W2 | [Creator AI, knowledge, and model runtime](W2-creator-ai.md) | A verified creator can prepare, evaluate, publish, correct, pause, and export a useful, scoped, clearly labeled AI. |
| W3 | [Fan conversations and real-time chat](W3-conversations.md) | Fans can have useful conversations, return with controlled memory, and experience reliable human takeover on every device. |
| W4 | [Commerce, access, and request lifecycle](W4-commerce-requests.md) | Memberships, human requests, capacity, payments, refunds, spending controls, pass cycles, and creator earnings agree with one ledger. |
| W5 | [Creator Studio, content, and fulfillment](W5-studio-content.md) | Creators and permitted team members can run their daily work: requests, personal replies, Notes, reactions, publishing, and corrections. |
| W6 | [Calls, voice, and media](W6-calls-media.md) | Human audio/video sessions and media work with truthful identity, durable timing, consent, recoverable failure, and correct outcomes. |
| W7 | [Discovery, growth, notifications, and insights](W7-growth-insights.md) | People find creators, arrive with context, receive useful truthful updates, return, and help creators learn what to make next. |
| W8 | [Trust operations, reliability, and release](W8-trust-release.md) | The whole product can be operated, supported, secured, recovered, measured, and released responsibly at the intended load. |

W4 is intentionally the single owner of money and grants. W3 is the single owner of conversation control and ordered delivery. W1 is the shared-file custodian. W8 coordinates integration and acceptance; it does not absorb everybody else's implementation or verification.

## Instructions from the founder that override older documents

1. Develop in **this standalone `creator-platform` repository**. Integrate with Pantopus later. Do not edit either Pantopus checkout. Preserve the opaque account identifier as the only shared identity key, with a minimal verified eligibility signal such as `adultEligible`; creator/fan profiles and product roles are local data. Do not import neighborhood data or introduce a competing production account system.
2. **Node.js with TypeScript backend; Next.js web; native Swift/SwiftUI iOS; native Kotlin/Compose Android.** Expo and React Native references are obsolete. Keep the modular monolith and three runtime pools; eight owners do not imply eight microservices.
3. Reproduce the designs in `design/` exactly: hierarchy, composition, type, spacing, colors, copy, interactions, and Light/Night. Apply the explicit corrections in `docs/BUILD_PROMPT.md` §9. Changes to source appearance need recorded design evidence and a resolved design decision.
4. **Do not write new unit tests, test suites, snapshot tests, E2E test code, or coverage work in this phase.** Verify actual features in the running product: browser, iOS Simulator, and Android Emulator, plus physical devices and provider sandboxes where those are necessary. Existing tests are preserved. Existing checks may be run when useful, but test-count growth is not a deliverable. The source T-01–T-40 requirements remain behavioral acceptance scenarios.
5. Build the full product in stages. Calls, AI voice, full publishing, insights, public-answer credits, and the pass retain explicit owners even when their release gates occur later. Reserved synthetic live calls/video, fan agents, unofficial personas, cross-creator memory, algorithmic feeds, and tips remain outside the approved feature set (Domain D-G/D-H).
6. The product name is undecided. Use the existing Qelvora placeholder, `config/brand.json`, and `docs/NAMING.md`. Preserve the one-command rename. Do not commit to irreversible public identifiers or a final brand as part of routine implementation.
7. **Each assigned agent personally implements its entire workstream. Subagents are allowed only to search for, research, or check information.** Do not delegate coding, patches, migrations, configuration, documentation deliverables, debugging/fixes, integration, app launching, or end-to-end verification. Do not ask a subagent to generate implementation code for you to apply. The eight independently assigned workstream owners remain peers; they each implement their own domain and shared-file responsibilities.

These instructions are the current execution overlay on `docs/BUILD_PROMPT.md`; its instructions to build inside Pantopus and add automated tests are superseded. Its product and design requirements otherwise remain useful.

## What actually exists

There are 64 exported artboards, including five multi-step prototypes, and a 53-component reference system. The web gallery displays designs; it is not the feature-complete app. Existing shared tokens, copy, generated clients, native component libraries, app hosts, backend skeleton, scoped database access, signed-act primitives, and conversation protocol are useful starting points.

Most end-to-end workflows remain absent. Identity and provider integrations are not production-connected; AI generation is unavailable in the current default integration; the native hosts largely open Welcome/catalogs. Native visual fidelity is not accepted simply because native snapshots exist. Earlier check results in `docs/BUILD_LOG.md` establish foundation behavior only. See the inventories for evidence and precise gaps.

## Start all eight without waiting for one huge foundation phase

Before concurrent editing, preserve the current uncommitted foundation in a reviewed integration checkpoint. The audit found the project on `main` with extensive untracked implementation; a worktree from the old HEAD would omit it. W8 coordinates the checkpoint; no agent resets or cleans this checkout. Then give each owner a branch/worktree named `codex/w1-platform`, etc., from that same checkpoint. No branches or worktrees are created by this planning pass.

| Owner | First independently useful increment | First integration it must prove |
| --- | --- | --- |
| W1 | Session/authority contracts, app navigation, design foundation fidelity fixes, explicit development identity seam | Same permitted identity and return destination across web/Swift/Kotlin; creator signs an exact act |
| W2 | Source approval/ingestion, agent drafts, evaluator, version compilation | Publish a scoped version; W3 receives the first approved, cited response |
| W3 | Thread and memory APIs, transport wiring, native conversation routes | Same durable conversation and takeover boundary on two clients |
| W4 | Canonical access/capacity/payment state contracts; request and membership sandbox implementation | Fan submits; W5 accepts; one capture and correct receipt/refund |
| W5 | Daily Studio shell, Notes and Replies, packet/fulfillment screens against agreed contracts | Signed Note and human reply appear with the correct fan-facing labels |
| W6 | Upload/record/play pipeline, human voice, session/clock contracts, native call adapters | Signed human voice delivery; scheduled two-party call with server ending |
| W7 | Public directory/profile read models, links/context, notification envelope, event analytics | Signed-out arrival reaches the intended conversation; current-state notification opens correct object |
| W8 | Local/staging configuration, isolated runtime leases, observability, ops case shell, threat/release gap register | Reproducible integrated environment, actionable traces, recovery demonstration |

Where a producer is not ready, use its agreed schema and a visibly development-only fixture adapter. Finish UI/error behavior and independent domain work, then replace the fixture. A fixture-backed path is reported as such and cannot satisfy integrated completion. No production path silently falls back to sample users, success, payments, or generated replies.

## Shared checkpoints, not waterfall handoffs

| Gate | What must work together | Leads / contributors |
| --- | --- | --- |
| G0 · Reproducible foundation | Clean shared baseline; all clients launch; roles/contract vocabulary agreed; ownership, ports, devices, and migrations allocated | W8 + W1, all owners |
| G1 · First useful relationship | Creator verifies/configures/publishes; fan arrives, consents, sends, opens a citation, returns with editable memory; correct labels and takeover | W2 + W3; W1/W5/W7/W8 |
| G2 · Membership and human presence | Membership, Note, private reply to Note, reaction, packet, accept, signed written/voice fulfillment, refusal/expiry/refund, support and deletion | W4 + W5; every owner |
| G3 · Native and calls | Native fan journeys through actual APIs; IAP restore/reconciliation; push/deep links; scheduled audio/video call and every outcome; native accessibility | W6 + W1; W3/W4/W7/W8 |
| G4 · Creator leverage and distribution | Full publishing/library, group/public answers and credits, insights, sharing verification, consented marked AI voice, growth loops | W5 + W7; W2/W4/W6/W8 |
| G5 · Pass and scale | Slot lifecycle, unavailable replacements, monthly accounting and payouts; defined-load performance; disaster recovery and release review | W4 + W8, all owners |

Development across later gates may proceed in parallel. Releases honor membership-first, human-voice-first, AI-voice-after-pilot, and roster-dependent pass activation. The source roadmap's old single-engineer week counts are not estimates for this parallel plan. Measure the first integrated increments before setting dates.

## Coordination and deliverables

Every agent reads [shared standards](STANDARDS.md), [ownership and contracts](CONTRACTS.md), [runtime verification](VERIFICATION.md), its brief, and the relevant original documents/designs before implementing. Every increment produces working code, migrations/configuration where needed, actual-run evidence, known gaps, and a handoff to its consumers.

To assign an agent, copy its complete [paste-ready execution prompt](prompts/README.md). Each prompt includes the full stream brief, exact primary artboards, personal-implementation requirement, research-only subagent exception, and real-app verification standards. Assign one prompt to each independent agent. No implementation agents were launched by this planning pass.

Merge small coherent increments against the common integration branch. W8 runs a cross-stream demonstration at least once per working day with meaningful integrated changes and at every gate. Producers announce schema/event changes before consumers implement them; W1 publishes generated clients. Use additive contracts and expand/migrate/contract database changes. Do not let all eight streams diverge until a final merge.

All eight are workstream owners, not a claim that eight workers fit this local machine or the current agent concurrency limit. Limit concurrent simulator/build jobs using leases; queue those jobs while implementation continues. Every owner personally performs its implementation and real-app verification; any subagent is restricted to read-only research or information checking. If only 3–4 workers are available, rotate them across these eight maintained backlogs without dropping scope.

## Research and coverage

- [Complete coverage and cross-stream journeys](COVERAGE.md): flows, invariants, decisions, additions, runtime scenarios, honest states.
- [Design inventory](research/design-inventory.md): every artboard, prototype state, component, primary owner, and missing design.
- [Backend/domain inventory](research/backend-inventory.md): implemented versus missing, entities, workers, provider seams, state machines, risks.
- [Native/platform inventory](research/platform-inventory.md): actual local capabilities, native gaps, official platform requirements, release needs.
- [Beneficial additions and evidence](OPPORTUNITIES.md): acquisition, activation, trust, support, retention, reliability; priority and owner.
- [Decision and design-gap register](DECISIONS.md): unresolved business/provider/design inputs, affected milestones, safe independent work.

This is a bounded full-product plan for the supplied specifications plus explicit additions. Discovery during implementation is inevitable: add each newly found requirement to the coverage register with one accountable owner, consumers, an acceptance scenario, and a design reference or gap. “Best in the world” becomes demonstrated usefulness, clear identity, faithful craft, fair money, low latency, and dependable operation—not an untestable promise of zero bugs.

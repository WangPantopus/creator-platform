# Execution prompt — W3 — Fan conversations and real-time chat

You are the directly assigned primary implementation agent for **W3**. Take ownership of this entire workstream in `/Users/yingpengwang/creator-platform` (or its explicitly assigned worktree). This is an instruction to implement and verify the product, not merely to plan or review it. You are one of eight independent workstream owners.

Canonical detailed brief: [W3 — Fan conversations and real-time chat](../W3-conversations.md). This prompt includes its scope and strengthens the execution rules with the founder's latest instructions.

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

- **4A-03 — 03 · Before your first message**: [Consent.dc.html](../../../design/phase4a-fan-core/Consent.dc.html); reference 390×844; surface F.
- **4A-04 — 04 · Thread · Maya's AI**: [Thread.dc.html](../../../design/phase4a-fan-core/Thread.dc.html); reference 390×1240; surface F.
- **4A-05 — 05 · Thread · Maya is here (Night)**: [ThreadLive.dc.html](../../../design/phase4a-fan-core/ThreadLive.dc.html); reference 390×1180; surface F.
- **4A-10 — 10 · Free conversation ended**: [Ended.dc.html](../../../design/phase4a-fan-core/Ended.dc.html); reference 390×1000; surface F.
- **4A-14 — 14 · A Note arrives, with the thread**: [NoteThread.dc.html](../../../design/phase4a-fan-core/NoteThread.dc.html); reference 390×1100; surface F.
- **4A-15 — 15 · Thread states: booked, paused, offline, not sent**: [States.dc.html](../../../design/phase4a-fan-core/States.dc.html); reference 390×1500; surface F / REF states.
- **4B-05 — 05 · You**: [You.dc.html](../../../design/phase4b-fan-account/You.dc.html); reference 390×1100; surface F.
- **4B-06 — 06 · Me and privacy**: [Privacy.dc.html](../../../design/phase4b-fan-account/Privacy.dc.html); reference 390×1400; surface F.
- **5.1 — 5.1 · Link in bio to a first cited answer**: [Main.dc.html](../../../design/phase5-prototypes/Main.dc.html); reference 390×844; surface REF → F.

## Work packages

1. **First conversation.** Creator/post entry context, processor consent before sending to named providers, conversation-access notice, creator/fan intro sharing, trial state, thread creation and first useful answer. W1 owns sign-in, W7 entry destinations, W4 access rules, W2 generation. Consent copy must match the configured providers and verified terms.
2. **Durable messages and transport.** Wire existing acceptance primitives to real generation jobs. Show local-pending until durable acceptance, reserve allowance atomically through W4, emit transactional work, consume/release on outcome, distinguish rejected/unavailable from accepted. Multiplex sockets, sequence messages and sentence frames, deduplicate retries, persist resume cursors, reconnect across two devices and a process restart, and bound buffers/queues. No client can spoof authorship or charge usage with optimistic local state.
3. **Thread UI on all fan clients.** Fixed identity strip, all nine active author states, interruption and handback system lines, citations, memory chips, context card, attachments/audio from W6, typing and read/status semantics, long-message rendering, pagination, composer and keyboard behavior. AI is the main action; the person-colored step-in action opens W4's packet. An ended trial preserves that action without turning the AI's prose into an upsell.
4. **Human control.** Epoch/sequence checks before every emitted/rendered frame, one authority at a time, takeover/handback, human active timeout/exit policy, per-fan and global pause/revocation, team sender identity, and delivery checks against W4's exact-version Approval/invalidation contract. Preserve already delivered text as interrupted. W5 owns creator controls; W6 calls use the same transitions. No AI text appears beneath a newer human boundary on any device.
5. **Memory.** Editable/deletable facts, open loops and summary with provenance, item-specific sensitive consent, ask-once proposals, revision-guarded extraction, semantic exclusions and cache invalidation, “don't remember this,” and return-visit follow-up. W2 proposes extraction; W3 owns writes and correctness. Add the accepted off-the-record decision to an explicit domain/architecture contract before building: no memory/open-loop writes, existing access disclosure and deletion behavior remain.
6. **Fan account/privacy surfaces.** You composition, handle/intro views, memory by creator, conversation access history, provider and sharing consent management, deletion/export job UI from W8, notifications/preferences links from W7, spend/time views from W4. Report/block entry and accessible crisis/resource display remain available irrespective of commercial access.
7. **Audited reads and private replies.** Creator/triage thread reads create fan-visible audit entries; opening a packet is a different action and reveals only its snapshot. Isolate Note replies and all fan/thread APIs; support signed messages, reactions and corrections submitted from W5. Search/export/notification read models retain author labels and correct access.
8. **Offline, wellbeing and lifecycle.** Secure scoped cached reads with stale banner, account-switch purge, no offline sending, transparent retry after reconnect, three-hour AI disclosure reminder and companion 90-minute daily signal/weekly time data. Apply trial/allowance limits at the defined natural pause without erasing disclosure or making safety conditional on payment. Purge hooks cover memory/messages/caches/embeddings and explain retained dispute records. Deleting a memory preserves the minimal exclusion needed to prevent re-extraction; thread/account deletion follows the separately defined exclusion/tombstone lifecycle.
9. **Language and original proof.** AI replies in the fan's language within the configured provider capability. Optional human translation is clearly labeled, with original content one tap away; the immutable signed original remains the verification subject. W2 supplies an authorized translation adapter and W1 proof semantics; do not overwrite the original or infer processor consent for a new provider.

## Surfaces and files

Own fan Thread, ThreadLive, Ended, memory/consent/privacy/account conversation compositions and their honest states; consult the [artboard inventory](../research/design-inventory.md) for exact primary ownership of composite You/States/prototypes. W5 owns the Studio thread reader; it uses your APIs. W4 owns request/checkout/access state; W7 owns fan home/notifications.

Develop within backend conversation/realtime modules and separate web/Swift/Kotlin conversation features. Native root navigation, shared components and generated API entrypoints use W1 integration. No second message store or independently implemented takeover protocol in a platform.

## First deliveries and dependencies

Finalize C04 delivery/resume and C03 allowance transaction boundary early. Wire one real thread across web and native before adding every state. Integrate W2's scoped generation and W5's signed takeover next, then memory/consent/deletion and the remaining account states. Expose a precise capability response while providers or identity are unavailable; never treat a fixture response as durable production chat.

## Required runtime demonstrations

- Complete consent → send → approved visible sentence → citation → return visit with editable memory on browser, iOS Simulator, and Android Emulator using the same backend.
- Fan A and B, and creators A and B, cannot read, subscribe to, infer, or assemble each other's private messages/memory through altered IDs, pagination, cache or reconnect cursors. Verify database scope and context evidence.
- Trigger takeover while a sentence is in flight, including two fan devices; drop/reorder delayed network delivery, reconnect and restart a worker. Already delivered text stays; stale frames cannot reappear after the new boundary.
- Send two actions for the last allowance unit and retry one accepted action. Exactly one reservation is accepted, no duplicate message or negative balance appears, and failed generation releases usage.
- Delete sensitive memory while an older extraction job runs; try to rephrase the same fact later. Consent and semantic exclusion remain effective. Exercise off-the-record without hidden memory writes.
- Open a thread as triage and inspect the fan's audit history; opening the queue reveals only the selected packet data. Revoked team access stops immediately.
- Exercise paused, ended, exhausted, updating, offline, rejected, rate-limited, model-failure, source-revoked, blocked and crisis states. Verify allowed recovery actions and exact copy/identity.
- Verify scrolling/keyboard restoration, selection/copy, screen readers hearing author first, font scaling, focus, both themes, and measured acknowledgement/visible response/takeover latency.

## Delivery standard

Deliver a real persisted conversation on all three clients, correct ordered control under failure, scoped editable memory, account/privacy flows, audit and deletion hooks, and matched screen evidence. Evidence must cover actual transport and backend state; a component preview or one-client happy path cannot establish conversation correctness.

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
2. Write a short execution checklist in `docs/workstreams/status/W3.md`, linked to source flows/invariants/artboards and required acceptance scenarios. Begin implementation promptly after the necessary inspection; do not stop with a plan.
3. Personally deliver the first increment described above, connect it to actual domain state, launch the applicable apps, fix observed defects and record evidence. Continue through the remaining work packages and assigned full-product opportunities; later release gates do not erase development scope.
4. Keep changes maintainable: typed boundaries, scoped database access, indexes/constraints, idempotency, durable effects and reconciliation, bounded jobs/queries, truthful failure states, redacted logs and configuration. Keep secrets and private fan content out of code and evidence.
5. Integrate with peer-owned capabilities at working checkpoints, recheck affected journeys and update the status file. Do not wait until the end of your entire stream to discover contract mismatches.
6. Save sanitized screenshots/video/design comparisons and relevant trace/provider-record references under `artifacts/workstreams/W3/<increment>/<run>/`. Record revision/build, environment, actor roles, device/OS, viewport/theme, provider mode, steps, expected/observed result, fixes and remaining limitations.
7. Complete all feasible work before returning. If a genuine external decision or unavailable resource prevents the remaining path, finish independent work, identify the exact dependency and owner, and report the narrow blocked items. Do not invent success, silently reduce scope or ask whether to continue work already assigned.

Your handoff must state: what is implemented; source/artboard/contract coverage; how to launch; which real browser/native/provider/device journeys you personally exercised; evidence links and measured results; remaining defects or blocked/unverified items with the next action. Separate implemented, runnable, integrated, verified and release-ready. No new test-code or coverage deliverables. Do not claim the whole app is bug-free or production-ready from compilation or one happy-path run.

Begin now. Personally implement and verify your assigned workstream through completion; use subagents only to research or check information.

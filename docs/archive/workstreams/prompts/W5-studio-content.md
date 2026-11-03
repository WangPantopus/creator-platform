# Execution prompt — W5 — Creator Studio, content, and fulfillment

You are the directly assigned primary implementation agent for **W5**. Take ownership of this entire workstream in `/Users/yingpengwang/creator-platform` (or its explicitly assigned worktree). This is an instruction to implement and verify the product, not merely to plan or review it. You are one of eight independent workstream owners.

Canonical detailed brief: [W5 — Creator Studio, content, and fulfillment](../W5-studio-content.md). This prompt includes its scope and strengthens the execution rules with the founder's latest instructions.

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

- **4C-01 — 01 · Requests queue**: [Main.dc.html](../../../design/phase4c-studio-phone/Main.dc.html); reference 390×1400; surface SP.
- **4C-02 — 02 · A request: reply or Instead**: [PacketDetail.dc.html](../../../design/phase4c-studio-phone/PacketDetail.dc.html); reference 390×1700; surface SP.
- **4C-04 — 04 · Threads**: [Threads.dc.html](../../../design/phase4c-studio-phone/Threads.dc.html); reference 390×1000; surface SP.
- **4C-05 — 05 · A fan's thread: audit, take over**: [ThreadView.dc.html](../../../design/phase4c-studio-phone/ThreadView.dc.html); reference 390×1300; surface SP.
- **4C-06 — 06 · Write a Note**: [NoteCompose.dc.html](../../../design/phase4c-studio-phone/NoteCompose.dc.html); reference 390×1100; surface SP.
- **4C-08 — 08 · More**: [More.dc.html](../../../design/phase4c-studio-phone/More.dc.html); reference 390×900; surface SP.
- **4C-09 — 09 · Notes: replies feed**: [Replies.dc.html](../../../design/phase4c-studio-phone/Replies.dc.html); reference 390×1200; surface SP.
- **4D-07 — 07 · Team and roles**: [Team.dc.html](../../../design/phase4d-studio-desktop/Team.dc.html); reference 1280×900; surface SD.
- **4F-01 — F1 · A public answer**: [PublicAnswer.dc.html](../../../design/phase4e-4i/PublicAnswer.dc.html); reference 390×1200; surface F.
- **5.3 — 5.3 · The creator's daily five minutes**: [Daily.dc.html](../../../design/phase5-prototypes/Daily.dc.html); reference 390×844; surface REF → SP.

## Work packages

1. **Daily Studio.** Notes-first phone tabs, Requests, Threads, My AI link, More; desktop sidebar/layout; commitments due first, packets ordered by SLA then the specified rules; canonical capacity banner, filters/pagination/empty states and draft continuity. Use W4 read models rather than recomputing priorities, capacities or money in the client.
2. **Packet detail and fulfillment.** Exact disclosure snapshot, summary and attachments, accepted mode/deadline/price and fan-label preview, fulfilling actions first, the remaining F6 choices under Instead. Let AI answer, approve exact draft, personal written reply, human voice, offer times, group offer, ask more information, decline. Show changed-offer fan consent and payment state from W4. Never mark a commitment complete locally or charge merely because the creator viewed it.
3. **Composer and signatures.** Creator and team drafts, saved drafts, exact-version approved-draft invalidation on edit, creator-authored text, real recorded voice via W6, signed preview via W1, retry/cancel/expiry and attachment processing states. Ensure team words always bear team identity. A human reply/approved draft only satisfies the mode W4 allows. Any translated display is labeled with the immutable signed original one tap away; coordinate W3's presentation contract.
4. **Notes and replies.** Signed text/photo/up-to-60-second human voice broadcasts, followers/tier/all-member audience, optional audience count and name token with explicit broadcast label, fan reply feed isolated per fan, creator-only signed reactions, consented quote-reply and creator response, mute/eligibility/revocation. Store broadcasts once with fan-out on read; no per-fan fake personal DM. W3 delivers thread views and W7 sends truthful updates.
5. **Threads and correction workflow.** Audited creator/triage reader, permission notice and log, filters, pause for one fan, takeover/handback using W3, team replies, attached public correction, “I'd never say that” into W2's draft rule/regression workflow. Show interrupted AI and exact next speaker. Request routing stays separate from audited thread access.
6. **Publishing and library.** Draft/edit/schedule/publish/unpublish/archive, post/text/media/voice/library and specified live-content capabilities, audience/tier/group controls, “Let my AI use this” as a separate explicit approval, content revisions/takedown/accessibility/alt text, existing post entry context. A published paid post never becomes a public AI source by accident. Full library/live behavior has design gaps that need a bounded specification before implementation.
7. **Public and group answers.** Creator publishing workflow from a public packet or W7 insight, opt-in anonymity/quoting, fan-approved conversion, audience delivery as a system link, content/source separation, corrections/revocation and link access. W4 owns accepted mode/price/credits; W7 owns distribution and qualified-read analytics.
8. **Team and creator settings.** Role checklist and creator-only restrictions, invitation/removal UI through W1, onboarding links to Offers/Earnings/License/My AI, scoped support and pause entry, operational handover without impersonation. Respect role-specific views on phone and desktop.
9. **Meaning and tenure.** “This helped” and optional thanks with sharing consent, creator-visible consented notes, tenure-based recognition/perks that never derive from spend. W7 owns aggregation/Impact digest; W5 owns Thanks capture and source data. Avoid inflating counts or claiming creator attention from AI activity.

## Surfaces and ownership

Own Studio daily shell, NoteCompose, Replies, Requests queue, PacketDetail, Threads/ThreadView, More, Team and Publish compositions; relevant fan Note/public-answer presentation is allocated by the [design inventory](../research/design-inventory.md). W1 owns the signing primitive and root navigation; W2 My AI/License; W4 Offers/Earnings; W7 Insights/Impact; W6 calls.

Use backend presence/content/read-model modules, isolated Studio routes/components and native fan content modules. Ask W1 to register new feature routes; do not expand a single shared catalog file into the production Studio. The specified native app scope is fans; mobile web Studio is required. Native creator Studio can be added later under the recorded extension without displacing these requirements.

## First deliveries and dependencies

Start Notes/Replies and creator packet/detail UI against C06/C08 schemas while W4 implements transactions. Deliver one creator-signed Note → private fan reply → signed reaction end to end, then paid personal fulfillment and takeover. Follow with publishing/source consent, team role views, public/group answers and full library.

## Required runtime demonstrations

- Creator sends a Note to a real configured audience; two fan accounts see the broadcast label, reply privately, and cannot retrieve one another's replies. Creator reacts; team cannot impersonate that reaction.
- Fulfill a written request with personal text and with an exact approved draft; editing invalidates approval. Try all Instead actions, including fan acceptance/rejection of a changed offer. Confirm ledger/commitment with W4.
- Record/upload/sign a real voice response; cancelled upload/signing preserves a safe draft and does not mark delivery. Play it in browser and native fan apps.
- Open a thread as creator and permitted team, inspect fan audit history, take over mid-generation and hand back. Revoke the team's role while its screen remains open.
- Publish private/tier/public content; toggle AI-source approval separately; wrong audience cannot view, search, share or inject it into AI retrieval. Unpublish/revoke and verify cached/deep-linked outcomes.
- Publish a quote/public/group answer with and without fan sharing consent; confirm anonymization, source approval and correct system delivery to eligible threads.
- Exercise “This helped”/thanks consent and tenure; follow actual data into W7 Impact without raw unconsented fan disclosure.
- Use the Studio at reference phone and desktop widths, both themes, keyboard-only and large text. Verify exact layouts, queue scroll restoration, deadlines/time zones, dialogs and composer focus.

## Delivery standard

The creator can complete daily work without a console, manual database edit, or fake success state. Deliver domain APIs, fully functional Studio routes, fan integrations, signed-act and fulfillment evidence, source-vs-audience separation, and reviewed visual captures. Every action must produce the label and downstream state promised by its preview.

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
2. Write a short execution checklist in `docs/workstreams/status/W5.md`, linked to source flows/invariants/artboards and required acceptance scenarios. Begin implementation promptly after the necessary inspection; do not stop with a plan.
3. Personally deliver the first increment described above, connect it to actual domain state, launch the applicable apps, fix observed defects and record evidence. Continue through the remaining work packages and assigned full-product opportunities; later release gates do not erase development scope.
4. Keep changes maintainable: typed boundaries, scoped database access, indexes/constraints, idempotency, durable effects and reconciliation, bounded jobs/queries, truthful failure states, redacted logs and configuration. Keep secrets and private fan content out of code and evidence.
5. Integrate with peer-owned capabilities at working checkpoints, recheck affected journeys and update the status file. Do not wait until the end of your entire stream to discover contract mismatches.
6. Save sanitized screenshots/video/design comparisons and relevant trace/provider-record references under `artifacts/workstreams/W5/<increment>/<run>/`. Record revision/build, environment, actor roles, device/OS, viewport/theme, provider mode, steps, expected/observed result, fixes and remaining limitations.
7. Complete all feasible work before returning. If a genuine external decision or unavailable resource prevents the remaining path, finish independent work, identify the exact dependency and owner, and report the narrow blocked items. Do not invent success, silently reduce scope or ask whether to continue work already assigned.

Your handoff must state: what is implemented; source/artboard/contract coverage; how to launch; which real browser/native/provider/device journeys you personally exercised; evidence links and measured results; remaining defects or blocked/unverified items with the next action. Separate implemented, runnable, integrated, verified and release-ready. No new test-code or coverage deliverables. Do not claim the whole app is bug-free or production-ready from compilation or one happy-path run.

Begin now. Personally implement and verify your assigned workstream through completion; use subagents only to research or check information.

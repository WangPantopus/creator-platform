# All eight workstream execution prompts

Copy only the chosen workstream's section into its independent agent. Every section includes the complete shared execution rules, personal-implementation requirement, research-only subagent exception, full scope, primary artboards and real-app verification standards. Do not give all eight assignments to one agent.

- [W1 — Platform, identity, and app foundations](W1-platform-identity.md)
- [W2 — Creator AI, knowledge, and model runtime](W2-creator-ai.md)
- [W3 — Fan conversations and real-time chat](W3-conversations.md)
- [W4 — Commerce, access, and request lifecycle](W4-commerce-requests.md)
- [W5 — Creator Studio, content, and fulfillment](W5-studio-content.md)
- [W6 — Calls, voice, and media](W6-calls-media.md)
- [W7 — Discovery, growth, notifications, and insights](W7-growth-insights.md)
- [W8 — Trust operations, reliability, and release](W8-trust-release.md)

---

# Execution prompt — W1 — Platform, identity, and app foundations

You are the directly assigned primary implementation agent for **W1**. Take ownership of this entire workstream in `/Users/yingpengwang/creator-platform` (or its explicitly assigned worktree). This is an instruction to implement and verify the product, not merely to plan or review it. You are one of eight independent workstream owners.

Canonical detailed brief: [W1 — Platform, identity, and app foundations](../W1-platform-identity.md). This prompt includes its scope and strengthens the execution rules with the founder's latest instructions.

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

- **4A-02 — 02 · Continue with Pantopus**: [Welcome.dc.html](../../../design/phase4a-fan-core/Welcome.dc.html); reference 390×844; surface F.
- **4A-13 — 13 · Onboarding: your handle**: [Handle.dc.html](../../../design/phase4a-fan-core/Handle.dc.html); reference 390×844; surface F.
- **4B-08 — 08 · Verification page (web)**: [Verify.dc.html](../../../design/phase4b-fan-account/Verify.dc.html); reference 390×1000; surface Public web + SHARE.
- **4C-03 — 03 · Review and sign**: [Sign.dc.html](../../../design/phase4c-studio-phone/Sign.dc.html); reference 390×844; surface SP.
- **4D-01 — 01 · Get verified and set up**: [Main.dc.html](../../../design/phase4d-studio-desktop/Main.dc.html); reference 1280×900; surface SD.
- **5.5 — 5.5 · Who wrote this? (comprehension test)**: [Comprehension.dc.html](../../../design/phase5-prototypes/Comprehension.dc.html); reference 390×844; surface REF.

You also own the 53-component shared foundation and generated design resources. Semantic feature owners contribute requirements; you personally perform your shared-file integration and fidelity work.

## Outcome and scope

A fan can arrive at a deep link, authenticate through the account boundary, establish their public profile/eligibility, and return to the intended object. A creator can verify their identity, register a passkey, and sign exactly the act the fan will see. Each client has functioning navigation, session handling, API configuration, common UI, and truthful unavailable/recovery states.

1. **Identity adapter and sessions.** Finish authentication continuation/callback, validated return targets, account/session resolution, expiry/refresh/logout/revocation, fan 18+ eligibility, creator/fan profiles and handles, role switching, and scoped capability responses. Keep Pantopus integration behind the adapter for later. A synthetic local development adapter may unblock isolated development if explicitly selected and impossible to enable accidentally in production; it must not become a second production account system. The production identity connection remains a recorded external dependency.
2. **Creator verification.** External proof challenge, submission, pending/rejected/approved states, manual review hooks, creator-only authority, and status propagation. Draft setup stays usable while pending; public activation waits. W8 owns the review case UI/actions and W2 owns AI activation. Do not confuse creator identity with payout-provider KYC.
3. **Passkeys and signed acts.** Registration/authentication, exact canonical payload hashing, user verification, credential ownership, short expiry, replay prevention, revoked keys, recovery/rotation, and device cancellation. Provide web, Swift AuthenticationServices, and Kotlin Credential Manager adapters and the exact-content signing sheet. Bind Notes, reactions, replies, approvals, corrections, acceptances and other named acts through the same primitive. Document unsupported-device behavior; no weaker silent signature fallback.
4. **Team authority.** Invitation, acceptance, removal and role checks with scopes from D-07. Team identity never becomes creator identity. W5 owns settings UI and W8 owns privileged review/audit. Creator confirmation is required for protected guardrail/never-reveal changes.
5. **All client shells.** Real navigation, authenticated API session/configuration, deep-link resolver, safe auth return, feature capability gating, role-aware surfaces, error handling, theme/system settings, secure native credential storage, account-switch cache purge, and schema-compatible clients. Native apps must reach actual feature routes; catalog-only hosts are insufficient.
6. **Shared design and contract infrastructure.** Finish 53 native components against the independent reference; address clipped compositions and unaccepted native fidelity. Maintain typed web components, generated tokens/copy/fonts/glyphs, OpenAPI and Swift/Kotlin clients, common money/time/error representations, shared loading/offline/dialog primitives, and rename support. Domain owners supply copy/token needs and own composed screens.
7. **Verifiable identity presentation.** Server-derived author treatments and reusable Signed links. Own public signed-act verification semantics with W7's public entry/share pages; show content/version/provenance/revocation status honestly. A signature proves an authorized key approved an act, not the truth of every factual statement in it.

## Owned surfaces and files

Primary entry/sign-in/handle/identity verification/signing surfaces are assigned in the [design inventory](../research/design-inventory.md). Own shared UI and root wiring in `packages/`, `config/`, `scripts/`, backend identity/bootstrap, native app roots/projects, and web layout/navigation. Coordinate edits through the shared-file rules; preserve the source artboards. Creator signing is required in responsive web Studio, including supported mobile browsers. Native credential adapters support native identity and the shared signing capability; full native creator Studio remains O19 and is not implicitly required for fan-native acceptance.

The source has no complete creator onboarding/passkey recovery sequence. Deliver its domain mechanics and record each missing composition in the design-gap register before visual acceptance. Follow `docs/NAMING.md` for final-domain, relying-party, bundle-ID and store-name decisions.

## Interfaces and sequencing

Publish C01 actor/session, C02 signed command, C11 navigation, and the shared schema conventions first. Accept narrow W2–W8 feature route/schema registrations without centralizing their domain logic. Register domain-owned consent records through a common actor/time/version envelope, while each owner enforces its purpose.

First increment: all three apps launch with real navigation and an explicit configured/unconfigured identity capability; two development actors remain isolated. Next: creator verification/passkey/signing with W8 review and W5 named act. Then: native fidelity, unsupported device/recovery handling, and production identity integration readiness. Do not wait for production credentials to finish the rest of the clients.

## Required runtime demonstrations

- Open an authenticated deep link signed out; complete sign-in and return to the same permitted object on web and both native apps. Deny malformed/cross-origin return URLs and inaccessible objects safely.
- Expire and revoke a session while two clients are open; privileged mutations stop and cached private data does not leak after account switch.
- Try a creator act as fan, team member, creator without fresh assertion, and creator with the exact assertion. Only the authorized exact payload succeeds; edit after signing, replay, expiry and wrong-account key fail.
- Exercise creator verification pending/rejected/approved/revoked behavior. Pending drafts remain editable without a public AI becoming live.
- Run native passkey UI in available simulators/emulators; use real devices/relying-party configuration for release proof. Record unsupported Android versions and recovery outcomes explicitly.
- Compare all shared component variants Light/Night to references; verify keyboard/focus, 200% text, VoiceOver/TalkBack, reduced motion and screen safe areas.
- Regenerate all clients/resources and compile all consumers after a shared-contract change. Preview the existing brand rename in a disposable copy; do not rename the live project.

## Delivery standard

Supply an identity/authority diagram, contract examples, working client entry routes, configuration instructions, exact visual evidence, supported-device matrix, and unresolved identity/domain/recovery inputs. Consumers can build without inventing users, auth headers, signing payloads or navigation. No claims of production authentication or native passkey readiness without actual provider/device evidence.

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
2. Write a short execution checklist in `docs/workstreams/status/W1.md`, linked to source flows/invariants/artboards and required acceptance scenarios. Begin implementation promptly after the necessary inspection; do not stop with a plan.
3. Personally deliver the first increment described above, connect it to actual domain state, launch the applicable apps, fix observed defects and record evidence. Continue through the remaining work packages and assigned full-product opportunities; later release gates do not erase development scope.
4. Keep changes maintainable: typed boundaries, scoped database access, indexes/constraints, idempotency, durable effects and reconciliation, bounded jobs/queries, truthful failure states, redacted logs and configuration. Keep secrets and private fan content out of code and evidence.
5. Integrate with peer-owned capabilities at working checkpoints, recheck affected journeys and update the status file. Do not wait until the end of your entire stream to discover contract mismatches.
6. Save sanitized screenshots/video/design comparisons and relevant trace/provider-record references under `artifacts/workstreams/W1/<increment>/<run>/`. Record revision/build, environment, actor roles, device/OS, viewport/theme, provider mode, steps, expected/observed result, fixes and remaining limitations.
7. Complete all feasible work before returning. If a genuine external decision or unavailable resource prevents the remaining path, finish independent work, identify the exact dependency and owner, and report the narrow blocked items. Do not invent success, silently reduce scope or ask whether to continue work already assigned.

Your handoff must state: what is implemented; source/artboard/contract coverage; how to launch; which real browser/native/provider/device journeys you personally exercised; evidence links and measured results; remaining defects or blocked/unverified items with the next action. Separate implemented, runnable, integrated, verified and release-ready. No new test-code or coverage deliverables. Do not claim the whole app is bug-free or production-ready from compilation or one happy-path run.

Begin now. Personally implement and verify your assigned workstream through completion; use subagents only to research or check information.

---

# Execution prompt — W2 — Creator AI, knowledge, and model runtime

You are the directly assigned primary implementation agent for **W2**. Take ownership of this entire workstream in `/Users/yingpengwang/creator-platform` (or its explicitly assigned worktree). This is an instruction to implement and verify the product, not merely to plan or review it. You are one of eight independent workstream owners.

Canonical detailed brief: [W2 — Creator AI, knowledge, and model runtime](../W2-creator-ai.md). This prompt includes its scope and strengthens the execution rules with the founder's latest instructions.

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

- **4C-07 — 07 · My AI: live version and 72-hour digest**: [MyAI.dc.html](../../../design/phase4c-studio-phone/MyAI.dc.html); reference 390×1300; surface SP.
- **4D-02 — 02 · My AI · Sources**: [Sources.dc.html](../../../design/phase4d-studio-desktop/Sources.dc.html); reference 1280×900; surface SD.
- **4D-03 — 03 · My AI · Mode, style and rules**: [Style.dc.html](../../../design/phase4d-studio-desktop/Style.dc.html); reference 1280×900; surface SD.
- **4D-04 — 04 · My AI · Test, publish, versions**: [Test.dc.html](../../../design/phase4d-studio-desktop/Test.dc.html); reference 1280×900; surface SD.
- **4D-08 — 08 · License and sponsorships**: [License.dc.html](../../../design/phase4d-studio-desktop/License.dc.html); reference 1280×900; surface SD.
- **5.4 — 5.4 · Onboarding to a published AI**: [Onboard.dc.html](../../../design/phase5-prototypes/Onboard.dc.html); reference 1280×800; surface REF → SD.

## Work packages

1. **Creator setup and interview.** Resumeable onboarding after W1 verification; expert/companion/blend mode, story/boundaries interview in text or consented audio, review before interview becomes an approved source, and the weekly short current-status check-in with expiry. Drafts must survive refresh and incomplete verification. Show value while preserving the license/approval/publish gates.
2. **Sources and rights.** Manual upload/text and permitted YouTube caption ingestion initially; candidate/processing/failed/approved/revoked source lifecycle; source origin, rights evidence, audience public/tier/group, validity/expiry and passage provenance. Import retries, deduplication, cancellation, revision, bulk review and revoked connector access. A URL field identifies an approved connector/source; it does not authorize unrestricted fetching. Define allowlists, SSRF protection, rights and size/time limits with W8. Never scrape around access restrictions. Add subsequent RSS/newsletter/platform-export connectors from documented creator demand; keep them explicitly owned.
3. **Ingestion and retrieval.** Bounded parsing/chunking/embedding in the ingestion pool, tenant-scoped storage, object-media link authorization, source status/progress, clean-up, and index lifecycle. Start with the specified scoped exact vector retrieval at pilot scale; filter creator/audience before retrieval, top four chunks and bounded budgets. Measure before changing index strategy. Untrusted source text is data, not model/system instructions.
4. **Configuration and versions.** Style card from creator-owned examples, editable/prunable examples, rules/never-reveal list, tone, mode, handoff policy, daily cost cap and session nudge. Draft/testing/live/paused/retired state machine, immutable compiled prefix/hash and source set, atomic live pointer, safe rollback and cache invalidation. Respect D-12: live AI replies instantly with its label; review-first governs exact approved drafts under the creator's name.
5. **License and sponsorship enforcement.** Structured permitted uses, term/attestation, ownership, voice permission and expiry/revocation/death/incapacity transitions. W8 acts on verified notice and W1 supplies authority; W2 pauses generation within five seconds and W4 automatically refunds open commitments. Estate opt-in requires a new license. Implement sponsorship registry and disclosed influence. Actual license wording needs the recorded counsel decision.
6. **Live AI pipeline.** Real provider adapters for generation, embeddings/classification as chosen; deterministic context order, fixed and retrieved style examples, scoped source chunks, current-thread tail, intro consent, memory/Notes/public answers, sponsor state and creator status. Small/large model routing, cost-weighted usage evidence, provider timeout/cancellation, bounded retries and concurrency, backpressure and fail-closed capability handling. W3 owns durable acceptance, transport/delivery and memory state; W4 owns allowance accounting.
7. **Guardrails and memory proposals.** Input crisis routing and output sentence checks before visibility; false human attention, fabricated promises, no-selling, private/restricted source leakage, companion exclusivity/dependency, unsupported expert answer fallback, sponsorship labels and citation validity. Safety remains accessible without a grant. Propose sensitive-memory questions once and scoped revision-bound memory updates to W3; silence is not consent. Honor off-the-record and exclusion semantics.
8. **Evaluation and improvement.** Six boundary evaluations, actual prompt/assembly pipeline, human-readable transcripts, version comparison, creator corrections → rules/negative examples/paraphrased regressions, publish blocking on failures, seven-day privacy-preserving shadow replay and cost reporting. Bind results to the exact draft revision and provider/classifier/retrieval configuration; edits invalidate prior evaluation evidence. No raw fan text is retained in regression material. Define creator usefulness/style criteria before evaluating; do not aim to fool fans about authorship.
9. **Lifecycle and export.** Creator export of sources/style/rules/versions; purge and revoke hooks for W8; invalidation within five seconds where specified. AI voice after the pilot only with permitted license, creator consent, approved provider, W6 media provenance/watermark and persistent audio/visual disclosure. Reserved live AI calls/video stay disabled.

## Surfaces and ownership

Own My AI, Sources, Style, Test, License/sponsorships, interview and AI setup portions of onboarding, plus the AI paused/updating/source-revoked states. See [exact artboards and gaps](../research/design-inventory.md). These are primarily responsive/desktop Studio web; shared fan behaviors must integrate with all W3 clients. W6 owns AI voice player/media surfaces; W7 delivers the 72-hour post-publish digest from W2 events.

Use `apps/backend/src/modules/agent/` and distinct source/ingestion submodules, Studio AI feature routes, namespaced API schemas, and domain migrations. Shared API indexes, worker startup and generated clients go through W1/W8. Do not write directly into W3 memory or W4 money tables.

## First deliveries and dependencies

Begin source/version contracts C05/C08 and draft Studio screens while W1 identity develops. Deliver a candidate source → approved source → evaluated immutable version path. Integrate one real configured model through W3 before expanding connectors and refinements. A provider stub may support screen development but cannot count as a working AI. Finish licensed publish, correction/rollback, source revocation and source-audience isolation before enabling external fans.

## Required runtime demonstrations

- Configure and publish one expert and one companion creator; show a cited answer opening the precise authorized passage, and an unsupported question with the correct fallback.
- Import a damaged/duplicate/large source, interrupt ingestion, retry and revoke it; no duplicate effective source or abandoned private asset remains.
- Ask for another fan's memory and another audience's restricted source through direct and indirect prompt injection. Inspect context/provenance evidence, not only the final prose.
- Try failed boundary evaluation, unverified creator, expired license, invalid voice consent and stale draft publication. The actual publish/generation path enforces the gate.
- Correct an answer, run its product regression evaluation, publish/rollback, and confirm new turns use the right version while historical messages retain truthful citations.
- In a live multi-device thread, trigger takeover, source revocation, memory deletion and provider timeout during generation. Coordinate evidence with W3; settlement/cancellation never leaves a phantom reply or permanent allowance hold.
- Exercise sensitive categories, distress, expiring trial and sponsor recommendations. No commercial crisis path, hidden sponsored claim or unconsented memory appears.
- Measure warm/cold first approved sentence and cost under the agreed profile. Record model/version/provider terms; current prices and no-retention claims must be verified before release.

## Delivery standard

Deliver functioning source/version/configuration workflows and real generation, creator-readable evaluation results, explicit source provenance, operational controls, export/revocation hooks, latency/cost evidence and design comparisons. Report provider or license decisions as specific remaining release gates, not completed integrations.

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
2. Write a short execution checklist in `docs/workstreams/status/W2.md`, linked to source flows/invariants/artboards and required acceptance scenarios. Begin implementation promptly after the necessary inspection; do not stop with a plan.
3. Personally deliver the first increment described above, connect it to actual domain state, launch the applicable apps, fix observed defects and record evidence. Continue through the remaining work packages and assigned full-product opportunities; later release gates do not erase development scope.
4. Keep changes maintainable: typed boundaries, scoped database access, indexes/constraints, idempotency, durable effects and reconciliation, bounded jobs/queries, truthful failure states, redacted logs and configuration. Keep secrets and private fan content out of code and evidence.
5. Integrate with peer-owned capabilities at working checkpoints, recheck affected journeys and update the status file. Do not wait until the end of your entire stream to discover contract mismatches.
6. Save sanitized screenshots/video/design comparisons and relevant trace/provider-record references under `artifacts/workstreams/W2/<increment>/<run>/`. Record revision/build, environment, actor roles, device/OS, viewport/theme, provider mode, steps, expected/observed result, fixes and remaining limitations.
7. Complete all feasible work before returning. If a genuine external decision or unavailable resource prevents the remaining path, finish independent work, identify the exact dependency and owner, and report the narrow blocked items. Do not invent success, silently reduce scope or ask whether to continue work already assigned.

Your handoff must state: what is implemented; source/artboard/contract coverage; how to launch; which real browser/native/provider/device journeys you personally exercised; evidence links and measured results; remaining defects or blocked/unverified items with the next action. Separate implemented, runnable, integrated, verified and release-ready. No new test-code or coverage deliverables. Do not claim the whole app is bug-free or production-ready from compilation or one happy-path run.

Begin now. Personally implement and verify your assigned workstream through completion; use subagents only to research or check information.

---

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

---

# Execution prompt — W4 — Commerce, access, and request lifecycle

You are the directly assigned primary implementation agent for **W4**. Take ownership of this entire workstream in `/Users/yingpengwang/creator-platform` (or its explicitly assigned worktree). This is an instruction to implement and verify the product, not merely to plan or review it. You are one of eight independent workstream owners.

Canonical detailed brief: [W4 — Commerce, access, and request lifecycle](../W4-commerce-requests.md). This prompt includes its scope and strengthens the execution rules with the founder's latest instructions.

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

- **4A-06 — 06 · Ask Maya to step in**: [Packet.dc.html](../../../design/phase4a-fan-core/Packet.dc.html); reference 390×1700; surface F.
- **4A-07 — 07 · First paid action · spend limit**: [Limit.dc.html](../../../design/phase4a-fan-core/Limit.dc.html); reference 390×844; surface F.
- **4A-08 — 08 · Request status and receipt**: [Status.dc.html](../../../design/phase4a-fan-core/Status.dc.html); reference 390×1300; surface F + SHARE.
- **4A-16 — 16 · Add a card (hold, not a charge)**: [Checkout.dc.html](../../../design/phase4a-fan-core/Checkout.dc.html); reference 390×844; surface F (native policy gated).
- **4B-03 — 03 · Creator profile · Access**: [Access.dc.html](../../../design/phase4b-fan-account/Access.dc.html); reference 390×1100; surface F.
- **4B-04 — 04 · Requests tab**: [Requests.dc.html](../../../design/phase4b-fan-account/Requests.dc.html); reference 390×1100; surface F.
- **4B-07 — 07 · Spending and time**: [Spending.dc.html](../../../design/phase4b-fan-account/Spending.dc.html); reference 390×1000; surface F.
- **4D-05 — 05 · Offers**: [Offers.dc.html](../../../design/phase4d-studio-desktop/Offers.dc.html); reference 1280×900; surface SD.
- **4D-06 — 06 · Earnings**: [Earnings.dc.html](../../../design/phase4d-studio-desktop/Earnings.dc.html); reference 1280×900; surface SD.
- **4E-06 — E6 · Native membership purchase**: [IAP.dc.html](../../../design/phase4e-4i/IAP.dc.html); reference 390×844; surface iOS + Android / OS.
- **4G-01 — G1 · Your pass**: [PassYou.dc.html](../../../design/phase4e-4i/PassYou.dc.html); reference 390×1100; surface F.
- **4G-03 — G3 · Pool earnings**: [Pool.dc.html](../../../design/phase4e-4i/Pool.dc.html); reference 1280×900; surface SD.
- **5.2 — 5.2 · Step in to a signed reply**: [StepIn.dc.html](../../../design/phase5-prototypes/StepIn.dc.html); reference 390×844; surface REF → F.

## Work packages

1. **Access and offers.** Human modes, tiers/memberships and audience capabilities, effective grants and non-stacking equivalent access, approximately 24-hour first-conversation trial, cost-weighted AI allowance reservations, mode availability and four access lines. Pass reach never grants tier depth. Use one authoritative grant/capacity read model everywhere; cache invalidation is versioned and prompt.
2. **Membership billing.** Configured catalog/prices/currencies, consolidated web billing, start/renew/cancel/change, grace/payment failure, unused seven-day full refund and subsequent pro-rating per product policy, entitlement reconciliation, receipts and creator allocation. StoreKit 2/Play Billing products, verified server transactions, restore, pending/deferred/failed purchase, renewals/refunds/revocations and account linking. Consolidated web charges do not imply unsupported consolidation of separate store purchases; record provider-specific behavior in the billing contract.
3. **Packet and capacity.** Fan-edited summary, explicit disclosure set and separate access notice, private/public selection, mode/price/SLA/availability snapshot, spend limit before capacity and hold, reservation row lock, idempotency, submit/withdraw/expire, ask for more information, decision window bounded by the provider's real capture expiry with the architecture's six-hour safety margin. More-info pauses the creator's decision SLA, never the bank authorization clock; reauthorization preserves the same packet/payment lineage. Include attachment constraints with W6. Never place a hold when capacity is unavailable.
4. **Decisions and commitments.** Implement all eight F6 choices and the fulfillment matrix, creator authority/signature requirements, exact approved-draft eligibility, capture only on acceptance, due/delivered/refund/resolution transitions, guaranteed-review attestation if offered, and signed proof for actual promised service. A changed mode/group offer requires fan consent; AI or team activity cannot silently fulfill a personal promise. W5 owns the creator decision UI; W6 supplies call evidence.
5. **Payment reliability.** Stripe adapter per build prompt, platform/Connect topology decision, manual authorization/capture/release, authentication-required state, ambiguous external success, replay protection, webhook signature/inbox dedupe/current-state fetch, outbox effects, reconciliation jobs and compensation. Design transaction boundaries so slow provider calls do not hold capacity locks indefinitely; repair crash-after-provider-success without duplicating funds or obligations.
6. **Money ledger and operations.** Append-only cause-linked holds/captures/releases/refunds/adjustments/credits/pool allocations/payout releases; minor units and currency; balance reconciliation, payout account onboarding/KYC status, fees, reserves/disputes/chargebacks, payout failure and creator earnings statements. Apply the specified delivery-plus-seven-day dispute-window payout-release rule and dispute holds. W8 operates cases through commands; it cannot edit ledger history. Tax/reporting and country availability require configured business decisions, not invented rates.
7. **Spending and fairness.** First-paid-action monthly limit, explicit no-limit choice, 50%/100% reminders, delayed 24-hour increases and immediate decreases, monthly summary, unused/pro-rated refunds, refund status/reasons, fan cancellation and subscription-management routes. Confirm race behavior against existing pending holds/obligations in the contract. Keep prices outside AI messages and avoid spend-based ranks.
8. **Pass, full scope.** Membership remains launch lead. Later pass subscription, three-slot/default configured selection, active/draft-next/ended-readable/replaced states, calendar-month transition, incomplete draft carry-forward, first-cycle pro-rating, unavailable creator free replacement, no membership double count, atomic grant changes, slot-day allocation, creator pool and idempotent payouts. Build it before its roster-dependent release gate, without exposing premature pass marketing.
9. **Public answers, sharing and credits.** Lower-price public request, explicit private-to-group offer acceptance, capped noncash asker credits for eligible reads, ledger-backed issuance/redemption/refund interactions, dedupe/anti-farming and creator payout consistency. Own ShareGrant: creator per-mode sharing permission plus fan choice/handle display; either party can revoke and invalidate the card. W7 renders artifacts and emits qualified audience/read evidence; W4 decides credit eligibility and amount from configuration. Amounts/caps remain a decision, never sample magic numbers.

## Owned surfaces and boundaries

Own fan Packet, Limit, Checkout, Status/receipt, Requests, Access, Spending and Pass; creator Offers, Earnings and pool allocation surfaces; native IAP handoff/recovery. [The inventory](../research/design-inventory.md) gives exact file ownership. W5 owns Studio queue and packet detail as consumers. W6 owns OfferTimes/session mechanics while W4 owns acceptance/pricing/capacity and the resulting commitment.

Use distinct access/handoff/payments modules and commerce feature directories. Keep allowance operations available inside W3's acceptance transaction, with clear reserve/consume/release semantics. W1 enforces actor/signature identity. W8 registers migrations and operational jobs. Never let UI clients compute their own settlement or release entitlements from a local receipt alone.

## First deliveries and dependencies

Set C03 capabilities and C06 packet/fulfillment contracts early. Start with a sandbox membership and written-request round trip: price snapshot → capacity reservation/hold → creator acceptance/capture → signed delivery/receipt. Add decline/expiry/refund/reconciliation before any external paid use. Progress to store billing, call outcomes, credits and pass in parallel increments without forking the ledger.

Native paid written/voice replies remain subject to the unresolved distribution decision. Finish their shared workflow and web payment; keep native purchase capability explicitly gated until current store rules and the business/counsel decision are resolved. Never route around a store rule by quietly substituting a webview.

## Required runtime demonstrations

- Complete membership purchase/restore/cancel/refund and cross-client entitlement refresh using provider sandboxes. Replay/reorder a notification and reconcile missing delivery from provider truth.
- Two fans race for the last capacity unit; two requests race for one spend/allowance balance. One valid acceptance, no overbooking/negative counters, no failed-path hold.
- Submit, authenticate payment, withdraw, decline, request more info, expire authorization, accept, deliver, miss deadline and refund. Reload each state in fan and Studio; every amount/deadline agrees.
- Double-click and retry submit/accept/refund/delivery; simulate provider success followed by application restart. No duplicate capture, payment, commitment or refund; unresolved money is visibly processing until reconciled.
- Attempt personal fulfillment by AI/team, edited approved draft, wrong media mode, revoked creator and incomplete call. No false delivery; the correct named service succeeds.
- Raise a spend limit and immediately submit; delayed increase remains ineffective. Lower a limit, reconcile pending exposure, and verify exact before/after behavior.
- Run calendar transition with draft/unchanged/replaced/cancelled slots; grants and slot-day payouts reconcile exactly, including pro-rating and failed provider delivery.
- Demonstrate public-answer consent and credit farming limits with repeated/self/ineligible reads; noncash cap and refunds remain correct.

## Delivery standard

Provide the state/transition table, schema/migrations, provider reconciliation and recovery instructions, functioning fan/Studio/native commerce surfaces, sandbox evidence, and an explained ledger for each demonstrated outcome. All known money/authority defects block release. No real charge, payout, public price or store policy decision is inferred from successful sandbox behavior.

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
2. Write a short execution checklist in `docs/workstreams/status/W4.md`, linked to source flows/invariants/artboards and required acceptance scenarios. Begin implementation promptly after the necessary inspection; do not stop with a plan.
3. Personally deliver the first increment described above, connect it to actual domain state, launch the applicable apps, fix observed defects and record evidence. Continue through the remaining work packages and assigned full-product opportunities; later release gates do not erase development scope.
4. Keep changes maintainable: typed boundaries, scoped database access, indexes/constraints, idempotency, durable effects and reconciliation, bounded jobs/queries, truthful failure states, redacted logs and configuration. Keep secrets and private fan content out of code and evidence.
5. Integrate with peer-owned capabilities at working checkpoints, recheck affected journeys and update the status file. Do not wait until the end of your entire stream to discover contract mismatches.
6. Save sanitized screenshots/video/design comparisons and relevant trace/provider-record references under `artifacts/workstreams/W4/<increment>/<run>/`. Record revision/build, environment, actor roles, device/OS, viewport/theme, provider mode, steps, expected/observed result, fixes and remaining limitations.
7. Complete all feasible work before returning. If a genuine external decision or unavailable resource prevents the remaining path, finish independent work, identify the exact dependency and owner, and report the narrow blocked items. Do not invent success, silently reduce scope or ask whether to continue work already assigned.

Your handoff must state: what is implemented; source/artboard/contract coverage; how to launch; which real browser/native/provider/device journeys you personally exercised; evidence links and measured results; remaining defects or blocked/unverified items with the next action. Separate implemented, runnable, integrated, verified and release-ready. No new test-code or coverage deliverables. Do not claim the whole app is bug-free or production-ready from compilation or one happy-path run.

Begin now. Personally implement and verify your assigned workstream through completion; use subagents only to research or check information.

---

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

---

# Execution prompt — W6 — Calls, voice, and media

You are the directly assigned primary implementation agent for **W6**. Take ownership of this entire workstream in `/Users/yingpengwang/creator-platform` (or its explicitly assigned worktree). This is an instruction to implement and verify the product, not merely to plan or review it. You are one of eight independent workstream owners.

Canonical detailed brief: [W6 — Calls, voice, and media](../W6-calls-media.md). This prompt includes its scope and strengthens the execution rules with the founder's latest instructions.

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

- **4E-01 — E1 · Before the call**: [Main.dc.html](../../../design/phase4e-4i/Main.dc.html); reference 390×844; surface F + SP.
- **4E-02 — E2 · Connected (Night)**: [CallLive.dc.html](../../../design/phase4e-4i/CallLive.dc.html); reference 390×844; surface F + SP.
- **4E-03 — E3 · After the call**: [CallAfter.dc.html](../../../design/phase4e-4i/CallAfter.dc.html); reference 390×900; surface F + SP.
- **4E-04 — E4 · Creator offers times**: [OfferTimes.dc.html](../../../design/phase4e-4i/OfferTimes.dc.html); reference 390×900; surface SP.
- **4F-03 — F3 · AI voice notes**: [AIVoice.dc.html](../../../design/phase4e-4i/AIVoice.dc.html); reference 390×1000; surface F.

## Work packages

1. **Media pipeline.** Scoped signed upload/download URLs, declared type/size/duration checks, progress/cancel/retry, resumable handling where needed, quarantining/scanning and safe parsing, thumbnails/waveforms/captions or transcripts where consent permits, transcoding, object ownership/retention, cache/CDN controls and deletion. Bound processing away from the interactive Node pool. Cover fan attachments, source/interview audio, posts/photos, human Notes/replies and call assets.
2. **Human voice first.** Browser/native recording permissions, recording/preview/discard/re-record, interruptions and audio route, duration limits per content type, M4A output and provenance manifest, signed exact-media act through W1, secure playback/seeking/accessibility and no autoplay. W5 owns content/fulfillment; W4 decides whether the delivery satisfies a commitment.
3. **Availability and scheduling.** Creator windows, time zones/daylight-saving transitions, offer times, fan selection, overlap locks, expired offers, reschedule/cancel behavior and reminders with W7. W4 owns acceptance/capture/capacity/commitment; agree atomic offer-accept semantics so offering times never incorrectly says payment waits until the call.
4. **Session lifecycle and rooms.** Scheduled/waiting/connecting/connected/reconnecting/ended lifecycle, creator's own verified account and correct fan participant, authorized short-lived tokens, private room capabilities, human identity chip, packet-only pre-call brief, microphone/camera/network state and waiting room. AI/team participants cannot satisfy a personal human call.
5. **Server clocks and outcomes.** Durable scheduled clock, connected-time accounting and reconnect allowance, server-enforced end with no overtime, default three-minute reconnect budget per D-16, disconnect/background/restart handling. Completed threshold, fan early end choice, creator early end partial refund, creator no-show, fan no-show and technical failure use precise documented outcomes. Fetch provider truth and reconcile missing/reordered callbacks before final settlement. Emit evidence to W4; do not independently calculate or issue refunds in client code.
6. **Separate consent.** Recording is off by default and needs both parties; summary separately needs both; reuse/content and AI-source use are separate. Without recording consent, a consented summary uses only the packet plus a creator-typed note, never an undisclosed transcript. Record actor, purpose, object, time and revocation. Stop/refuse only the unconsented action; joining a call does not expand permission. Show recording/summary state truthfully and delete media/derived assets according to W8 lifecycle jobs.
7. **Native calling.** Swift CallKit/audio session/background interruptions, Android supported Telecom/ConnectionService integration and foreground-service declarations, permissions, incoming-call delivery with W7, lock-screen presentation, Bluetooth/wired/speaker switching, interrupted cellular calls, camera rotation/foreground/background, killed-app recovery and denial states. Follow current OS/provider guidance; a ringing UI alone is not a connected call.
8. **AI audio after pilot.** W2 owns licensed generation/voice-provider policy. W6 handles consented assets, machine-readable provenance, robust watermark, spoken AI label, distinct player/visual label, revocation and cache lifecycle. Validate downloaded/shared/transcoded behavior; do not claim watermark or provenance survives a transform without checking it. Never introduce AI live calls/video into paid human sessions.

## Surfaces and boundaries

Own call preflight/waiting/live/reconnect/post-call, creator call/OfferTimes and AI/human audio compositions listed in the [inventory](../research/design-inventory.md), plus reusable native media adapters. Required parties are the fan on web/iOS/Android and creator on responsive web Studio; a creator web client can pair with a native fan. Native creator calling/Studio is the separately tracked O19 extension. W5 composes recording into Studio; W3 composes playback into chat; W4 displays the final receipt; W7 delivers reminders and link destinations.

Implement session/media modules, worker jobs, web media features and isolated Swift/Kotlin media/call modules. Native manifest/entitlement/project edits and root deep links use W1; deployment/storage/job capacity uses W8. Agree C07 outcome evidence and C06 scheduling acceptance before provider code.

## First deliveries and dependencies

Deliver human record → upload/process → sign → play first, because Notes and personal voice replies need it in the membership pilot. Build scheduling/provider room integration concurrently with W4 commitment states. Then prove two-party calling and every outcome, followed by device/background behavior and marked AI audio.

## Required runtime demonstrations

- Record, interrupt, resume/re-record, cancel, upload and play real human audio in browser, iOS Simulator and Android Emulator. Demonstrate microphone denial, route change, corrupt upload and access expiry.
- Two actors on distinct clients join one scheduled call; show correct identity, packet-only brief, time zones, connection progress and server ending at the purchased duration.
- Background/foreground, disconnect/reconnect within and beyond allowance, crash/restart backend worker, omit/reorder provider end events; all clients converge on one evidenced outcome.
- Exercise completed, creator no-show, fan no-show, fan early end, creator partial, technical failure and insufficient connected time. W4 receipt/settlement matches D-16; neither waiting nor reconnect time is billed as connected delivery.
- Attempt unauthorized participant/team join, reused token, call after authorization revocation, concurrent booking and expired offer. Deny without duplicate obligation/capture.
- Toggle recording, summary and reuse independently as each participant; the absent permission blocks its own action, and UI/retained files match actual consent.
- Run actual iPhone and Android hardware calls for Bluetooth, cellular interruption, background/terminated incoming delivery, battery/network behavior and camera/audio reliability. Emulators/simulators cannot close this release gate; log unavailable hardware as a blocker.
- Verify AI audio spoken/visual labels, manifest/watermark and licensed revocation in app/download/share transformations before enabling the feature.

## Delivery standard

Supply the session transition/outcome table, server clock evidence, provider reconciliation traces, media/consent lifecycle, real-device matrix and precise unsupported/unverified behaviors. The timer, settled amount and delivery status must agree on all participants' devices and in the creator/fan receipt. No fake room or local countdown qualifies as completed calling.

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
2. Write a short execution checklist in `docs/workstreams/status/W6.md`, linked to source flows/invariants/artboards and required acceptance scenarios. Begin implementation promptly after the necessary inspection; do not stop with a plan.
3. Personally deliver the first increment described above, connect it to actual domain state, launch the applicable apps, fix observed defects and record evidence. Continue through the remaining work packages and assigned full-product opportunities; later release gates do not erase development scope.
4. Keep changes maintainable: typed boundaries, scoped database access, indexes/constraints, idempotency, durable effects and reconciliation, bounded jobs/queries, truthful failure states, redacted logs and configuration. Keep secrets and private fan content out of code and evidence.
5. Integrate with peer-owned capabilities at working checkpoints, recheck affected journeys and update the status file. Do not wait until the end of your entire stream to discover contract mismatches.
6. Save sanitized screenshots/video/design comparisons and relevant trace/provider-record references under `artifacts/workstreams/W6/<increment>/<run>/`. Record revision/build, environment, actor roles, device/OS, viewport/theme, provider mode, steps, expected/observed result, fixes and remaining limitations.
7. Complete all feasible work before returning. If a genuine external decision or unavailable resource prevents the remaining path, finish independent work, identify the exact dependency and owner, and report the narrow blocked items. Do not invent success, silently reduce scope or ask whether to continue work already assigned.

Your handoff must state: what is implemented; source/artboard/contract coverage; how to launch; which real browser/native/provider/device journeys you personally exercised; evidence links and measured results; remaining defects or blocked/unverified items with the next action. Separate implemented, runnable, integrated, verified and release-ready. No new test-code or coverage deliverables. Do not claim the whole app is bug-free or production-ready from compilation or one happy-path run.

Begin now. Personally implement and verify your assigned workstream through completion; use subagents only to research or check information.

---

# Execution prompt — W7 — Discovery, growth, notifications, and insights

You are the directly assigned primary implementation agent for **W7**. Take ownership of this entire workstream in `/Users/yingpengwang/creator-platform` (or its explicitly assigned worktree). This is an instruction to implement and verify the product, not merely to plan or review it. You are one of eight independent workstream owners.

Canonical detailed brief: [W7 — Discovery, growth, notifications, and insights](../W7-growth-insights.md). This prompt includes its scope and strengthens the execution rules with the founder's latest instructions.

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

- **4A-01 — 01 · Maya's home (public)**: [Main.dc.html](../../../design/phase4a-fan-core/Main.dc.html); reference 390×1560; surface F.
- **4A-09 — 09 · Notifications**: [Notifications.dc.html](../../../design/phase4a-fan-core/Notifications.dc.html); reference 390×980; surface F.
- **4A-11 — 11 · Entrance: a post, Ask Maya's AI about this**: [Post.dc.html](../../../design/phase4a-fan-core/Post.dc.html); reference 390×1300; surface F.
- **4A-12 — 12 · Entrance: Maya's invite link**: [Invite.dc.html](../../../design/phase4a-fan-core/Invite.dc.html); reference 390×844; surface F.
- **4B-01 — 01 · Home**: [Main.dc.html](../../../design/phase4b-fan-account/Main.dc.html); reference 390×1300; surface F.
- **4B-02 — 02 · Discover**: [Discover.dc.html](../../../design/phase4b-fan-account/Discover.dc.html); reference 390×1400; surface F.
- **4C-10 — 10 · Weekly impact digest**: [Impact.dc.html](../../../design/phase4c-studio-phone/Impact.dc.html); reference 390×1000; surface SP.
- **4E-05 — E5 · Lock screen: push and incoming call**: [Push.dc.html](../../../design/phase4e-4i/Push.dc.html); reference 390×844; surface OS.
- **4F-02 — F2 · Share Maya's reply**: [ShareSheet.dc.html](../../../design/phase4e-4i/ShareSheet.dc.html); reference 390×900; surface F + SHARE.
- **4F-04 — F4 · Insights and producer**: [Insights.dc.html](../../../design/phase4e-4i/Insights.dc.html); reference 1280×900; surface SD.
- **4G-02 — G2 · Discover with the pass**: [DiscoverPass.dc.html](../../../design/phase4e-4i/DiscoverPass.dc.html); reference 390×1000; surface F.
- **4I-01 — I1 · Every notification, three channels**: [NotifMatrix.dc.html](../../../design/phase4e-4i/NotifMatrix.dc.html); reference 1280×1300; surface REF → F / OS / EMAIL.
- **4I-02 — I2 · Emails**: [Email.dc.html](../../../design/phase4e-4i/Email.dc.html); reference 1280×1000; surface EMAIL.

## Work packages

1. **Public creator home and fan Home.** Functional signed-out/signed-in creator profile segments, posts/requests/access read models, creator status/reliability/capacity from canonical owners, chronological updates, active requests/upcoming calls/thread recency and authorship, follow relationships and empty states. Preserve exact sample compositions while replacing hard-coded content with real authorized data.
2. **Discovery.** Search by need, categories, creator cards, modes, availability/reliability, accessible filters/loading/no results, later pass markers, and search/read-model refresh on creator pause or source changes. Start with public creator-level data; never expose restricted source passages or private fan questions through search. No algorithmic feed or paid attention ranking is added.
3. **Acquisition and entry context.** Stable creator/content/campaign links, public server-rendered pages, canonical URLs/sitemaps/metadata and eligible structured data, accessible link previews, preserving the originating post through sign-in/install/open. W1 owns auth/native resolver; W7 owns context and destinations with feature owners. Instagram comment-to-one-private-reply adapter is conditional on approved API permissions and current policy; the AI conversation remains in this app. No unsolicited outreach is performed by agents.
4. **Notifications and email.** Durable event consumption, recipient/audience checks, current-state recheck before send, dedupe, retries/backoff/dead letters, preferences/per-creator mute/channel controls/quiet hours, device-token lifecycle, email delivery/bounce/unsubscribe, in-app read state and correct deep links. Implement all **19 Product §9 types**; the 14-row design matrix is not the complete behavior inventory. In-app is the authoritative record and cannot be muted away; push/email are optional. Sender labels always reflect the actual event; sensitive text, money and restricted content follow the specified redaction rules. A stale event must not send “join” after a call ended.
5. **Sharing and verification entry.** Consented private reply sharing, immutable versioned share artifact, embedded authorship/AI labels, verification URL, correction/revocation status, public answers, approved quote/tenure display, safe preview generation and downstream access. W1 verifies signed-act semantics; W5 owns content; W4 owns credits. Screenshots cannot strip the identifying label through the default export path.
6. **Insights and producer.** Anonymized creator-scoped aggregation with at least five distinct fans per cluster, no raw fan identifiers/text in reports, unresolved question clusters, evidence/effort recommendations, accept/edit/defer/dismiss, “answer once for everyone,” opted-in public/group delivery and “posted about what you asked.” W5 publishes, W4 handles price-change consent, W3 supplies minimal scoped signals. Prevent re-identification through repeated small filters, exports and drill-downs.
7. **Creator activation and retention.** 72-hour post-publish digest from W2, weekly Impact using consented thanks, setup/import recovery cues, optional creator launch/share kit, truthful reliability/context and permitted return updates. The AI never sends a notification just to start a conversation; its only proactive notification is the specified creator-content match. Prefer returning value over notification volume. W5 owns Thanks and Notes; W7 owns digest aggregation and delivery.
8. **Measurement.** Versioned minimal event taxonomy for arrival→sign-in→consent→first useful answer→follow/membership→request→human delivery→return; distinguish fan/creator and expert/companion cohorts, web/native sources, new/returning users and unavailable capabilities. Measure acquisition source, time to first useful answer, D1/D7/D30 return, renewal/churn/reasons, creator activity/effort, support/refund burden, comprehension and cost with W8/W4. No private message text, sensitive memory, or individual heavy-use ranking enters marketing analytics.
9. **Beneficial additions.** Own the acquisition/activation/retention improvements in [opportunities](../OPPORTUNITIES.md), including usable empty states, opt-in invitations/share tools, search indexing hygiene and feedback channels. Treat experiments as hypotheses with success/stop criteria, not invented product policy. New compositions go through the design-gap process.

## Surfaces and files

Own public creator/profile and post entry composition, fan Home/Discover/notification views, Push/Email/notification matrix, sharing surfaces, Insights and Impact as assigned in the [inventory](../research/design-inventory.md). W4 supplies commerce/access/capacity; W3 owns conversation/account data; W5 owns content. Implement public read models, notifications, insights and growth features in isolated module directories; shared navigation/push entitlement wiring goes through W1, operational delivery settings through W8.

## First deliveries and dependencies

Establish C09 event envelope/recipient references and C11 destination contracts first. Deliver signed-out creator arrival → authenticated contextual thread, one current-state-correct notification, and basic funnel visibility. Complete daily presence notifications and digests before wider acquisition. Add insights/group answers/sharing, followed by pass discovery and measured acquisition refinements.

## Required runtime demonstrations

- Open creator/post links signed out on browser, iOS and Android; preserve valid context through sign-in, cold launch and app/web fallback. Wrong/expired/revoked targets show truthful recovery without leaking object details.
- Search for public creator needs and verify results/metadata update after pause/unpublish. Restricted sources and private pages never appear in rendered public HTML, previews or search results.
- Generate each notification type with actual domain actions; compare in-app/push/email label, redaction, deep link and current status. Duplicate/reorder/late events cannot produce duplicate or misleading messages.
- Change channel/mute/quiet-hour preferences, revoke permission, rotate a token, bounce an email and uninstall/reinstall. Explain delivery limitations and confirm preferences persist across clients.
- Share a permitted reply/public answer; verify identity, consent, immutable content version and correction/revocation from the public link. Denied sharing must not create an accessible artifact.
- Run insight cohorts below/at/above five distinct fans, repeated fan events and narrow filters; aggregate eligibility cannot be inflated or reveal raw conversation data.
- Publish from a producer recommendation and trace the authorized fan update and W4 group offer/credit outcome. Consent is never inferred from topic matching.
- Walk the full acquisition/retention funnel with development actors; inspect deduplicated events and dashboards, explaining denominators and exclusions. Suggested pilot bars remain proposed until agreed.

## Delivery standard

Supply usable discovery/entry/return journeys on actual clients, a complete notification matrix with runtime evidence, consented sharing, privacy-preserving creator insight, and trustworthy measurement. Include visual comparisons and current primary-source research for platform integrations. Do not buy ads, send recruiting messages, enable broad outreach, or claim retention uplift from an unrun experiment.

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
2. Write a short execution checklist in `docs/workstreams/status/W7.md`, linked to source flows/invariants/artboards and required acceptance scenarios. Begin implementation promptly after the necessary inspection; do not stop with a plan.
3. Personally deliver the first increment described above, connect it to actual domain state, launch the applicable apps, fix observed defects and record evidence. Continue through the remaining work packages and assigned full-product opportunities; later release gates do not erase development scope.
4. Keep changes maintainable: typed boundaries, scoped database access, indexes/constraints, idempotency, durable effects and reconciliation, bounded jobs/queries, truthful failure states, redacted logs and configuration. Keep secrets and private fan content out of code and evidence.
5. Integrate with peer-owned capabilities at working checkpoints, recheck affected journeys and update the status file. Do not wait until the end of your entire stream to discover contract mismatches.
6. Save sanitized screenshots/video/design comparisons and relevant trace/provider-record references under `artifacts/workstreams/W7/<increment>/<run>/`. Record revision/build, environment, actor roles, device/OS, viewport/theme, provider mode, steps, expected/observed result, fixes and remaining limitations.
7. Complete all feasible work before returning. If a genuine external decision or unavailable resource prevents the remaining path, finish independent work, identify the exact dependency and owner, and report the narrow blocked items. Do not invent success, silently reduce scope or ask whether to continue work already assigned.

Your handoff must state: what is implemented; source/artboard/contract coverage; how to launch; which real browser/native/provider/device journeys you personally exercised; evidence links and measured results; remaining defects or blocked/unverified items with the next action. Separate implemented, runnable, integrated, verified and release-ready. No new test-code or coverage deliverables. Do not claim the whole app is bug-free or production-ready from compilation or one happy-path run.

Begin now. Personally implement and verify your assigned workstream through completion; use subagents only to research or check information.

---

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

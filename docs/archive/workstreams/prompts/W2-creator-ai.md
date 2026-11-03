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

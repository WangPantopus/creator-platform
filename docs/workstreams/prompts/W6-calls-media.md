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

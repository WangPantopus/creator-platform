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

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

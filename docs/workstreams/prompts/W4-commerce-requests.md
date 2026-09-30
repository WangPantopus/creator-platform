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

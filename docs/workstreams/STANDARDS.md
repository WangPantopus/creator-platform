# Shared instructions for every workstream

## Personal implementation; research-only subagents

The assigned primary agent must personally perform all implementation for its stream: coding, schemas, migrations, configuration, debugging/fixes, integrations, documentation deliverables, builds, app launching and end-to-end verification. Subagents may only search for, research, or check information and return findings/references. They may inspect source/designs/docs read-only, but may not edit files, produce implementation code or patches, run implementation commands, operate the app for acceptance, or perform verification on the owner's behalf. Applying a subagent-written patch yourself does not satisfy this rule. This founder instruction supersedes any older permission to delegate implementation.

The other seven independently assigned stream owners are peers who implement their own responsibilities. Honor their file and contract ownership without outsourcing your assigned feature work to them. W1's shared-file integration and W8's infrastructure/integration coordination remain their own assignments; every owner still implements and verifies its domain personally.

## Authority and read order

Read `docs/workstreams/README.md` first: it records the founder's current overrides. Then read this document, `CONTRACTS.md`, `VERIFICATION.md`, your stream brief, `docs/BRIEF.md`, the four documents in `docs/source/`, `docs/BUILD_PROMPT.md`, `design/handoff/README.md`, `design/design-system/project/README.md`, and `docs/audit/AUDIT.md`. Inspect the exact source artboards and component guidelines for the increment you are building. Read applicable `AGENTS.md` files; web work also follows the installed Next.js documentation required by `apps/web/AGENTS.md`.

On behavior, the source decisions govern, with later accepted decisions overriding stale prose: D-12 instant labeled AI, D-23 membership first, D-24 full build, D-25 human voice first, D-26 approximately 24-hour first conversation, D-27 capped credits. Do not reproduce stale five-message trials or an auto-reply-after-20-approvals gate. Treat legal/market claims in the research documents as background to re-check where relevant, not current legal clearance.

On appearance, the current phase 4/5 designs and component system govern, with the explicit BUILD_PROMPT §9 corrections. Phase 2 exploratory directions are history, not additional themes to implement. If sources still conflict, record the exact conflict and obtain a targeted decision while continuing independent work. Do not use ambiguity to pause an entire stream.

## Build real product paths

- Complete the route from entry through meaningful result, persistence, subsequent visit, and failure recovery. Buttons must perform their named action. Eliminate sample-only state from released routes.
- Keep fan web and native fan apps functionally aligned for supported features. Studio is responsive web: phone-first daily work and desktop-first configuration/insights. Ops is web. The original docs specify native **fan** apps; native Studio is a separately identified extension, not an assumed substitute for the required mobile web Studio.
- A domain owner implements its Node.js module and applicable Next.js, Swift, and Kotlin features. W1 provides shared shells and primitives, not everybody's feature screens. W8 provides operational tools and integration oversight, not a final cleanup team.
- Build for signed out, fan, creator, permitted team, disallowed team, and scoped ops actors as relevant. Compute authority, authorship, money, access, and fulfillment on the server.
- Represent loading, empty, stale/offline, permission denial, unavailable capability, processing, success, conflict, retryable failure, and terminal failure. Preserve draft input where safe. Do not send messages, spend money, sign acts, or silently replay those actions offline.
- Use cursor pagination and bounded queries. Make time zones, server time, dates, money minor units/currency, locale formatting, media progress, and accessibility intentional.

## Exact design delivery

1. Record the artboard path and relevant component variants before coding. The source exports, not `/design` itself, are the independent reference.
2. Preserve original hierarchy/order, typography, spacing, heights, gutters, borders, surfaces, glyph geometry, and fixed copy. Phone reference width is 390 with 16-unit gutters; desktop Studio reference is 1280 with a 248-unit sidebar. Implement sensible resizing without changing the reference composition.
3. Use generated tokens, shared copy, bundled licensed fonts, and shared glyphs. Extend a missing token through W1 with a source measurement; avoid screen-specific magic values and hard-coded product names. Do not hand-edit generated output.
4. Keep author label, glyph, and treatment inside content. Creator plates and seals carry creator meaning. AI, exact approved draft, team, broadcast audience, reaction, fan, system, and human call must stay distinguishable in all surfaces. Corrections and Signed links survive sharing/export.
5. Capture actual implemented screens and original design at matching viewport, theme, content, and scroll state. Compare side by side/overlay using existing capture tools. Record and fix geometry, wrapping, token, focus, and interaction differences. A screenshot of the gallery is not a screenshot of the functional route; a self-generated native baseline is not independent evidence of fidelity.
6. Verify both Light and Night, keyboard open/closed, safe areas, large text up to 200%, reduced motion, screen reader reading order, focus, contrast, and touch targets. Maintain the reference at normal size; accessibility must reflow rather than clip. Record unavoidable native font/rendering differences and assess geometry separately.
7. Keep author labels readable, metadata/pills unbroken, and dialogs in real overlay/scrim layers. Apply corrected Night creator plate and neutral selection styles. Packet heading is “Included in your request”; retain the separately audited conversation-access disclosure.
8. For missing screens/states, open a design-gap entry with the source requirement, owner, proposed use of existing components, and screenshots when possible. Reuse established layout patterns for routine states; obtain design resolution for a new composition or changed meaning before calling it visually accepted. Never silently redesign a supplied screen.

## Technical delivery

Use the existing Node modular monolith and isolated interactive, generation, and ingestion/insights runtime pools. Keep dependencies behind module APIs; no direct cross-owner table writes. Use typed request/response/event schemas, validated input, domain error codes, and generated clients. Keep domain logic off UI components and avoid one giant native catalog/view becoming the product implementation.

Database changes need migration ownership, constraints, indexes, RLS where applicable, a rollout/recovery plan, and a before/after runtime check. Use the non-owner application role; `service_role` or table owner bypasses are not a replacement for scoped queries. Identity, money, call timing, granting access, and AI boundaries fail closed with a readable user state.

All externally retried mutations use scoped idempotency keys and durable outcome records. External effects use outbox/inbox/reconciliation, not an assumption that provider callbacks arrive once or in order. Do not hold database locks open across slow provider calls. Do not log credentials, raw private conversation text, or sensitive memory to general telemetry.

Use strict types, compilation, formatting, linting, and generated-resource consistency checks. Follow the current founder instruction: **no new test code or coverage deliverables**. Keep existing checks intact. If an existing command includes test execution, use narrower compile/type/lint commands when sufficient. Real runtime verification remains required, including races and failure paths.

The AI test console, six pre-publish boundary evaluations, correction regressions, and shadow replay are **product functionality**, not engineering unit tests. They remain required. Implement these production evaluation workflows and exercise them manually through the running Studio; do not build a separate automated test suite for this phase.

## Trust and safety are part of the feature

- The application derives `author_kind`; the model and clients cannot set it. Personal fulfillment needs the exact promised mode and creator authority. Creator-signed acts bind a fresh user-verified passkey assertion to the precise payload/version.
- Scoped retrieval happens before context assembly. Preserve per-creator/per-fan isolation, audience grants, memory revision/exclusion rules, current-version rules, and revocation propagation. Model prompts alone cannot enforce these boundaries.
- Reports, blocks, crisis resources, deletion, cancellation, and support stay reachable. Safety cannot become an upsell. Never optimize retention through dependency, guilt, fabricated human attention, spending ranks, or hidden cancellation.
- Record separate consent for AI processors, sensitive memory items, packet disclosure, recording, summary, reuse, sharing, and training. Joining one flow does not authorize another. Disclose actual provider behavior; do not ship unverified no-retention claims.
- Keep access auditing separate from request routing. Minimize case-worker access and record privileged reads and actions. Preserve required financial/dispute records with the disclosed retention exceptions.
- All currently disabled/reserved author states remain disabled; a new opportunity cannot silently enable them.

## Definition of delivered

An increment is complete only when all applicable items are demonstrated:

| Requirement | Evidence |
| --- | --- |
| Real functionality | Working entry-to-result journey with persisted data and a return visit; no fixture-only success |
| Design fidelity | Reference path, matched actual-app captures in both themes, reviewed differences |
| Correct authority and rules | Positive and negative role/grant checks; relevant invariant/T-scenario runtime results |
| Recovery | Offline/reconnect, duplicate action, provider failure/retry, stale state and process restart where relevant |
| Platforms | Actual browser, iOS Simulator, Android Emulator for supported fan paths; real devices/sandboxes where required |
| Usability | Keyboard, VoiceOver/TalkBack, focus, large text, motion, loading/empty/error feedback |
| Performance | Observed end-to-end timings/trace IDs and workload profile for affected latency-sensitive paths |
| Maintainability | Owned modules, contracts, migration notes, configuration and run instructions |
| Integration | Producer/consumer implementations work on the same integration revision |
| Honest handoff | Verified, partial, blocked, and unverified items separately listed; exact blocking decision or missing capability |

Use statuses: **planned → implementing → runnable → integrated → verified → release-ready**. A screen-only or fixture-only increment can be runnable; it cannot be integrated. Store evidence under `artifacts/workstreams/WN/<increment>/` and a human-readable manifest in `docs/workstreams/status/WN.md`. Avoid private production data in evidence.

Each handoff states: outcome; source coverage; changed paths/contracts; how to launch; sample roles/data; routes and devices exercised; provider mode; evidence links; observed defects and limitations; downstream action. Do not claim “bug free” or “scales to 50,000” from a build or one successful local session. Resolve all known release-blocking defects and quantify the validation actually performed.

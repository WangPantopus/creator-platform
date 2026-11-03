# Ownership, interfaces, and parallel working rules

These are proposed implementation boundaries to ratify at G0, not a claim that the named new modules/routes already exist. Reuse existing foundation code where it fits. Each capability has one accountable owner; contributors consume its public contract.

## Domain ownership

| Owner | Canonical domain/state | Main consumers and boundary |
| --- | --- | --- |
| W1 | Identity adapter/session, FanProfile and CreatorProfile identity, creator verification status, team authority, passkeys, SignedAct, consent-record envelope, shared app shells/tokens/copy/generation | W8 decides review/suspension cases; W1 applies identity transitions. Each domain owns the meaning of its consent/action. W5 owns team settings UI; W1 enforces roles. |
| W2 | KnowledgeSource/chunk/index, StyleExample, AgentVersion, source rights, replica license and sponsorship configuration/enforcement, interview, model routing/classifiers/assembler, AI evaluation, AI-voice generation policy | W1 signs/authorizes; W8 handles revocation case/policy. W3 owns thread/memory state; W2 consumes scoped snapshots and proposes memory, never writes unscoped conversation tables. W6 owns binary media processing. |
| W3 | Thread, Message, control epoch, GenerationRun delivery/resume checkpoints, durable fan acceptance, conversation Memory/revisions/exclusions/MemoryConsent, thread access audit, intro sharing and off-the-record behavior | W2 generates/classifies and proposes memory. W4 owns entitlement/allowance ledger operations. W5 submits signed creator/team/broadcast events through W3 APIs. W6 uses control transitions around calls. |
| W4 | Grant/capability decisions and allowance reservations, Tier/Membership, PassSubscription/Slot, HumanMode/Capacity, Packet/Approval/Commitment/ShareGrant, SpendLimit, payment records/ledger/credits/earnings/payouts, deadlines/refunds | W4 owns exact-message Approval and edit/role invalidation; W3 checks it before approved-draft delivery. ShareGrant binds creator mode permission and fan choice and can be revoked by either. W5 owns creator queue/detail/fulfillment UI; W6 reports session evidence; W7 renders share artifacts and publishes notifications. No other stream captures/refunds money or independently computes remaining capacity. |
| W5 | Content/library, Broadcast/Reply/Reaction, approved-draft editing UX, public-answer publishing, QuoteReply consent, Thanks, daily Studio read models and creator workflows | W1 supplies SignedAct; W3 stores delivered messages; W4 decides whether the signed delivery fulfills a commitment; W2 separately approves a content item as an AI source; W7 shares/distributes/aggregates. |
| W6 | MediaAsset/upload/transcode/playback/Provenance, voice recording/asset processing, call offer-time selection/session scheduling mechanics, Session/participants/clocks/consents/outcomes, provider/native calling adapters | W4 owns priced offer acceptance, commitments and refunds. W6 emits immutable outcome evidence; W4 settles. W2 owns VoiceAsset authorization/consent, synthetic voice licensing and generation routing; W6 marks/stores/plays binary assets. |
| W7 | Public discovery/home read models, search, follow/relationship feed, entry context/deep-link destinations, notification preferences/delivery/email/push, sharing artifacts, anonymized Insight/producer recommendations, growth analytics | W1 owns link authentication and navigation resolver; feature owners register destinations. W5 publishes content; W4 grants audiences/credits. W8 owns security/operational metrics and status/support. |
| W8 | SafetyCase/report/block enforcement orchestration, ops workflows, appeal/support records, export/deletion job coordinator, retention orchestration, infra/secrets/observability/recovery/release | Every domain supplies export/delete/pause hooks and proves them. W8 cannot bypass W1/W3 scoped access or W4 accounting. Domain owners implement their own reliability instrumentation and fixes. |

## Screen and code boundaries

The [design inventory](research/design-inventory.md) assigns a primary owner to each artboard. That owner assembles the screen and verifies it end to end even when it consumes several domains. Concrete examples:

- W4 owns the fan Packet/Checkout/Status/Requests/Access/Spending/Pass and creator Offers/Earnings/pool surfaces. W5 owns Studio queue/packet detail, calling W4 decision/fulfillment APIs; it does not own a second request state machine.
- W5 owns creator ThreadView/Threads, consuming W3 audited reads/control/messaging and W2 correction commands. W3 owns fan Thread/Memory/Privacy/You composition; W8 supplies data export/delete jobs and W4 supplies billing/pass sections.
- W2 owns My AI/Sources/Style/Test/License/interview. W1 owns creator identity steps and the signing primitive/sheet. The creator onboarding journey integrates both, and W2 owns the final publish gate.
- W7 owns public creator home/profile, fan Home/Discover/Post entry composition, notification surfaces, share card, and Insights/Impact presentation. W5 owns the underlying content and Thanks submission; W7 owns aggregation and digest. Use the inventory for file-level assignments if a title is ambiguous.
- W6 owns call/voice/player/session compositions, and both parties' call UI. W8 owns OpsQueue/OpsCase. W1 owns shared navigation and primitive fidelity fixes; domain owners own their screen fidelity.

Place new domain code under the appropriate `apps/backend/src/modules/` module, `apps/web` feature/route directory, and isolated native feature files/directories. Decide exact route/file names at G0; do not have eight agents independently edit a monolithic `schemas.ts`, root app view, navigation file, or package lock. Keep existing paths working during migration.

## Interface contracts to settle first

Every contract specifies input/output schemas, actor and tenant scope, state/version preconditions, errors and recovery actions, idempotency scope, resulting events, and privacy classification. Timestamp/sequence fields are server-derived. Money is integer minor units plus currency. Version contracts additively.

| Contract | Producer → consumers | Required substance |
| --- | --- | --- |
| C01 Actor/session | W1 → all | Account/profile/role identifiers, eligibility, permission scope, session revocation, sign-in/callback and return destination, development vs production capability flags |
| C02 Signed command | W1 → W2/W4/W5/W6 | Canonical action+payload+version hash, creator key, user verification, expiry, replay protection, cancellation/retry, exact preview and verification URL |
| C03 Capabilities/allowance | W4 → W2/W3/W5/W6/W7 | Audience rights, effective grants, time/cycle boundaries, non-stacking access, reserve/consume/release allowance transaction semantics, invalidation version |
| C04 Accepted message/delivery | W3 → W2/all clients | Durable message/generation IDs, epoch/sequence/resume cursor, pending/accepted/rejected/interrupted states, classifier-approved sentence frames, backpressure and recovery |
| C05 Scoped generation | W2 ↔ W3/W4 | Immutable version hash, licensed mode, scope and allowed sources, thread-tail/memory revision, cancellation, cost, citations, safety results, memory proposals |
| C06 Request/fulfillment | W4 ↔ W5/W6/W3 | Packet snapshot/disclosure/mode/price/deadline, capacity version, eight decision actions, changed-offer fan confirmation, signed delivery evidence and fulfillment result |
| C07 Session outcome | W6 → W4/W3/W7 | Verified participants, scheduled and connected clocks, reconnect allowance, server ending, final cause, evidence completeness, consent, reconciliation state; no client-authored refund amount |
| C08 Content/audience | W5 → W2/W3/W7 | Content/Note/public-answer versions, signed authorship, audience, reply privacy, explicit source approval, fan quoting/sharing consent, revoke/takedown handling |
| C09 Domain event | all → W7/W8 | Durable event ID/type/schema version, aggregate ID/version, causation/correlation, timestamp and recipient references; minimal payload, consumer inbox dedupe, current-state recheck |
| C10 Privacy lifecycle | W8 ↔ all | Export/delete/revoke/pause job IDs and scope, immediate deny boundary, domain acknowledgments, retained exceptions, retries, completion evidence, restoration tombstones |
| C11 Deep link | W1 + W7 ↔ all | Stable object route, creator/context reference, auth continuation, access check, absent/expired/revoked target, web/native fallback, no sensitive text/token in URLs |
| C12 Observability | W8 → all | Trace/correlation conventions, redaction, accepted-to-visible timings, outcome/error/retry taxonomy, queue and money metrics, cost per plan, version/release metadata |

Do not add distributed service boundaries solely to implement these interfaces. Local module calls and one PostgreSQL transaction are appropriate where consistency requires them. W3 and W4 agree an allowance reservation seam that participates in W3's durable acceptance transaction; W1 integrates shared schemas. No second service can acknowledge success before the write commits.

## Shared-file custodians

| Shared area | Custodian | Contribution method |
| --- | --- | --- |
| Root manifests, lockfile, TypeScript/Turbo build conventions; shared tokens/copy/brand; generated API/client wiring | W1 | Submit a narrow requested change or take an explicit temporary edit lease; W1 regenerates and checks all clients |
| `packages/api` common schema/protocol entrypoints | W1 | Domain owner authors namespaced contract module; W1 integrates exports/generation after consumer review |
| Backend bootstrap/router registration, native root navigation/project wiring, web root layout | W1 | Domain owner provides a feature registration/route manifest; one integrator edits shared root |
| Database migration registry/order and shared runtime infrastructure | W8 | Domain owner writes its own append-only migration after reserving an ID; W8 validates ordering on a clean DB and upgraded DB |
| Thread control/protocol and delivery primitives | W3 | All callers use agreed APIs; W2/W6 changes reviewed against takeover/resume semantics |
| Ledger, granting, capacity and settlement | W4 | No cross-stream SQL patches or duplicate accounting implementations |
| CI/release/environment definitions and integration evidence index | W8 | Coordinate runtime/build needs; preserve existing checks; add no new test suites in this phase |
| Source artboards/component references | W1 coordinates design decisions | Implementation does not rewrite a reference to make a comparison pass |

These are ownership rules, not mandatory bureaucracy for every small fix. Ask the owner for a narrow lease when direct editing is faster, then return it with changed paths. Never overwrite unrelated work.

## Workspace and runtime leases

Use one integration checkout and isolated branch/worktree per active owner after the baseline is preserved. No force pushes, destructive resets, bulk cleans, or migration edits in another owner's workspace. Make small commits/PRs with source references and runtime evidence when implementation is underway.

W8 maintains a runtime lease table (owner, worktree revision, ports, database/schema, simulator UUID, emulator serial, bundle/application ID, build-cache paths, start time). Suggested web/API ranges are 3001–3008 / 4101–4108; allocate, do not assume they are free. Give workers separate queue namespaces and sandbox webhook destinations. A port flag must override the current package scripts' fixed port rather than accidentally starting a second server on 3000.

Use isolated Xcode DerivedData and Gradle build outputs per worktree. One owner at a time installs into a simulator/emulator for a given app ID. Device-wide changes (appearance, network, permissions, biometric simulation, reset) also require an exclusive lease for the entire UUID/serial. Prefer dedicated creator-platform devices; the already-running Pantopus AVD/simulator are not shared disposable resources. Do not kill existing servers, erase devices, or reset shared databases to resolve a port/build problem.

At each merge: reconcile contracts, regenerate clients, compile applicable targets, migrate disposable and existing development databases, run the affected real journeys, and update the handoff. If a regression belongs to a producer, identify the exact contract/state and involve that owner; W8 keeps the integrated journey open until both halves work.

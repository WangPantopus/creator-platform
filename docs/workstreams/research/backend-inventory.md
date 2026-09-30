# Backend and contract inventory for parallel workstreams

Research snapshot: September 29, 2026. This is a read-only planning audit. The founder replaced implementation with research and workstream planning; no new production or test code was written for this audit. The proposed KnowledgeSource/AgentVersion slice was stopped before any slice-2 files, migration or database were created. Existing foundation work is preserved.

The repository contains a runnable Node foundation, shared contracts and client presentation foundations. It does **not** contain a live creator platform. Pantopus authentication, real generation, payments, creator verification/onboarding and every other external provider remain unconfigured. A component, provider interface, enum or fixture is not a completed product lifecycle.

## Source authority and navigation

| Reference | Precise source anchor | Use |
| --- | --- | --- |
| DM | [Domain Model §1–3](../../source/Domain_Model_and_Behavioral_Contract.md#1-decisions-in-force), lines 7–136 | Settled decisions, actors, entities and authority |
| INV | [Domain Model §4](../../source/Domain_Model_and_Behavioral_Contract.md#4-invariants), lines 138–195 | All INV-01–INV-25 |
| States / F | [Domain Model §5](../../source/Domain_Model_and_Behavioral_Contract.md#5-state-machines), lines 197–266; [§6](../../source/Domain_Model_and_Behavioral_Contract.md#6-core-flows), lines 268–344 | State machines, F1–F16 and mandatory event distinctions |
| Context | [Domain Model §7](../../source/Domain_Model_and_Behavioral_Contract.md#7-agent-context-contract), lines 345–387 | Fixed eight-slot context, model outputs, guardrails and publication evidence |
| D / T | [Domain Model §9](../../source/Domain_Model_and_Behavioral_Contract.md#9-decisions-made-in-this-document), lines 413–456; [§10](../../source/Domain_Model_and_Behavioral_Contract.md#10-acceptance-tests), lines 458–515 | D-01–D-27 and T-01–T-40 |
| ADR / modules | [Architecture §1](../../source/System_Architecture.md#1-architecture-decisions), lines 7–29; [§3](../../source/System_Architecture.md#3-modules), lines 88–114 | ADR-1–ADR-12; owning module APIs, no cross-module handler joins |
| Data / runtime | [Architecture §4](../../source/System_Architecture.md#4-data-model), lines 116–180; [§5–6](../../source/System_Architecture.md#5-the-message-pipeline), lines 182–301 | Persistence, deletion, read models, pipeline, latency/load/cost and compilation |
| Money / calls | [Architecture §7](../../source/System_Architecture.md#7-handoff-capacity-and-money), lines 302–355; [§8](../../source/System_Architecture.md#8-realtime-and-calls), lines 356–428 | External-state recovery, schedulers, billing, transport and call outcomes |
| Security / ops | [Architecture §9–11](../../source/System_Architecture.md#9-isolation-in-practice), lines 429–549 | Isolation outside retrieval, Pantopus seams, consent, abuse, SLOs and runbooks |
| Sequence / unresolved | [Architecture §12–13](../../source/System_Architecture.md#12-build-sequence), lines 551–594 | Original slices and unresolved provider/deployment decisions |
| Additions | [Second Review §5](../../source/Second_Review_Strategy_Behavior_and_Additions.md#5-add), lines 114–133; [§7–8](../../source/Second_Review_Strategy_Behavior_and_Additions.md#7-five-decisions-for-you), lines 154–202 | A1–A14; Q1–Q5 were resolved as D-23–D-27; pilot measurements |
| Screens / language | [Product Design §5](../../source/Product_Design_Flows_Screens_and_Copy.md#5-fan-screens), lines 163–336; [§7–11](../../source/Product_Design_Flows_Screens_and_Copy.md#7-creator-screens), lines 376–665 | Screen behavior, honest states, notifications, translation, offline and deep links |
| Current brief | [BRIEF §13–15](../../BRIEF.md#13-platform-and-accessibility-requirements), lines 256–304 | Accepted later decisions, navigation and known inconsistencies |
| Build / appearance | [BUILD_PROMPT §1–9](../../BUILD_PROMPT.md#1-read-before-you-write-any-code), lines 19–201; [handoff](../../../design/handoff/README.md#screen-to-module-map); [audit](../../audit/AUDIT.md#findings-and-fixes) | Stack, exact supplied appearance/copy, generated contracts, known fixes and unresolved design verification |
| Existing evidence | [backend foundation](../../implementation/backend-foundation.md); [Pantopus seam audit](../../implementation/pantopus-integration.md) | Prior bounded foundation evidence and parent-system integration limits |

The human user's stack and sequencing instructions override old Expo/React Native references: Node.js, Next.js, Swift/SwiftUI and Kotlin/Compose; build in creator-platform first and integrate with Pantopus later. The name remains replaceable. Source behavior takes precedence over sample design behavior; supplied design files govern appearance. This research does not reinterpret dated legal or pricing claims as current external verification. W8 must obtain current counsel/store/provider approval where the sources explicitly leave it open.

The current user instruction overrides BUILD_PROMPT's older request to add automated tests: this work proposes real running-app, dev-database, provider and device scenarios, and adds no test code. T IDs below remain behavioral acceptance scenarios; publication's six actual-pipeline boundary cases remain a product requirement.

Workstream IDs and ownership below follow the proposed [CONTRACTS.md](../CONTRACTS.md) boundaries. Source domain behavior remains authoritative; C01–C12 are integration contracts to ratify, not implemented endpoints.

## Evidence from the running development environment

At 22:12 UTC on September 29:

- The existing Next app on localhost:3000 answered the root route with HTTP 307. This proves a server answered, not that all screens or workflows work.
- No process was listening on the usual Node port 4100. The existing production artifact was started temporarily on isolated localhost port 5411, exercised, and stopped. No identity adapter or database was attached.
- GET /health returned status ok, ready false, identity/database unconfigured and featureEnabled false.
- GET /v1/identity/capabilities returned signInAvailable false and localAccountsAllowed false.
- POST /v1/identity/continue with a relative creator/post context returned HTTP 503 identity_unconfigured. A scheme-relative returnTo returned HTTP 400 invalid_request. A private thread read returned HTTP 503 feature_unavailable.
- A transaction declared READ ONLY against the existing dev Postgres on localhost:55432 found 18 creator tables, pgcrypto 1.3 and vector 0.8.6. All were owned by creator_owner. creator_runtime was not superuser, not BYPASSRLS and not inheriting. Thirteen tables had both RLS and FORCE RLS.
- The five tables without RLS were creator_profile, fan_profile, team_membership, schema_migration and webhook_inbox. Current module authority checks guard profile/team reads; the inventory must not claim blanket RLS on every creator table. New private tables and operational/ETL roles need deliberate policies.

Only health/auth-unavailable behavior and schema/role metadata were exercised during this research. No live account, provider, purchase, call, generation, native device or load acceptance was verified. Existing documented foundation checks are historical evidence; they were not rerun for this task. The dev fixture database is not evidence of production encryption, backup, retention or deployed role configuration.

## Actual implementation versus product coverage

Status vocabulary: **Foundation** = substantive internal implementation exists; **Interface only** = types/seams exist without workflow; **Unavailable** = an explicit fail-closed executable/endpoint; **Absent** = no persistent lifecycle or API. A foundation feature can also be unavailable to end users.

| Area and owner | Actual code / contract | Status and material limits |
| --- | --- | --- |
| W1 server and integration | [app.ts](../../../apps/backend/src/app.ts), [server.ts](../../../apps/backend/src/server.ts), [integration.ts](../../../apps/backend/src/integration.ts), [config.ts](../../../apps/backend/src/config.ts) | Foundation: Express JSON API, feature flag, request IDs, sanitized errors, no-store and production bundle. Default start never attaches dependencies. Configured host seam requires identity, guardrail and non-owner database, but still sets generationAvailable false. |
| W1 shared API | [schemas.ts](../../../packages/api/src/schemas.ts), [openapi.ts](../../../packages/api/src/openapi.ts), [client.ts](../../../packages/api/src/client.ts), [generator](../../../packages/api/scripts/generate-openapi.ts) | Foundation: strict Zod, generated OpenAPI 3.1, drift-check option and partial TS client. Only ten HTTP operations, plus the separate WebSocket contract. No domain contracts for most screens. |
| W1 generated native API | [Swift API](../../../apps/ios/Sources/Generated/QelvoraAPI.swift), [Kotlin API](../../../apps/android/app/src/main/java/com/pantopus/qelvora/generated/QelvoraAPI.kt), [native generator](../../../scripts/generate-native-api.mjs) | Foundation: generated request/response types and HTTP methods. Native API-to-screen state management, token lifecycle and provider workflows are not connected. |
| W1 Pantopus identity | [adapter.ts](../../../apps/backend/src/modules/identity/adapter.ts), [read.ts](../../../apps/backend/src/modules/identity/read.ts) | Interface only externally: strict accountId/adultEligible envelope, no local account issuer. Foundation internal profile/team authority read API. No real adapter, session callback/storage, revocation/deletion event integration, onboarding, handle management, public-profile API or team lifecycle. |
| W1 named act proof | [signed-acts.ts](../../../apps/backend/src/modules/identity/signed-acts.ts), [canonical.ts](../../../apps/backend/src/core/canonical.ts), migration hash trigger | Foundation: real WebAuthn assertion verification, nonce plus exact canonical hash, UV/origin/RP/expiry/counter/replay checks and transactional single-use consumption. No enrollment/recovery or verification process. HTTP begin currently authorizes only thread subjects; only personal text reply has a consumption/publication lifecycle. The other act enum values are not implemented acts. |
| W4 scope and allowance | [scope.ts](../../../apps/backend/src/modules/access/scope.ts) | Foundation: privately issued runtime-valid ThreadScope; current fan/verified creator/triage authority; logged creator/team opens; locked active grant reservation/settlement. Not a full access service: no grant issuance/billing transitions, tier capabilities, membership/pass lifecycle, creator authorization/license invalidation or cost-unit allowance. |
| W3 conversation | [service.ts](../../../apps/backend/src/modules/conversation/service.ts) | Foundation: durable fan acceptance, derived authority, idempotency, text generation records, sentence guardrail seam and epoch recheck, interruption, explicit takeover/handback, exact signed creator reply, locked timeline snapshot. HTTP AI send remains unavailable. No thread creation/onboarding, media, drafts/approvals, pause/block/delete/report endpoints, citations, presence detection, reminders or client persistence. |
| W3 memory | [memory.ts](../../../apps/backend/src/modules/conversation/memory.ts) | Foundation: thread-local context tail, revision-guarded proposals, deletion exclusions. No live extractor or CRUD API, fan editing, semantic normalization/classification, per-item sensitive consent, rolling summary/open-loop resolution or deletion across caches/embeddings. Explicitly tagged sensitive proposals are denied; this is not independent sensitive-text detection. |
| W3 delivery | [gateway.ts](../../../apps/backend/src/realtime/gateway.ts), [TS gate](../../../packages/api/src/protocol.ts), [Swift gate](../../../apps/ios/Sources/QelvoraUI/DeliveryProtocol.swift), [Kotlin gate](../../../apps/android/app/src/main/java/com/pantopus/qelvora/ui/DeliveryProtocol.kt) | Foundation: authenticated scoped subscription, cursor ordering, epoch/sequence checks, bounded buffers, slow-client disconnect and serializable resume state. Polling event log every 100 ms is not measured design-scale fanout. No live native renderer wiring, typing, request/call channels, distributed fanout or actual multi-device interruption evidence. |
| W1 events / W8 runtime recovery | [outbox.ts](../../../apps/backend/src/core/outbox.ts), [inbox.ts](../../../apps/backend/src/core/inbox.ts), [idempotency.ts](../../../apps/backend/src/core/idempotency.ts) | Foundation: ordered thread event publication with stable IDs; verified-event interface plus inbox dedup/current-state reconciliation; atomic request-hash idempotency. Outbox schema/envelope is thread-specific. No creator/fan/global aggregate event bus, durable consumers, live webhook verifier/route, external-success recovery or reconciliation scheduler. |
| W8 database | [0001_foundation.sql](../../../apps/backend/migrations/0001_foundation.sql), [database.ts](../../../apps/backend/src/db/database.ts), [migrate.ts](../../../apps/backend/scripts/migrate.ts) | Foundation: non-owner roles, FORCE RLS, composite thread FKs, signed-message canonical hash enforcement, pgvector extension and transaction-local scope. Startup safety check covers a core subset of protected tables. Migration runner applies only 0001 then skips; it is not an ordered multi-migration deploy mechanism. |
| W8 pools / deployment | [pool.ts](../../../apps/backend/src/workers/pool.ts), [start.ts](../../../apps/backend/src/workers/start.ts), [bundle script](../../../apps/backend/scripts/build.mjs), [CI](../../../.github/workflows/ci.yml) | Foundation in-memory bounded concurrency/fairness and deployable ESM artifacts. Generation/ingestion executables stop unavailable. Three actual deployed pools, durable queues/schedulers, job leases/retry/DLQ, timeouts, metrics, graceful drain and production release configuration are absent. CI definitions are not evidence of hosted deployment; xcode-27 runner availability must be confirmed. |
| W2 agent / sources | [providers.ts](../../../apps/backend/src/modules/agent/providers.ts) | Interface only ModelProvider and sentence GuardrailProvider. No agent_version, source/chunk/style/voice/license/sponsor/regression tables, compiler, importer, retrieval, publish evidence, actual classifiers, routing, cost or models. pgvector being installed does not implement retrieval. |
| W4 commerce / requests | Same provider interface file: PaymentProvider | Interface only authorize/capture/release/refund/fetchCurrent. No Packet, HumanMode, Capacity, Approval, Commitment, ShareGrant consent/access gate, spend limit, subscription, receipt, ledger, payout, credits or Stripe adapter. No checkout or real card hold. |
| W5 content / presence / fulfillment | No backend module or domain endpoint | Absent: content, audience, live/replay, Notes, private replies feed, reactions, quotes, corrections, Thanks, group/public-answer publishing, creator_queue projection and creator fulfillment workflow. W7 consumes those records for public/shared artifacts. UI fixtures must not be mistaken for data. |
| W6 calls / media / voice | CallProvider and VoiceProvider interfaces | Interface only. No storage adapter, upload/download authorization, transcoder, provenance signer/watermark, consented VoiceAsset, Session, room token, clock/outcome, summary or native call/billing integration. |
| W7 discovery / notifications / insights | No backend module or domain endpoint | Absent: public profile/Home/discovery/search/relationship projections, sharing/export/verification artifacts, subscriptions to notification channels, device registration, read cursor, preferences/quiet hours, Instagram entry, impact/72-hour digest, tenure, anonymized ETL and producer. W1 verifies signed acts; W4 authorizes sharing. |
| W8 safety / privacy / ops | No backend module or domain endpoint | Absent: SafetyCase/report/block/case grants, ops verification/disputes/refunds/pauses, license suspension coordinator, deletion/export/retention jobs, operational logs/alerts/runbooks, backups/restores or incident procedures. |

Current tables are schema_migration, creator_profile, fan_profile, team_membership, thread, access_grant, passkey_credential, signed_challenge, signed_act, signed_act_consumption, message, generation, memory, memory_exclusion, thread_audit, event, idempotency_key and webhook_inbox. There is no later agent-workspace migration.

### Current HTTP and authentication contract

- Public: GET /health; GET /openapi.json; GET /v1/identity/capabilities; POST /v1/identity/continue with relative returnTo.
- Private: GET /v1/threads/{creatorId}/{fanId}; POST suffixes /messages, /takeover, /handback, /human-replies.
- Private signing: POST /v1/identity/{creatorId}/signed-acts/begin with fanId and command; POST /v1/identity/signed-acts/verify with challengeId and assertion.
- Web: [Next auth route](../../../apps/web/app/api/auth/continue/route.ts) uses the shared IdentityContinue schema, preserves a valid return path and delegates redirect creation to the backend. HTTPS is checked; actual Pantopus origin allowlisting, callback/state/PKCE behavior and native app links remain adapter work. Unconfigured/failed responses lead to the supplied unavailable state.
- Native: Welcome's injected PantopusSignInProvider defaults to UnavailablePantopusSignIn, not a demo account. There is no live native SSO flow.
- OpenAPI describes bearer security on private operations; it presently omits actual 401/404 responses and detailed WebSocket/error/versioning semantics. TS client lacks identity/signing methods that generated native clients expose.
- The shared package exports TS source with internal .js specifiers. Backend bundling handles it; Next auth uses the schemas subpath. Future full TS client consumption needs a deliberate published/bundled JS contract or compatible resolver, rather than assuming current Next can import the whole source index.
- Actual enums enable nine author kinds and five thread controls. Reserved ai_call, ai_video and fan_agent are rejected at the API/database, rather than being represented as disabled API enum metadata. They must remain unavailable; UI reserved labels do not authorize writes.

## Workstream ownership and dependencies

These eight ownership groups preserve the architecture's modules; they are not eight independent deployments. A module owns its writes and exposes reads/commands/events. The Architecture module table contains eleven baseline rows plus presence, despite its stale count text: preserve all twelve module families. Client work is vertical within each stream, using W1's shared app/contract foundations and the exact supplied designs.

| ID | Owns the complete product capability | Domain and storage ownership | First dependencies / interfaces |
| --- | --- | --- | --- |
| **W1 Platform, identity & app foundations** | Cross-platform shells, Pantopus sign-in/context, adult/account eligibility, fan/creator identity records and handles, verification/passkey enrollment/recovery, team roles, signed-act verification semantics, common API/codegen/version/deep-link/cache conventions | identity module, signed_act/passkeys, profile/team/verification; shared API/schema registry and reusable infrastructure interfaces | Confirm real Pantopus token, revocation and lifecycle contract; W8 supplies case/verification decisions and release controls; W4 owns capability grants; W3 owns intro-sharing behavior; W7 composes public profile/verification entries. |
| **W2 Creator AI setup, knowledge & AI runtime** | Creator interview/import/approval/style/rules/modes, sources/chunks, source revocation/expiry, immutable versions/compile hashes, actual-pipeline boundary evidence, publish/rollback, license/sponsors, model routing/generation/classification/grounding and asynchronous AI voice policy | agent module, agent_version/knowledge_source/source_chunk/style_example/voice_asset/regression_case/sponsorship/replica_license; no direct conversation-memory writes | W1 verified creator/signed configuration confirmation/provider consent; W4 authoritative audience/allowance decisions; W3 scoped history/memory/release APIs; W6 voice/media provenance; W8 policy decisions/escalation. |
| **W3 Fan conversation & real-time chat** | Thread creation/read/send/local retry, context history, intro-sharing, editable memory/open loops, off-the-record setting after model amendment, all control epochs/pause/block/handback, realtime delivery, citations, consent/reminders/wellbeing interaction, translation rendering and cached read-only views | conversation module: thread/message/generation/memory/exclusions/MemoryConsent/thread_audit; one ordered frame protocol; fan relationship state | W1 actor/identity/deep-link/cache foundations; W2 actual pipeline, sensitivity/translation proposals and authorized citation references; W4 capabilities/allowance and exact-draft Approval validity; W5 merged eligible Notes and fulfillment events; W8 deletion/safety actions. |
| **W4 Commerce, access & human request lifecycle** | Membership/trial/pass grants, tiers/modes/prices/eligibility, spend limits, exact Packet disclosure, capacity, holds/reauthorization/capture/refunds, creator decisions/Instead, canonical exact-draft Approval, Commitments, ShareGrant consent/access gate, receipts, billing/IAP entitlement reconciliation, ledger/credits/pool/payout/disputes | access, handoff and payments modules; sole writer of all money/grant/capacity/Packet/Approval/Commitment/ShareGrant state | W1 current authority and exact signed acts; W2 current license/creator authorization and no-obligation suggestions; W3 consumes Approval validity; W5 exact creator delivery proof and queue projection; W6 reconciled Session outcome; W7 share artifacts; W8 incident/refund commands. |
| **W5 Creator Studio, content & fulfillment** | Studio queue/detail and Instead UI, creator_queue projection, signing/review-and-send, audited Threads/takeover UI, personal reply/voice fulfillment, content publish/schedule/audience/preview, Notes/replies/reactions/quote/correction/Thanks capture, group/public-answer publishing | content and presence modules plus daily Studio read models; Studio consumes W3 and W4 canonical APIs rather than writing their tables | W1 creator/team authority and signed subject commands; W4 capacity/decide/deliver/Approval/ShareGrant policy; W3 thread control/public correction anchors/Note merge; W2 explicit KnowledgeSource approval, not automatic source creation; W6 human media provenance; W7 public/home/discovery/share/export/verification renderers, notifications and Impact aggregates. |
| **W6 Calls & media** | Private uploads/attachments/human voice recording/transcoding, provenance/C2PA/watermark, consented asynchronous voice rendering, scheduling/rooms/tokens/call lifecycle/three clocks/outcomes, recording/summary, CallKit/ConnectionService/audio/background/device behavior | session module, session/session_event/provenance and media storage interfaces; no independent money or thread-authority state | W1 verified account/passkey and native platform plumbing; W4 accepted Commitment/scheduling/fulfillment/refund contract; W3 takeover/handback boundary; W2 voice/license/provider eligibility; W8 durable schedulers/reconciliation and consented retention. |
| **W7 Discovery, growth, notifications & insights** | Public profile/Home/discovery/search/relationships/context entrances, Instagram one-shot link entry, share/export/verification artifacts, fan/creator notification records/preferences/push/email, match notifications, tenure/Impact/calibration digests, anonymized insights/clusters/producer/recommendation loop | notifications and insights modules, public/fan_home/search projections and sharing artifacts; creator_insights ETL/read boundary | W1 profile/identity/deep-link and signed-act verification semantics; W4 audience/ShareGrant consent gate, reliability/spend/entitlement events; W5 published content/Note/Thanks source records; W3 safe signals/open-loop match API; W8 audience revocation, ETL scope, provider delivery/metrics. |
| **W8 Trust operations, reliability & release** | SafetyCase/report/block/dispute/verification decisions, grants for case-specific ops reads, crisis protocol/regulatory reporting, pause/license-death/account-deletion coordinators, export/retention, three deployed pools/jobs/outbox/inbox recovery, environments/secrets/observability/performance/backup/incident/deployment/release | safety module and platform operational infrastructure; orchestrates domain-owned commands, never edits another module's tables | W1 lifecycle/roles/case-read authorization; every stream's durable events, deletion/export and readiness APIs; real provider and production accounts; counsel/store sign-off where required. |

W2 executes policy in the live pipeline; W8 owns policy decisions, case lifecycle and escalation. W1 owns signing infrastructure/verification; the subject-owning stream owns canonical command preparation and authorization. W4 owns exact-draft Approval, fulfillment and ShareGrant consent/access state; W3 consumes Approval validity, W5 and W6 supply fulfillment evidence, and W7 renders authorized sharing/export/verification artifacts. W5 owns creator_queue projection and publishing/Thanks capture; W7 owns public/fan-home/discovery/relationship projections and Impact aggregates. W2 owns VoiceAsset authorization, purpose consent and provider/license eligibility; W6 owns binary MediaAsset/provenance processing. W3 owns Memory writes; W2 proposes classified facts through its API. W8 coordinates deletion; each domain deletes its own data.

Work can proceed in parallel on contracts and isolated domain data/read models. User-facing AI requires W1+W2+W3+W4 baseline capabilities and W8 safety/readiness. A paid human request requires W1+W3+W4+W5+W6 human media where applicable, plus W8 recovery. Notes need W1+W4 audience grants+W5+W3 timeline+W7 delivery. Calls require a completed W4 Commitment contract before room integration. Later pass, AI voice and producer capabilities remain planned even when they are not on the first pilot critical path.

## Entity and feature completeness by owner

This covers every named domain object and the additional persistence/read-model objects in Architecture §4.

| Family / owner | Complete inventory | Present versus missing behavior |
| --- | --- | --- |
| Identity / W1 | Account boundary; CreatorProfile; FanProfile; TeamMembership; verification; passkey_credential; signed_challenge; SignedAct; signed_act_consumption | Minimal profile/team tables, account/adult seam and signing primitives exist. Public profile, content eligibility lifecycle, availability/reliability, intro-card per-creator sharing, pseudonyms, account status, handle changes, verification/enrollment/recovery and four-role CRUD are absent. |
| Agent / W2 | AgentVersion; KnowledgeSource; source_chunk; StyleExample; VoiceAsset; regression_case; Sponsorship; ReplicaLicense | All tables/lifecycles absent. Need creator ownership, origin/rights evidence, audience, purpose/consent, valid window/expiry, source revision and provenance; immutable compiled snapshot; exact run evidence; active license use/term/counsel/union/voice ownership; sponsor aliases/expiry/disclosures; calibration digest integration. |
| Access / W4 | Grant; PassSubscription; PassSlot; Tier; Membership | Grant row/allowance exists only as foundation data. No trial issue/24-hour/natural-pause lifecycle, membership invoices/refunds, capability inheritance, entitlement revocation, pass slot carry/replacement/read-only state, calendar-cycle/pool or store entitlement lifecycle. Equivalent grants do not stack; tier AI never consumes a slot. |
| Conversation / W3 | Thread; Message; generation; Memory; MemoryExclusion; thread_audit; MemoryConsent; ProcessorConsent | Text/control records and audited scoped reads exist. No thread-create/read-notice acceptance flow, media/draft/version/citation model, sensitive consent, provider-named processing consent, three-hour/90-minute/weekly signals, full access-history UI API, summary job, open-loop resolution, export or full deletion. Off-the-record requires the accepted model addition. |
| Handoff / W4 | HumanMode; Capacity; Packet; exact-draft Approval; Commitment; ShareGrant | All absent. Exact immutable disclosure copy, fan-edited summary, explicit message/attachment/identity/whole-thread choices, private/public choice, mode/price/deadline/refund snapshots, one shared capacity row, more-info/re-auth, signed acceptance, all Instead choices, attested promised-mode delivery and dual-revocable sharing gate must be implemented. W5 owns queue projection, W7 sharing artifacts. |
| Calls/media / W6 | Session; session_event; Provenance; private media/attachments/recordings; room/token/egress metadata | All absent. Scheduling in both time zones, appointment/connected/reconnect clocks, five outcomes, both-party separate consents, creator-only host token, transcript provenance, fixed server end and provider polling are required. |
| Content/presence / W5 | Content; content_audience; live_event; Broadcast; BroadcastReply; Reaction; Correction; Thanks; creator_queue projection | All absent. Post/media/live/replay publish/schedule/drafts/audience previews; AI-use permission independent of visibility; stored-once Note/name token/read cursors/private feed; creator-only reactions; anonymous quotes unless consented; signed corrections; consented Thanks capture; group fulfillment; public answer promotion only with separate AI approval. W7 renders public/shared content and aggregates Impact. |
| Money / W4 | LedgerEntry; idempotency_key; payout; spend_limit; store transaction/subscription/item/payment lineage; capped credit accounting | Generic request idempotency exists. Append-only financial ledger, actual holds/captures/refunds, payout dispute delay, Connect onboarding/reconciliation, one consolidated monthly subscription, spend cap/24-hour increase/immediate decrease, unused-membership refund, pass slot-day allocation and capped noncash credits are absent. |
| Insights/growth / W7 | Insight; cluster; recommendation; fan_home; follow/search/context records; tenure; impact/72-hour digest | All absent. Separate anonymized ETL schema/role, minimum group five, no thread/fan IDs, evidence/effort/recommendation decisions/outcomes, return follow-up matches and consented thanks/tenure are required. No spend-derived rank or algorithmic feed. |
| Safety/ops / W8 | SafetyCase; block; report; case-specific access/evidence/audit; deletion/export/retention workflows; operational reconciliation jobs | All absent. Grant-independent reporting/crisis, no routing/score/commercial influence, verified-notice death/incapacity, disputes/pauses/verification decisions, durable event-driven lifecycle and operational audit are required. |
| Notifications / W7 | notification; preference; device_token; delivery/read state; creator/type/channel quiet-hour/hide-preview settings | All absent. In-app record cannot be disabled and is authoritative; push/email optional and independently mutable. Recipients/previews revalidated against current audience; sender type always visible; locked screens receive no restricted text, request price, spend amounts or unconsented identity. |

Guaranteed review is described in the fulfillment matrix “if offered”; do not silently turn it into an always-on mode. Human modes enumerate written reply, voice note, audio/video call and group answer. Tips, realtime AI calls/video, fan_agent execution, cross-creator memory, unofficial personas and algorithmic feeds remain deferred (D-H); no workstream may accidentally enable them.

## State machines that must agree across clients, database and provider state

| Lifecycle | Required transitions / clocks / evidence | Current coverage | Owner |
| --- | --- | --- | --- |
| Thread | ai_active → human_active → announced ai_active; pause/resume with reason; blocked; closed; every control change increments epoch, cancels stale generation and precedes new sender | Takeover/handback core exists; automatic departure, pause/revocation/block/delete and multi-device live rendering absent | W3, W2/W8 triggers |
| Message/generation | local_pending client → accepted durable reservation → generating → delivered / failed / interrupted; contiguous sentence sequence; exact retry; interruption preserves delivered text | Internal text path exists; no live provider/send/renderer/cost/citation path | W3 + W2 |
| AgentVersion | draft → testing → live → paused/retired; exactly one live; publish evidence for exact revision/pipeline; rollback prior valid snapshot without retesting | Absent | W2 |
| KnowledgeSource | candidate → approved → revoked/expired; only current approved/unexpired source available; source change/revocation invalidates retrieval/cache | Absent | W2 |
| Grant | pending → active → expired/revoked; server checks time/current state; membership, trial, pass, commitment and comp distinct | Active allowance query and enum only | W4 |
| Membership | trialing / active / past_due / cancelled; cancellation keeps access to paid period end; provider/store current-state reconciliation | Absent | W4 |
| PassSlot/cycle | draft_next → active atomically on 1st; uncarried active → ended_readable; unavailable creator → replaced free; incomplete selection carries; prorated initial cycle | Absent; later roster phase, not removed | W4 |
| Approval | valid → invalidated on any content/version edit or authority change; send uses exact own-account evidence | No Approval table/lifecycle | W4, W5 UI, W1 proof |
| Packet/payment | draft → submitting/provider action → submitted; requires_action/requires_capture/declined/unknown/capture_before explicit; submitted ↔ more_info; accepted/declined/expired/withdrawn; hold failure shares nothing | Payment interface only; additional internal submission states need shared API definition | W4 |
| Commitment | accepted Packet → due → in_progress → delivered only by promised-mode proof; deadline/no-show/failure → resolution_required → refunded/resolved; late delivery after refund no extra charge | Absent | W4, W5/W6 evidence |
| Session | scheduled → waiting → connecting → connected ↔ reconnecting → ended; waiting → no_show; appointment, connected and fixed total reconnect allowance clocks | Call interface only | W6 |
| Session outcome | completed ≥80% connected or fan choice to end; creator-early partial proportional refund; creator_no_show refund/stat hit; fan_no_show charged but never delivered; technical_failure rebook/refund, no stat hit | Absent; provider event alone cannot decide | W6 computes, W4 resolves |
| License/creator availability | active → revoked/suspended_death_or_incapacity/expired; pause under 5 s; no new use; open commitments refund; new estate opt-in license, no silent continuation | No license or coordinator | W2 eligibility, W8 decisions, W4 refunds, W3 boundary |
| Spend limit | first paid choice including explicit none; raise pending for 24 h; decrease effective now; holds plus captured spend checked before capacity | Absent | W4 |
| Content/Note/share | draft/schedule/publish/retract; eligible read projection; quote/handle/reuse consents; shared card valid only while both grants survive | Absent; state vocabulary still needs API finalization | W5 + W4/W7 |
| Consent/safety/deletion | versioned scoped records; consent never expands; sensitive question once/item; case/report/action; delete scheduled/propagated/redacted-retained/purged | Not defined sufficiently as contracts or implemented | W1 conventions, purpose-owning domain records, W8 coordinator |

The source diagrams are not complete transition enums for payment recovery, content scheduling, SafetyCase, notification delivery or deletion jobs. Those contracts need written state/error definitions before UI actions can imply success.

### Agent publication and immutable evidence

W2's first domain contract must distinguish editable draft configuration revision from immutable AgentVersion snapshot. Approved source revisions, style examples, rules/mode/sponsors/license use, provider/model configuration and classifier/retrieval pipeline contribute to deterministic compile/run hashes. An evidence record references that exact revision and pipeline; changing either invalidates prior evidence. These are future contract requirements, not implemented tables.

The six required live-pipeline cases in DM §7 are: identity disclosure under pressure; out-of-scope request; restricted-source probe using a fan without the tier; unsupported personal opinion; private-detail probe using the never-reveal list; instruction override embedded in a fan message. Every creator correction adds a regression case containing only AI output, the one-line rule and a paraphrased prompt. Publication must expose pending/running/failed/succeeded evidence, cannot accept client-supplied “passed,” and remains unavailable until actual providers/verifiers/license/creator authority and the full pipeline are configured.

Publish requires a current own-account creator authority, permitted unexpired license, valid approved source set/audiences/rights and exact successful evidence; it atomically selects one live immutable version. Rollback follows the source's no-retest rule for a prior snapshot, but cannot resurrect revoked/expired sources or bypass present license/authority checks. Source revocation must affect runtime retrieval immediately even when the live snapshot originally referenced that source. The same data must support TestConsole, VersionList, blocked-publish reasons and the 72-hour post-publish digest.

## High-risk interfaces to freeze before parallel implementation

| Contract | Producer → consumer | Required agreement / failure behavior |
| --- | --- | --- |
| Actor and lifecycle | W1 → all; Pantopus → W1/W8 | Opaque valid session plus only accountId/adultEligible crosses the boundary. Confirm Pantopus session revocation watermark, issuer/token validation and account-deletion events. Never import private parent identity fields. Role and entitlement rechecked at the acting module. No local demo bypass. |
| Creator authorization | W1/W2/W8 → W3/W4/W5/W6 | One current verification/license/availability read decision and version/expiry. Revocation cannot leave a stale thread scope, call offer or accepted model job authorized. Lost key requires external re-verification. Policy failure returns neutral paused state, with separate commitment resolution. |
| Canonical signed command | Subject owner + W1 → W3/W4/W5/W6 | Server-prepared exact act/subject/version/content, hash encoding and normalization; signing screen displays that exact original. One UV assertion only consumed transactionally for authorized subject. Notes/reactions/corrections/acceptances need subject-specific policies, not the current thread-only shortcut. Edited approved drafts invalidate Approval even if a signature record exists. |
| Audience and capabilities | W4 → W2/W3/W5/W6/W7 | One public/tier/group audience representation, plus explicit follower semantics for Notes; active grant version/expiry, no implied tier hierarchy. Filter before retrieval and before private bytes/push; pass grants never grant depth. Define denied/revoked citation UX and max-5-second invalidation. |
| Scoped context and memory | W3 + W4 → W2 | Issued ThreadScope only, preserved author labels, current revision/epoch, permitted intro, memory exclusions and sensitive item consent. W2 cannot supply a different fan/creator or write Memory tables. Only slots 1–3 stable cache prefix; thread material never enters shared cache or creator-wide style/regression data. |
| AI proposal and delivery | W2 → W3 | Proposal fields only content, permitted citations, refusal/handoff reason and classified memory proposals; no authority/price/time/obligation. Input/output guardrails before every visible sentence; recheck epoch at commit. AbortSignal cancellation is separate from stale-output rejection. Provider failure cannot become delivered or weaker-guard retry. |
| Timeline / stream / restart | W3 + W5 → all clients; W7/W6/W4 later channels | Durable cursor, epoch, generation ID and contiguous sentence sequence; atomic snapshot and checkpoint include per-generation sequence state. Define Note merge ordering/read cursors and multiplex request/call channels without changing thread epoch meaning. Reconnect must not duplicate, reorder or skip visible text; slow clients resync. |
| Accepted money saga | W4 ↔ provider, W1 proof | Spend → capacity → authorization attempt; nothing in creator queue until authorized. No long external call inside database lock. Real capture_before bounds SLA with safety margin; more-info pauses response SLA, not bank clock. Stable payment lineage/idempotency keys and crash recovery/current-state fetch required for each external step. |
| Exact disclosure / fulfillment | W3/W5/W6 ↔ W4 | Packet is copied fan-selected data, separate audited full-thread action. Personal promised mode only fulfilled by exact creator proof; no AI/team/view notification. Instead conversion needs fan acceptance before changed charge. Group/public answer scope, matched recipients and pricing are explicit. |
| Translation / provenance / sharing | W1/W2/W3/W5/W6/W4 → W7 artifacts | Original signed human content is immutable; translated display is labeled with original one tap away and cannot replace proof. W2 authorizes VoiceAsset use; W6 processes binary MediaAsset/provenance. W1 verifies signed-act records; W7 renders verification/export/share artifacts. W4 enforces dual-revocable ShareGrant; no caller-invented verification claim/URL masquerading as evidence. |
| Durable domain events | Every owner → W1/W8 infrastructure/W7 projections | Envelope includes aggregate type/id, event ID, version/order, actor, cause, idempotency and minimal scoped payload. Thread delivery events are not a generic global bus. Separate verified webhook inbox from our outbox; consumers deduplicate and fetch current external state. No raw fan text in broad events/logs. |
| Safety and commercial separation | W2/W3/W7 → W8; W8 → domain commands | Grant-independent case/report/crisis resource API; defined ops case access and reason audit. No offers, relevance/capacity scoring or purchase prompts from crisis/distress. W8 never directly changes another module's money/control tables. |
| Deletion and export | W8 coordinator ↔ every owner | Durable account/thread/memory/source/version/media deletion manifest, cache/embedding/regression/summary invalidation and domain completion receipts. Preserve only disclosed redacted dispute records, purge after 12 months, hash ledger identity per reviewed retention policy; prevent stale jobs recreating deleted facts. |
| UI cache/deep links/storefront | W1 ↔ all client streams | Stable object routes and authorization-aware post-login return context; cache partition by account/thread and stale banner; logout/revocation invalidation. Offline never sends or buys. Storefront/product matrix, subscription receipt reconciliation and web/store prices must be explicit; native paid-reply policy remains counsel-open. |

## Complete source flow and invariant mapping

### F1–F16

| Flow | Main / collaborating owners | Present foundation and missing vertical behavior |
| --- | --- | --- |
| F1 Creator onboarding | W1 + W2; W8/W6 | Signing primitive only; verify/import/rights/audience/style/rules/license/interview/boundary/publish missing. D-12 supersedes review-first gating ordinary AI. |
| F2 Discovery/access | W7 + W4; W1/W3 | No live workflow. Replace stale N-message/pass-first sequence with D-23/D-26 membership and free first ~24-hour conversation. |
| F3 Message/AI | W3 + W2; W4/W8 | Internal acceptance/epoch/output guardrail seam only; full eight-slot authorized assembler/providers/safety/citations/cost missing. |
| F4 Return visit | W3 + W2 | Scoped memory read exists; live extraction, editable open-loop follow-up and natural re-entry missing. |
| F5 Packet handoff | W4; W3/W5/W6 | Entire lifecycle absent. Spend check precedes capacity/hold; fan-edited exact copy and hold failure shares nothing. |
| F6 Creator decision | W4 + W5; W1/W6 | Personal thread reply proof is not a queue decision. Full AI/approved/self/voice/times/group/more-info/decline/Instead absent. |
| F7 Written delivery | W4 + W5; W1/W3 | Signed text message exists; no Commitment/attestation/capture/notification/human-provenance memory workflow. |
| F8 Call | W6; W4/W3/W7/W1 | Interface only. Scheduling, clocks, outcomes, consents, summary, handback and reminders absent. |
| F9 Takeover/handback | W3 + W5; W2 | Internal protocol exists; real generation/client/presence/departure integration absent. |
| F10 Pass cycle | W4; W7/W3 | All absent; later phase still owns grants/carry/replacement/prorating/pool. |
| F11 Unavailable creator | W8/W2 → W3/W4/W7 | No lifecycle orchestration; pause boundaries, replacement and automatic resolutions absent. |
| F12 Revoke/delete | W8 coordinator + W2/W3/W6/W4/W7 | Memory exclusion/revision foundation only; source/version/cache/embedding/export/retention lifecycle absent. |
| F13 Group answer | W7 → W5/W4/W3/W2 | Entire aggregate/private-to-public consent/changed-price/fulfillment/source-approval loop absent. |
| F14 Producer | W7 + W5; W3/W2 | Entire anonymized-min-group/evidence/creator decision/publish/open-loop match loop absent. |
| F15 Safety | W8; W2/W3/W4 | No case/report/block/API/ops or grant-independent crisis path. |
| F16 Correction | W5 + W2; W1/W3/W7 | No public correction or regression lifecycle; must retain AI output/rule/paraphrase, never raw fan text. |

### INV-01–INV-25

| ID | Owning enforcement and required reach | Current limit |
| --- | --- | --- |
| INV-01 | W3 authority writes; W1 shared schema; W5/W6 later paths | Nine enabled kinds and strict rejection present; later media/Note/team/approval paths absent; reserved states remain disabled. |
| INV-02 | W4 Approval; W5 edit/review/send; W1 exact proof | Approval lifecycle absent; signature is not an Approval substitute. |
| INV-03 | W3 cursor/epoch boundary; W2 cancellation; all clients | Core exists; live network/devices/automatic pause/revocation absent. |
| INV-04 | W3 announced handback; W5 departure/W6 end | Explicit command exists; automatic presence/call triggers absent. |
| INV-05 | W2 semantic classifier; W3 labels/memory; W7 copy | Guardrail seam only; no real human-memory/feeling claim blocker. |
| INV-06 | All clients/W7 share/export artifacts/W8 export jobs; W2/W6 AI audio; W3 reminders | Label components/contracts only; no full notification/search/export/audio/3-hour workflow. |
| INV-07 | W4 grants/tier/pass; W2/W5/W6 downstream checks | Pass capability SQL check only; grants/workflows missing. |
| INV-08 | W2 retrieval; W4 current audience decision | No source assembler; citations refused. |
| INV-09 | W4 Commitment; W5 creator delivery; W6 Session | No fulfillment state machine; signed thread text cannot complete absent Commitment. |
| INV-10 | W4 sole capacity row/lock; W5/W7 projections | No capacity or hold workflow. |
| INV-11 | W3 scope/history/memory; W2 assembler/cache; W8 roles | Scoped conversation foundation exists; all future retrieval/media/regression/cache/ETL paths missing. |
| INV-12 | W1 consent conventions; purpose owners W2/W3/W5/W6 | Seven independent permissions not implemented. Provider consent/sensitive consent additionally required. |
| INV-13 | W4 copied Packet; W3 separate logged audit; W5 queue | Audit foundation exists; disclosure/projection missing. |
| INV-14 | W1 Pantopus adapter; W8 review; every schema | Minimal actor envelope/current schema boundary present; real integration unverified. |
| INV-15 | W8 coordinator; W2/W3/W6/W7 owners | Memory exclusion only; no end-to-end source/version/deletion/cache propagation. |
| INV-16 | W4 capture/refund saga; W6 outcomes; W8 recovery | Interface only; no money movement lifecycle. |
| INV-17 | W2 promise classifier; W4/W6 trusted handlers | Strict model shape cannot create resources; semantic promises/persistent obligations absent. |
| INV-18 | All owning commands; W1/W8 primitives | Thread idempotency exists; all provider/product transitions still missing. |
| INV-19 | W8 cases/crisis; W2/W3 routes independent of W4 grants | No live safety path. |
| INV-20 | W2 expert/companion/blend rules | No modes, actual classifier or fallback pipeline. |
| INV-21 | W2 no-selling/natural-pause policy; W3 trial/allowance UI; W8 crisis | Entire semantic/runtime behavior absent; never use distress to sell access. |
| INV-22 | W1 exact WebAuthn; W3/W4/W5/W6 authorized act consumers | Personal text proof exists; other named acts/enrollment/recovery absent. |
| INV-23 | W2 independent sensitivity detection; W3 per-item consent/writes | Explicit sensitive field rejected; no actual detection/consent/extractor. |
| INV-24 | W5 Note/audience/quote data; W3 merge; W7 notification/export | Components only; broadcast/reply isolation absent. |
| INV-25 | W2 sponsor/source labeler; W5 registry; W7 rendering | Entire registry/disclosure/grounded first-hand behavior absent. |

## Settled decisions and architecture coverage

### D-A–D-H and D-01–D-27

| IDs | Required choice, owner and current state |
| --- | --- |
| D-A | W1/W8: standalone now, shared Pantopus identity/infrastructure later. Minimal seam exists; external connection absent. |
| D-B | W2: expert, companion and blend from day one; modes/pipeline absent. |
| D-C | W1/W4/W6/W8: full web plus per-storefront native matrix; shells/contracts only, no commerce. |
| D-D | W2/W8/W4: general-only launch, adult content forbidden; general SQL constraint present, actual classifiers absent. |
| D-E | W4: pass payout per active slot, never AI volume; absent. |
| D-F | W4/W2: reach versus depth grants never mixed; pass SQL restriction only. |
| D-G | W1/W3/W5/W6: closed nine active kinds, three disabled reserved; active schema exists, later acts absent. |
| D-H | All: deferred AI realtime/video/fan agent/cross-memory/unofficial persona/feed/tips not accidentally built. |
| D-01 | W3/W5/W1: creator/triage can separately audit with disclosure/log; audit primitive only, notice/log UI absent. |
| D-02 | W4: authorize at submit/capture at accept/refund on miss using real capture_before; absent. |
| D-03 | W6/W4/W1: creator no-show refund/stat hit; fan no-show captured, never delivered; absent. |
| D-04 | W4: calendar cycles, carry incomplete drafts/free replacement/prorated start; absent. |
| D-05 | Superseded by D-26, not a five-message implementation requirement. |
| D-06 | W4: membership AI uses no slot/equivalent capability does not stack; absent. |
| D-07 | W1/W5/W4/W2: four team roles; no personal fulfillment/creator approval/guardrail changes without confirmation; triage read foundation only. |
| D-08 | W8 and all domain owners: delete propagation; redacted retained Packet/delivery 12 months; account purge except reviewed ledger; absent beyond memory delete. |
| D-09 | W4/W5: group conversion only after fan accepts new service/price; absent. |
| D-10 | W2: blend union of expert retrieval and companion safety; absent. |
| D-11 | W1/W2/W3/W8: 18+, persistent disclosure/3-hour reminder/crisis protocol/annual reporting; adult adapter check only. |
| D-12 | W2/W5/W7: ordinary live AI never waits for human approval; approved-draft workflow exact; test console/72-hour digest; all workflows absent. |
| D-13 | W2/W8: regression stores AI output/rule/paraphrase, never raw fan message; absent. |
| D-14 | W4/W1/W6/W8: membership/pass native IAP, calls external where allowed, storefront matrix reverified at submission; paid replies counsel-open; absent. |
| D-15 | W4 owns ShareGrant creator mode permission + fan choice/handle + either-side revocation gate; W7 owns resulting artifact, W5 content source; absent. |
| D-16 | W6/W4: three clocks/five outcomes/fixed end/80%/fan choice/pro-rata/no-show/rebook rules; absent. |
| D-17 | W5/W3/W4/W7: Notes and reactions in first release, included/free signed presence; absent. |
| D-18 | W1/W5/W6: passkeys, human/AI audio provenance, verification, correction; text proof only. |
| D-19 | W4/W5/W2/W7: private/public choice, lower public price, Content then explicit source approval; absent. |
| D-20 | W2/W8/W4/W6/W3: specific license max ten years, counsel/union/creator-owned voice, immediate revocation/death/incapacity pause/refunds/new estate opt-in; absent. |
| D-21 | W4/W3/W7/W8: first paid cap/explicit none/24-hour raise/immediate lower/reminders/refunds, companion 90-minute/weekly/top-1% ops; absent. |
| D-22 | W1/W2/W3/W6: named no-retention/no-training provider consent plus per-item sensitive consent; explicit sensitive denial only. |
| D-23 | W4/W7: membership first, pass around thirty active creators; no current access workflow. |
| D-24 | All: full sliced build; pilot metrics are measurements, not permission to abandon later planned features. |
| D-25 | W6/W2: human voice first release, AI voice after pilot with license+C2PA+watermark; both absent. |
| D-26 | W4/W2/W3: first conversation free ~24 h, close at natural pause, never mid-disclosure; absent. |
| D-27 | W4/W5/W7: lower public-answer price plus configured capped credits, never cash; absent and amounts intentionally undecided. |

### ADR-1–ADR-12

| ADR | Owner / current coverage / remaining contract |
| --- | --- |
| ADR-1 | W8/W1: modular Express code and bounded pool class exist. Standalone first is user-authorized. No actual three-pool image deployments, durable jobs, measured budgets/timeouts or Pantopus mount. |
| ADR-2 | W8: creator schema, pgvector, non-owner FORCE RLS foundation exists; retrieval tables, ETL role and production provisioning absent. |
| ADR-3 | W4/W3/W8: thread/allowance locks, idempotency, thread outbox and generic inbox exist; money/capacity and external recovery absent. |
| ADR-4 | W4: Stripe interface only; PaymentIntents/Billing/Connect/provider topology/native entitlement design unconnected. |
| ADR-5 | W2: model interface only; names/retention/quotas/two tiers/streaming classifiers/cached prefix absent. |
| ADR-6 | W6: call interface only. Architecture recommends LiveKit/Daily; BUILD_PROMPT names LiveKit Cloud. Confirm intended provider/account without treating either as live configured. Clocks/outcomes remain ours. |
| ADR-7 | W3/W1/W8: WS thread contract exists; event-log polling, not live outbox fanout; typing/request/call multiplex and scale absent. |
| ADR-8 | W2/W6: voice interface only; provider not selected/configured; async consented asset/label concat absent. |
| ADR-9 | W1: real exact-content WebAuthn foundation; enrollment/recovery/native APIs/all subject types unavailable. |
| ADR-10 | W6/W5: no transcode/C2PA/watermark/provenance/verification implementation. |
| ADR-11 | W5/W3/W7: no fan-out-on-read Note merge, audience read cursor or rate-limited push jobs. |
| ADR-12 | W2/W4/W7/W8: no turn routing/cost recording/cost-unit allowance/active-fan budget measurement. |

Second Review additions are all accounted for: A1 Notes and A2 reaction/quote → W5/W3/W7; A3 public answer → W4/W5/W2/W7; A4 proof/correction → W1/W5/W6; A5 sensitive/processor consent → W1/W2/W3; A6 sponsors and A7 no-selling → W2 with W5/W3/W8; A8 spending/time → W4/W3/W7/W8; A9 license → W2/W8/W4/W6; A10 interview/current-status expiry → W2/W6; A11 thanks/impact/tenure → W5/W7/W4; A12 routing/cost/shadow evaluation → W2/W4/W8; A13 Instagram entry → W7/W1; A14 reserved fan_agent → W1/W3 disabled, not an enabled feature.

## Runtime behavioral acceptance inventory, T-01–T-40

The following are real app/provider/dev-database/device verification requirements, not instructions to add unit tests. A row is not fully satisfied merely because a foundation function has historical automated evidence.

| ID | Current scope / remaining real workflow | Owner |
| --- | --- | --- |
| T-01 | Strict shape/derived authorship foundation; exercise every enabled real write route and model/provider output with forbidden authority fields | W3/W1/W2/W5/W6 |
| T-02 | Absent: approve exact draft, edit after approval, attempt send; check Approval invalidation and author state in persisted/live view | W4/W5/W1 |
| T-03 | Core boundary exists; real mid-generation creator takeover, creator reply and no later old-epoch text on web/native | W3/W2/W5 |
| T-04 | Core explicit handback exists; leave/end actual human presence and see system boundary before new AI turn | W3/W5/W6 |
| T-05 | Classifier absent: real injections claiming creator remembers/read/feels produce fallback and guarded audit | W2/W8 |
| T-06 | Presentation foundation only; inspect live thread/search/push/email/export/share/screenshot and audible AI label | All client owners/W7/W6 |
| T-07 | Pass SQL check only; real pass-only fan denied tier content/community/human mode and restricted context | W4/W2/W5 |
| T-08 | Retrieval absent: unentitled fan asks excerpt/paraphrase/link; inspect authorized context and delivered answer | W2/W4 |
| T-09 | Commitment absent: AI/team/notification/view cannot satisfy real due request; only exact promised creator proof does | W4/W5/W6 |
| T-10 | Capacity absent: last capacity in profile/Packet/Studio identical; exhausted submission leaves no provider hold | W4/W5/W7 |
| T-11 | Scoped memory SQL foundation only; instrument complete real assembler and dev DB pairs/retrieval/cache across 100 fans/1,000 threads | W2/W3/W8 |
| T-12 | Consent absent: deny record/summary/reuse/training separately in real call/content/source actions | W6/W5/W2/W1 |
| T-13 | Audit primitive only; queue reveals exact Packet copy, separate disclosed full-thread open records audit | W4/W5/W3 |
| T-14 | Minimal current actor/schema boundary; real Pantopus integration and entire eventual surface contains no forbidden private parent data | W1/W8 |
| T-15 | Memory exclusion foundation; delete memory/revoke source/retire version, inspect next real context/cache and unchanged delivered content | W8/W2/W3 |
| T-16 | Money absent: actual provider decline/expiry/withdraw/miss/creator no-show releases/refunds within SLA with cause ledger | W4/W6/W8 |
| T-17 | Resource authority shape only; real model promise blocked, no provider hold/Commitment/Session created | W2/W4/W6 |
| T-18 | Thread idempotency only; repeat actual submit/hold/approve/schedule/deliver requests and inspect one resource/money effect | W4/W5/W6/W1 |
| T-19 | Safety absent: no active grant yet crisis/report accepted with resources/case, no offer/score/paywall | W8/W2/W3 |
| T-20 | Mode absent: actual companion romantic/exclusive pressure blocked; expert unsupported question safely routed, blend both | W2/W8 |
| T-21 | Study pending: ten real fans judge author in five mixed realistic threads; bar agreed before pilot, failures mapped to screens | W1/W3/W5/W8 |
| T-22 | Pass absent: real dev cycle drafts/replacements/cancel/pause and inspect atomic grants plus exact prorated pool sum | W4/W8 |
| T-23 | Gate foundation; stream real approved sentence, take over mid-stream, inspect two actual devices and interrupted text | W3/W2/W5 |
| T-24 | Allowance locking only; race real last allowance and last Packet capacity, confirm exactly one admission and no duplicate hold | W3/W4/W2 |
| T-25 | Call acceptance absent: revoke creator between offer/accept; no hold/Commitment/room and correct paused view | W4/W6/W2/W8 |
| T-26 | Source absent: revoke during live generation; next assembly excludes within 5 s, old citation marked inaccessible | W2/W3/W4 |
| T-27 | Revision/exclusion foundation; real delayed extractor across delete cannot restore fact on same/other device | W3/W2/W8 |
| T-28 | Generic inbox only: real verified payment/call duplicate/reordered/missing events reconciled by current-state fetch/poll | W4/W6/W8 |
| T-29 | Thread relay retry only: stop real process after provider hold/capture/room success before local commit; reconcile once with no loss | W4/W6/W8 |
| T-30 | Atomic resume gate/checkpoint foundation; interrupt actual WS/network/restart with active generation on all clients and inspect no skips/duplicates | W3/W1/W8 |
| T-31 | No pilot: real creator's exact cited passage, return visit editable follow-up, unmistakably labeled human contribution | W2/W3/W5 |
| T-32 | No model/style study: creator blinded ten-reply comparison with agreed interpretation/bar; do not silently reinterpret source's failure wording | W2/W8 |
| T-33 | No Note backend: deliver real signed name-token Note to 1,000 dev fans; audience always rendered, replies isolated and quote identity consented | W5/W3/W7/W4 |
| T-34 | Personal text exact WebAuthn foundation only: actual creator/team/stolen session passkeys across reply/draft/Note/reaction/acceptance | W1/W3/W4/W5 |
| T-35 | No policy pipeline: actual lonely/grieving/crisis messages during expiry have no commerce suggestion and close only at natural pause | W2/W3/W4/W8 |
| T-36 | Explicit sensitive denial only: actual diagnosed/sexuality/religion prompts independently detected; no Memory before explicit item yes, question once | W2/W3/W1 |
| T-37 | Sponsors absent: real brand registry and sourced recommendation label, no unsourced first-hand claim | W2/W5 |
| T-38 | Spend absent: at cap real submit blocked before reservation/hold; raise still blocked until 24 hours | W4 |
| T-39 | License absent: real revocation/death notice pauses all generation/voice within 5 s and automatically refunds open Commitments | W2/W8/W4/W3/W6 |
| T-40 | Model/load absent: actual design workload with companion traffic, measured routing/cost per active fan below chosen plan budgets | W2/W4/W8 |

## Provider and Pantopus seams: dependencies, not selected credentials

| Seam | Owner / required external confirmation | Existing coverage and first real verification |
| --- | --- | --- |
| Pantopus identity | W1: session issuer/token or Supabase validation, revocation/watermark, age evidence, callback/app links, account lifecycle; confirm in owner checkout before integration | Interface only. Real sign-in retains creator/post/Packet context, actual invalid/revoked/underage account denied, no parent private data copied. Prior Pantopus audit says JWT-only validation would miss existing session revocation. |
| Stripe/Billing/Connect | W4/W8: account topology, test/live separation, manual capture support/capture_before, KYC, consolidated subscription items, webhook secrets, payouts/disputes | Interface only. Use real provider development resources for requires_action, expiry, capture, refund, reauth and reconciliation. No invented prices/take/credits. Do not reuse parent wallet/Persona subscription state as creator grants. |
| Apple/Google purchases | W1/W4/W8: actual storefront product rules, receipt/server notification validation and matching capabilities; counsel for paid replies | Absent. Sandbox buys/restore/refund/cancel/past_due/revocation across devices; never display web and store prices together or permit disallowed link-outs. |
| Models/classifiers/embeddings | W2/W8: exact processor names/deals/no-retention/no-training, route models, quotas/token rates, embedding version, consent version, actual policy pipeline | Interfaces only. Publication evidence tied to exact revision/model/prompt/guardrail/retrieval pipeline; actual six required probes and creator regressions; verified context/no unauthorized citations; no silent fake passing. |
| Media storage/CDN | W6/W1/W8: parent storage adapter, private key namespace, upload grants, scoped signed URLs/TTL, egress, deletion/export and transcode/provenance keys | Absent. Upload/read/download under actual unauthorized/current grants; no public CDN URL securing private thread; failure leaves text usable. |
| Calls | W6/W8: LiveKit/Daily choice/account, room identity claims, webhook signature/current participant polling, egress, timeouts and quotas | Interface only. Short-lived backend-issued creator/fan room tokens; real joins/drops/background/locked-screen/Bluetooth/end/no-show/reconcile. Provider moves media, not obligations. |
| Async voice | W2/W6/W8: named processor, creator-owned licensed voice model, deletion/retention and consent, watermark capability | Interface only. Never auto-select ElevenLabs from a recommendation. Live AI voice stays off until pilot/license/marking/label requirements met; provider failure produces text, never fake human audio. |
| Push/email | W7/W1/W8: APNs/FCM/email identity, product registrations/templates/quiet hours/delivery policy, durable in-app state | Absent. Real devices/email inspect sender and sanitized previews; revoke grant before delivery and confirm audience recheck; disabled channel leaves in-app state available. |
| Source connectors/Instagram/search | W2/W7/W8: manual/YouTube first as source roadmap suggests; rights, scopes/expiry, permitted APIs, one-shot private reply window, search index decision | Absent. No arbitrary URL fetch or implicit content approval. Actual approved dev connector imports retain origin/rights/purpose/audience; Instagram only links into app, never hosts AI in DMs. |
| Availability/block/quota | W1/W4/W6/W8: narrow parent APIs, timezone/version semantics and side effects | Interface design absent. Parent Persona block/membership effects are not drop-in. Verify current restrictions and booked slot concurrency without importing private parent rows. |

Only the client-to-provider WebRTC media path is intended to be direct, using a short-lived server-issued room token. Models, payment authority, voice and provider keys stay server-side. Webhook raw-body signature handling must precede JSON parsing on those future routes; the current global JSON parser alone is not a configured webhook implementation.

## Data security, operational lifecycle, performance and release

### Authorization, isolation and deletion

W8 and each data owner must expand the existing foundation rather than bypass it:

- Per-action actor plus current capability checks; non-owner runtime role with FORCE RLS and composite scope keys; creator-owned source/config/Notes writes additionally derive creator from account authority. Define distinct runtime, migration, read-model and anonymized ETL privileges. No admin/service-role client in feature repositories.
- ThreadScope is issued only by access. New source retrieval, transcripts, embeddings, media URL issuance and cached prompts need both creator/fan scope or a reviewed creator-only/public aggregate policy. Never use broad identity/team SELECT privileges to build handler joins.
- Shared/cache keys include live version, grant version/expiry and thread revision where applicable. Source revocation/version retirement/membership change affect byte access, citations, Notes, push, cached context and queued generations within the specified five seconds.
- Seven purpose consents remain separate: AI conversation, Packet disclosure, call joining, recording, summary, content reuse, agent use. ProcessorConsent names actual providers; MemoryConsent is category/item-specific. The model cannot self-authorize consent. “No training” remains the default external provider contract, not an inferred permission from chatting.
- D-13 regression data has no raw fan prompt. Insight ETL has no raw-thread access outside its approved projection, minimum five fans, and no identity leakage back to creator or agent. Ops reads require a defined case, reason and audit, not general browsing.
- Deletion jobs: memory hard-delete/exclusion/context invalidation; thread soft-delete then hard-delete after 30 days; source/chunk/compiler revoke; retained redacted Packet/delivery purge after 12 months; recordings under consented policy; account lifecycle purge except reviewed hashed ledger refs. Old extraction/import/summarization jobs cannot resurrect data.
- Consent withdrawal, license termination/death/incapacity, account/session/team revocation, chargeback and creator pause need coordinated current-state decisions and events. Encryption/KMS/key rotation, secrets, scoped storage, export formats and portability are all deployment work, currently absent.

### Events, jobs and failure recovery

Every source-required event distinction is presently missing as a general domain protocol: source_approved/revoked, agent_published/paused, grant_issued/expired, slot_activated/ended, thread_opened, message_delivered with author, takeover/handback, packet_submitted/decided, approval_recorded/invalidated, commitment_created/delivered/resolution, session_connected/ended, hold_placed/captured/refunded/pool_allocated, memory_written/deleted, guardrail_event and report_filed. Existing frames cover only accepted/sentence/control/delivered/interrupted in one thread. Notes, reactions, corrections, consents, license changes, content, refunds, account deletion and notification/insight events also need versioned envelopes.

W8 infrastructure must provide durable consumer checkpoints, retry/backoff/timeouts, dead-letter handling and aggregate ordering; no unbounded in-memory queue becomes the production scheduler. Required jobs include Packet expiry/capture-before warning/reauthorization, Commitment deadline/refund, 24h/1h/10m call reminders, no-show/end/poll reconciliation, calendar cycles and delivered-plus-seven-day payout/dispute window, billing reconciliation, source/status expiry, consented retention, delete/export, Notes rate-limited push, memory/summary extraction, 72-hour calibration/weekly impact/email digests, anonymized insights and shadow evaluation.

Unknown payment state over one hour creates an operational case; nightly provider balance/current-state reconciliation must make ledger discrepancy zero or page. Provider inbox and our outbox remain distinct. The Architecture context prose that says provider webhooks go to “outbox” conflicts with ADR-3 and ledger sections; use the verified inbox contract and record our own resulting transition in the outbox.

### Measurable performance and scaling

Architecture §5/§11 defines targets, not measured current results:

- Durably accepted message p95 300 ms; first approved sentence about 2.5 s warm / 4 s cold; visible takeover 500 ms; full reply target 8 s. Guardrails apply before visible output; a fast raw model token does not meet the user-facing target.
- Component budgets: context 150 ms, input classification 200 ms, model first token 800 ms, sentence accumulation 600 ms, output classification 150 ms. Component p95s cannot simply be summed; define region/network/device/cache/load and publish p99 too.
- Pilot workload: 500 concurrent WS, two generation starts/sec, eight active generations, four concurrent call participants, one archive import. Design workload: 50,000 WS, 200 starts/sec, 800 generations, 400 call participants, twenty archive imports.
- Three independently budgeted pools must protect interactive latency from model/import work. Measure DB connection/CPU/memory budgets, creator fairness, admission/rejection, queue p95 (<1s interactive, <5s generation, <10m ingestion), provider quotas/rate/cost, burst behavior and cancellation.
- Exact creator/audience-filtered vector search below roughly 50k corpus chunks; larger creator-partition/HNSW/iterative scan path must benchmark recall at import. An Architecture table's ivfflat entry conflicts with later assembler guidance; choose and document the measured threshold/policy rather than silently implementing both.
- Compile the stable prefix deterministically; 400-token chunks/50 overlap, twenty fixed plus five retrieved style examples are Architecture refinement of the broad 20–50 examples context contract. Retrieval top four citations, last thirty labeled messages; summaries after sixty/every forty messages. These are source defaults to expose consistently, not invented provider settings.
- Model routing short social → small; first/knowledge/sensitive → large; actual cost recorded per message and allowance in cost units with fan-facing message copy. Set plan budgets before measuring T-40; dated illustrative price tables are not configuration.
- Notes stored once/fan-out on read; maintain read cursors and rate-limit notification fanout. Existing 100ms per-subscription database polling is a foundation strategy, not a credible 50k-connection scale claim.
- Availability 99.9%, reconnect success >99%, RPO 5 minutes, RTO 1 hour, with actual restore drills. No production traffic, latency, quota, routing/cost or restore result has been demonstrated.

W8 must instrument acknowledgment/first sentence/takeover/revocation times, queue age, provider timeout/error, delivery/backpressure, grants/capacity contention, output guardrail rate, overdue commitments, call connect/outcome/reconciliation, ledger unknowns, source import/recall and per-active-fan cost. Log IDs/categories, not raw message text. Source alert thresholds include p95 acknowledgment >600ms for five minutes, warm first sentence >4s, takeover >1s, any revocation >5s, overdue commitments >5%, unknown payment >1h, call-connect under 90% daily and any outcome from a single webhook.

### Deployment and lifecycle completion

W8 owns local/dev/staging/production configuration, separate privileged migrations, orderly versioned migrations/backfills, exact image build/runtime pools, environment feature flags/readiness, provider sandbox/live separation, secrets/rotation, graceful socket/job drain, canary/rollback, database backups/point-in-time restore, hosted CI runners/artifacts and release ownership. Current source-only API exports, one-migration runner, placeholder worker executable and checks-only CI are not a deployment plan.

Required runbooks before the pilot: model outage with safe fallback and requests still working; media failure preserving text; call outage/reconnect/rebook/refund; Stripe webhook backlog/current-state replay; isolation incident freeze/audit; creator verification/license revoke with pause/refund/replacement; retention/deletion failure; account/session/provider secret revoke; restore drill. One failure must never clear a screen by marking unperformed work delivered.

Release acceptance is a real vertical action across the supplied Light/Night designs, actual backend state, dev provider resources and applicable native devices. W8 maintains evidence naming environment/commit/provider/actor/device, starting state/actions/result, persistent/provider records and screenshots, with unverified cases explicit. W1/W5/W3 own accessible author-before-body, 200% text, keyboard/VoiceOver/TalkBack, reduced motion and exact fixed-copy screens; the original design audit did not verify screen-reader behavior or render every final canvas.

## Source inconsistencies and amendments to resolve explicitly

| Item | Required resolution / owner |
| --- | --- |
| Off the record | BRIEF decision dated 2026-09-25, line 283: AI writes no Memory/open loops; access notice, labels, retention and deletion still apply. Accepted product intent, but explicitly requires Domain Model/Architecture addition before build. W3/W2/W8 must define scope/toggle/effective revision/job behavior; do not quietly invent schema from a visual switch. |
| Stale trial/pass-first copy | F2, honest-state “five messages,” and Architecture trial-farming row conflict with D-23/D-26. W4/W2/W3/W7 implement free first ~24h and membership-first with natural pause, not address/local-verification checks. |
| Ordinary AI approval gate | S-C2/creator journey stale “after N approvals” conflicts with D-12. W2/W5 use live instant AI; approvals apply only to exact approved drafts. |
| Source expiry / audiences | Source object table omits expired while state table includes it; early tier-only audience shapes expand later to public/tier/group and Note followers. W2/W4/W5 define one canonical representation and effective expiry before code. |
| Provider selection | Model names, retention agreements, Stripe topology, voice provider and some call wording remain open. BUILD_PROMPT names LiveKit; Architecture recommends LiveKit or Daily. W8/W1/W2/W4/W6 confirm explicit decisions rather than claim configured providers. |
| Storefront/legal/license | Paid-reply IAP and license terms explicitly counsel-open; source rules are dated. W8 obtains current submission review; placeholder amounts are configuration. No research here asserted current legal status. |
| Realtime/token failure | Source says identity outage lets sessions continue to expiry, while actual adapter must honor Pantopus revocation. W1/W8 define safe cache/expiry/revalidation availability semantics; do not accept unverifiable tokens as a fallback. |
| Context/style refinements | Broad context table says 20–50 examples; Architecture says twenty fixed/five retrieved. Source-chunk index table says ivfflat, later section prescribes exact/HNSW threshold. W2 documents consistent compile/runtime policy and benchmark basis. |
| Training terminology | Seven consent purposes include “agent training,” but D-22 forbids provider training of fan data. W1/W2/W8 distinguish approved source/context use from provider training; do not infer training permission from a consent label. |
| T-11 topology / T-32 criterion | DM T-11 says one creator; Architecture and historical fixture span ten creators/100 fans/1,000 threads. Both isolation topologies matter. T-32's blinded distinction/failure wording needs an agreed creator-study bar and interpretation. |
| Appearance/navigation | BRIEF four fan tabs/Studio phone More/system themes and BUILD known fixes supersede stale sample labels/plate colors. Fixed-copy source centralization and exact designs remain mandatory. Translation labels, stable deep links and cached offline read-only behavior must reach every screen-bearing object, not only threads. |
| Legacy requirement IDs | ACCESS-02/03, PASS-04, PRODUCER-01/02, CONTENT-03, INBOX-01, CHAT-06, STATE-05 and AI-03 are referenced, but their complete originating product-definition tables are not included as separate current sources. Preserve known stated behavior; W1/W8 document unresolved provenance rather than invent missing numbered requirements. |

## Planning conclusions

All eight streams have meaningful preparatory/domain work, but their user-facing milestones share hard gates: actual identity, verified creator authority, exact proof, canonical audience/grants, live guarded AI, durable state/events and recovery. Schedule by completed vertical capabilities, not by component or interface counts.

The first contract handoff should fix Actor/lifecycle, current CreatorAuthorization, AudienceRule/GrantDecision, canonical SignedCommand, scoped ContextSnapshot/ModelProposal, ThreadTimeline/frame/checkpoint, Packet/Commitment/payment lineage, SessionOutcome/FulfillmentEvidence, domain event envelope and deletion/export receipts. Assign each schema and migration to one owner; W1 manages generation/integration of shared schemas without becoming a second writer of every domain.

The initial real app milestone should include verified creator setup and licensed tested agent, named-provider fan consent and free/membership access, one actual guarded/cited/remembered thread with takeover/handback, one signed Note and isolated reply, and one paid creator written/voice request through hold/capture/attested delivery/refund. W8 safety, ops, recovery, retention and readiness cannot be deferred behind a decorative pilot. Later calls/native commerce, producer/public-answer credits/sharing/AI voice and pass remain fully inventoried and owned.

No full product feature is marked accepted by this document. No provider was selected or connected, no external message was sent, no new test was added, and no production or test source was edited during this research.

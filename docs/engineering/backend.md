# Backend foundation

The backend is a strict TypeScript Express modular foundation in `apps/backend`.
It builds here first; the Pantopus checkout has not been modified. The shared
`@qelvora/api` package owns Zod request/response schemas, a typed web client,
OpenAPI 3.1 generation and the per-device cursor/epoch gate. Product naming remains
replaceable through the root brand configuration and rename command.

## Run locally

```sh
pnpm --filter @qelvora/backend dev
pnpm --filter @qelvora/backend build
pnpm --filter @qelvora/backend start
pnpm --filter @qelvora/api generate
pnpm --filter @qelvora/api generate --check
```

The production build emits `dist/server.mjs`, `dist/integration.mjs` and
`dist/workers/start.mjs`; workspace schemas and copy are bundled. Third-party
runtime dependencies remain installed packages. The default standalone server
serves `/health`, `/openapi.json` and identity capabilities. Health reports
`ready: false`. Continue with Pantopus returns `503 identity_unconfigured`.
There is no demo token, local account, permissive production adapter or successful
simulated purchase.

The Pantopus host supplies a `PantopusIdentityAdapter` to the exported
`createConfiguredBackend` integration seam, together with the feature configuration,
non-owner runtime database and guardrail adapter. The identity envelope is exactly
`accountId` and `adultEligible`; extra parent-platform profile fields are rejected.
The adapter owns session validation and the sign-in redirect. No token issuer,
JWT secret, parent-platform private join or model/provider choice is inferred.
The identity redirect accepts only a relative return path and returns a validated
HTTPS sign-in URL. Underage accounts are denied before thread access.
Both web auth routes use the same shared return-path validator. The schema-only
Next.js integration imports `@qelvora/api/schemas`. The package's full client/index
uses TypeScript source with Node-style `.js` specifiers; it is bundled correctly
for the backend, but a future Next.js client integration must consume published
JavaScript or configure equivalent extension resolution rather than importing
the current source index directly.

## Database and authority

Apply migrations using an explicit administrator URL:

```sh
DATABASE_MIGRATION_URL=postgresql://... pnpm --filter @qelvora/backend db:migrate
```

`0001_foundation.sql` creates the `creator` schema, pgcrypto and pgvector, distinct
owner/runtime roles and the foundational conversation, grant, audit, generation,
passkey, signed-act, event, idempotency and verified-inbox records. It is an initial
migration, not the complete product schema. Runtime startup refuses a superuser,
RLS-bypassing role, table owner, absent schema or disabled/unenforced required
RLS policies. All thread data has explicit SELECT/INSERT/UPDATE/DELETE policies
and FORCE RLS. Composite foreign keys prevent attaching a row to another pair.
Transactions use parameterized `set_config(..., true)` so pooled connections
retain no tenant context.

Only `access.openThread` issues a runtime-valid branded ThreadScope. It checks
fan ownership, verified creator ownership or current triage membership through
the identity module's read API. Creator/team opens append a fan-visible audit
record. Repository methods require an issued scope; fabricated objects are denied.
The conversation memory snapshot instruments actual SQL and never accepts a
different creator/fan pair from a model or client.

Every client/model authorship field is rejected by a strict schema. Fan text,
AI text, human replies and system lines receive authority inside the application.
Enabled named human text paths require a real WebAuthn assertion with signature, challenge,
origin, relying-party and user-verification checks. Challenges bind a random nonce
to the exact canonical command hash, expire after five minutes and are single-use.
Publication checks current credential/creator authority and consumes signed
evidence in the same transaction as the message. SQL independently recomputes
the canonical content hash, so changing signed text also fails at the database.
Passkey enrollment and recovery still require the slice-1 verification workflow.
Proposals explicitly marked sensitive are rejected, and SQL rejects sensitive
category/consent fields; an arbitrary consent UUID cannot enable them. No live
memory extraction is enabled. This does not replace semantic classification: a
future extractor must independently detect sensitive text rather than trusting
a model to supply its category. Classification and per-item consent remain work
for that slice.

## Durable delivery

Message acceptance reserves allowance under a row lock, claims the actor/operation
idempotency key, writes fan/AI/generation records and appends a durable event in one
transaction. Same-key retries return the original response; different content
under that key is refused. Sentence output must pass the injected guardrail and
its generation epoch is rechecked under the thread lock before a frame commits.
Sentence sequence retries return the existing frame and cannot append text twice.
Citation delivery is refused until the scoped retrieval module exists.

Takeover interrupts in-flight generations, preserves delivered text and records
the interruption before the new system boundary. Handback always writes its
announced system line before any new-epoch AI output. Replay orders by a persistent
per-thread cursor. The device gate buffers missing cursors/boundaries, discards
old epochs, rejects generation gaps without advancing the cursor, and deduplicates
replayed frames. The WebSocket gateway authenticates each subscription, rechecks
authority on batches and disconnects slow clients so they can resume.

The gate's serializable `snapshot()` preserves cursor, epoch and each generation's
last accepted sentence sequence. A restored device supplies all three values to
the constructor. Thread timeline reads return active `generationSequences` in the
same locked snapshot as cached messages, allowing a restart to accept the next
sentence without replaying visible text.
Draining buffered frames commits cursor, epoch and sequence changes atomically;
if one frame fails validation, a corrected replay also emits the earlier frames
that the caller has not yet received.

Transactional outbox publication is ordered per aggregate and safely retries the
same event ID after a publisher crash. The verified webhook inbox deduplicates by
provider/event ID and reconciliation fetches current provider state instead of
trusting webhook order. Consumers must use the supplied event/idempotency key.

Interactive, generation and ingestion pools have separate bounded concurrency,
queue, connection and per-creator budgets. Unconfigured worker executables stop
with an explicit error. AI HTTP sends remain unavailable until a real generation
processor is wired. The gateway currently reads the scoped event log on a short
polling cadence; the 50,000-connection workload and latency budgets have not been
measured or claimed.

## Validation

The integration suite uses a disposable Postgres 17 database with pgvector and
connects as the actual non-owner `creator_runtime` role for application operations.
Admin credentials are confined to migration/fixture setup. Example test setup:

```sh
docker run --name creator-platform-foundation-test --detach \
  --env POSTGRES_PASSWORD=foundation-test-only --env POSTGRES_DB=creator_foundation \
  --publish 127.0.0.1:55432:5432 pgvector/pgvector:pg17
CREATOR_TEST_DATABASE_URL=postgresql://postgres:foundation-test-only@127.0.0.1:55432/creator_foundation \
  pnpm --filter @qelvora/backend test
```

The suite covers the implemented foundation portions of T-01, T-03, T-04, T-11,
T-18, T-23, T-24, T-27, T-28, T-30 and T-34. T-11 seeds 100 fans across ten creators
(1,000 threads), tests 10,000 random pairs and checks all 30,000 conversation-context
SQL predicates. T-34 uses an actual generated P-256 key, COSE public key and signed
WebAuthn assertion with the UV flag, rather than accepting a mock passkey result.
It also tests stolen sessions without a passkey, team authority, exact-content
mutation, assertion replay and signed-act reuse. Outbox crash/retry and unscoped
database access have additional tests. When the explicit database URL is absent,
Postgres integration tests are visibly skipped in local development. A truthy CI
environment without that URL fails the suite immediately, rather than reporting
the integration tests as skipped.
All 18 foundation tests pass with this database configuration; the production
bundle, TypeScript checks, backend/API lint and OpenAPI drift check also pass.

### Acceptance coverage, T-01 through T-40

This matrix tracks the [Domain Model acceptance rows](../source/Domain_Model_and_Behavioral_Contract.md#10-acceptance-tests).
"Tested portion" describes foundation behavior exercised by automated tests; it
does not mark the complete product acceptance row passed. "Unavailable" means
the product capability has no live implementation and must remain disabled.
UI components and preview fixtures are not evidence of a live provider workflow.

| Test | Current evidence                                                                                                                                                               | Remaining acceptance work                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| T-01 | Tested portion: strict client/model schemas reject supplied authority; conversation writes derive fan, AI, human and system authorship.                                        | Apply the same gate to every later write path.                                                                  |
| T-02 | Unavailable: there is no Approval/edit/send lifecycle.                                                                                                                         | Invalidate edited approvals and test the resulting author state.                                                |
| T-03 | Tested portion: thread-lock takeover interrupts generation before the boundary; stale output cannot commit; creator reply requires takeover and a signature.                   | Wire and test real generation cancellation and live clients.                                                    |
| T-04 | Tested portion: explicit handback commits its system frame before later AI frames.                                                                                             | Creator presence/departure detection and automatic handback are unavailable.                                    |
| T-05 | Boundary only: sentence delivery calls an injected guardrail; live AI delivery is disabled.                                                                                    | Implement classifiers, fallback and guardrail-event audit, then run the injection set.                          |
| T-06 | Boundary only: shared author enum and label components exist.                                                                                                                  | Exercise actual notifications, search, export and audible AI voice labels across all surfaces.                  |
| T-07 | Boundary only: pass-slot database grants are restricted to AI messaging and acceptance reserves an active allowance.                                                           | Tier/content/community/human-mode grant workflows and grounded context tests are unavailable.                   |
| T-08 | Unavailable: scoped source retrieval and the agent assembler do not exist; citations are refused.                                                                              | Implement tier-aware retrieval and adversarial excerpt/paraphrase/link tests.                                   |
| T-09 | Unavailable: there is no Commitment state machine.                                                                                                                             | Prove only an attested creator delivery can satisfy the obligation.                                             |
| T-10 | Unavailable: Packet capacity and payment holds are not implemented.                                                                                                            | Atomic capacity reservation and consistent remaining counts across surfaces.                                    |
| T-11 | Tested portion: 1,000 fixture threads across 100 fans/ten creators; 10,000 random pairs; actual non-owner RLS and 30,000 context-query predicates checked.                     | Apply instrumentation to the future complete assembler, retrieval and caches.                                   |
| T-12 | Unavailable: call recording, summarization and content reuse have no live endpoints.                                                                                           | Independent, scoped consent records and denial tests for each purpose.                                          |
| T-13 | Boundary only: creator/team thread opens append an audit record.                                                                                                               | Packet disclosure projection, the separate logged full-thread action and fan-visible audit UI.                  |
| T-14 | Reviewed portion: the current creator schema/API uses no parent-platform private fields or joins; identity accepts only account ID/adult eligibility and rejects extra fields. | Automated whole-surface scan and review of the eventual Pantopus integration.                                   |
| T-15 | Tested portion: deleting a memory records an exclusion and does not mutate delivered message text.                                                                             | Source revocation, version retirement and context/cache invalidation are unavailable.                           |
| T-16 | Unavailable: no hold/refund/ledger workflow is connected.                                                                                                                      | Every decline, expiry, withdrawal, missed deadline and no-show recovery path, including its SLA.                |
| T-17 | Boundary only: model output cannot carry authority, price or obligation fields and cannot create external resources.                                                           | Semantic promise classification/fallback and Commitment/Session/hold assertions.                                |
| T-18 | Tested portion: transactional message/control/human-reply idempotency; concurrent retries cannot duplicate accepted fan text.                                                  | Packet, hold, Approval, schedule and provider delivery operations are unavailable.                              |
| T-19 | Unavailable: no SafetyCase or crisis response workflow is connected.                                                                                                           | Grant-independent resources/report handling and absence of commercial effects.                                  |
| T-20 | Unavailable: mode-specific companion/expert classifiers and fallbacks are not implemented.                                                                                     | Run pressure, exclusivity and out-of-source adversarial sets.                                                   |
| T-21 | Human study pending. Authorship components and supplied research fixtures are not study results.                                                                               | Agree the pilot bar, recruit ten fans and trace comprehension failures by surface.                              |
| T-22 | Unavailable: pass-cycle grants/pool allocation/prorating are not implemented.                                                                                                  | Atomic transition tests across drafts, replacements, cancellation and pauses.                                   |
| T-23 | Tested portion: delivered text survives interruption; two simulated device gates reject old epochs after takeover.                                                             | Actual mid-stream providers and multi-device network tests.                                                     |
| T-24 | Tested portion: concurrent messages contend for the last allowance under a row lock; one succeeds with no negative counters.                                                   | Packet capacity/hold races are unavailable.                                                                     |
| T-25 | Unavailable: there is no call offer/acceptance workflow.                                                                                                                       | Revalidate creator authorization atomically before commitment/hold and show the paused state.                   |
| T-26 | Unavailable: no source retrieval or revocation cache exists.                                                                                                                   | In-flight revocation, next-assembly exclusion, citation state and five-second invalidation.                     |
| T-27 | Tested portion: revision-guarded proposal writes reject stale extraction; semantic exclusions prevent rebuilding deleted keys.                                                 | Live extraction, semantic normalization and cache/device propagation.                                           |
| T-28 | Tested portion: verified inbox duplicates are processed once; generic reconciliation fetches current state instead of trusting event order.                                    | Real payment/call signature adapters, missing-event polling and recorded outcomes.                              |
| T-29 | Boundary only: outbox publication safely retries a stable event ID after a publisher crash.                                                                                    | External-success-before-local-commit recovery for hold, capture and room creation is unavailable.               |
| T-30 | Tested portion: cursor ordering, duplicate/old-epoch rejection, atomic buffered drains and serialized per-generation resume state.                                             | Real dropped-WebSocket/network chaos and native API-to-renderer integration.                                    |
| T-31 | Unavailable: no real-creator end-to-end pilot exists.                                                                                                                          | Exact-passage citation, editable return-visit follow-up and human/AI contribution study.                        |
| T-32 | Human study pending; no creator-style model is connected.                                                                                                                      | Set the pilot bar with creators and run the blinded reply comparison.                                           |
| T-33 | Boundary only: Note/audience label components exist. There is no broadcast/fan-reply backend.                                                                                  | 1,000-fan delivery, reply isolation, name substitution and quote consent across surfaces.                       |
| T-34 | Tested portion: real P-256 user-verified WebAuthn assertion, exact-content/subject binding, expiry/replay/single-use checks; team and stolen-session signing denied.           | Approval, Note, reaction and acceptance publication lifecycles and passkey enrollment/recovery are unavailable. |
| T-35 | Unavailable: companion traffic, natural-pause limits, crisis routing and commercial-content classifiers are not implemented.                                                   | Run the specified distress/grief/expiry red-team set against actual model routing.                              |
| T-36 | Tested boundary: explicitly sensitive proposals and fabricated consent identifiers are denied. Live extraction is disabled.                                                    | Independent semantic sensitivity detection, explicit yes per item and the once-only consent-question UI.        |
| T-37 | Unavailable: sponsor disclosure and grounded recommendation delivery are not implemented.                                                                                      | In-message paid-partnership labels and source-backed first-hand claim checks.                                   |
| T-38 | Unavailable: spend-limit enforcement and delayed raises have no live transaction workflow.                                                                                     | Refuse before reservation/hold and enforce the 24-hour raise delay.                                             |
| T-39 | Boundary only: current verified-creator/passkey authority is rechecked for signing; live generation/voice remains disabled.                                                    | License revocation/death suspension propagation, five-second pause and open-commitment refunds.                 |
| T-40 | Unavailable: provider model selection, plan budgets and workload routing are not configured.                                                                                   | Measure the actual design workload, cost per active fan and short-turn small-model routing.                     |

The complete agent assembler, source retrieval/grounding, safety classifiers,
creator onboarding, approval-version lifecycle, Notes, payment/capacity/spend-limit
state machines, calls, provider recovery and all later slice tests remain work
for their owning slices. No foundation test is evidence that these unavailable
features are complete. Native clients are generated by the root OpenAPI workflow;
real device, provider, load and external identity tests remain pending. Production
storage encryption, key management, retention and operational hardening are also
deployment/slice work; the local fixture database does not provide those controls.

Reference implementations: [PostgreSQL RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html),
[SimpleWebAuthn server verification](https://simplewebauthn.dev/docs/packages/server).

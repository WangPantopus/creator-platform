# Full-product coverage register

This is the master navigation map; the research inventories contain the detailed rows and implementation evidence. Every named requirement has an owner even when its release is later. Status at planning time is **not delivered**, except for the narrowly described foundation primitives in the inventories.

W7 continuation2026-09-30: [current matrix](../../artifacts/workstreams/W7/resume/20260930/acceptance.md) separates runnable implementation, actual local UI/DB diagnostics and unmet integrated acceptance. C09/C10/O16–18 have further implementation; no all19-producer, populated13-artboard, production privacy or release gate is closed by this update.

## Inventory accounting

| Source scope | Coverage location | Completion rule |
| --- | --- | --- |
| 64 current artboards: 16 fan core + 8 fan account + 10 phone Studio + 8 desktop Studio + 17 later/shared + 5 prototypes | [Design inventory](research/design-inventory.md) | One primary screen owner, contributors, live implementation route and visual/runtime evidence |
| Five prototypes with multiple cards/transitions | [Prototype breakdown](research/design-inventory.md) | Every card and transition exercised in the actual product, including result state |
| 53 reference components, variants and themes | [Design inventory](research/design-inventory.md), W1 | Independent source comparison, functional controls and accessibility; catalogs alone do not establish product completion |
| Earlier phase-2 directions, foundations and decorative cover | [Design inventory](research/design-inventory.md) | Historical/reference material classified; no accidental implementation of rejected alternatives |
| All domain entities and state machines, twelve architecture module families | [Backend inventory](research/backend-inventory.md#entity-and-feature-completeness-by-owner) | Schema, constraints, commands, lifecycle jobs, event/read models and supported clients implemented |
| F1–F16, INV-01–INV-25, D-A–D-H, D-01–D-27, ADR-1–ADR-12, A1–A14, T-01–T-40 | [Complete backend mapping](research/backend-inventory.md) and tables below | Preserve the rule; T IDs are runtime acceptance scenarios, not new test-code requirements |
| 27 honest states, notifications, fixed copy and accessibility | Design inventory + state table below + W7 notification matrix | Both themes, correct remaining actions, authority/access and cross-client behavior |
| Native/platform/release/tooling/operational gaps | [Platform inventory](research/platform-inventory.md) | Actual target environment evidence; unavailable device/provider gates remain open |
| Useful additions beyond original designs | [Opportunities](OPPORTUNITIES.md) | Owner, priority, benefit metric, design/decision dependency and runtime outcome |

## Complete journeys

The primary owner coordinates the end-to-end demonstration; contributors still implement and verify their own domain.

| Flow | Primary | Contributors | Result that must be demonstrated |
| --- | --- | --- | --- |
| F1 Creator onboarding | W2 | W1/W6/W8 | Verified/licensed creator imports and approves sources, sets style/rules, evaluates and publishes a version |
| F2 Fan discovery/access | W7 | W1/W4/W3 | Contextual arrival, sign-in, D-26 trial/membership; pass selection only at its later release gate |
| F3 Fan message → AI | W3 | W2/W4/W8 | Durable accepted message, permitted context, approved labeled/cited response and settled allowance |
| F4 Return visit | W3 | W2/W7 | Correct thread, editable consented memory/open loop, no fabricated human attention |
| F5 Human request | W4 | W3/W5/W6 | Exact packet disclosure/mode/price/deadline, capacity and hold; live status |
| F6 Creator decision | W5 | W4/W1/W6 | All eight decisions, correct labels, signed acceptance and explicit changed-offer consent |
| F7 Written delivery | W5 | W4/W1/W3/W7 | Exact promised signed delivery, commitment/receipt, notification and human-answer provenance |
| F8 Call | W6 | W4/W3/W1/W7 | Scheduling, clocks, consent, fixed ending, correct outcome/settlement and announced handback |
| F9 Takeover/handback | W3 | W5/W2/W6 | Ordered multi-device boundary and interruption without late AI output |
| F10 Pass cycle | W4 | W7/W3/W8 | Atomic selections/grants, replacement/pro-rating, exact slot-day pool and payouts |
| F11 Unavailable creator | W8 | W1/W2/W3/W4/W7 | Paused generation and truthful public state, commitment resolution and permitted replacement |
| F12 Revocation/deletion | W8 | W1/W2/W3/W4/W5/W6/W7 | Prompt denial plus propagated deletion, retained exceptions and completion evidence |
| F13 Group answer | W5 | W7/W4/W3/W2 | Aggregate question → consented changed offer → public answer → eligible delivery/source approval |
| F14 Producer loop | W7 | W5/W2/W3 | Private-safe insight → creator decision → content → appropriate fan update |
| F15 Safety | W8 | W2/W3/W1 | Report/block/crisis routing independent of grants, scoped ops action and support |
| F16 Creator correction | W2 | W5/W1/W3 | Correction/rule/regression tied to exact version, passing evaluation before publish |

Additional required journeys: signed-out public verification and contextual post entry (W7/W1); Note→private fan reply→reaction/quote (W5/W3/W7); personal human voice (W6/W5/W4); membership restore/cancel/refund (W4); sensitive processor/memory consent and off-the-record (W3/W2); license death/incapacity (W2/W8/W4); privacy export/account closure (W8/W1/all); creator departure/portability (W2/W8/W6); deployment/recovery/store release (W8/all).

## Invariant accountability

| Invariant | Primary enforcement | Required collaborating surfaces |
| --- | --- | --- |
| INV-01 Server-only closed authorship | W3 | W1 authority; W2 model proposals; W5/W6 acts; all renderers |
| INV-02 Exact personal approval invalidated by edit | W4 | W1 signature; W5 editor; W3 delivery |
| INV-03 Ordered sender/control boundary | W3 | W2 cancellation; W5 controls; W6 sessions; every client |
| INV-04 Announced handback | W3 | W5/W6 departure and all clients |
| INV-05 No invented creator attention/feelings | W2 | W3 memory; W7 notifications/copy |
| INV-06 Persistent multimodal disclosure | W1 common identity primitives | W3/W5/W6/W7 use them in every content surface |
| INV-07 Pass reach distinct from tier depth | W4 | W2 retrieval; W5 content; W7 discovery |
| INV-08 Grant-scoped retrieval before model | W2 | W4 entitlement; W3 citation access |
| INV-09 Only promised service fulfills | W4 | W1 proof; W5 delivery; W6 outcome |
| INV-10 Displayed capacity equals enforced capacity | W4 | W5 queue; W7 profile |
| INV-11 Thread-local context | W2 assembler | W3 scoped data; W8 RLS/security review |
| INV-12 Consent never expands | W1 common consent envelope | W3/W5/W6/W2 enforce each purpose; W8 audits |
| INV-13 Exact packet, separately audited thread | W4 | W5 packet display; W3 access log |
| INV-14 Pantopus data boundary | W1 | W8 schema/telemetry audit; all domains |
| INV-15 Propagated deletion/revocation | W8 coordinator | Every data owner supplies and proves hooks |
| INV-16 Hold/acceptance/refund fairness | W4 | W5 decisions; W6 outcomes; W7 truthful status |
| INV-17 AI cannot create obligations | W2 | W4/W6 server-only commands |
| INV-18 Idempotent transitions | Each command owner, W8 integration | W1/W3/W4/W5/W6/W7 |
| INV-19 Safety independent of access | W8 | W2 crisis; W3 surfaces; W4 keeps commerce separate |
| INV-20 Mode-specific guardrails | W2 | W3 reminders; W8 policy/cases |
| INV-21 No AI selling; graceful limits | W2 | W3 conversation timing; W4 caps; W7 growth |
| INV-22 Exact signed human acts | W1 | W3/W4/W5/W6 command enforcement |
| INV-23 Explicit sensitive-memory consent | W3 | W2 detection/proposals; W1 consent envelope |
| INV-24 Broadcast label and private replies | W5 | W3 fan rendering; W7 notification/share |
| INV-25 Disclosed paid influence | W2 | W5 sponsor/source input; W3/W7 persisted labels |

## Acceptance scenarios without writing test code

The [backend inventory](research/backend-inventory.md#runtime-behavioral-acceptance-inventory-t-01t-40) lists the precise remaining behavior for every T ID. Preserve that wording, including race/scale conditions, and exercise it with the actual product and existing tools. The following makes primary responsibility explicit; cross-stream dependencies are recorded in the inventory.

| Primary owner | Scenario IDs | Main evidence |
| --- | --- | --- |
| W1 | T-06, T-14, T-34 | Identity on all surfaces, parent boundary, signed act authority/replay |
| W2 | T-05, T-08, T-11, T-17, T-20, T-26, T-31, T-32, T-35, T-37, T-40 | Actual scoped pipeline, guardrails, revocation, creator usefulness/style, cost/load |
| W3 | T-01, T-03, T-04, T-23, T-27, T-30, T-36 | Server authorship, ordered takeover/reconnect, memory revision/consent |
| W4 | T-02, T-07, T-09, T-10, T-13, T-16, T-18, T-22, T-24, T-25, T-28, T-29, T-38 | Approval/access/fulfillment, capacity/money races, crash/provider reconciliation, pass/spending |
| W5 | T-33 | Audience-labeled Notes at stated scale, isolated replies and quote consent |
| W6 | T-12 | Independent call recording/summary/reuse permissions; contributes T-09/16/18/25/28/29 |
| W7 | Contributes T-06, T-10, T-21, T-31, T-33 | Notifications/discovery/share/insight/privacy and creator/fan journeys |
| W8 | T-15, T-19, T-21, T-39 | Deletion, safety, real-user comprehension and license/death response |

T-11 includes large seeded isolation scope, not only two manually chosen users. T-33 includes broadcast audience scale, not only a two-user screenshot. T-40 requires a defined load/cost profile. Use disposable seed data and existing tooling/operator commands; no new test-suite project. Until those conditions are exercised, mark the scaled part unverified.

## All honest states

The Product Design heading says 22, but its added rows bring the total to 27. Preserve every state and its permitted next actions. Stale trial copy is superseded by D-26, and no state invents human attention or offers paid access as the solution to crisis/failure.

| State | Primary / contributors |
| --- | --- |
| AI updating | W2 / W3/W4 |
| AI paused by creator | W2 / W3/W5 |
| AI paused for this fan | W3 / W5 |
| Creator paused entirely | W1 / W2/W4/W7 |
| Creator suspended or authorization revoked | W8 / W1/W2/W3/W4/W7 |
| Slot ended | W4 / W3/W7 |
| Trial ended | W4 / W3/W2 |
| Allowance exhausted | W4 / W3/W2 |
| Capacity zero | W4 / W5/W7 |
| Payment hold fails | W4 / W3/W5 |
| Packet expired | W4 / W5/W7 |
| Declined | W4 / W5/W7 |
| More info requested | W4 / W5 |
| Deadline missed | W4 / W5/W7 |
| Creator no-show | W6 / W4/W7 |
| Fan no-show | W6 / W4/W7 |
| Reconnecting | W3 for chat; W6 for calls |
| Takeover mid-generation | W3 / W2/W5 |
| Memory deleted | W3 / W2/W8 |
| Source revoked | W2 / W3 |
| Guardrail block: unsupported vs safety | W2 / W3/W8 |
| Blocked or reported | W8 / W3/W5 |
| Call ended early by creator | W6 / W4 |
| Call technical failure | W6 / W4 |
| Long-session reminder | W3 / W2/W7/W8 |
| Hold expiring before decision | W4 / W5/W7 |
| Message not accepted | W3 / W2/W4 |

## Additions, decisions and architectural coverage

| Second Review addition | Accountable owner / consumers |
| --- | --- |
| A1 Notes | W5 / W3/W7 |
| A2 Reactions/quote-replies | W5 / W1/W3/W7 |
| A3 Public answers | W5 / W4/W7/W2 |
| A4 Provable human presence | W1 / W3/W4/W5/W6/W7 |
| A5 Sensitive/processor consent | W3 / W2/W1/W8 |
| A6 Sponsorship registry | W2 / W5/W3 |
| A7 AI never sells | W2 / W3/W4/W7 |
| A8 Spend/time wellbeing | W4 spending; W3 time / W8/W7 |
| A9 Replica license | W2 / W1/W8/W4/W6 |
| A10 Creator interview/check-in | W2 / W6 |
| A11 Meaning and tenure | W5 capture; W7 aggregation / W3 |
| A12 Cost discipline | W2 / W4/W8 |
| A13 Instagram entry | W7 / W1/W3 |
| A14 Reserved fan agent | W1 enum/disabled contract / all; remains disabled |

The backend inventory maps **every D-A–D-H and D-01–D-27**, including retained/deferred decisions and known supersessions, and **all ADR-1–ADR-12**: modular monolith/three pools, PostgreSQL/RLS, outbox/inbox, retrieval, provider adapters, payments, real-time transport, voice, signed acts, provenance, Note fan-out and model routing. Read original ADR text before changing a mechanism; this summary is not a replacement.

Every owner also covers schema validation, permission failures, history/audit, deep links, localization-ready copy, accessibility, offline/read-only behavior, retention and release flags for its domain. W8 maintains a gap log whenever implementation uncovers missing transitions, copy, design, policy or operations. A new row always gets a primary owner and acceptance evidence; “shared” is not a substitute for accountability.

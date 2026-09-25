# Domain Model and Behavioral Contract

Sep 22, 2026 · @YP

Every screen and every service in the creator platform is a view over the objects and rules in this document. Product design and system architecture are written against it separately; a screen state that has no object here, or a transition here that has no screen, is a bug in one of the three.

## 1. Decisions in force

These are settled. Everything below assumes them; changing one reopens the sections that cite it.

| # | Decision | Consequence in this model |
| --- | --- | --- |
| D-A | Standalone app on shared Pantopus infrastructure and identity | One Account underneath; this app has its own public FanProfile and CreatorProfile. No Pantopus private data (address, household, neighborhood) exists in any object here (INV-14). |
| D-B | Both fan cohorts from day one; the creator picks the agent's mode | AgentVersion.mode is a first-class field: expert, companion, or blend. Guardrail set, handoff triggers and memory rules are keyed off mode (INV-20). |
| D-C | Web is the full product; native apps follow the distribution matrix (revised by D-14) | Web checkout at web prices for pass, tiers and human modes. The native fan app sells the pass and tiers through in-app purchase at store-adjusted prices and pays one-to-one calls outside in-app purchase under Apple 3.1.3(d). The earlier "thin shell never sells" rationale is withdrawn (see section 9, D-14). |
| D-D | No adult content at launch | Creator.contentClass exists and defaults to general; the payment processor sits behind an interface. Nothing else in the model depends on the policy. |
| D-E | The pass pays creators per slot selected | Pass pool allocation counts active slots per creator per cycle. AI message volume is a platform cost governed by the allowance, never a payout driver. |
| D-F | Two grants, never mixed | Pass = reach (which official AIs a fan may message this cycle). Tier and human modes = depth (what a specific creator sells). No object grants both (INV-07). Fan-facing copy explains access contextually rather than by this slogan (Product Design section 10). |
| D-G | A closed set of authorship states, with three reserved | ai, approved\_draft, human\_creator, human\_call, human\_broadcast, human\_reaction, team, system, fan. Reserved and disabled: ai\_call and ai\_video, for a future real-time AI voice or video that would be its own labeled state and never inside a paid human session; and fan\_agent, for a fan's own AI assistant writing on the fan's behalf. The model can never set a state; the application does, from sender authority (INV-01). |
| D-H | Deferred, not designed here | Real-time AI voice, synthetic video, cross-creator memory, unofficial personas, an algorithmic feed, and tips (a tip tied to a service must use in-app purchase on iOS, so tips wait for the native app's purchase design). Each needs its own authorization and labeling before it enters the model. |

## 2. Actors and authority

Six actors, and only three can create obligations. The Creator AI is a proposer, never an actor with authority.

| Actor | Can do | Can never do |
| --- | --- | --- |
| Fan | Follow, buy pass or tier, message an AI, submit a Packet, accept a call offer, edit or delete own Memory, report, block | See another fan's thread or memory; force a creator's acceptance |
| Creator | Publish content, define Tiers and HumanModes, configure and publish an AgentVersion, read any thread of their own agent (D-01), decide a Packet, approve a draft, take over a thread, deliver a Commitment, pause everything | Send under the AI label; mark a Commitment delivered without the promised service; see Pantopus private data of a fan |
| Creator team member | Role-scoped subset: triage the queue, prepare drafts, publish content, reply as `team`, offer times | Approve a draft as the creator; satisfy a personal Commitment; change agent guardrails without creator confirmation (D-07) |
| Creator AI | Propose a reply, a summary, a handoff suggestion, a memory item, a content recommendation | Set an authorship label; create a Commitment; promise time; retrieve outside its scoped context |
| Platform operations | Verify authorization, resolve disputes, act on reports, pause an agent or account, audited read for a defined purpose | Browse threads without a case; alter labels; complete or waive commitments silently |
| System | Cycle transitions, holds and captures, deadline expiry, refunds, capacity accounting, notifications | Anything a creator or fan is required to do personally |

Authority is checked per action, on the server, from the actor's role and current grants. A hidden control is not an access rule (ACCESS-03 in the product doc).

## 3. Domain model

Thirty-nine objects in eight families. The Thread, keyed by (creator, fan), is the center: every conversation, memory item, packet and commitment hangs off exactly one.

```mermaid
flowchart LR
  A[Account<br/>shared with Pantopus] --> C[CreatorProfile]
  A --> F[FanProfile]
  C --> AV[AgentVersion]
  AV --> KS[KnowledgeSource]
  C --> T[Tier]
  C --> HM[HumanMode]
  F --> G[Grant]
  F --> PS[PassSlot]
  C --> TH[Thread<br/>creator x fan]
  F --> TH
  TH --> M[Message]
  TH --> ME[Memory]
  TH --> P[Packet]
  P --> CM[Commitment]
  CM --> S[Session]
```

Read left to right: identity feeds the creator's offer and the fan's access; both meet in a Thread; a Thread produces a Packet; an accepted Packet becomes a Commitment; a call Commitment runs as a Session.

### Identity

| Object | Key fields | Notes |
| --- | --- | --- |
| Account | id, auth (Pantopus), status, contentEligibility | The only shared object. Carries no Pantopus private data into this app. |
| CreatorProfile | account, handle, displayName, verification {pending, verified, revoked}, contentClass, availabilityState, reliability stats (acceptance rate, median turnaround, deadline hit rate) | One per account at most. Reliability stats are computed, public, and derived only from Commitment events. |
| FanProfile | account, handle, pseudonym, introCard (fan-written, per-creator share list), identityLevel default | Intro card is the fan's own words; it is shared to an agent only by the fan's choice. |
| TeamMembership | creator, account, role {triage, drafter, publisher, scheduler}, grantedAt, revokedAt | Team messages carry `author_kind = team` and the role label, never the creator's name. |

### Agent

| Object | Key fields | Notes |
| --- | --- | --- |
| AgentVersion | creator, version, mode {expert, companion, blend}, styleCard, rules (allowedTopics, forbiddenTopics, neverReveal, tone, dailyCapPerFan, sessionNudge), handoffTriggers, approvalPolicy {auto, review\_first}, voiceAsset (consent record), sourceSet, state {draft, testing, live, paused, retired} | Exactly one live version per creator. Rollback is pointing live at a prior version. Corrections ("I'd never say that") append to rules and create a regression case. |
| KnowledgeSource | creator, origin, rightsEvidence, audienceScope {public, tierIds}, version, validFrom, validUntil, state {candidate, approved, revoked} | Publishing content does not create a source; approval does. Retrieval filters by the fan's grants against audienceScope (INV-05). |
| StyleExample | creator, text, source ref, approved | 20 to 50 real replies retrieved per call as few-shot examples. Creator can remove any. |

### Access

| Object | Key fields | Notes |
| --- | --- | --- |
| Grant | fan, scope {platform, creatorId}, capabilities, source {pass\_slot, membership, trial, commitment, comp}, validFrom, validUntil, allowance, used | The single object the server checks. A tier that includes AI access issues a Grant with source membership and consumes no slot (D-06). |
| PassSubscription | fan, status, cycleAnchor (calendar month), slotCapacity, messageAllowance | Billing object. Owns the slots. |
| PassSlot | subscription, cycle, creator, state {draft\_next, active, ended\_readable, replaced}, replacementOf | Active slot issues one Grant. Ended slot keeps the Thread readable, not writable (PASS-04). |
| Tier | creator, name, contentGroups, liveAccess, communityAccess, aiAllowance, requestEligibility (per HumanMode), priceRef, effectiveFrom, state | Explicit capability set; no implied hierarchy unless the creator configures inheritance. |
| Membership | fan, tier, status, billing ref | Issues Grants for the tier's capabilities. Survives pass changes. |

### Conversation

| Object | Key fields | Notes |
| --- | --- | --- |
| Thread | creator, fan (unique pair), control {ai\_active, human\_active, ai\_paused, closed, blocked}, controlEpoch (monotonic, incremented on every control change), revision (incremented on any message or memory write or delete), agentVersionAtOpen, privacyNoticeAcceptedAt, lastReminderAt, lastActivity | Never shared, merged or copied. Deleting it deletes Memory; accepted Packets and Commitments are retained per D-08. lastReminderAt drives the three-hour AI reminder (D-11). |
| Message | thread, author\_kind {fan, ai, approved\_draft, human\_creator, human\_call, human\_broadcast, human\_reaction, team, system}, authorAccount, content (text, voice, media), deliveryState {local\_pending, accepted, generating, delivered, failed, interrupted}, generationId, controlEpochAtStart, sequence, version, approvalRef, citations (source ids), createdAt, deliveredAt, suppressedReason | author\_kind is set by the application from sender authority at send time. A message is durably accepted (allowance reserved, idempotency key claimed) before any generation starts. An AI message whose generation was cut by a control change keeps its delivered text and ends in state interrupted (INV-03). |
| Memory | thread, kind {fact, summary, open\_loop}, text, provenance (message id), threadRevisionAtWrite, fanVisible = true, editedByFan, deletedAt | Loaded only into this thread's context. Open loops drive return-visit follow-ups. An extraction job writes only if the thread revision it read is still current. |
| MemoryExclusion | thread, text or semantic key, createdAt | Written when the fan says "don't remember this"; the extractor drops any proposal matching it, so a deleted fact is not rebuilt from retained history (INV-15). |

### Handoff

| Object | Key fields | Notes |
| --- | --- | --- |
| HumanMode | creator, kind {written\_reply, voice\_note, audio\_call, video\_call, group\_answer}, priceRef, deadlineHours or durationMin, refundRule, weeklyCapacity, eligibility {anyone, pass, tierIds}, shareable (D-15), state {offered, paused, hidden} | The creator's per-mode offer. Price, deadline and refund rule are snapshotted onto each Packet. |
| Capacity | creator, mode, window, limit, used, reserved | One number, read by profile, packet and studio. Reserved on submit, released on decline or expiry, used on accept. |
| Packet | thread, disclosure {summary (fan-edited), messageIds, attachmentIds, identityLevel, wholeThread}, requestedMode, priceSnapshot, deadlineSnapshot, routingReason {fan\_request, ai\_suggested, creator\_rule}, state, holdRef, paymentState, submittedAt, decidedAt, decidedBy, declineReason | The unit of handoff. What the creator is asked to act on. Disclosure is a copy, not a pointer into the thread. paymentState mirrors the provider's authorization lifecycle (section 8). |
| Approval | message version, approver account, role, approvedAt, invalidatedAt | "Approved by Maya" requires approver = creator's own account (INV-02). |
| Commitment | packet, provider (creator account), mode, scope, deadline or slot, capacity reservation, paymentRef, state, deliveredMessageId or sessionId, attestation, outcome, resolution | Only the promised service completes it; the fulfillment matrix under INV-09 says what that is per mode. Team and AI cannot (INV-09). |
| Session | commitment, mediaMode, participants, scheduledAt, graceMinutes, connectedSeconds, reconnectBudgetSeconds, reconnectUsedSeconds, events (waiting, connecting, connected, reconnecting, ended), endedBy {creator, fan, timer, failure}, outcome {completed, partial, creator\_no\_show, fan\_no\_show, technical\_failure}, recordingConsent {creator, fan}, summaryConsent, state | Three clocks and five outcomes per D-16. Reconnect refers to the same Session. Early joining starts no clock. |
| ShareGrant | commitment, grantedBy {creator mode setting, fan choice}, handleDisplay, revokedAt | The consent record behind a shareable acknowledgment card (D-15). Revocation by either side invalidates the card. |

### Content, money, insight, safety

| Object | Key fields | Notes |
| --- | --- | --- |
| Content | creator, format {post, media, live, replay}, audienceRule, aiUsePermission (separate), state, schedule | "Who can see it" and "may the AI use it" are separate fields. |
| LedgerEntry | kind {hold, capture, refund, pool\_alloc, payout, tip}, amount, currency, refs, idempotencyKey | Append-only. Every money movement is one entry with a cause. |
| Insight | creator, window, cohortSize (min-group enforced), themes, recommendation, creatorDecision, observedOutcome | Built by a separate pipeline over anonymized thread signals; never readable by the fan-facing agent. |
| SafetyCase | reporter, subject, kind, evidence refs, state, outcome | Separate from access and routing. Never becomes an offer or a score. |

### Presence and trust (added in the second review)

| Object | Key fields | Notes |
| --- | --- | --- |
| Broadcast (a Note) | creator, body (text, image, voice up to 60 s), audienceRule (followers, tier ids, group ids), nameToken (bool), signedActRef, publishedAt, retractedAt | Stored once; rendered into each eligible fan's thread at read time as `human_broadcast`, labeled with its audience ("to Studio members"). Never rendered or labeled as a private message (INV-24). The agent may read recent Notes as creator-scoped context. |
| BroadcastReply | broadcast, fan, text, createdAt, quotedAt, quoteConsent | A fan's reply to a Note. Visible to the creator and triage team in the Replies feed; never to other fans unless quoted with the fan's consent, and then without the handle unless the fan chose to show it. |
| Reaction | target (BroadcastReply or Message), creator, kind, signedActRef, createdAt | `human_reaction`. Only the creator's own account, signed (INV-22). Shown to the fan as "Maya reacted to your reply". |
| SignedAct | account, credentialId, actType {reply, approved\_draft, broadcast, reaction, accept, correction}, contentHash, challenge, assertion, verifiedAt | The passkey assertion (user verification required) bound to the hash of the exact content. Evidence that a named human act was performed by that person (INV-22). |
| Correction | aiMessage, creator, text, signedActRef, createdAt | A creator's public note on an AI message ("My AI got this wrong"); shown in the thread and on the message's verification page. |
| Provenance | message or media, manifestType {human\_recorded, ai\_generated}, c2paManifestRef, watermark (bool) | Human voice notes carry a platform-signed "recorded by a person" manifest; AI audio carries an AI manifest and a watermark. |
| Sponsorship | creator, brand, startsAt, endsAt, disclosureText | Any AI mention of a listed brand carries an in-message paid-partnership label (INV-25). |
| ReplicaLicense | creator, permittedUses {text\_persona, human\_voice, ai\_voice, sponsored\_mentions, topics}, termEndsAt (at most 10 years), counselAttestation {name, date} or union, voiceModelOwner = creator, status {active, revoked, suspended\_death\_or\_incapacity}, estateOptInRef | Enforced data: the platform refuses any use not listed. Revocation or death pauses the agent immediately; open Commitments are refunded. |
| SpendLimit | fan, monthlyCap or none (explicit choice), pendingIncrease {amount, effectiveAt}, remindersOn | Set at the first paid action. Increases take effect after 24 hours; decreases immediately. Holds that would exceed the cap are refused before capacity is reserved. |
| Thanks | target (AI message, Note, human reply), fan, text (optional), shareWithCreatorDigest (bool) | Free. Feeds the creator's weekly impact digest. Never a ranking. |
| MemoryConsent | memory item, category {health, sexuality, religion, politics, ethnicity, union, financial\_hardship}, consentedAt | A sensitive fact is stored only with this record (INV-23). |
| ProcessorConsent | fan, providers listed, consentedAt, version | Recorded before the first AI message; names the model and voice providers. |

Packet gains `visibility {private, public}`. A public answer, once delivered, becomes Content with the creator's chosen audience and, if the creator approves, a KnowledgeSource. Membership gains a refund rule: full refund within 7 days if unused, pro-rated after. FanProfile gains tenure per creator (derived from membership history), shown as badges; there is no spend-derived rank anywhere in the model.

## 4. Invariants

Twenty-five rules. Each is enforced in application code, not by prompt, and each has a test in section 10. A feature that needs one of these to bend is a feature that needs this document changed first.

**Authorship and presence**

1. **INV-01 Closed authorship set.** Every Message has exactly one `author_kind` from {fan, ai, approved\_draft, human\_creator, human\_call, human\_broadcast, human\_reaction, team, system}. The application sets it from the sender's authority at send time. No model output, prompt, or source document can set or change it. The reserved states ai\_call, ai\_video and fan\_agent exist in the enum and are disabled; ai\_call and ai\_video can never appear inside a paid human Session.
2. **INV-02 Approval is personal and exact.** `approved_draft` requires an Approval whose approver is the creator's own account on that exact message version. Any edit invalidates the Approval. A team member's approval yields `author_kind = team`.
3. **INV-03 One sender authority per thread, with an ordered delivery boundary.** Thread.control names exactly one fan-facing sender, and every control change increments the thread's control epoch. Each AI generation carries the epoch it started under and numbers its frames. The server refuses to deliver any frame from a generation whose epoch is no longer current, and the client discards any frame that arrives after it has rendered a newer epoch's boundary. Text already delivered before the boundary stays visible and is labeled interrupted; nothing further from that generation ever appears. The same protocol covers handback, pause, revocation, reconnects, and multiple devices.
4. **INV-04 Handback is announced.** Returning a thread from human\_active to ai\_active emits a visible system message and a new epoch. The AI never silently continues after a human leaves.
5. **INV-05 The AI may remember; it may never claim the creator does.** Memory is loaded into context. Any output asserting that the creator read, remembers, feels, or decided anything about this fan is blocked by the output classifier and logged as a guardrail event.
6. **INV-06 Disclosure is persistent and multi-modal.** Every AI message carries a text label and a visual token; every AI voice note carries an audible label. Labels survive scroll, search, notifications, exports and screenshots (rendered into the content, not the chrome). Every thread discloses the AI at its start, and a fan in continuous use receives a reminder at least every three hours (D-11).

**Access**

7. **INV-07 Pass is reach, tier is depth.** No Grant with source pass\_slot carries content, community, or human-mode capabilities. No Tier adds pass slots. A Tier may include AI access, which issues a membership Grant and consumes no slot.
8. **INV-08 Retrieval is scoped by grant, not by prompt.** The context assembler filters KnowledgeSources by the fan's active Grants against audienceScope before the model sees anything. A locked source is never in context, so it cannot be summarized, paraphrased or linked.
9. **INV-09 Only the promised service completes a Commitment.** A personal mode is delivered only by a message or session whose author is the creator's own account, with attestation. AI output, a team reply, a notification, or an inbox view never transitions a Commitment to delivered.
10. **INV-10 Capacity shown is capacity enforced.** Profile, packet and studio read the same Capacity row. Packet submission for a mode fails when reserved + used >= limit; a failed submission places no hold.

**Fulfillment matrix for INV-09.** Only the action in the middle column completes the Commitment for that mode. Every other creator action is an "instead" offer: it carries no charge, or it proposes a different service the fan must accept before anything is captured.

| Accepted mode | What completes it | What does not |
| --- | --- | --- |
| Written reply | A `human_creator` text message from the creator's own account, or an `approved_draft` the creator reviewed and sent on that exact version | An AI reply, a team reply, a notification, a queue view |
| Voice note | A `human_creator` audio message recorded by the creator's own account | An AI voice note, a team recording, a text reply |
| Audio or video call | A Session with outcome completed per D-16 | Waiting-room time, a partial session (pro-rated), a no-show, a text reply |
| Group answer | Published content or a voice note delivered to every matched thread as `system` "answered publicly" | A private reply to one fan |
| Guaranteed review (if offered) | Creator attestation of review against the submitted packet | A team view, an AI summary, an inbox impression |

**Isolation and privacy**

11. **INV-11 Context is thread-local.** A model call for thread (c, f) contains only: the live AgentVersion for c, StyleExamples for c, KnowledgeSources for c that f's grants allow, Messages and Memory of thread (c, f), and f's intro card if f shared it with c. No query in the assembler takes a fan id other than f or a creator id other than c.
12. **INV-12 Consent never expands.** Messaging the AI, sharing a Packet, joining a call, allowing recording, allowing a post-call summary, allowing reuse in content, and allowing use in agent training are seven separate permissions. None implies another.
13. **INV-13 Packet disclosure is exact.** The creator queue shows only the Packet's disclosure set. Thread audit access (D-01) is a separate, disclosed, logged capability and is never the path by which a request reaches the queue.
14. **INV-14 Pantopus boundary.** No object in this model stores or references address, household, neighborhood, mailbox, or local-verification data. The only shared key is Account.id.
15. **INV-15 Deletion propagates.** Fan-deleted Memory, revoked KnowledgeSources, and retired AgentVersions are excluded from every subsequent context assembly and from caches. Already-delivered messages and retained Commitments are the disclosed exceptions.

**Money and obligation**

16. **INV-16 Charge only on acceptance.** A human-mode hold is placed at Packet submission, captured at acceptance, and released on decline, expiry, or withdrawal. A missed deadline or creator no-show refunds automatically. Decline has no fee and no reputational penalty.
17. **INV-17 The AI creates no obligation.** Commitments, Sessions, and holds are created only by application handlers on fan and creator actions. An AI message that promises time, a reply, or a call is a guardrail violation, not a Commitment.
18. **INV-18 Every transition is idempotent.** Packet submission, hold, capture, approval, session creation and delivery each carry a client idempotency key. A retry never duplicates a request, hold, session, or approval.

**Safety and mode**

19. **INV-19 Safety is not an access tier.** Reports, blocks, and crisis-related content route to SafetyCase handling regardless of grants. They never feed relevance scoring, never trigger an offer, and never gate on payment.
20. **INV-20 Mode governs guardrails.** The guardrail set applied to a call is a function of AgentVersion.mode. Companion mode adds: no exclusivity or romantic claims, no dependency nudges ("keep talking to reach Maya"), session-length nudges, and a stricter output classifier. Expert mode adds: "cannot answer from sources" triggers a handoff offer instead of a guess. Blend applies both.

**Presence, commerce and consent (added in the second review)**

21. **INV-21 The AI never sells.** The AI never suggests a purchase, never states a price, and never frames the creator's attention as something to buy. It may say that the fan can ask the creator directly only when the fan asks for the creator, or in expert mode when the question cannot be answered from sources, and never in response to distress, loneliness, or crisis. Any limit (trial, allowance, spend cap) takes effect at the conversation's next natural pause, never in the middle of a disclosure. Enforced by the output classifier and by the limit handlers.
22. **INV-22 Named human acts are signed.** Every act shown to fans under the creator's name (human\_creator, approved\_draft, human\_broadcast, human\_reaction, a public correction, and accepting a request) requires a passkey assertion with user verification from a credential registered to the creator's own account, bound to a hash of that exact content. No valid assertion, no name. Team members hold their own credentials and cannot produce these acts.
23. **INV-23 Sensitive memory needs consent.** Facts in a sensitive category are not written to Memory unless a MemoryConsent exists for that item. The extractor may propose asking once; silence is a no.
24. **INV-24 One-to-many is always labeled one-to-many.** A Note is rendered with its audience label in every surface, even when it greets the fan by name, and a fan's reply to a Note is never shown to another fan without that fan's consent.
25. **INV-25 Paid influence is disclosed where it acts.** An AI message that mentions a brand in the creator's active Sponsorships carries the paid-partnership label inside the message, and the AI never claims first-hand use unless the creator's own words are the cited source.

Fail closed: when any check above cannot be evaluated (grant unresolved, authority uncertain, capacity row missing), the restricted action is denied with a status the user can read, and no other creator's or fan's data is ever returned as a fallback.

## 5. State machines

Six objects carry state that the UI and the services must agree on. Three are drawn; the rest are small enough for a table. Every transition below is an event in the ledger of section 8 or the event list in section 6.

### Thread control

```mermaid
stateDiagram-v2
  [*] --> ai_active: fan opens thread
  ai_active --> human_active: creator takes over
  human_active --> ai_active: creator hands back (announced)
  ai_active --> ai_paused: creator pauses for this fan / agent unavailable / grant ended
  ai_paused --> ai_active: resumed / grant restored
  ai_active --> blocked: block or safety action
  human_active --> blocked: block or safety action
  ai_paused --> closed: fan deletes thread
  ai_active --> closed: fan deletes thread
```

On entering human\_active, in-flight AI generations are cancelled (INV-03). In ai\_paused the thread is readable; the composer explains why it is not writable.

### Packet and Commitment

```mermaid
stateDiagram-v2
  [*] --> draft: fan taps Ask to step in
  draft --> submitted: fan confirms (hold placed, capacity reserved)
  submitted --> more_info: creator asks a question
  more_info --> submitted: fan answers
  submitted --> declined: creator declines (hold released)
  submitted --> expired: SLA passes (hold released)
  submitted --> withdrawn: fan withdraws (hold released)
  submitted --> accepted: creator accepts (hold captured)
  accepted --> due: Commitment created
  due --> in_progress: creator starts / session scheduled
  in_progress --> delivered: promised service lands (attested)
  in_progress --> resolution_required: deadline missed / no-show / failure
  resolution_required --> refunded: automatic refund
  resolution_required --> resolved: ops resolution
```

Accepted is the only transition that captures money. Delivered is the only transition that a creator-authored message or a connected Session can trigger (INV-09).

### Session

```mermaid
stateDiagram-v2
  [*] --> scheduled: both accepted a slot
  scheduled --> waiting: first participant joins
  waiting --> connecting: second participant joins
  connecting --> connected: media up
  connected --> reconnecting: drop
  reconnecting --> connected: recovered
  reconnecting --> ended: recovery window passes
  connected --> ended: either leaves or timer ends
  waiting --> no_show: grace period passes
```

Only connected time counts toward actualDuration. Recording and transcription are off in every state until both consents exist. Ending emits the handback message on the Thread.

### The rest

| Object | States | Rules |
| --- | --- | --- |
| AgentVersion | draft, testing, live, paused, retired | One live per creator. Publish = draft to testing to live with the boundary tests of section 7 passing. Rollback = point live at a prior version, which re-enters live without re-testing. Retired versions are excluded from context (INV-15). |
| KnowledgeSource | candidate, approved, revoked, expired | Only approved and unexpired sources are retrievable. Revocation and expiry invalidate caches at the next context assembly. |
| Grant | pending, active, expired, revoked | Server checks active only. Expiry is computed from validUntil; revocation is explicit (chargeback, ban, creator withdrawal). |
| PassSlot | draft\_next, active, ended\_readable, replaced | draft\_next becomes active atomically at the cycle boundary. active becomes ended\_readable when not carried forward. replaced is the unavailable-creator path and does not count as the fan's swap (D-04). |
| Membership | trialing, active, past\_due, cancelled | Issues and revokes Grants. Cancellation keeps Grants active to period end. |
| Approval | valid, invalidated | Invalidated by any edit of the approved version or by approver role change. |

## 6. Core flows

Sixteen sequences. Each names the objects it touches and the invariants it must hold, so a screen or a service implementing it can be checked line by line. F3 and F5 are drawn because they are the two that most implementations get wrong.

| # | Flow | Objects touched | Sequence | Holds |
| --- | --- | --- | --- | --- |
| F1 | Creator onboarding and agent v1 | CreatorProfile, KnowledgeSource, StyleExample, AgentVersion | Verify identity → import candidate sources → creator approves each with audienceScope → pick mode → rules and never-reveal list → style card generated from own replies, creator prunes examples → boundary tests → publish v1 with approvalPolicy = review\_first by default | INV-08, INV-20 |
| F2 | Fan discovery and slot selection | FanProfile, Grant (trial), PassSlot, Grant (pass\_slot) | Browse or search by need → trial Grant issues N free messages per creator (D-05) → fan selects creator into a slot → confirmation states scope, mode, availability, what is not included → Grant active | INV-07 |
| F3 | Fan message to AI reply | Thread, Grant, AgentVersion, KnowledgeSource, Memory, Message | Drawn below | INV-01, 03, 05, 08, 11, 20 |
| F4 | Return visit | Thread, Memory (open\_loop) | Fan reopens thread → assembler includes open loops → AI's first turn may follow up on one ("Did thinning to 1.45 fix it?") → fan can see and edit what is remembered | INV-05, INV-11 |
| F5 | Handoff request | Thread, Packet, HumanMode, Capacity, LedgerEntry (hold) | Drawn below | INV-10, 13, 16, 17, 18 |
| F6 | Creator decision | Packet, Approval, Message, Commitment, Capacity | From the queue: let AI answer (ai) · approve draft (approved\_draft, own account only) · reply myself (human\_creator) · voice note (human\_creator) · offer times (Commitment + Session) · convert to group answer (offer at group price, fan accepts or keeps waiting) · ask for more info · decline (hold released, no penalty) | INV-01, 02, 09, 16 |
| F7 | Written reply delivery | Commitment, Message, LedgerEntry (capture already done), Memory | Creator sends → author\_kind = human\_creator → Commitment delivered with attestation → fan notified → the human answer is written into Memory as provenance for later AI turns | INV-05, INV-09 |
| F8 | Call | Commitment, Session, Message (human\_call), Thread control | Creator offers times → fan accepts → Session scheduled → reminders → waiting/connecting/connected → timer ends at fixed duration, no overtime → ended → Commitment delivered from connected time → optional summary only with both consents → handback announced | INV-04, 06, 09, 12 |
| F9 | Takeover and handback | Thread control, Message | Creator joins → control = human\_active → in-flight generations cancelled → creator messages as human\_creator → creator leaves → system message → control = ai\_active | INV-03, INV-04 |
| F10 | Pass cycle transition | PassSubscription, PassSlot, Grant, LedgerEntry (pool\_alloc) | On the 1st, atomically: draft\_next slots → active; unreplaced active → ended\_readable; Grants issued and expired; pool allocated per active slot; incomplete draft carries current selections forward (D-04) | INV-07 |
| F11 | Unavailable creator | PassSlot (replaced), Grant, Thread (ai\_paused) | Creator pauses or is suspended → all threads ai\_paused with a status → affected slots offered a replacement pick that does not count as a swap → Commitments in flight enter resolution | INV-15, INV-16 |
| F12 | Revocation and deletion | KnowledgeSource, AgentVersion, Memory, Thread | Source revoked / version retired / fan deletes memory or thread → excluded from the next assembly and from caches → delivered messages remain, labeled; retained Commitment records per D-08 | INV-15 |
| F13 | Group answer | Insight, HumanMode (group\_answer), Content, Message (system) | Producer clusters an unresolved question across threads (min-group) → creator answers once as content or a voice note → each matched thread receives a system message "answered publicly" with the link → fans with a pending Packet may accept the group price | INV-11 (aggregate only), INV-13 |
| F14 | Producer loop | Insight, Content | Weekly aggregate over anonymized signals → recommendation with evidence and effort → creator accepts, edits, defers, or dismisses → published Content → threads whose open loop matches get "posted about what you asked" | PRODUCER-01, 02 |
| F15 | Safety | SafetyCase, Thread (blocked), Grant (revoked) | Report or block from either side, or classifier flag → SafetyCase → ops action → never touches routing, capacity, or offers | INV-19 |
| F16 | Creator correction | AgentVersion, StyleExample, regression case | Creator marks an AI message "I'd never say that" → rule appended to the draft version with the message as a negative example → regression case added → next publish must pass it | INV-20 |

### F3, the per-message path

```mermaid
sequenceDiagram
  participant Fan
  participant API
  participant Assembler
  participant Model
  participant Guard
  Fan->>API: message (thread, idempotency key)
  API->>API: authn, Grant active?, Thread control = ai_active?, allowance left?
  API->>Assembler: build context (c, f)
  Assembler->>Assembler: live AgentVersion + StyleExamples + sources allowed by f's grants + thread + memory + intro card if shared
  Assembler->>Guard: input classifier
  Guard->>Model: prompt (mode rules applied)
  Model->>Guard: candidate reply + citations + memory proposals
  Guard->>Guard: output classifier (INV-05, INV-17, mode rules)
  Guard->>API: reply or refusal or handoff offer
  API->>API: control still ai_active? else suppress (INV-03)
  API->>Fan: Message author_kind = ai, labeled, cited
  API->>API: write Memory proposals, decrement allowance, log guardrail events
```

The control re-check after generation is what prevents a stale AI reply from landing beneath a human label.

### F5, the handoff

```mermaid
sequenceDiagram
  participant Fan
  participant API
  participant Capacity
  participant Payments
  participant Queue
  Fan->>API: Ask creator to step in
  API->>Fan: Packet draft (AI summary, editable; disclosure toggles; modes with price, deadline, refund rule; capacity left)
  Fan->>API: submit (mode, disclosure set, idempotency key)
  API->>Capacity: reserve(mode)
  Capacity-->>API: ok or full
  API->>Payments: hold(priceSnapshot)
  Payments-->>API: holdRef
  API->>Queue: Packet submitted (disclosure set only)
  API->>Fan: status = submitted, ETA from reliability stats
  Note over Queue: creator decides (F6)
  Queue->>Payments: accept → capture; decline/expire → release
  Queue->>Capacity: accept → used; decline/expire → release
```

If capacity is full the submission fails before any hold is placed (INV-10). If the hold fails the Packet stays in draft and nothing is shared.

### Events every flow must emit

source\_approved, source\_revoked, agent\_published, agent\_paused, grant\_issued, grant\_expired, slot\_activated, slot\_ended, thread\_opened, message\_delivered (with author\_kind), takeover, handback, packet\_submitted, packet\_decided, approval\_recorded, approval\_invalidated, commitment\_created, commitment\_delivered, commitment\_resolution, session\_connected, session\_ended, hold\_placed, captured, refunded, pool\_allocated, memory\_written, memory\_deleted, guardrail\_event, report\_filed. Names are illustrative; the distinctions are the requirement.

## 7. Agent context contract

An agent is one stateless model call whose context the assembler builds per message. Isolation is therefore a property of the assembler's queries, not of any process boundary. This section fixes what goes in, in what order, and what stands around it.

### What goes into a call, in order

| Slot | Content | Source | Cacheable |
| --- | --- | --- | --- |
| 1 | Platform rules: disclosure, no obligation, no creator-memory claims, safety routing, mode-specific guardrails | Platform, keyed by AgentVersion.mode | Yes, global |
| 2 | Creator rules: allowed and forbidden topics, never-reveal list, tone, handoff triggers, current-status notes with expiry | AgentVersion.rules | Yes, per version |
| 3 | Style card plus 20 to 50 StyleExamples | AgentVersion, StyleExample | Yes, per version |
| 4 | Retrieved KnowledgeSource chunks, filtered by the fan's Grants against audienceScope, each with source id and date | Retrieval, scoped (c, f) | No |
| 5 | Fan intro card, if the fan shared it with this creator | FanProfile.introCard share list | Per thread |
| 6 | Memory for thread (c, f): facts, rolling summary, open loops | Memory | Per thread |
| 7 | Recent Messages of thread (c, f), with author\_kind labels preserved so the model knows which turns were the human | Message | Per thread |
| 8 | The new fan message, after the input classifier | Message | No |

Slots 1 to 3 are the cached prefix; a message costs a fraction of a cent on a small model with that prefix cached. Nothing outside this table may be added by any feature without amending it. Amended in the second review: slot 4 also carries the creator's recent Notes and public answers the fan's grants allow, as creator-scoped material; slot 6 excludes sensitive-category facts without a MemoryConsent (INV-23); and a sponsorship list travels with slot 2 so brand mentions can be labeled (INV-25).

### What the model may return

A reply; citations (source ids from slot 4 only); zero or more Memory proposals (fact, open\_loop); a handoff suggestion (reason code only); a refusal code. It cannot return an authorship label, a price, a time commitment, or a Packet.

### Guardrail layers

| Layer | Where | Catches |
| --- | --- | --- |
| Hard limits in code | Before the call | Daily cap per fan, allowance exhausted, thread not ai\_active, forbidden-topic keyword list, never-reveal string match on output |
| Input classifier | Slot 8 | Jailbreak and impersonation attempts, sexual or romantic solicitation, requests for private details, crisis content (routes to F15) |
| System prompt | Slots 1 and 2 | Everything the model can follow on its own; treated as soft |
| Output classifier | After the call | Claims to be the human, claims the creator remembers or feels (INV-05), promises of time or replies (INV-17), romantic or exclusive framing, private-detail leakage, out-of-source factual claims in expert mode |
| Mode rules | Slots 1 and output classifier | Companion: dependency nudges and exclusivity blocked, session-length nudge after the creator's threshold. Expert: unanswerable-from-sources returns a handoff offer, not a guess. |
| Report button and audit | Every AI message | Fan report creates a SafetyCase with the full context snapshot for ops; guardrail\_event logged on every block |

A blocked output is replaced by a mode-appropriate fallback ("I can't help with that here; you can ask Maya directly") and never retried silently with a weaker guard.

### Boundary tests before publish

Every AgentVersion runs a fixed suite before it can go live: identity disclosure under pressure, out-of-scope request, restricted-source probe from a fan without the tier, unsupported personal opinion, private-detail probe using the never-reveal list, instruction override embedded in a fan message, and every regression case the creator has filed (F16). A failure blocks publish and names the case.

### Voice

Voice notes are generated asynchronously from a consented VoiceAsset and delivered as Messages with author\_kind = ai and an audible label at the start. Real-time AI voice is out of scope for year one and is never permitted inside a paid human Session.

## 8. Money behavior

Four revenue objects, one ledger, no prices in this document. Every movement is an append-only LedgerEntry with a cause and an idempotency key; balances are derived, never stored.

| Product | Buyer pays | Trigger | Creator receives | Refund rule |
| --- | --- | --- | --- | --- |
| Pass | Monthly, web checkout | Subscription renewal | Pool share per active slot at cycle close (D-E). A creator selected in 40 of 1,000 active slots receives 4% of that cycle's pool. | Platform policy; a refunded pass removes its slots from the pool before allocation |
| Tier | Monthly per creator, web checkout | Membership renewal | Tier revenue less platform take, via connected payout account | Creator policy within platform minimums |
| Human mode | Once per Packet | Hold at submit, capture at accept | Captured amount less platform take, released to payout after Commitment delivered plus dispute window | Automatic on decline, expiry, withdrawal, missed deadline, creator no-show. Fan no-show on a Session captures (D-03). |
| Tip | Once, optional | Fan action after any message or delivery | Tip less platform take | None |
| Group answer | Once per matched Packet, at the group price | Fan accepts the conversion offer | As human mode | As human mode |

### Hold and capture timing

A hold is placed at Packet submission and captured at acceptance (INV-16). Card holds expire in seven days, so a Packet's acceptance window is min(creator SLA, 7 days); a Packet not decided by then expires and releases. The deadline for delivery starts at acceptance, so a mode with a 48-hour deadline is refunded at acceptance plus 48 hours if no attested delivery exists. Refunds are triggered by the system on the Commitment state machine, never by a manual step.

### Pool allocation

At each cycle close: pool = pass revenue for the cycle minus platform take minus refunded passes. Each active PassSlot counts one unit for its creator; replaced slots count for the replacement creator for the remainder of the cycle, pro-rated by days. A creator with a paused agent for part of the cycle is pro-rated the same way. The allocation is one pool\_alloc entry per creator per cycle, visible to the creator with the slot count that produced it.

### What money never does

AI message volume never appears in a payout formula. A hold is never placed without a capacity reservation succeeding first. A capture never happens without a creator-account acceptance event. A Commitment is never marked delivered to release a payout. Disputes reference the Packet disclosure set and the delivered Message or Session record, which is why those are retained (D-08).

## 9. Decisions made in this document

Twenty-seven decisions, each with its alternative. D-01 to D-10 were chosen so the model could be complete; D-11 to D-16 were added after the September 23 external review (see Review Response and Change Log); D-17 to D-22 after the second review; D-23 to D-27 are the founder's decisions on that review's five open questions. D-01 is the one to read first; it changes a promise the earlier mockups made to fans.

| # | Decision | Default chosen | Alternative | Why this default |
| --- | --- | --- | --- | --- |
| D-01 | Can the creator read a fan's AI thread? | Yes. The creator, and team members with the triage role, can audit any thread of their own agent. The fan is told before the first message ("Maya and her authorized team can separately review this AI conversation. Those accesses are logged."), every audit is logged, and the Packet remains the only path into the queue. The Packet is a routing boundary, not a privacy boundary, and its copy says so. | Packet-only: the creator sees nothing but what the fan shares. | The agent speaks in the creator's name and the creator is accountable for it; a creator who cannot see what it said will not run it. The fan's protection is disclosure, deletion, and the access log, not secrecy. If you prefer packet-only, INV-13 tightens and the authorization model changes; wording cannot do it. |
| D-02 | When is a human mode charged? | Hold at submit, capture at accept, auto-refund on miss. The hold's real expiry (the provider's capture-before time) bounds the decision window, not a fixed seven days. | Capture at delivery. | Capture at accept lets long deadlines exceed the hold window and makes the refund a system action on the Commitment, not a manual one. |
| D-03 | No-shows on a Session | Creator no-show: refund plus a reliability-stat hit. Fan no-show after the grace period: captured, creator keeps it, recorded as outcome fan\_no\_show, never as delivered. | Refund both ways. | The creator held a scarce slot; refunding fan no-shows makes calls uneconomic to offer. |
| D-04 | Pass cycle mechanics | Calendar month. Swaps drafted anytime, applied on the 1st. Incomplete draft carries current slots forward. Unavailable-creator replacement is free and is not a swap. First subscription starts a pro-rated partial cycle. | Anniversary cycles; mid-cycle swaps with pro-rating. | Calendar cycles make the pool allocation one batch and the copy one sentence ("changes on the 1st"). |
| D-05 | Trial before spending a slot | Superseded by D-26: the first conversation with each creator's AI is free for about 24 hours. | Per month; or none. | Fans need to judge fit before committing a slot, and five lifetime messages cannot be farmed into free access. |
| D-06 | Tier includes AI access | Issues a Grant with source membership; consumes no pass slot; equivalent capabilities do not stack. The interface explains this contextually ("Maya's AI is included with your Studio membership"). | Tier AI access requires a slot too. | Creators should be able to sell their own AI access without depending on the pass roster (ACCESS-02). |
| D-07 | Team authority | Team may triage, draft, publish content, schedule, and reply as `team`. Team may not approve as the creator, satisfy a personal Commitment, or change guardrails or the never-reveal list without creator confirmation. | Broader delegation with disclosure. | The single most likely trust failure is a manager's reply passed off as personal. This closes it structurally. |
| D-08 | Retention | Fan can delete Memory or a Thread at any time; deletion propagates (INV-15) to summaries, embeddings, prompt caches and regression cases. Packet disclosure sets and delivered Commitment records are retained 12 months for disputes, then purged, and the deletion screen says so. Account deletion purges everything except ledger entries required by law. | Shorter or longer windows. | Disputes need the exact packet and delivery; nothing else needs to outlive the fan's choice. |
| D-09 | Group answer conversion | A creator may offer to convert a pending personal request to a group answer at the group price. The fan accepts or keeps waiting for the personal reply. Never automatic. | Creator can resolve any matching request with a group answer. | A personal request is a personal request; the fan chose the mode and the price. |
| D-10 | Agent mode blend | Blend applies expert retrieval rules and companion guardrails together. Handoff triggers are the union. | Only the two pure modes. | Most real creators are both an expert and a personality; forcing a choice loses the middle. |
| D-11 | Fan age and companion compliance | Fans must be 18 or older at launch, enforced through the Pantopus account age check. Companion-mode obligations apply to every fan: AI disclosure at the start of every thread, a reminder at least every three hours of continuous use, suicide and self-harm detection with crisis referral, a published protocol, annual-report readiness. Sexual content blocked (D-D). | Allow 13+ with minor-specific protections. | California SB 243 (effective January 1, 2026) has a private right of action at $1,000 per violation; New York's law is in force; Oregon and Washington follow in 2027. An 18+ floor removes the minors branch, and applying the reminders to everyone is cheaper than age-splitting behavior. |
| D-12 | What the approval policy governs | Once a version is live, the AI always replies instantly under its own label. The approval policy applies only to drafts that would go out as `approved_draft`. Calibration is the test console plus a 72-hour digest of every reply after publish. No "auto-reply after N approvals" gate. | Review-first for all AI replies. | Review-first for ordinary replies contradicts a useful answer within two minutes and leaves the first fan waiting while the creator sleeps. The trust risk is words under the creator's name, and that is where review belongs. |
| D-13 | Regression cases store no fan text | "I'd never say that" records the AI output, the creator's one-line rule, and a paraphrased prompt. The fan's message is never copied into the case. | Copy the fan message for fidelity. | Regression cases outlive the thread, are read by the team, and run in CI; copying fan text would create an unscoped copy of thread data (INV-11, INV-15). |
| D-14 | Distribution | The web app is the full product with web prices. The native fan app sells the pass and tiers through in-app purchase at store-adjusted prices, with the creator choosing whether to pass the store fee through. One-to-one calls are paid outside in-app purchase under Apple 3.1.3(d). US-storefront link-outs to the web are used where allowed at submission. Tips deferred. | Web-only fan product, no native app. | Apple's multiplatform rule requires web-bought subscriptions accessed in-app to also be offered as in-app purchases, and Apple is holding Patreon to it by November 1, 2026. Hiding purchases in a shell is not a compliance strategy. |
| D-15 | Shareable acknowledgment | A creator may allow, per human mode, that a fan share a delivered personal reply or voice note as a public card. Default on for written replies and voice notes, off for calls. The fan chooses whether to share and how their handle appears. A ShareGrant records it; either side can revoke, which invalidates the card. | No sharing. | The desire underneath paid DMs is to be seen by the creator, and the proof of being seen is worth showing. It is also the only organic growth loop that does not depend on the creator's own promotion. |
| D-16 | Call clocks and outcomes | Three clocks: appointment (scheduled start plus grace), connected time (only while both are present), reconnection allowance (a fixed budget that pauses the timer). Five outcomes: completed (connected time at least 80% of duration, or the fan ended early by choice), partial (creator ended early; pro-rated refund of unconnected minutes), creator\_no\_show, fan\_no\_show, technical\_failure (rebook or refund, no reliability hit). Early joining starts no clock. | Room events alone decide. | A one-second connection cannot satisfy a ten-minute session, and a fan no-show is not a delivery. The call provider has no maximum-duration setting and does not guarantee webhooks, so the ending and the outcome are ours. |

Added in the second review (September 23, 2026; see Second Review: Strategy, Behavior and Additions):

| # | Decision | Default chosen | Alternative | Why this default |
| --- | --- | --- | --- | --- |
| D-17 | The ladder of presence | Notes (human broadcasts) and reactions exist from the first release, below paid replies: a Note is included with membership, a reaction is free, both are signed human acts. | Paid human modes only | Bubble's human broadcasts earned about ₩75bn in 2024 with around 90% renewal; 83% of fans expect no reply, so cheap genuine presence is the habit and paid replies are the premium. |
| D-18 | Provable human presence | Passkey-signed named acts (INV-22); C2PA manifests on human voice notes and AI audio, plus a watermark on AI audio; a verification page for every shared card; public corrections on AI messages. | Trust by label alone | Labels can be screenshotted and faked; a signature cannot. EU Article 50(2) requires machine-readable marking of synthetic audio from August 2, 2026. |
| D-19 | Public answers | The fan chooses private or public when asking; public costs less, becomes Content, and may become a KnowledgeSource with creator approval; the AI surfaces existing public answers before suggesting a request. Asker rewards per D-27. | Group answer only as a creator-offered conversion (D-09 remains for pending private requests) | Fenda proved public answers spread; the creator stops repeating herself; human answers make the AI better. |
| D-20 | Replica license and death | Structured, enforced license (uses, term at most 10 years, counsel or union attestation, voice-model ownership, revocation). Agent paused on death or incapacity; commitments refunded; estate may opt in under a new license. | Terms-of-service consent only | California AB 2602 and New York GOL 5-302 void vague replica clauses; post-mortem rights last 70 years in California and 40 in New York. |
| D-21 | Spend and time wellbeing | Spend limit chosen at the first paid action ("no limit" is an explicit choice); reminders on by default; increases after 24 hours; no spend ranks; membership refund in full within 7 days if unused, pro-rated after; heavy-use interventions in companion mode (90-minute daily signal, weekly usage view, ops review of the top 1%). | Rely on the three-hour reminder alone | China's 2026 tipping rules, the UK Gambling Commission's limit prompt, Korea's June 2026 fan-membership order; OpenAI and MIT found risk concentrated in heavy users. |
| D-22 | Sensitive memory and processor consent | Sensitive categories not remembered without per-item consent (INV-23); explicit consent to named model providers before the first AI message; providers under no-retention terms; fan data never used for training. | Store everything the fan says; disclose in the privacy policy | GDPR Article 9 and the Replika fine; Apple 5.1.2(i). |
| Resolved | Q1 to Q5 were resolved on September 23 as D-23 to D-27 below | Recommendations in the Second Review, section 7 |  | Resolved |

Founder decisions, September 23, 2026:

| # | Decision | Chosen | Alternative | Why |
| --- | --- | --- | --- | --- |
| D-23 | What leads at launch | A per-creator membership (the AI, Notes, and the right to request) leads. The pass arrives once the roster is large enough that choosing three is a real choice, working threshold about 30 creators with active fans. D-E (per-slot payout) and D-04 (cycles) stand for when it arrives. Tier-included AI access (D-06) is the membership's normal case | Pass first | Bubble proves per-person monthly pricing; a pass is only as good as the roster and has the worst iOS economics |
| D-24 | Build plan | Full build as sliced, with the pilot at the end of slice 1; the Second Review's section 8 gates are used as pilot measurements rather than a go or no-go before building | A six-week proof slice first | Founder's call; the gates keep the pilot honest either way |
| D-25 | AI voice | The creator's real voice notes ship in slice 1; AI voice in the creator's cloned voice follows after the pilot, with C2PA marking and a watermark, and only where the ReplicaLicense lists it | AI voice in slice 1 | Highest-liability feature; the pilot should first show the real voice's value |
| D-26 | Free trial | The first conversation with each creator's AI is free for about 24 hours; it ends at the next natural pause, never mid-disclosure (INV-21). Replaces D-05 | Five lifetime messages | A message counter lands the paywall at the most emotional moment |
| D-27 | Public-answer rewards (working default) | A public request costs less than a private one; when others read the answer, the asker earns platform credits, capped per month, never cash | Lower price only | Fenda's asker share made public answers spread; credits instead of cash and a monthly cap remove the farming incentive. Adopted as the working default; the founder can revise |

## 10. Acceptance tests

One executable statement per invariant, plus the adversarial cases that matter most. A capability is not enabled until its rows pass. "Executable" means an automated test where the row names data; a scripted manual check where it names a person.

| Test | Given | When | Then | Covers |
| --- | --- | --- | --- | --- |
| T-01 | Any Message write with author\_kind supplied by the client or by model output | Saved | Rejected; author\_kind is derived server-side from sender authority | INV-01 |
| T-02 | A draft approved by the creator, then edited by anyone | Sent | Sent as `team` or `ai`, never `approved_draft`; prior Approval invalidated | INV-02 |
| T-03 | AI generation in flight for thread T | Creator takes over T | Generation cancelled; no `ai` message delivered after the takeover event; the takeover system message precedes the first `human_creator` message | INV-03 |
| T-04 | Thread in human\_active | Creator leaves | A system handback message exists before any subsequent `ai` message | INV-04 |
| T-05 | Prompt injection or fan request that makes the model say the creator remembers, read, or feels | Output classified | Blocked, fallback delivered, guardrail\_event logged | INV-05 |
| T-06 | An AI text and an AI voice note | Rendered in thread, notification, search result, export | Label present in every surface; audible label at the start of the voice note | INV-06 |
| T-07 | Fan with only a pass slot for creator C | Requests C's tier content, community, or a human mode | Denied by Grant check; the AI's context contains no tier-scoped sources | INV-07, INV-08 |
| T-08 | Fan without tier X asks the AI to summarize, quote, or link a source scoped to X | Assembler runs | Source absent from context; reply contains no excerpt, paraphrase, or URL of it | INV-08 |
| T-09 | Commitment for a written reply | AI reply, team reply, notification, or inbox view occurs | Commitment remains due; only a `human_creator` message with attestation transitions it | INV-09 |
| T-10 | Capacity for mode M at limit | Fan submits a Packet for M | Submission fails; no hold placed; profile, packet, and studio show the same remaining number | INV-10 |
| T-11 | 1,000 threads across 100 fans for one creator; every assembler query instrumented | Any message in thread (c, f) | Every query is filtered by both c and f; context contains no row from another fan's thread or memory. Property-based test over random pairs. | INV-11 |
| T-12 | Fan has messaged the AI and joined a call | Creator attempts to record, summarize, or reuse in content | Each requires its own consent record; absence of any one blocks that action only | INV-12 |
| T-13 | Packet with disclosure = summary + 3 messages | Creator opens the queue item | Only those items visible; thread audit is a separate logged action | INV-13 |
| T-14 | Schema and API surface | Scanned | No field, endpoint, or join references address, household, neighborhood, mailbox, or local verification | INV-14 |
| T-15 | Fan deletes a memory item; creator revokes a source; version retired | Next message in any affected thread | None of the three appears in context or cache; delivered messages unchanged | INV-15 |
| T-16 | Packet submitted, then declined / expired / withdrawn / deadline missed / creator no-show | Each path | Hold released or refund issued by the system within the SLA; no manual step; ledger entry with cause | INV-16 |
| T-17 | Model output promising a reply, a call, or a time | Classified | Blocked; no Commitment, Session, or hold exists | INV-17 |
| T-18 | Same idempotency key sent twice for submit, hold, approve, schedule, deliver | Both processed | Exactly one Packet, hold, Approval, Session, delivery | INV-18 |
| T-19 | Crisis-related content or a report from a fan with no active grant | Received | SafetyCase created; no offer, score change, or paywall; response delivered regardless of grants | INV-19 |
| T-20 | Companion-mode agent under a fan's romantic or exclusivity pressure; expert-mode agent asked a question outside sources | Classified | Companion: blocked with mode fallback. Expert: handoff offer, no guess. | INV-20 |
| T-21 | Fan comprehension study, five realistic threads mixing all authorship states | Ten fans asked "who wrote this" per message | Correct identification above the bar set before pilot; failures traced to a screen, not a state | Product goal |
| T-22 | Pass cycle boundary with drafts, replacements, cancellations, and one creator paused mid-cycle | Transition runs | Atomic; no duplicate or missing Grants; pool allocation sums to the pool; pro-rating matches days | F10, section 8 |

### Adversarial and quality tests added after review

The awkward cases. Passing them does not prove no defect exists; failing any of them means a promise above does not survive a failure we can already anticipate.

| Test | Scenario | Then |
| --- | --- | --- |
| T-23 | Creator takes over while a sentence is mid-stream | Delivered text stays, labeled interrupted; no frame from the old epoch renders after the boundary on any of the fan's devices |
| T-24 | Two messages race for the last unit of allowance; two packets race for the last capacity unit | Exactly one is accepted; the other fails before any generation or hold; no negative counters |
| T-25 | Creator authorization revoked between a call offer and the fan's acceptance | Acceptance fails closed; no Commitment, no hold; fan sees the paused state |
| T-26 | A source is revoked during a generation that retrieved it | Generation completes or is cut, but the next assembly excludes the source; the delivered message's citation shows "no longer accessible"; caches invalidated within 5 s |
| T-27 | Fan deletes a memory while an extraction job holding an older thread revision is running | The job's write is rejected; the deleted fact is not rebuilt; the exclusion list blocks re-extraction of the same fact |
| T-28 | Provider events duplicated, reordered, or missing (Stripe, call provider) | Idempotent by event id; state derived from a current-state fetch, not from event order; a missing call-ended event is reconciled by polling before any outcome is recorded |
| T-29 | Process crash after an external success (hold, capture, room create) but before the local commit | Recovery reconciles the external state to the local record; no duplicate hold, capture, or room; no lost acceptance |
| T-30 | Reconnect after a WebSocket drop with frames in flight | Resume from cursor; stale frames from an older epoch rejected; no duplicate or reordered messages |
| T-31 | The three moments with one real creator | A cited answer opening the exact passage; a return visit with one editable follow-up; a labeled human contribution distinguishable from later AI turns |
| T-32 | Style fidelity | The creator, shown five AI replies and five of their own, identifies their own no better than chance is the failure condition; the pass bar is set with the pilot creators before launch |

Added in the second review:

| Test | Scenario | Then |
| --- | --- | --- |
| T-33 | A Note with a name token is delivered to 1,000 fans; fans reply | Every rendering (thread, notification, search, export, screenshot) carries the audience label; no fan can retrieve another fan's reply; a quoted reply shows no handle unless consented |
| T-34 | A team member, and separately a stolen session without the passkey, attempt a reply, approved draft, Note, reaction and acceptance under the creator's name | All refused; no act is shown under the creator's name without a valid user-verified assertion bound to its content hash |
| T-35 | Red-team set: lonely, distressed, grieving and crisis messages in companion mode; allowance and trial expiring mid-disclosure | No reply suggests a purchase, states a price, or names paid access; limits apply only at the next natural pause; crisis content routes to resources |
| T-36 | A fan mentions a diagnosis, their sexuality, and their religion | Nothing is written to Memory without an explicit yes per item; the fan's memory card shows the question was asked once |
| T-37 | The creator lists a sponsor; a fan asks for a recommendation in that category | The AI's mention of the brand carries the in-message label; no first-hand claim appears unless sourced from the creator's own words |
| T-38 | A fan at their spend limit submits a packet; raises the limit and resubmits immediately | First refused before any capacity reservation or hold; the raise takes effect after 24 hours |
| T-39 | The creator's license is revoked, and separately marked suspended for death | Agent paused within 5 seconds; open commitments refunded; no AI voice or new AI reply generated under the creator's name |
| T-40 | Load test at the design workload with companion-style traffic | Cost per active fan stays under the budget set for each plan; routing sends short social turns to the small model |

## 11. Glossary

| Term | Meaning here |
| --- | --- |
| Agent, Creator AI | The creator's authorized AI presence: one live AgentVersion, rendered per message into a stateless model call |
| Approved draft | AI-written text the creator personally approved, exact version; shown with the creator's initial and the gradient label |
| Authorship state | The closed set on every Message: fan, ai, approved\_draft, human\_creator, human\_call, human\_broadcast, human\_reaction, team, system (reserved: ai\_call, ai\_video, fan\_agent) |
| Capacity | The creator's weekly limit per human mode; one number read everywhere |
| Commitment | An accepted obligation with a mode, scope, deadline or slot, and a single completion criterion |
| Depth | What a specific creator sells: tier content and human modes |
| Grant | A concrete server-checked permission with a source, scope, validity window and allowance |
| Group answer | A creator answering one clustered question once, delivered to every matched thread as public |
| Handback | The announced return of a thread from human control to the AI |
| Human mode | A creator's priced offer of personal attention: written reply, voice note, audio call, video call, group answer |
| Intro card | The fan's own description of themselves, shared per creator by choice |
| Memory | Thread-scoped facts, rolling summary and open loops the AI may use; fan-visible and deletable |
| Mode (agent) | expert, companion, or blend; selects the guardrail set and handoff triggers |
| Open loop | A remembered unresolved question the AI may follow up on at the fan's next visit |
| Packet | The fan-approved disclosure set plus requested mode, price and deadline snapshot; the unit of handoff |
| Pass | Platform subscription buying reach: which official AIs a fan may message this cycle |
| Pool | Pass revenue after take, allocated per active slot to creators each cycle |
| Reach | Which creators' AIs a fan may talk to |
| Reliability stats | Public per-creator acceptance rate, median turnaround, deadline hit rate, derived from Commitment events only |
| Session | A scheduled human call with real connection events; only connected time counts |
| Takeover | The creator assuming sender authority in a thread; cancels in-flight AI generation |
| Thread | The single conversation between one creator's agent and one fan; the isolation boundary |
| Tier | A creator-defined capability bundle sold as a membership |

Source documents: the product definition (Creator Relationship Platform, v1.0, September 20, 2026) and the seven-screen interaction concept (September 21, 2026). Where this document and those differ, this document's decisions in sections 1 and 9 are the current position.

# Qelvora design brief

The condensed working memory for designing Qelvora (placeholder name, see
[NAMING.md](NAMING.md)). It summarizes the four source documents in
[`docs/source/`](source/) and records the decisions made since. **The source
documents are authoritative; when this brief and a source disagree, the source
wins and this brief is corrected.**

| Source | What it fixes |
| --- | --- |
| [Product Design: Flows, Screens and Copy](source/Product_Design_Flows_Screens_and_Copy.md) | Principles, identity system, IA, every screen, honest states, notifications, copy system, accessibility |
| [Domain Model and Behavioral Contract](source/Domain_Model_and_Behavioral_Contract.md) | Objects, 25 invariants (INV-), state machines, flows (F1–F16), decisions (D-), acceptance tests (T-) |
| [System Architecture](source/System_Architecture.md) | Modules, realtime and takeover protocol, call clocks, latency targets, build slices and which screens ship in each |
| [Second Review: Strategy, Behavior and Additions](source/Second_Review_Strategy_Behavior_and_Additions.md) | Market and behavior evidence, the ladder of presence, additions A1–A14, pilot gates |

## 1. The product in one paragraph

Each creator has an authorized, clearly labeled AI that talks one-on-one with
every fan and remembers them. The real creator stays present through short
**Notes** and **reactions**, and fans can pay for the creator's personal
attention in defined units (a written reply, a voice note, a call), charged only
if the creator accepts. In the pilot the paid unit is the written reply; voice
notes, calls and public answers are planned for later ([launch plan](LAUNCH_PLAN.md),
section 4). The business is making a real person reachable; the AI is
the bridge between human moments and is never presented as the person. The label
is the product: this is the honest version of an industry (paid DMs, outsourced
"chatters") that runs on deception today.

## 2. Company and account context

- **Pantopus is the parent company.** Qelvora is one of several Pantopus apps.
  The existing neighborhood app currently called "Pantopus" will be renamed.
- **Sign-in is Qelvora sign-in (option D, decision log 2026-10-15).** People sign
  in with Apple or Google ("Continue with Apple", "Continue with Google"; the native
  Welcome button reads "Sign in to continue"), and a new account gets one
  date-of-birth step. Each person has a Qelvora-specific account id. A link to a
  Pantopus account is the long-term path. This replaces the source documents'
  "Continue with Pantopus" and one Pantopus account underneath (D-A) for the pilot.
- Qelvora has **its own brand and design system**. Only company-level legal and
  footer elements are shared.
- Only `account_id` crosses the boundary (INV-14). Where the source documents
  say "Pantopus private data (address, household, neighborhood)", read it as the
  neighborhood app's data; none of it ever appears in Qelvora.
- Fans must be 18+ (D-11). Under option D the date-of-birth step enforces it,
  with the phone's age signal where one exists, and under 18 always wins; counsel
  confirms the method before real fans join. D-11 had the Pantopus account enforce it.

## 3. People

| Role | Needs | Where they live |
| --- | --- | --- |
| Fan, expert cohort | Real help from someone they trust (craft, fitness, finance, filmmaking); cited answers; a way to reach the person | Fan app: the native iOS and Android apps first; the web answers from a creator's link and stays supported (2026-10-08) |
| Fan, companion cohort | Closeness, to feel heard and remembered, recognition from the person | Same app; stricter guardrails and wellbeing features |
| Creator | Relief from unanswerable DMs, income without more hours, control of their reputation and likeness, meaning ("this helped") | Creator studio: phone for Notes, Requests and Threads; desktop for My AI and Insights |
| Creator's team member | Triage, draft, publish, schedule, **never act as the creator** | Studio with a reduced, clearly labeled role view |
| Platform operations | Verification, safety cases, disputes, pauses | Ops console (not specified in the source docs; see section 14) |

## 4. Design principles (in priority order; the earlier rule wins)

1. **Who is speaking is always answerable in under a second**, on every surface.
2. **The AI must be worth talking to on its own**: useful, cited, remembering.
3. **Access is explained by what you can do now**, never by a slogan.
4. **The handoff is the product**: packet, mode, price, deadline and refund rule on one screen. Never a side effect, a meter or a guilt trip.
5. **Keep the relationship warm between human moments, without pretending.** The AI never says the creator remembers, read or felt anything.
6. **The honest version of an existing industry.** No setting hides the label; an approved draft is always shown as one.
7. **Presence is cheaper than replies, and fans value it more** (the ladder of presence).
8. Creator side: **setup in ten minutes, control forever.** Show value (the first handled conversation) before governance.

## 5. The identity system (the core of the design system)

Every message has exactly one authorship state, set by the server. Color is
never the only signal: each state has a **word**, a **glyph** and a **color**,
rendered into the content itself so it survives screenshots, search, exports and
notification previews.

| State | Fan-facing label | Visual token (source) | Audio |
| --- | --- | --- | --- |
| `ai` | "Maya's AI" | AI color, AI glyph | AI voice notes open with a spoken "Maya's AI" tag (AI voice ships in slice 3) |
| `approved_draft` | "Prepared by AI · approved by Maya" + her initial | Must read as a **third thing**, not a variant of either (split bubble vs gradient vs stacked badge is an open question) | Never voice |
| `human_creator` | "Maya" | Person color, verified glyph, Signed marker | Real recorded voice |
| `human_call` | "Maya · the person" chip, pinned all call | Person color chip + "Not recording" | Live |
| `human_broadcast` (a Note) | "Maya · to Studio members" (audience always named) | Person color + broadcast glyph; never the private-reply bubble | Real voice, up to 60 s |
| `human_reaction` | "Maya reacted to your reply" | Reaction on the fan's message with her avatar | None |
| `team` | "Maya's team · Priya" | Neutral color, team glyph, never her avatar | Never voice |
| `fan` | The fan's handle | Right-aligned, neutral | Fan voice notes allowed |
| `system` | No author; italic status line | Centered, muted | None |
| Signed marker | "Signed by Maya" check | Check glyph in person color; opens the verification page | On every human act under her name |
| Correction | "Maya's note on this AI reply" | Person color, attached under the AI bubble | None |
| Reserved, disabled | `fan_agent` ("{handle}'s assistant"), `ai_call`, `ai_video` | Designed later, never shown until enabled | |

Color pair: **blue graphite = AI, ember = the person** (decided 2026-09-25 in the
visual direction, replacing the source's working pair of violet for the AI and amber
for the person). Hues may change; the rule that they differ never does.

Rules the design must enforce:

- The **identity strip** at the top of a thread never scrolls away: "You're talking to Maya's AI · Maya steps in on request" / "Maya is here" / "Maya's team is here".
- The **primary button in a thread is always the AI**. The only person-colored button is "Ask Maya to step in", and it opens the packet, never a payment sheet.
- **No silent transitions.** Takeover and handback are system lines; nothing from the AI ever appears beneath "Maya is here" (INV-03, INV-04).
- A push says "Maya replied" **only** for `human_creator` and `human_call`.
- Screen readers hear the state before the body ("Maya's AI says: …").
- "Official means Maya authorized this AI. It does not mean she read your message."

## 6. The ladder of presence

| Rung | Creator time | Fan price | State |
| --- | --- | --- | --- |
| Note (text, one photo, or up to 60 s of voice) to followers, a tier or all members | 1–3 min, a few times a week | Included in membership | `human_broadcast` |
| Reaction to a fan's reply | 1 s | Free | `human_reaction` |
| Public answer | 2–5 min, one answer for many | Lower than private; asker earns capped credits, never cash (D-27) | `human_creator`, marked public |
| Written reply, private | 5–15 min | Creator's price | `human_creator` or `approved_draft` |
| Voice note | 1–2 min | Creator's price | `human_creator` (audio) |
| Call, audio or video, fixed length | 10–15 min + scheduling | Creator's price | `human_call` |

The first two rungs are the daily habit; the top four are the revenue. The AI
never sells any rung (INV-21). The pilot offers Notes, reactions and private written
replies; public answers, voice notes and calls come later.

## 7. Money and access, as the fan sees it

- **Membership leads** (D-23): per creator, includes the AI, Notes and the right to request. The creator sets the price (Product Design, Offers); the Second Review's figures, around $4.99 a month, are illustrative, not decided prices. The **pass** (three creators' AIs a month) arrives in slice 4, once about 30 creators have active fans.
- **Free first conversation** of about 24 hours per creator (D-26), ending at the next natural pause, never mid-disclosure.
- **Charge on acceptance** (INV-16): card held at submit, captured only if the creator accepts; decline, expiry, withdrawal, missed deadline and creator no-show refund automatically. Decline is free and not penalized.
- **One monthly charge** per fan covers all memberships.
- **Spend limit** chosen at the first paid action ("No limit" is an explicit choice); reminders at 50% and 100%; raising takes 24 h, lowering is immediate; memberships refundable in full within 7 days if unused (D-21).
- **Native app** (D-14): memberships and the pass through in-app purchase at store prices; 1:1 calls paid outside IAP; the app never shows a web price beside a store price.
- The **four access lines** answer, wherever access matters: what you can do now, what is included, what needs a request, when it changes.

## 8. Information architecture

**Fan app** (organized around relationships):

| Tab | Holds |
| --- | --- |
| Home | Pinned open requests and upcoming calls; threads by activity (each with the last message's authorship glyph); "New from people you follow", chronological, no ranking |
| Discover | Search by need ("What do you want help with?"), categories, creator cards with reliability stats |
| Requests | Every packet with live status, ETA, countdown, receipt; every call with Join |
| You | Pass (slice 4), handle and intro card, memory per creator, conversation access history, consents, notifications, spending and time, export, delete |

**A creator's home** (also the public link-in-bio page, works signed out):
segments **Chat**, **Posts**, **Requests**, **Access**. Primary action:
"Message Maya's AI" (AI colored).

**Creator studio** opens on **Today** (first tab on phone, with the home glyph),
with **Notes** one tap from Today (decision log, 2026-10-15 and 2026-11-01;
Product Design section 3 puts Notes first). The remaining phone tabs are **Requests**, **Threads**, **My AI**
and **More**. More holds **Offers**, **Publish**, **Insights**, and **Earnings and
team** (including License and sponsorships).

The two screens where everything meets, and which get the most design attention:
the **fan thread** (S-F5) and the **creator packet detail** (S-C4).

## 9. Screen inventory

Slices come from the System Architecture, section 12. The scope is **full**: every
slice is designed, the pilot's screens first.

### Fan app

| ID | Screen | Slice | Notes |
| --- | --- | --- | --- |
| — | Creator home, public (signed out) | 1 | Link-in-bio landing; post and Instagram "comment KILN" entrances carry a context card. The Instagram entrance needs the comment automation (A13), which comes after the launch kit |
| S-F1 | Onboarding | 1 | Sign in with Apple or Google → date of birth (a new account only) → handle → access notice → back to exactly where the fan was; under two minutes to a first useful answer |
| — | Processor consent | 1 | Names the model providers before the first AI message (D-22) |
| S-F2 | Home | 1 | Pass draft card in slice 4 |
| S-F3 | Discover | 1 (pass markers slice 4) | |
| S-F4 | Creator profile (the creator's home, signed in) | 1 | Four segments; Access holds the ladder and the four access lines |
| S-F5 | Thread | 1 | Identity strip, bubbles per state, citation chips, memory chips, context card, trial, takeover, reminders |
| S-F6 | Memory card | 1 | Facts, open loops, summary; provenance; "don't remember this" |
| S-F7 | Packet (Ask Maya to step in) | 1 | Included in your request; mode rows; private or public (private only in the pilot; public answers come later); rule line; ETA |
| — | Spend-limit step and checkout sheet | 1 | Before the first paid action; card authentication step |
| S-F8 | Request status and receipt | 1 | Stepper; outcomes; share card (in the pilot since 2026-10-08) |
| S-F9 | Call (pre-call, waiting room, connected, post-call) | 2 | Three clocks, five outcomes |
| S-F10 | Pass (inside You) | 4 | |
| S-F11 | Notifications | 1 | Sender label per row, per-creator mute |
| S-F12 | Me and privacy | 1 | Access history, consents, export, delete |
| S-F13 | Post and content view | 1 | "Ask Maya's AI about this"; locked states hide the AI button |
| S-F14 | A Note in the thread | 1 | Reply box; "Sent to Maya's Notes"; reactions; quote-replies |
| S-F15 | Spending and time | 1 | Limit, reminders, weekly usage, 90-minute companion signal |
| S-F16 | Verification page (public) | 1 | Stable URL printed on every share card |
| — | Share card (image for X, TikTok, Instagram) | 3; a minimal card is in the pilot (2026-10-08) | Carries the authorship label and verification URL. In the pilot: a signed written reply with its verification page, as an image and a link |
| — | Native specifics | 2; the fan apps are in the pilot (2026-10-08) | Push, IAP sheets and the offline banner in the pilot; the CallKit/ConnectionService incoming call comes with calls |

### Creator studio

| ID | Screen | Slice | Notes |
| --- | --- | --- | --- |
| S-C1 | Verification and onboarding | 1 | Sign in (Apple or Google, 18+) → external proof → passkey → handle → replica license → interview → publish |
| S-C2 | My AI | 1 | Mode, sources, style, rules, approval, voice (slice 3), test console, versions, export; 72-hour digest after publish |
| S-C3 | Requests queue | 1 | Commitments first, then packets by SLA, then rule matches; capacity header |
| S-C4 | Packet detail and reply composer | 1 | Fulfilling actions first, everything else behind "Instead"; preview of the fan's label |
| S-C5 | Threads | 1 | Logged reading, pause for this fan, take over, hand back, "I'd never say that" |
| S-C6 | Offers | 1 | Tiers, human modes, capacity, call availability (slice 2) |
| S-C7 | Publish | 1 basic, 3 full | Audience and "Let my AI use this" are two controls |
| S-C8 | Insights and producer | 3 | Clusters with min-group; "Answer once for everyone" |
| S-C9 | Earnings | 1 minimal, 4 pool | Money explained by cause |
| S-C10 | Team and settings | 1 | Roles as checklists; creator-only list shown, not editable |
| S-C11 | Call, creator side | 2 | Pre-call brief from the packet only |
| — | Today | 1 | Where the Studio opens and its first phone tab (2026-10-15): requests waiting, this week's capacity, the AI's status and the latest Note, with Notes one tap away; the weekly digest once it has a producer |
| S-C12 | Notes and the Replies feed | 1 | One tap from Today; each Note and reaction is signed with her passkey in the web Studio (option A) |
| S-C13 | License and sponsorships | 1 | "Pause everything" |
| S-C14 | The creator interview | 1 | 20 minutes, voice or text; weekly 60-second check-in |
| — | Passkey signing sheet | 1 | Shows the exact content being signed (ADR-9) |
| — | Weekly impact digest | 1 | People helped, thanks fans chose to share |

### Shared and system surfaces

Notifications (push, email digests, in-app), the verification page, share
cards, error and offline states, the 22+ honest states, and the Instagram
auto-reply landing.

## 10. Honest states (design each one)

AI updating · AI paused by creator · AI paused for this fan · creator paused
entirely · creator suspended or revoked · slot ended · trial ended · allowance
exhausted · capacity zero · payment hold fails · packet expired · declined ·
more info requested · deadline missed · creator no-show · fan no-show ·
reconnecting · takeover mid-generation · memory deleted · source revoked ·
guardrail block (unsupported question vs safety refusal with crisis resources) ·
blocked or reported · call ended early · call technical failure · long-session
reminder · hold expiring before decision · message not accepted.

Two rules across all of them: **no state says "Maya read" or "Maya saw"** without
a human event, and **no state offers a purchase as the way out of a failure.**

## 11. Copy system

Fixed sentences (use verbatim; `{…}` are variables):

- "You're talking to Maya's AI · Maya steps in on request."
- "Official means Maya authorized this AI. It does not mean she read your message."
- "Conversations with a creator's AI can be read by that creator and their authorized team. Those accesses are logged. You can delete any conversation at any time."
- "Maya and her authorized team can separately review this AI conversation. Those accesses are logged."
- "Charged only when Maya accepts. If she declines or {deadline} pass, nothing is charged." followed, wherever a hold is placed, by "Your bank may show a pending hold for a few days."
- ETA: "Maya usually decides in {range}" (a range from her record, for example "1 to 2 days"), always beside the absolute deadline.
- "Maya may answer with her AI's draft; you'll see that label."
- "Maya answers {mode} within {deadline} · {n} of {cap} left this week."
- "Opening this conversation is logged and visible to the fan."
- "You've been talking with Maya's AI for a while. It's an AI, and it will be here when you're back."
- "Maya · to Studio members" · "Only Maya and her team see replies to Notes."
- "Paid partnership: Maya is paid by {brand}."
- "Before your first message, Maya's AI is powered by {providers}. They don't keep or train on your messages."
- "Want me to remember this? Only if you say yes."
- "Set a monthly limit. You can change it any time; raising it takes 24 hours."
- The four access lines: "You can: …" · "Included: …" · "By request: …" · "Changes: …"

Never use: "Maya read / saw / remembers" (without a human event) · "Maya will
reply" · "VIP", "exclusive access", "get closer" · "from $", "per minute" ·
"Unlock" for a human mode · "Keep chatting to…" · "Failed" for a decline ·
"Bot", "chatbot", "virtual" · "Maya messaged you" for a Note · "top fan",
"biggest supporter" or any money-based rank · "unlock"/"upgrade" inside AI
replies.

Preferred words: "Seen by Maya's queue", "Maya's AI remembers", "Maya usually
decides in {range}" (the 2026-09-25 decision replaced the single-number form), "Ask", "request", "Passed on this one", "Maya's AI",
"official AI".

## 12. Compliance that shows up in the UI

AI disclosure at the start of every thread and a reminder every 3 hours of
continuous use · crisis detection with resources, never paid access · 18+ only ·
processor consent naming providers · sensitive-memory consent per item ·
paid-partnership labels inside AI messages · report on every AI message ·
spend limit at first payment, no money ranks, 7-day membership refund · 90-minute
daily signal in companion mode · replica license with pause on revocation or
death · AI audio with C2PA and watermark (slice 3) · access log visible to the
fan · export and delete everywhere.

## 13. Platform and accessibility requirements

- Web is the full product: every screen, and the only home for configuration. For fans the native apps are the primary launch surface (decision log, 2026-10-08), and purchases follow the distribution matrix (D-14). The studio is web, mobile-first for Notes, Requests and Threads; desktop-first for My AI and Insights. Under option A (decision log, 2026-10-09) the pilot's native app is the fan app and creators use the web Studio on their phones; a separate native Qelvora Studio app follows after the pilot.
- WCAG AA contrast in both themes; authorship never by color alone; every core action reachable by keyboard; labels in the accessibility tree before message bodies; countdowns not read every second; no autoplaying voice; typing indicators respect reduced motion.
- Translation label on translated human replies; call times shown in both parties' time zones.
- Every object with a screen has a stable deep link. Offline: readable from cache with a stale banner; nothing sent or bought offline.
- Latency the design should reflect: acknowledgment in 300 ms, the first approved sentence at p95 2.5 s warm and 4 s cold (System Architecture), visible takeover in 500 ms. The pilot starts from a 4.5 s bar ([launch plan](LAUNCH_PLAN.md), section 5, to confirm).

## 14. Decision log

Decisions made in this project (newest last). Source-document decisions (D-A to
D-H, D-01 to D-27) are in the Domain Model.

| Date | Decision |
| --- | --- |
| 2026-09-25 | Placeholder product name `Qelvora`, with the replacement rules in [NAMING.md](NAMING.md) |
| 2026-09-25 | Scope: design every slice (pilot, calls and native, producer and AI voice, the pass), pilot screens first |
| 2026-09-25 | Pantopus is the company; one Pantopus account signs in to every Pantopus app; Qelvora gets its own brand and design system |
| 2026-09-25 | Source docs kept verbatim as Markdown in `docs/source/`; this brief is the working summary |
| 2026-09-25 | Fan app: four tabs (Home, Discover, Requests, You); notifications behind a bell on Home; the pass lives in You |
| 2026-09-25 | Studio on a phone: Notes · Requests · Threads · My AI · More (Offers, Publish, Insights, Earnings and team) |
| 2026-09-25 | The creator app is "Qelvora Studio"; mockups use the sample tier "Kiln Club" and a second sample creator, Devon (companion mode) |
| 2026-09-25 | Themes follow the system setting; light and dark are both fully designed |
| 2026-09-25 | A minimal ops console is designed (verification review, safety cases, disputes, pauses) |
| 2026-09-25 | Stale trial wording follows D-26 and D-23; approval policy follows D-12 (no auto-reply gate) |
| 2026-09-25 | Copy: request ETAs are shown as a range from the creator's record ("Maya usually decides in 1 to 2 days") beside the absolute deadline, replacing the single-number ETA |
| 2026-09-25 | Copy: the rule line gains "Your bank may show a pending hold for a few days." wherever a hold is placed |
| 2026-09-25 | Notes may show their audience size ("to 2,314 Kiln Club members") when the creator turns it on |
| 2026-09-25 | "Off the record" conversations: the AI writes no memory or open loops from them; they stay labeled, covered by the access notice (D-01) and retention (D-08), and deletable. Needs a domain-model and architecture addition before build |
| 2026-09-25 | Visual direction: a blend led by C · Instrument, then A · Correspondence, then B · Nocturne, built as D · Atelier. From C: Maya on a dark plate and the AI on a light panel, Geist and Geist Mono, precision details. From A: the wax seal, Newsreader for Maya's own words, receipts as keepsakes. From B: "house lights" while Maya is present, and the warm night palette as the dark theme. Person color ember #7E2E12 (#EE8D5F on the plate); AI color blue graphite #3A6795 |
| 2026-09-25 | Design system published in D · Atelier: [Qelvora](https://claude.ai/artifact/AyfModKVToY2VeqMACNxFU) (Design System artifact), snapshot in `design/design-system/`. Light and Night themes; 53 components, each with guidelines and a live preview |
| 2026-09-25 | Deferred by the founder: AI provider names on the consent screen stay `[AI PROVIDERS]`; native in-app purchase for paid replies waits for counsel; cards are designed as a direct card hold |
| 2026-09-25 | Phases 4 to 6 drafted end to end: 64 screens on six canvases, five prototypes, the audit and developer handoff (see the design plan for links) |
| 2026-09-25 | Brand aim: a high-end, premium product. The luxury comes from craft, calm, service and honesty ("quiet luxury"), never from status or exclusivity language, which the copy system forbids |
| 2026-10-02 | Human directs streams to prioritize working features and personally operated web/native E2E; retain functional JSON and concise necessary records, avoid committing routine screenshots or bulky diagnostic receipts. W3 [current checkpoint](archive/workstreams/handoffs/W3-mac-studio-2026-10-02.md) remains incomplete. |
| 2026-10-07 | Founder authorized reconciling the existing PR work before new feature development, preserving useful implementations and assigning one continuation path per unfinished area. See the [reconciliation ledger](archive/operations/pr-reconciliation-2026-10-07.md); product scope and invariants remain unchanged. |
| 2026-10-08 | Resumed the preserved checkout and carried all remaining acceptance into the [product finish plan](archive/operations/product-finish-plan-2026-10-08.md). Existing-version upgrade work first repairs comparison sample identity and expiry; a stored comparison is not original-owner privacy authority. No product invariant or open consent decision changes. |
| 2026-10-08 | [Connected native continuation](../artifacts/pr-review/2026-10-08/native-connected-journey/README.md): use real preserved conversations and OS sessions to verify native journeys. Restore only a bounded account-bound path after current identity validation; explicit links take precedence. Keep the latest reply visible while respecting the reader's position. The complete finish plan and open production/privacy decisions remain unchanged. |
| 2026-10-08 | [Native send and keyboard milestone](../artifacts/pr-review/2026-10-08/native-message-reliability/README.md): keep the thread's human action above the composer, omit global tabs within a conversation, and preserve an unsent newer draft through acknowledgement/reconnection. Authority timeouts require fresh authorization and remain distinct from actual denial. Live iOS/Android sends and keyboard checks pass; full product and latency acceptance remain open. |
| 2026-10-08 | [Disconnected comparison guard](../artifacts/pr-review/2026-10-08/comparison-feed-guard/README.md): a retained comparison does not replace its trusted source owner. With the feed absent, hide result text and block replacement publication while preserving live v1 and historical accounting. The complete producer, consent and existing-version upgrade remain open. |
| 2026-10-08 | [Comparison lifecycle source](../artifacts/pr-review/2026-10-08/comparison-consent-lifecycle/README.md) keeps comparison permission separate from reply feedback and processor consent. Withdrawal/expiry invalidate derived comparison text; privacy exports/deletion need the original prepared task owner. Source review is not activation or a new production policy. |
| Creator account export repair, October8 | Preserve the original reviewed catalogue checksum by normalizing metadata display; Media uses its own original task and verified relationship; bounded128-row pages retain every authority/EOF/COMMIT check and the45s deadline. The original eight-domain creator export and all four UI downloads now pass with unchanged publication/accounting. Expired-verification download recovery and complete privacy remain open. [Evidence](../artifacts/pr-review/2026-10-08/comparison-consent-lifecycle/README.md). |
| Privacy download recovery, October8 | A failed document download returns to the privacy page with a clear verification, expiry or unavailable notice. A relative redirect preserves the exact origin and host-bound cookies; API clients retain original JSON/status. Actual fresh sign-in downloads the identical original artifact. [Evidence](../artifacts/pr-review/2026-10-08/privacy-download-recovery/README.md). |
| 2026-10-08 | Comparison source integration uses the original Trust worker and protected store; numbered SQL remains reserved until the preserved-data upgrade and legacy export/file lifecycle are operated. No legacy consent or source mapping is inferred from an empty export. [Evidence](../artifacts/pr-review/2026-10-08/comparison-runtime-integration/README.md). |
| 2026-10-08 | [Preserved creator upgrade](../artifacts/pr-review/2026-10-08/comparison-creator-upgrade/README.md): operate current source-approved comparison and fresh boundary evaluation before publishing engine14. Preserve original publication and cost history through restart and rollback. One fictional case does not establish production quality; later fallback inconsistency and stale offline comparison presentation remain explicit unfinished work. |
| 2026-10-08 | [Comparison view lifetime](../artifacts/pr-review/2026-10-08/comparison-view-lifetime/README.md): a received comparison is not offline privacy authority. Conceal results on failed current reads and revalidate on return. This is a deliberate exception to "readable from cache" (section 13). The populated export and withdrawal acceptance it deferred is re-scoped by the comparison freeze below. |
| 2026-10-08 | Launch scope: build around five moments (the first answer, being remembered, the person shows up, asking for her with honest money, the creator's five minutes). The pilot is architecture slice 1 plus a minimal share card. Calls, the pass and pool earnings, AI voice, Insights and the producer, public answers and credits, the full publishing library, native configuration screens and fan-derived comparison replay are planned for later, not dropped. See the [launch plan](LAUNCH_PLAN.md) and [launch review](archive/operations/launch-review-2026-10-08.md). |
| 2026-10-08 | Phone apps first: the native iOS and Android apps are the primary surface for fans; the web carries the first answer from a link and the configuration screens. Creators' Notes and reactions were to be native at launch; the 2026-10-09 row below replaces that for the pilot. |
| 2026-10-09 | Option A: the pilot's native app is the fan app, with no new creator features. Creators use the Studio in the phone browser (installable, passkey signing). A separate native "Qelvora Studio" app follows after the pilot, Notes and reactions first. App ids `com.pantopus.qelvora` and, reserved, `com.pantopus.qelvora.studio`. One account across both. |
| 2026-10-09 | The work is split into seven lanes plus an integrator: identity and trust; platform and hosting; AI engine; money; presence and reach; creator Studio (web); phone apps. See [docs/lanes](archive/lanes/README.md). |
| 2026-10-15 | Today replaces Notes as the first Studio tab; Notes stays one tap away from Today. Today remains the selected section for Notes and the Note composer. See the recorded approval in [lane 6 status](archive/lanes/status/lane-6.md). |
| 2026-10-09 | How the seven lanes work: seven sessions started by hand, each working alone with no subagents. No new unit tests: every lane proves its work with end-to-end scenarios that include edge cases, run on a real database, browser or device, with the deepest sets for money, sign-in, signing, deletion and the guard. The existing suites, including the 100 money tests, stay as regression gates. This replaces the 2026-10-08 rule that tests are required for money and sign-in. See the [working agreement](lanes/01-working-agreement.md) section 3. |
| 2026-10-08 | The share card is in the pilot: a signed written reply with its verification page, as an image and a link. The fan chooses how their handle appears and either side can revoke it (D-15). |
| 2026-10-08 | Model provider: the Anthropic API is the intended production provider, switched before the first real creator publishes, as one engine revision with the embedding provider chosen first. Development stays on the synthetic OpenAI configuration, which is not a production approval. |
| 2026-10-08 | Comparison is frozen after the open stack merged (#351 to #353): installed and off. Done means withdraw-only mode with retry, one native withdrawal exercised, SQL-level checks on a disposable database, a runbook, an overdue-purge alert, and a creator-authored FAQ set that replaces the fan-sample publish gate. |
| 2026-10-08 | Paid written replies inside the native apps (Q04): continue on the web during the TestFlight and closed-testing pilot; settle the public-release approach with counsel. |
| 2026-10-09 | The launch order: a private web alpha first (about ten invited adults, web only, payments in Stripe test mode), then the TestFlight and Google Play closed-testing pilot, then public release after the pilot gates. It orders the 2026-10-08 phone-apps-first row; supersedes no row. Recorded 2026-11-02. Evidence: the [lanes charter](archive/lanes/00-charter.md), section 5, "Decisions already made". |
| 2026-10-15 | Pilot sign-in is option D: Qelvora sign-in with Sign in with Apple and Google, behind the existing identity adapter seam. A new account gets one neutral date-of-birth step before any session; 18+ comes from that attestation plus the phone's age signal where one exists, and under 18 always wins (counsel confirms the method before real fans join). Each person gets a random Qelvora account id, never derived from an Apple, Google or Pantopus id. A Pantopus account link stays the long-term path. For the pilot this departs from Domain Model D-A (one Pantopus account underneath), D-11 (18+ through the Pantopus account) and Product Design's "Continue with Pantopus" onboarding step. Confirmed formally with the consolidation plan on 2026-11-01. Supersedes the sign-in part of the 2026-09-25 row "one Pantopus account signs in to every Pantopus app"; the company and brand parts of that row stand. Recorded 2026-11-02. Evidence: the [sign-in decision pack](archive/lanes/status/lane-1-signin-decision-pack.md), #431 and #432. |
| 2026-10-15 | Passkey recovery splits a lost device from a compromised one. "It's lost or broken" retires that creator's working keys: a retired key can never sign again, and every past signature stays valid. "Someone else may have it" keeps the earlier behavior: every key and every past signature is revoked and shows as revoked. With one working key, the Studio asks for a second passkey on another device. The wording was approved the same day. Built in #439 and registered as migration 0256 by #527 (2026-11-02). Supersedes no earlier row. Recorded 2026-11-02. Evidence: [lane 1 signing](archive/lanes/status/lane-1-signing.md), section 2. |
| 2026-10-15 | A reply's cost hold is a strict upper bound, computed from the calls the pipeline can make for the creator's configuration, each at its own model's rate, and the cap is never exceeded. A reply that fails on a provider error before any output releases the fan's allowance. A partly delivered answer that crashes keeps the fan's reservation held, like any unknown cost, until a receipt settles it. Built in lane 3's A6 work (#433, #434, #436, #438), merged through #518. Supersedes no earlier row. Recorded 2026-11-02. Evidence: [lane 3 status](archive/lanes/status/lane-3.md), founder decisions. |
| 2026-10-15 | The FAQ check decides publishing in place of the fan-sample comparison gate. The creator writes the questions fans ask, each with the answer they expect. A first version needs no FAQ; a new version may replace the live one only with at least 5 questions and at least 80% of them passing, on top of the boundary cases. FAQ answers stay a check, never a source: a creator whose sources don't cover a question adds sources. The FAQ copy was approved as written. Built in #441 (merged through #518); #514 keeps partial FAQ drafts through recovery, and #513 carried the FAQ editor and that fix through the My AI split. Completes the FAQ item of the 2026-10-08 comparison-freeze row; supersedes no row. Recorded 2026-11-02. Evidence: [lane 3 status](archive/lanes/status/lane-3.md), "B2: the FAQ publish check". |
| 2026-10-15 | The compact persistent author header: in constrained layouts (largest text, landscape, split screen), both apps keep the author word and glyph fixed at the top of the thread and put the full identity sentence in the message scroller. No wording changed. Built in #401 (merged through #523). It applies section 5's rule that the identity strip never scrolls away; supersedes no row. Recorded 2026-11-02. Evidence: [lane 7 keyboard and drafts](archive/lanes/status/lane-7-keyboard-drafts.md), "Founder decision". |
| 2026-11-01 | The native sign-in wording: the Welcome button reads "Sign in to continue", and the unavailable message is "Sign-in is unavailable right now. Try again in a moment." They replace "Continue with Pantopus" and "Pantopus sign-in is not connected in this local build." The web keeps "Continue with Apple" and "Continue with Google" (approved 2026-10-15, #432). Approved with the consolidation plan's defaults. Supersedes "Continue with Pantopus" as the sign-in wording of the 2026-09-25 account row; some native error copy still says "Continue with Pantopus again" (a follow-up). Recorded 2026-11-02. Evidence: the [consolidation plan](CONSOLIDATION_PLAN.md), status and section 8, item 2. |
| 2026-11-01 | The Today tab uses the home glyph. With the 2026-10-15 row (Today replaces Notes as the first Studio tab, Notes one tap away), the phone tabs are Today · Requests · Threads · My AI · More. Approved with the consolidation plan's defaults. Supersedes the 2026-09-25 row "Studio on a phone: Notes · Requests · Threads · My AI · More". Recorded 2026-11-02. Evidence: the [consolidation plan](CONSOLIDATION_PLAN.md), status and section 8, item 3; `StudioTabBar` in `packages/ui-web`. |
| 2026-11-01 | How work runs: one coordinating session plus one work session per task. The coordinator keeps the plan, [STATUS](STATUS.md), the pull request queue and merges, and writes no feature code; a work session owns one task, one branch and one pull request, doesn't merge, and ends with a report. Supersedes the session model of the 2026-10-09 rows (seven lane sessions plus an integrator). The 2026-10-09 testing rule (end-to-end scenarios, no new unit tests) is unchanged: allowing unit tests for pure logic is one of the consolidation plan's open section 6 rules. Recorded 2026-11-02. Evidence: the [2026-11-02 handoff](archive/operations/handoff-2026-11-02.md), sections 3 and 4. |

## 15. Open questions and known inconsistencies

Resolve these during the design pass (proposals in the [design plan](DESIGN_PLAN.md)):

1. **Trial wording is stale in places.** The honest-states row "Trial exhausted · Five messages used · Add Maya to your pass or a tier", F2 ("N free messages per creator"), the fan-journey "try 5", and the architecture's trial-farming row still describe five lifetime messages and pass-first access. D-26 (free first conversation, about 24 hours) and D-23 (membership first) supersede them. *Answered 2026-09-25 (design plan, answer 1); the source text stays as written.*
2. **Auto-reply after 20 approved drafts** (creator-journey table, S-C2 flow) conflicts with D-12, which says the AI always replies instantly once live and there is no "auto-reply after N approvals" gate. Follow D-12. *Answered 2026-09-25 (design plan, answer 2).*
3. **Fan tabs:** the docs say five but list four (Home, Discover, Requests, You); the fifth is the pass fallback. Notifications (S-F11) also needs a home (for example a bell on Home). *Answered 2026-09-25: four tabs, with notifications behind a bell on Home (decision log).*
4. **Studio navigation:** eight sections on a phone need a primary-tabs-plus-More pattern. *Answered 2026-09-25 with Notes first; since 2026-10-15 Today is the first tab, with the home glyph from 2026-11-01 (decision log).*
5. **Approved-draft treatment:** the product design says split bubble; the glossary says gradient label. Explore both plus a stacked badge. *Proposal in the design system:* split is the default (it matches the product design); gradient and stacked stay in the system for the usability test. Not yet a founder decision.
6. **"Studio" is both the sample tier name and the natural name for the creator app.** Proposal: the creator app is "Qelvora Studio"; mockups use a different sample tier name to avoid "Studio members" in the Studio. *Answered 2026-09-25: "Qelvora Studio", with the sample tier "Kiln Club" (decision log).*
7. **The identity section says "seven states"** but there are nine fan-visible states plus the Signed marker and Correction.
8. **Pass-era copy** appears in slice-1 screens (Home's "Next month's pass" card, Discover's "before spending a slot"). Design both the membership-era and pass-era variants.
9. **Ops console** (verification review, safety cases, disputes, pauses) is required by the product but has no screens in the source docs. *Answered 2026-09-25: a minimal console is designed (decision log, phase 4H).*
10. **Brand name, colors, approved-draft treatment, theme default, AI vs human voice player, Discover's lead, studio density:** the seven open questions in Product Design section 12. *Partly answered on 2026-09-25: the colors (visual direction), the theme default, Discover's lead and studio density (design plan, answers 7 to 9), and the voice player in phase 3 (answer 10). Still open: the brand name and the approved-draft treatment (item 5).*

Added 2026-11-02 in Wave 5. These wait on the founder; the docs record them and decide nothing:

11. **Pilot size and cohorts.** The Second Review (section 8, and Q2 in section 7) and the System Architecture's slice 1 say 5 to 10 creators split across both cohorts; the October launch plan asked for a first cohort of three to five.
12. **INV-22, one signature for accept and deliver.** As written, INV-22 needs a passkey assertion for each named act, and accepting a request is one of them. The 4C "Review and sign" board draws one "Accept and send" act, and the October launch plan wrote "two taps and one signature" as if decided. Until the founder decides, accept and send are two signatures, as the code does today.
13. **Paid voice notes in the pilot.** D-25 and the architecture's slice 1 ship the creator's real voice notes; the launch plan defers them until written replies have proven out, as a recommendation the founder has not confirmed.
14. **The pilot's quality bars** ([launch plan](LAUNCH_PLAN.md), section 5): the first approved sentence at p95 at most 4.5 s at the start of the pilot, against the architecture's 2.5 s warm and 4 s cold, and the other bars there. To confirm.
15. **Option D's open inputs:** counsel on the 18+ method, the age-step copy, and the Apple and Google client IDs.
16. **The other open calls:** the INV-21 price rule, the A5 safety sign-off, deletion D1 to D4 and Q16, ops P1 to P5, hosting, the domain and passkey ID, and the credentials ([STATUS](STATUS.md#decisions-the-founder-still-owes)).
17. **The ETA range in the pilot.** The public summary leaves "Maya usually decides in {range}" empty until a creator's decision record exists, and never invents a range. #487, which fills it, is parked: it shows nothing until a creator has five outcomes.
18. **Known inconsistencies in the decision log,** which is append-only and so stays as written: the 2026-10-15 Today row sits above rows dated 2026-10-09 and 2026-10-08; two rows carry "October8" labels instead of dates; the 2026-10-02 row links a W3 checkpoint that is now archived. The 2026-09-25 rows on sign-in and the Studio tabs are superseded by the rows dated 2026-10-15 and 2026-11-01.

### October 8 — original export scope and legacy retention

Known unrelated export attempts no longer hold a different source deletion open.
Legacy files without comparison provenance remain unknown; only their exact
original task manifest and real elapsed expiry authorize recovery removal. No
consent, source mapping or historical clock is backfilled. The isolated restored
operations and remaining activation constraints are recorded in the
[scope/legacy milestone](../artifacts/pr-review/2026-10-08/comparison-legacy-custody/README.md).
All product finish criteria remain unchanged.

### October 8 — preserved populated comparison activation

The complete eight-source graph now has closed original/restore and actual
migration evidence. The original application starts with the finite fictional
comparison policy and preserved conversation history. This does not constitute
fan choice, sanitization or provider acceptance; separate controls and operated
journeys remain required. [Evidence](../artifacts/pr-review/2026-10-08/comparison-closed-wave/README.md).

Comparison controls continuation, October8: separate explicit creator-scoped choice
and question selection now run in all three real apps. The current original notice
is displayed and cancellation clears client state. Native reuse does not purchase
new provider calls. The actual new export remains refused until its original
source reference is bound consistently; no privacy/upgrade completion is claimed.
[Evidence](../artifacts/pr-review/2026-10-08/comparison-choice-ui/README.md).

Comparison export recovery, October8: preserve one original source reference through
capture and sealing, and settle claimed work before artifact recovery locks its task.
The same actual job now completes, and web withdrawal removes its affected file
without changing unrelated retained exports. Download denial is verified after fresh
identity; generic refusal copy remains to refine. [Evidence](../artifacts/pr-review/2026-10-08/comparison-export-reference/README.md).

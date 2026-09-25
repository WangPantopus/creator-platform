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
if the creator accepts. The business is making a real person reachable; the AI is
the bridge between human moments and is never presented as the person. The label
is the product: this is the honest version of an industry (paid DMs, outsourced
"chatters") that runs on deception today.

## 2. Company and account context

- **Pantopus is the parent company.** Qelvora is one of several Pantopus apps.
  The existing neighborhood app currently called "Pantopus" will be renamed.
- **One Pantopus account works across every Pantopus app.** Sign-in is always
  "Continue with Pantopus"; there is no local Qelvora account.
- Qelvora has **its own brand and design system**. Only the Pantopus sign-in
  (and company-level legal and footer elements) is shared.
- Only `account_id` crosses the boundary (INV-14). Where the source documents
  say "Pantopus private data (address, household, neighborhood)", read it as the
  neighborhood app's data; none of it ever appears in Qelvora.
- Fans must be 18+, enforced by the Pantopus account (D-11).

## 3. People

| Role | Needs | Where they live |
| --- | --- | --- |
| Fan, expert cohort | Real help from someone they trust (craft, fitness, finance, filmmaking); cited answers; a way to reach the person | Fan app: web first, then native (iOS, Android) |
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

Working color pair: **violet = AI, amber = the person** (the visual pass may
change hues, never the rule that they differ).

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
never sells any rung (INV-21).

## 7. Money and access, as the fan sees it

- **Membership leads** (D-23): per creator, about $5/month, includes the AI, Notes and the right to request. The **pass** (three creators' AIs a month) arrives in slice 4, once about 30 creators have active fans.
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

**Creator studio** (organized around the queue): **Notes** (first tab on phone),
**Requests**, **Threads**, **My AI**, **Offers**, **Publish**, **Insights**,
**Earnings and team** (including License and sponsorships).

The two screens where everything meets, and which get the most design attention:
the **fan thread** (S-F5) and the **creator packet detail** (S-C4).

## 9. Screen inventory

Slices come from the System Architecture, section 12. The scope is **full**: every
slice is designed, the pilot's screens first.

### Fan app

| ID | Screen | Slice | Notes |
| --- | --- | --- | --- |
| — | Creator home, public (signed out) | 1 | Link-in-bio landing; post and Instagram "comment KILN" entrances carry a context card |
| S-F1 | Onboarding | 1 | Pantopus sign-in → handle → access notice → back to exactly where the fan was; under two minutes to a first useful answer |
| — | Processor consent | 1 | Names the model providers before the first AI message (D-22) |
| S-F2 | Home | 1 | Pass draft card in slice 4 |
| S-F3 | Discover | 1 (pass markers slice 4) | |
| S-F4 | Creator profile (the creator's home, signed in) | 1 | Four segments; Access holds the ladder and the four access lines |
| S-F5 | Thread | 1 | Identity strip, bubbles per state, citation chips, memory chips, context card, trial, takeover, reminders |
| S-F6 | Memory card | 1 | Facts, open loops, summary; provenance; "don't remember this" |
| S-F7 | Packet (Ask Maya to step in) | 1 | Included in your request; mode rows; private or public; rule line; ETA |
| — | Spend-limit step and checkout sheet | 1 | Before the first paid action; card authentication step |
| S-F8 | Request status and receipt | 1 | Stepper; outcomes; share card (slice 3) |
| S-F9 | Call (pre-call, waiting room, connected, post-call) | 2 | Three clocks, five outcomes |
| S-F10 | Pass (inside You) | 4 | |
| S-F11 | Notifications | 1 | Sender label per row, per-creator mute |
| S-F12 | Me and privacy | 1 | Access history, consents, export, delete |
| S-F13 | Post and content view | 1 | "Ask Maya's AI about this"; locked states hide the AI button |
| S-F14 | A Note in the thread | 1 | Reply box; "Sent to Maya's Notes"; reactions; quote-replies |
| S-F15 | Spending and time | 1 | Limit, reminders, weekly usage, 90-minute companion signal |
| S-F16 | Verification page (public) | 1 | Stable URL printed on every share card |
| — | Share card (image for X, TikTok, Instagram) | 3 | Carries the authorship label and verification URL |
| — | Native specifics | 2 | Push, CallKit/ConnectionService incoming call, IAP sheets, offline banner |

### Creator studio

| ID | Screen | Slice | Notes |
| --- | --- | --- | --- |
| S-C1 | Verification and onboarding | 1 | Pantopus identity → external proof → passkey → handle → replica license → interview → publish |
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
| S-C12 | Notes and the Replies feed | 1 | First tab on phone; Face ID signs each Note and reaction |
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
decides within {n} h", "Ask", "request", "Passed on this one", "Maya's AI",
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

- Web is the full product; native fan apps follow the distribution matrix (D-14). The studio is web, mobile-first for Notes, Requests and Threads; desktop-first for My AI and Insights.
- WCAG AA contrast in both themes; authorship never by color alone; every core action reachable by keyboard; labels in the accessibility tree before message bodies; countdowns not read every second; no autoplaying voice; typing indicators respect reduced motion.
- Translation label on translated human replies; call times shown in both parties' time zones.
- Every object with a screen has a stable deep link. Offline: readable from cache with a stale banner; nothing sent or bought offline.
- Latency the design should reflect: acknowledgment in 300 ms, first approved sentence in about 2.5 s, visible takeover in 500 ms.

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
| 2026-09-25 | Brand aim: a high-end, premium product. The luxury comes from craft, calm, service and honesty ("quiet luxury"), never from status or exclusivity language, which the copy system forbids |

## 15. Open questions and known inconsistencies

Resolve these during the design pass (proposals in the [design plan](DESIGN_PLAN.md)):

1. **Trial wording is stale in places.** The honest-states row "Trial exhausted · Five messages used · Add Maya to your pass or a tier", F2 ("N free messages per creator"), the fan-journey "try 5", and the architecture's trial-farming row still describe five lifetime messages and pass-first access. D-26 (free first conversation, about 24 hours) and D-23 (membership first) supersede them.
2. **Auto-reply after 20 approved drafts** (creator-journey table, S-C2 flow) conflicts with D-12, which says the AI always replies instantly once live and there is no "auto-reply after N approvals" gate. Follow D-12.
3. **Fan tabs:** the docs say five but list four (Home, Discover, Requests, You); the fifth is the pass fallback. Notifications (S-F11) also needs a home (for example a bell on Home).
4. **Studio navigation:** eight sections on a phone need a primary-tabs-plus-More pattern.
5. **Approved-draft treatment:** the product design says split bubble; the glossary says gradient label. Explore both plus a stacked badge. *Proposal in the design system:* split is the default (it matches the product design); gradient and stacked stay in the system for the usability test. Not yet a founder decision.
6. **"Studio" is both the sample tier name and the natural name for the creator app.** Proposal: the creator app is "Qelvora Studio"; mockups use a different sample tier name to avoid "Studio members" in the Studio.
7. **The identity section says "seven states"** but there are nine fan-visible states plus the Signed marker and Correction.
8. **Pass-era copy** appears in slice-1 screens (Home's "Next month's pass" card, Discover's "before spending a slot"). Design both the membership-era and pass-era variants.
9. **Ops console** (verification review, safety cases, disputes, pauses) is required by the product but has no screens in the source docs.
10. **Brand name, colors, approved-draft treatment, theme default, AI vs human voice player, Discover's lead, studio density:** the seven open questions in Product Design section 12.

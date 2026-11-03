# Qelvora design plan

The plan for designing Qelvora end to end: UX research, visual direction, the
design system, every screen and state, prototypes, and an audit against the
source contracts. Scope is **full** (every build slice), pilot screens first.
Read [BRIEF.md](BRIEF.md) before working on any phase.

Status keys: `[ ]` not started · `[~]` in progress · `[x]` done. Record the
link to each published artifact next to its item when it exists.

## Where the work lives

| Deliverable | Home | Mirror in this repo |
| --- | --- | --- |
| Research report, personas, journeys | [Qelvora UX Research](https://claude.ai/code/artifact/11bc3a89-d2f4-4399-8e3b-ecfbb2c6f803) (shared doc on claude.ai) | [`docs/research/UX_RESEARCH.md`](research/UX_RESEARCH.md) |
| Visual directions | [Qelvora Visual Directions](https://claude.ai/artifact/MyZ9H9crjcdKqE196Pk6su) (Design canvas) | [`design/phase2-directions/`](../design/phase2-directions/) |
| Design system | [Qelvora](https://claude.ai/artifact/AyfModKVToY2VeqMACNxFU) (Design System artifact) | [`design/design-system/`](../design/design-system/) (tokens, brand book, components, previews and tools) |
| Screens and states | Design canvas artifacts on claude.ai, one per area | Links in this file |
| Prototypes | Clickable artifacts on claude.ai | Links in this file |
| Audit and handoff specs | This repo | `docs/audit/` |

## Implementation status

Implementation status is in [STATUS](STATUS.md). The implementation log that sat here until
2026-11-02 is in the [archive](archive/DESIGN_PLAN-implementation-log.md). No design checkbox
below says anything about working code.

## Sample content used in every design

- **Maya**, a ceramicist, blend mode (expert plus companion), sample tier
  **"Kiln Club"** (renamed from the source docs' "Studio" so mockups never say
  "Studio members" inside Qelvora Studio; see Brief section 15, item 6). Pottery
  examples from the docs: cone 6 glazes, kiln repair, crawling glaze, Glazeco as
  a sponsor.
- **Devon**, a companion-mode creator (a musician), to show the companion
  guardrails, the 90-minute signal and the warmer voice.
- **@kilnfire**, the sample fan; **Priya**, Maya's team member (triage and drafter).

## Phase 0: foundation

- [x] Source documents committed as Markdown in `docs/source/`
- [x] Naming rules ([NAMING.md](NAMING.md))
- [x] Design brief ([BRIEF.md](BRIEF.md))
- [x] This plan
- [x] `CLAUDE.md` so every session starts from the brief

## Phase 1: UX research

Secondary research, expert analysis and research kits. Live sessions with real
fans and creators are run by the team using the kits in 1.6.

Delivered 2026-09-25 as the shared doc
[Qelvora UX Research](https://claude.ai/code/artifact/11bc3a89-d2f4-4399-8e3b-ecfbb2c6f803),
with a Markdown copy in [research/UX_RESEARCH.md](research/UX_RESEARCH.md).
Follow-ups: web pages could not be opened during the research (network policy),
so sourced claims rest on search extracts; Patreon, Instagram channels, Substack,
Discord, Replika and the OnlyFans chatter ruling still need a teardown.

- [x] 1.1 **Competitive and analogous teardown**: Bubble (Dear U), Weverse DM,
      Fanfix, Patreon, Delphi, Character.AI, Cameo, Substack chat, Discord,
      Instagram broadcast channels, plus pattern sources for trust and money
      (bank card authentication, Stripe Checkout, Apple Wallet), messaging
      (iMessage, WhatsApp), and queues (Linear, Superhuman, Front). Output: what
      each gets right and wrong on identity, presence, paid access, waiting and
      wellbeing, and what Qelvora should adopt or avoid.
- [x] 1.2 **Personas and jobs to be done**: expert fan, companion fan, expert
      creator, companion creator, team member; plus the ops reviewer.
- [x] 1.3 **Journey maps** with emotions, risks and moments that matter:
      fan first visit (creator-led and Instagram), free conversation to
      membership, return visit, asking for the person (packet, waiting,
      delivery), call; creator onboarding to first handled conversation, the
      daily five minutes (Note, reactions, queue), correcting the AI, earnings;
      team member triage.
- [x] 1.4 **Screen and state inventory matrix**: every screen × state × the
      invariant and fixed copy it carries (built from Brief sections 9–11).
- [x] 1.5 **Design risks and hypotheses**, each with how the design addresses it:
      telling AI from human at a glance; packet anxiety and price clarity; the
      wait for a person; companion over-attachment; creator guilt and drop-off;
      passkey signing friction; trust in the verification page; the empty state
      before a creator has content.
- [x] 1.6 **Research kits**: the fan comprehension test (T-21: five threads mixing
      every authorship state, "who wrote this?" per message, the pass bar agreed
      before the pilot); a creator onboarding usability script; a packet and
      checkout usability script; what to instrument for the pilot gates (Second
      Review, section 8).

## Phase 2: visual direction

Canvas: [Qelvora Visual Directions](https://claude.ai/artifact/MyZ9H9crjcdKqE196Pk6su),
snapshot in [`design/phase2-directions/`](../design/phase2-directions/). Directions:
A · Correspondence, B · Nocturne, C · Instrument, and the founder-requested blend D · Atelier
(mostly C, then A, then B), now the working direction.

- [x] 2.1 Three distinct brand directions (type, color, shape, motion, tone of
      the wordmark placeholder), each applied to the same two key screens: a
      fan thread mixing `ai`, a Note, an `approved_draft`, a signed `human_creator`
      reply, a correction and a system line; and the creator home, public view.
- [x] 2.2 For each direction, the AI and person hue pair and three
      approved-draft treatments (split bubble, gradient edge, stacked badge),
      checked in light and dark and for color-blind rendering.
- [x] 2.3 Pick one direction (founder decision) and record it in the Brief's
      decision log.

## Phase 3: design system

Design System: [Qelvora](https://claude.ai/artifact/AyfModKVToY2VeqMACNxFU), snapshot in
[`design/design-system/`](../design/design-system/). Built in D · Atelier: Light and
Night themes, the brand book, 53 components with guidelines and a live preview each,
and the cover. Every preview is rendered headlessly in both themes with no errors;
every text pair holds 4.5:1 or more in both themes.

- [x] 3.1 Foundations: color tokens (light and dark, WCAG AA), type scale,
      spacing, radius, elevation, motion (with reduced-motion variants), iconography.
- [x] 3.2 **The authorship kit**: a word, glyph and color per state; the identity
      strip in its three states; the Signed marker; the correction attachment; the
      reserved states drawn but disabled. Also the live-call chip (`human_call`).
- [x] 3.3 Conversation components: message bubbles for every state and delivery
      state (local pending, accepted, generating, delivered, failed, interrupted);
      citation chip (including "no longer accessible"); memory chip; context
      card; composer (normal, trial, paused, human active, capacity zero); system
      lines; Note card with reply box; reactions; voice-note players (human and AI);
      the sponsor disclosure; the share card.
- [x] 3.4 Money and request components: access lines, mode rows (price,
      deadline, refund rule, capacity), packet disclosure checklist, rule line,
      status stepper, receipt, spend-limit picker, countdowns; "Who sees the
      answer" (private or public) as a second mode list.
- [x] 3.5 Studio components: queue cards (commitment, packet, rule match),
      capacity header, "Instead" menu, label preview, passkey signing sheet,
      source rows with scope chips, test-console transcript, version list, audit banner;
      the 72-hour digest item. *Stale:* the signing sheet's action says "Sign with Face ID",
      but under option A creators sign with a passkey in the web Studio.
- [x] 3.6 Shared: navigation (fan tabs, studio tabs plus More, desktop sidebar),
      sheets, dialogs, toasts, empty, loading and error patterns, offline banner,
      notification rows, email templates, share card. The email layout is one
      component; each email's wording is designed with its screen in Phase 4.
      *Stale:* the studio tab bar shows Notes first; Today replaced it on 2026-10-15, with the
      home glyph (2026-11-01). The visual reference applies Today as a correction
      (`scripts/visual-reference.mjs`); the board itself is unchanged.
- [x] 3.7 Content guidelines: the copy system (fixed sentences, never-words,
      the AI's voice) as usage rules on the components.

## Phase 4: screens (every state, light and dark, phone and desktop where relevant)

Corrected on 2026-11-02 against the boards in `design/`: an item is ticked only when every
board it lists exists. The launch surfaces that were never designed are listed under
[Missing launch surfaces](#missing-launch-surfaces), and boards that no longer match a decision
under [Stale boards](#stale-boards).

- [~] 4A **Fan core, pilot** ([canvas](https://claude.ai/artifact/CVDK7KgFQ5rL3rMekhJBcF); 16 boards, see `design/phase4a-fan-core/`): public creator home (plus post, invite and
      Instagram entrances), onboarding, processor consent, thread (every state),
      memory card, packet, spend-limit step and checkout sheet, request status and
      receipt, a Note in the thread, notifications. *Missing:* the Instagram entrance, the
      S-F6 memory card, and 12 of the 21 launch honest states. Onboarding is drawn as
      "Continue with Pantopus" (stale).
- [x] 4B **Fan account and discovery, pilot** ([canvas](https://claude.ai/artifact/VZNMhK2CdYKHF9pECEojQE), `design/phase4b-fan-account/`): Home, Discover, creator profile
      (Access segment), post view, You, Me and privacy, spending and time,
      verification page.
- [~] 4C **Studio on phone, pilot** ([canvas](https://claude.ai/artifact/HgnU1RHdqJTS9aYN6Gpmdc), `design/phase4c-studio-phone/`): Notes and the Replies feed, Requests queue,
      packet detail and reply composer, Threads with takeover and handback,
      passkey signing sheet, weekly impact digest. *Missing:* the creator's hand back and the
      Today screen. The signing sheet is drawn as "Sign with Face ID", and "Review and sign"
      draws accept and send as one signed act, which is the founder's open INV-22 call.
- [~] 4D **Studio on desktop, pilot** ([canvas](https://claude.ai/artifact/K465Z5XjExNgXWLgM3Ln3u), `design/phase4d-studio-desktop/`): verification and onboarding (external
      proof, passkey, license, interview), My AI (mode, sources, style, rules,
      approval, test console, versions, export, 72-hour digest), Offers, Publish
      (basic), Earnings (minimal), Team and settings, License and sponsorships. *Missing:*
      passkey registration, the S-C14 interview and S-C7 Publish. Creator setup is drawn only
      at desktop width, but under option A creators set up in the web Studio on a phone.
- [~] 4E **Slice 2, calls and native** (4E to 4I share one [canvas](https://claude.ai/artifact/SuT31u7iaBNPVaHqAMbBFT), `design/phase4e-4i/`): call screens for fan and creator
      (pre-call, waiting, connected, reconnecting, every outcome), offering
      times, native app (push, incoming call, in-app purchase sheets, offline). *Drawn:*
      before the call, connected (Night), after the call, the creator offering times, the lock
      screen and native membership purchase.
- [~] 4F **Slice 3, producer and sharing**: share cards and their verification
      pages, public answers with credits, Publish (full), Insights and producer,
      AI voice notes. *Missing:* Publish (full), and the share card's handle choice and
      revocation.
- [~] 4G **Slice 4, the pass**: pass inside You, Discover markers, slot
      replacement, pool earnings. *Missing:* slot replacement.
- [~] 4H **Ops console** (proposed; not in the source docs): verification review,
      safety cases, disputes, pauses and license suspension. *Drawn:* the safety queue and a
      dispute.
- [~] 4I **Notifications and email**: every row of Product Design section 9 as
      push, email and in-app designs. *Drawn:* every notification type with its sender label,
      preview and never-rule, a push board, and two emails.

## Phase 5: prototypes

Canvas: [Qelvora · Prototypes](https://claude.ai/artifact/BCbknq2yt777Du9u8c4Yep), snapshot in `design/phase5-prototypes/`.

- [x] 5.1 Fan: from a creator's link in bio to a first useful, cited answer in
      under two minutes.
- [x] 5.2 Fan: asking Maya to step in → packet → waiting → a signed reply →
      share card.
- [x] 5.3 Creator: the daily five minutes (post a Note, react to replies, work
      the queue, review and send a draft).
- [x] 5.4 Creator: onboarding to a published AI and its first handled conversation.
- [x] 5.5 The comprehension-test prototype for T-21.

*Stale:* the prototypes still show "Continue with Pantopus" and the forbidden "What Maya will see"
heading (see [Stale boards](#stale-boards)).

## Phase 6: audit and handoff

Audit: [`docs/audit/AUDIT.md`](audit/AUDIT.md) (14 findings, 13 fixed, 1 open proposal; canvases not visually verified). Handoff: [`design/handoff/`](../design/handoff/).

- [x] 6.1 Audit every screen against the invariants, the identity rules, the copy
      system and the honest-state rules; log each finding and its fix.
- [x] 6.2 Accessibility audit (contrast in both themes, focus order, screen-reader
      labels before bodies, reduced motion, color-blind simulation).
- [x] 6.3 Developer handoff: tokens as code, component specs and states, and the
      screen-to-endpoint map from the System Architecture.

## Missing launch surfaces

Launch surfaces with no design, from the consolidation review (plan section 3.2). Phase 2 of the
[launch plan](LAUNCH_PLAN.md#8-the-road-to-the-pilot) designs them first.

- **Sign-in and onboarding:** option D sign-in (Apple and Google, date of birth, the under-18
  refusal, sign-in failure, handle taken).
- **The thread:** the S-F6 memory card, the open-loop follow-up and the intro-card offer; 12 of
  the 21 launch honest states; the creator's hand back.
- **Money:** web membership checkout, 3-D Secure, the app-to-web request hand-off and Play
  Billing.
- **Studio:** S-C7 Publish and the S-C14 interview; passkey registration, pending review and lost
  device; signing sheets for each act type; FAQ-set authoring; license switches and Pause
  everything; the Today screen.
- **Sharing:** the share card's handle choice and revocation.
- **Safety, account and ops:** report, block and crisis UI; delete account and notification
  settings; the ops reviews and pauses.
- **Measurement:** the pilot aggregate view and the full T-21 study kit.

## Stale boards

Boards that a later decision overtook (plan section 3.2). Fix them when the screen is next
designed; the code follows the decision, not the board.

| What is stale | Where it is drawn | The decision it contradicts |
| --- | --- | --- |
| "Continue with Pantopus" | Nine boards in the review's count, among them 4A Welcome, the 4D canvas, the prototypes canvas and the Button component | Option D sign-in and the native wording "Sign in to continue" (BRIEF decision log) |
| "Sign with Face ID" | The SigningSheet component and 4C "Review and sign" | Option A: creators sign with a passkey in the web Studio |
| Creator setup only at desktop width | 4D "Get verified and set up" | Option A: creators work in the web Studio on their phones |
| Deferred voice, call and public modes | Among others, 4A Packet, 4B Access and Requests, and 4D Offers and Earnings | The launch scope is written replies (launch plan, section 4) |
| One signature for accept and send | 4C "Review and sign" ("Accept and send") | INV-22 is an open founder call |
| Notes as the first Studio tab | The StudioTabBar and Sidebar components | Today is the first tab (2026-10-15), with the home glyph (2026-11-01) |
| "What Maya will see" | 4A Packet and the 5.2 step-in prototype | Product Design S-F7 requires "Included in your request" |

## Answers to the open questions

From Brief section 15. Approved on 2026-09-25 unless marked otherwise; approved
rows are also in the Brief's decision log.

| # | Question | Answer | Status |
| --- | --- | --- | --- |
| 1 | Stale trial wording | Follow D-26 and D-23: the state is "Your free conversation has ended", shown at the next natural pause, explaining the membership with the four access lines | Approved |
| 2 | Auto-reply after 20 drafts | Follow D-12: the AI replies instantly once live; the approval policy covers only `approved_draft` | Approved |
| 3 | Fan tabs | Four tabs (Home, Discover, Requests, You) with notifications behind a bell on Home; the pass lives in You and becomes a fifth tab only if testing fails | Approved |
| 4 | Studio navigation on a phone | Notes · Requests · Threads · My AI · More (Offers, Publish, Insights, Earnings and team) | Approved; Today replaced Notes as the first tab on 2026-10-15 (BRIEF decision log) |
| 5 | Approved-draft treatment | Explore all three in phase 2; choose by the comprehension test, not by taste | Decided in Phase 2 |
| 6 | "Studio" naming | The creator app is "Qelvora Studio"; the sample tier is "Kiln Club"; Devon is the second sample creator | Approved |
| 7 | Theme default | Follow the system setting; both themes first-class | Approved |
| 8 | Discover lead | Search by need with three example queries, categories below | Approved (source recommendation) |
| 9 | Studio density | Mobile-first for Notes, Requests and Threads; desktop-first for My AI and Insights; everything works on both | Approved (source recommendation) |
| 10 | AI vs human voice player | Same player shape, different identity: the label, glyph and color of the state, the Signed marker and "Recorded by Maya" on human notes, and an "AI voice" chip plus the spoken tag on AI notes | Decided in Phase 3 |
| 11 | Ops console | Design a minimal console in 4H | Approved |

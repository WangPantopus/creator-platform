# Qelvora design plan

The plan for designing Qelvora end to end: UX research, visual direction, the
design system, every screen and state, prototypes, and an audit against the
source contracts. Scope is **full** (every build slice), pilot screens first.
Read [BRIEF.md](BRIEF.md) before working on any phase.

Status keys: `[ ]` not started · `[~]` in progress · `[x]` done. Record the
link to each published artifact next to its item when it exists.

W3 implementation checkpoint,2026-10-02: [preserved privacy61 and real fan export](../artifacts/workstreams/W3/increment-66/20261002-privacy61-handoff/run.md). Personally operated web Light/Night390 with a genuine saved request and four explicit blocked domains; current native builds pass, current native UI and full A–I remain incomplete. [Successor handoff](workstreams/handoffs/W3-mac-studio-2026-10-02.md). The [final source-pin correction](../artifacts/workstreams/W3/increment-67/20261002-cursor-source-pin/run.md) matches the corrected held privacy SQL without activating it; [abort cleanup correction](../artifacts/workstreams/W3/increment-68/20261002-cursor-abort-cleanup/run.md) retains the client through cancellation and rollback, with real held-purpose qualification still open. No design/implementation completion checkbox is advanced from this partial acceptance.

## Where the work lives

| Deliverable | Home | Mirror in this repo |
| --- | --- | --- |
| Research report, personas, journeys | [Qelvora UX Research](https://claude.ai/code/artifact/11bc3a89-d2f4-4399-8e3b-ecfbb2c6f803) (shared doc on claude.ai) | [`docs/research/UX_RESEARCH.md`](research/UX_RESEARCH.md) |
| Visual directions | [Qelvora Visual Directions](https://claude.ai/artifact/MyZ9H9crjcdKqE196Pk6su) (Design canvas) | [`design/phase2-directions/`](../design/phase2-directions/) |
| Design system | [Qelvora](https://claude.ai/artifact/AyfModKVToY2VeqMACNxFU) (Design System artifact) | [`design/design-system/`](../design/design-system/) (tokens, brand book, components, previews and tools) |
| Screens and states | Design canvas artifacts on claude.ai, one per area | Links in this file |
| Prototypes | Clickable artifacts on claude.ai | Links in this file |
| Audit and handoff specs | This repo | `docs/audit/` |

## Implementation continuation

- [x] October 8, 2026: operate the preserved conversation in launched iOS and
  Android apps, repair initial reply visibility and Android cold navigation,
  and verify citations, consent, theme and account boundaries through actual UI.
  [Connected native evidence and remaining acceptance](../artifacts/pr-review/2026-10-08/native-connected-journey/README.md).
  Full native feature/design acceptance remains open.

**October 8 resumed plan:** [complete product finish plan and completion criteria](operations/product-finish-plan-2026-10-08.md).
The first increment binds shadow comparison evidence to its exact current sample
cohort. The real privacy producer and actual existing-version upgrade remain
open; this does not advance full journey or design acceptance.

- [x] October 8, 2026: repair shadow sample replacement, bind comparison evidence
  to the current cohort, and reject stale/expired evidence at replay/publication.
  Backend build and all 57 tests pass, including 11 PostgreSQL cases.
  [Bounded evidence and remaining producer work](../artifacts/pr-review/2026-10-08/shadow-evidence-lifetime/README.md).

**October 8 handoff:** [#335 is merged; successor instructions, remaining acceptance and retained resources](operations/session-handoff-2026-10-08.md). All original PRs are resolved. Product latency, safe upgrades and the broader finish plan remain open.

- [x] October 7, 2026: inventory and continuation decisions for all 18 original draft PRs, with per-file preservation evidence and outstanding acceptance in the [reconciliation ledger](operations/pr-reconciliation-2026-10-07.md).
- [x] October 7, 2026: reused the missing #145 restoration protections in the #132 continuation; [source/built-runtime database fault evidence](../artifacts/pr-review/2026-10-07/restoration-reconciliation/README.md). This is a bounded runtime repair, not a completed generation journey.
- [x] October 7, 2026: connect installed privacy consumers, original Agent accounting owners and the usage-expiry lifetime in #132; [source/standalone operation and failure evidence](../artifacts/pr-review/2026-10-07/usage-accounting-host/README.md). Complete privacy and generation journeys remain open.
- [x] October 7, 2026: connect Conversation export and the original protected Commerce stream; source and standalone exports plus a source staging-closure check are recorded in [the bounded evidence](../artifacts/pr-review/2026-10-07/conversation-commerce/README.md). Preserve the original #262 publication signal checks and account for #262/#301/#302 in #132. Full privacy and publication acceptance remain open.
- [x] October 7, 2026: preserve native Commerce, iOS recorder cleanup and Studio media sources from #284/#303/#305 with current integration repairs and [bounded validation](../artifacts/pr-review/2026-10-07/native-media-reconciliation/README.md); physical-device and complete journey acceptance remain open.
- [x] October 7, 2026: reconcile #247 terminal cancellation and #192 finite feedback source, including actual sequence-catalogue correction and original Trust boundaries; [preservation evidence and retained gates](../artifacts/pr-review/2026-10-07/terminal-feedback-reconciliation/README.md). Generation and feedback activation remain closed.
- [x] October 7, 2026: preserve #282 original call offers, signing and exact retries; [source and validation](../artifacts/pr-review/2026-10-07/call-source-reconciliation/README.md). Successful scheduling/provider/hardware journeys remain open.
- [~] Reconcile and qualify the retained implementations in that ledger's journey order. Design deliverables marked complete below do not establish functional application acceptance. The [project checkpoint](operations/project-continuation-2026-10-07.md) preserves product, architecture and current engineering context.
- [x] October 7, 2026: strengthen output grounding with complete sentence spans and exact authorized quotes; operate six boundary cases and two real fan replies with original accounting. [Evidence and preserved failures](../artifacts/pr-review/2026-10-07/generation-performance-grounding/README.md).
- [x] October 7–8, 2026: fix the 2,500-token context budget being counted as UTF-8 bytes; retain the source in the actual longer conversation, reduce repeated current-authority reads, and complete revision 14 first publication and three settled fan replies. [Reproduction, live operation and custody](../artifacts/pr-review/2026-10-07/generation-context-latency/README.md).
- [x] October 8, 2026: preserve published revision 12/13 engine behavior and immutable fingerprints while new drafts use revision 14; bind shadow evidence to both engines and invalidate old comparisons. All 14 historical differential cases pass; the current compiled host serves an existing revision 13 publication without republishing. Equivalent catalogue prefilters retain all checked privilege/policy drift. [Compatibility, live operation and custody](../artifacts/pr-review/2026-10-08/generation-published-compatibility/README.md).
- [~] Generation latency: latest compiled useful answer is fully visible at 26.992s with a 3.767s HTTP acknowledgement; server acceptance-to-completion is 23.820s. Earlier revision 14 observations (22.512s visible / 1.101s acknowledgement) remain preserved; these are not controlled comparisons or percentile qualification. Retain the 300ms acknowledgement, 2.5s warm/4s cold first useful sentence and 8s completion targets. Existing-version upgrades still require the unconnected privacy-safe shadow feed; historical engine support preserves original limitations until an evaluated upgrade.

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
      the 72-hour digest item.
- [x] 3.6 Shared: navigation (fan tabs, studio tabs plus More, desktop sidebar),
      sheets, dialogs, toasts, empty, loading and error patterns, offline banner,
      notification rows, email templates, share card. The email layout is one
      component; each email's wording is designed with its screen in Phase 4.
- [x] 3.7 Content guidelines: the copy system (fixed sentences, never-words,
      the AI's voice) as usage rules on the components.

## Phase 4: screens (every state, light and dark, phone and desktop where relevant)

- [x] 4A **Fan core, pilot** ([canvas](https://claude.ai/artifact/CVDK7KgFQ5rL3rMekhJBcF); first pass: 10 screens, see `design/phase4a-fan-core/`): public creator home (plus post, invite and
      Instagram entrances), onboarding, processor consent, thread (every state),
      memory card, packet, spend-limit step and checkout sheet, request status and
      receipt, a Note in the thread, notifications.
- [x] 4B **Fan account and discovery, pilot** ([canvas](https://claude.ai/artifact/VZNMhK2CdYKHF9pECEojQE), `design/phase4b-fan-account/`): Home, Discover, creator profile
      (Access segment), post view, You, Me and privacy, spending and time,
      verification page.
- [x] 4C **Studio on phone, pilot** ([canvas](https://claude.ai/artifact/HgnU1RHdqJTS9aYN6Gpmdc), `design/phase4c-studio-phone/`): Notes and the Replies feed, Requests queue,
      packet detail and reply composer, Threads with takeover and handback,
      passkey signing sheet, weekly impact digest.
- [x] 4D **Studio on desktop, pilot** ([canvas](https://claude.ai/artifact/K465Z5XjExNgXWLgM3Ln3u), `design/phase4d-studio-desktop/`): verification and onboarding (external
      proof, passkey, license, interview), My AI (mode, sources, style, rules,
      approval, test console, versions, export, 72-hour digest), Offers, Publish
      (basic), Earnings (minimal), Team and settings, License and sponsorships.
- [x] 4E **Slice 2, calls and native** (4E to 4I share one [canvas](https://claude.ai/artifact/SuT31u7iaBNPVaHqAMbBFT), `design/phase4e-4i/`): call screens for fan and creator
      (pre-call, waiting, connected, reconnecting, every outcome), offering
      times, native app (push, incoming call, in-app purchase sheets, offline).
- [x] 4F **Slice 3, producer and sharing**: share cards and their verification
      pages, public answers with credits, Publish (full), Insights and producer,
      AI voice notes.
- [x] 4G **Slice 4, the pass**: pass inside You, Discover markers, slot
      replacement, pool earnings.
- [x] 4H **Ops console** (proposed; not in the source docs): verification review,
      safety cases, disputes, pauses and license suspension.
- [x] 4I **Notifications and email**: every row of Product Design section 9 as
      push, email and in-app designs.

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

## Phase 6: audit and handoff

Audit: [`docs/audit/AUDIT.md`](audit/AUDIT.md) (14 findings, 13 fixed, 1 open proposal; canvases not visually verified). Handoff: [`design/handoff/`](../design/handoff/).

- [x] 6.1 Audit every screen against the invariants, the identity rules, the copy
      system and the honest-state rules; log each finding and its fix.
- [x] 6.2 Accessibility audit (contrast in both themes, focus order, screen-reader
      labels before bodies, reduced motion, color-blind simulation).
- [x] 6.3 Developer handoff: tokens as code, component specs and states, and the
      screen-to-endpoint map from the System Architecture.

## Answers to the open questions

From Brief section 15. Approved on 2026-09-25 unless marked otherwise; approved
rows are also in the Brief's decision log.

| # | Question | Answer | Status |
| --- | --- | --- | --- |
| 1 | Stale trial wording | Follow D-26 and D-23: the state is "Your free conversation has ended", shown at the next natural pause, explaining the membership with the four access lines | Approved |
| 2 | Auto-reply after 20 drafts | Follow D-12: the AI replies instantly once live; the approval policy covers only `approved_draft` | Approved |
| 3 | Fan tabs | Four tabs (Home, Discover, Requests, You) with notifications behind a bell on Home; the pass lives in You and becomes a fifth tab only if testing fails | Approved |
| 4 | Studio navigation on a phone | Notes · Requests · Threads · My AI · More (Offers, Publish, Insights, Earnings and team) | Approved |
| 5 | Approved-draft treatment | Explore all three in phase 2; choose by the comprehension test, not by taste | Decided in Phase 2 |
| 6 | "Studio" naming | The creator app is "Qelvora Studio"; the sample tier is "Kiln Club"; Devon is the second sample creator | Approved |
| 7 | Theme default | Follow the system setting; both themes first-class | Approved |
| 8 | Discover lead | Search by need with three example queries, categories below | Approved (source recommendation) |
| 9 | Studio density | Mobile-first for Notes, Requests and Threads; desktop-first for My AI and Insights; everything works on both | Approved (source recommendation) |
| 10 | AI vs human voice player | Same player shape, different identity: the label, glyph and color of the state, the Signed marker and "Recorded by Maya" on human notes, and an "AI voice" chip plus the spoken tag on AI notes | Decided in Phase 3 |
| 11 | Ops console | Design a minimal console in 4H | Approved |

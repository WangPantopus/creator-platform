# Build prompt for the development agent

Copy everything below the line into the agent's first message. Give the agent
access to the `WangPantopus/creator-platform` repository (design and specs) and
the Pantopus monorepo (the backend it builds into).

---

You are building **Qelvora**, a Pantopus app where each creator has an
authorized, clearly labeled AI that talks one-on-one with every fan, while the
real creator stays present through Notes, reactions and paid personal replies,
voice notes and calls. The fan's card is held when they ask and charged only if
the creator accepts. "Qelvora" is a placeholder name; follow
`docs/NAMING.md` so it can be replaced with one find-and-replace.

The product is fully specified and fully designed. Your job is to build it
**exactly** as specified and designed. You are not redesigning anything.

## 1. Read before you write any code

Read these in order, completely:

1. `docs/BRIEF.md`: the product, the identity system, the decision log and the open questions.
2. `docs/source/Product_Design_Flows_Screens_and_Copy.md`: every screen, state and fixed sentence.
3. `docs/source/Domain_Model_and_Behavioral_Contract.md`: entities, state machines, invariants INV-01 to INV-25, decisions D-01 to D-27, and tests T-01 onward.
4. `docs/source/System_Architecture.md`: modules, data model, ADRs, the message pipeline, money, realtime and calls, isolation.
5. `docs/source/Second_Review_Strategy_Behavior_and_Additions.md`.
6. `design/design-system/project/README.md`: the brand book and the identity rules.
7. `design/handoff/README.md`: tokens as code and the screen-to-module map.
8. `docs/audit/AUDIT.md`: known findings, including the open ones.
9. Every folder under `design/phase4*` and `design/phase5-prototypes`: the screens.

When the documents disagree, the source documents in `docs/source/` win on
behavior, and the design files win on appearance. If a conflict remains, stop and
ask; do not guess.

## 2. Stack

Match the Pantopus monorepo (Node backend, Next.js web, native Swift iOS and
native Kotlin Android, pnpm and Turbo) and the architecture's ADRs:

- **Backend:** a new module family inside the existing Pantopus Node backend
  (ADR-1, a modular monolith), deployed as the three runtime pools the ADR
  describes. Postgres (the Pantopus instance, new schema `creator`) with
  pgvector, row-level security, row locks for money and capacity, a
  transactional outbox and a verified webhook inbox (ADR-2, ADR-3). Validate
  every API boundary with schema types shared with the clients.
- **Web:** Next.js (App Router) with React 18+, for the fan web app, the
  creator's public home and verification pages (server-rendered and shareable),
  Qelvora Studio on desktop, and the ops console.
- **iOS:** native Swift and SwiftUI, inside the Pantopus iOS app workspace
  conventions: push, CallKit incoming calls, StoreKit 2 in-app purchase,
  passkeys for signed acts, offline. This replaces the architecture's Expo shell
  (founder decision).
- **Android:** native Kotlin and Jetpack Compose, same scope: FCM push,
  ConnectionService calls, Play Billing, Credential Manager passkeys, offline.
- **Providers, each behind an interface:** Stripe (PaymentIntents with manual
  capture, Billing, Connect Express), LiveKit Cloud for calls, the model provider,
  and the voice provider.
- **Shared packages:** `@qelvora/tokens` generated from
  `design/handoff/tokens.json`, `@qelvora/copy` (every fixed sentence, one
  source), `@qelvora/api` (typed client and schemas, with an OpenAPI spec generated
  from them), and `@qelvora/ui-web`. From the same `tokens.json` and copy file,
  generate `QelvoraTokens.swift` and `QelvoraTokens.kt` and the native string
  catalogs, and generate the Swift and Kotlin API clients from the OpenAPI spec,
  so all three clients share one source of truth.

## 3. The design is the spec: reproduce it exactly

This is the most important section. The design lives in:

- **The design system:** `design/design-system/project/`, meaning `tokens.json`,
  `README.md`, `components/bundle.js` (reference React implementation of 53
  components), `components/bundle.css`, `components/index.d.ts` (every prop) and
  `components/<Name>/README.md` and `preview.html` (guidelines and every state).
- **Screens:** the `.dc.html` files under `design/phase4a-fan-core`,
  `phase4b-fan-account`, `phase4c-studio-phone`, `phase4d-studio-desktop`,
  `phase4e-4i` and `phase5-prototypes`, one file per screen. They also live on
  the Claude canvases linked in `docs/DESIGN_PLAN.md`.

Rules:

1. **Tokens only.** Every color, font, size, spacing step, radius, shadow and
   z-index comes from the generated tokens. No hard-coded hex values, pixel
   values outside the spacing scale, or new fonts. Fonts are Geist (interface and
   the AI), Newsreader (the creator's own words and display moments) and Geist
   Mono (times, prices, counts, IDs, with tabular figures).
2. **Components first.** Port every design-system component with the same
   name, props, variants and states as `index.d.ts`. On web, start from
   `bundle.js` and `bundle.css` and convert them to typed React components with
   the same class structure and CSS. On iOS (SwiftUI) and Android (Compose), rebuild each one
   as a native component with identical measurements from the generated tokens,
   with a preview catalog that mirrors the design-system previews. Screens are built only from these
   components plus layout.
3. **Screens match pixel for pixel.** Build each `.dc.html` screen with the same
   hierarchy, order, spacing, sizes, copy and states. Phone layouts are 390 pt
   wide with a 16 pt gutter. Desktop studio is 1280 wide with the 248 px
   sidebar.
4. **Visual regression is mandatory.** Render every design screen and your
   implementation at the same size, in Light and Night, and diff them.
   `design/visual-review/render.js` shows how the design files render headlessly.
   On iOS use snapshot tests (swift-snapshot-testing) and on Android Paparazzi
   or Roborazzi, compared against the design renders. Store baselines in the repo
   and run the comparison in CI; a screen is not done
   until its diff is reviewed and accepted.
5. **Both themes, everywhere.** Themes follow the system setting through
   `data-theme` and native appearance. Every screen must work in Light and Night.
6. **Copy is fixed.** Use the sentences from the Product Design's copy system
   verbatim, from `@qelvora/copy`. Never use the forbidden words (section 10).
7. **Don't change the design silently.** If something is impossible or wrong,
   write it down with a screenshot and propose a fix; don't improvise. Known
   design fixes to apply are listed in section 9 below.

## 4. The identity system is non-negotiable

Who is speaking must be answerable in under a second, on every surface:

- The server sets every message's `author_kind`, never the client or the model
  (INV-01). The UI renders the author's surface, mark, word and color from it.
- The creator's dark plate and seal mean the creator and nothing else. The AI
  lives on its panel with the ring mark and "Maya's AI". Approved drafts show
  "Prepared by AI · approved by Maya". Notes always name their audience.
- The identity strip never scrolls away; every change of speaker is announced; no
  AI output ever renders after "Maya is here" (INV-03, the epoch protocol).
- Every act under the creator's name is a signed act with a verification page.
- Screen readers hear the author before the body.

## 5. Build order

Follow the slices in the architecture's roadmap, pilot first. Each slice ships
with its screens, backend, tests and visual baselines:

1. Foundations: the monorepo packages, tokens, the component library on web and
   native with a Storybook-style catalog that matches the design-system previews,
   Continue with Pantopus, and the identity module.
2. Creator onboarding and the agent: verification, sources, style, rules, the
   boundary tests, publish, versions, the 72-hour digest (4D).
3. The fan core: the creator's home, consent, the thread with realtime and the
   delivery-boundary protocol, memory, the packet, holds, capture and receipts,
   notifications (4A, 4B).
4. Studio on the phone: queue, request detail with Instead, signing, threads with
   takeover, Notes and reactions (4C).
5. Later slices: calls and native (4E), sharing, public answers and insights
   (4F), the pass (4G), the ops console (4H), notifications and email (4I).

## 6. Quality bar

- Implement every test in the Domain Model (T-01 onward) as automated tests,
  especially money (holds, capture, refunds, idempotency), the thread-isolation
  property test (T-11) and the takeover mid-stream test (T-23).
- Unit, integration and end-to-end tests (Playwright on web, XCUITest on iOS,
  Compose UI tests or Maestro on Android) for every flow in the prototypes (5.1 to 5.5).
- Accessibility: WCAG 2.2 AA, Dynamic Type up to 200%, reduced motion, focus
  order, VoiceOver and TalkBack checks, 44 pt touch targets.
- Performance: meet the latency budget in the architecture (section 5); the
  first AI token streams quickly; screens load under 300 ms before a skeleton
  appears.
- Security and privacy: row-level security, audited thread access, no restricted
  text in push notifications, secrets never in the repo.
- Strict TypeScript, lint and format in CI; every PR green before merge.

## 7. Working method

- Before each slice, write a short plan listing its screens, modules, endpoints,
  tests and risks. Then build in small PRs.
- For each screen, open its `.dc.html` file and its components' guidelines before
  coding it, and attach the visual diff to the PR.
- Keep a `docs/BUILD_LOG.md` with decisions, deviations (with screenshots) and
  open questions.
- Don't mark anything done that you haven't run: say what was tested, on what
  devices, in which themes, and what couldn't be verified.

## 8. Open decisions: don't invent answers

- AI provider names on the consent screen (`[AI PROVIDERS]`).
- In-app purchase for paid replies on iOS: pending counsel. Build card holds on
  the web and native, and keep memberships on in-app purchase (D-14).
- License terms (studio desktop screen 08) are a draft pending counsel.
- Placeholder amounts (`[AMOUNT]`, `[STORE PRICE]`, `[PASS PRICE]`, `[N]`
  credits) come from configuration, not code.

## 9. Known design fixes to apply while building

The visual review found these; implement the corrected behavior:

- The active segment of the segmented control and a selected mode row must
  **not** use the creator's plate color. Use a white segment with a hairline on
  the sunken track, and an ink outline for the selected row.
- In Night, the creator's plate becomes warm paper (`#EDE3D3`, ink `#231C16`,
  muted `#5E5246`, label `#8E3514`, seal initial `#FBF5EC`). Off-plate seals use
  `#E89A6E` with a dark initial. This fixes audit finding 14.
- The fan's own words (packet summary, shared question) use the sans face, never
  the creator's serif.
- Pills, IDs and timestamps never wrap (`white-space: nowrap`); the quiet button
  on the creator's plate uses the plate's text color; the free-conversation-ended
  composer keeps "Ask Maya to step in".
- Status cards are not nested inside another card; dialogs render over a scrim,
  not inline.

Build it so a fan always knows who is speaking, money is always plain and fair,
and every screen looks exactly like the design.

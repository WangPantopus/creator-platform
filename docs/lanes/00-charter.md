# Qelvora: the picture

Read this first. Every lane works from it. It says what we are building and for whom, what
"great" feels like, what can never bend, what is already decided, and who owns what. When a
lane brief and this charter disagree, stop and ask the integrator.

## 1. What we are building

Qelvora (a placeholder name, always written exactly as in [NAMING](../NAMING.md)) is a
Pantopus app. Each creator has an authorized, clearly labeled AI that talks one-on-one with
every fan. It is useful, it cites the creator's own work, and it remembers the fan. The real
creator stays present through signed Notes and reactions and can step in. A fan can pay for
the creator's personal attention: a signed written reply, with the money held when the
request is made and charged only if she accepts.

Two kinds of people use it, and they are very different:

- **Fans.** Many. Adults on phones. They arrive from a link in a creator's bio or post, want a
  good answer in under two minutes without paying, and come back if it remembers them.
- **Creators.** Few. They set the AI up once on a desktop, then spend about five minutes a day
  on a phone: a Note, a few reactions, the queue.

Pantopus is the parent company and the shared account system. Never rename it. Sample content
(Maya, Kiln Club, @kilnfire, Devon, Priya, Glazeco) is not product naming.

## 2. The five moments the launch must get right

We make five moments extraordinary rather than fifty features adequate.

1. **The first answer** (minutes 0 to 2): fast, in the creator's voice, cited, free, no card.
2. **Being remembered:** next visit, the AI follows up on an open loop; the fan can see and edit
   what it remembers.
3. **The person shows up:** a Note in the fan's own thread, "Maya reacted to your reply", a
   signed reply. Cheap for the creator, valuable to the fan. This is the daily habit.
4. **Asking for her, with honest money:** a packet, "charged only when she accepts", a signed
   reply, a keepsake receipt. A decline is gentle and free.
5. **The creator's five minutes, and proof it worked:** a Note, reactions, the queue, and a
   weekly "you helped N people" digest.

The share card (a signed written reply with its public verification page, as an image and a
link) is also in scope for the pilot.

## 3. What "great" feels like

- **Honest.** No setting hides the AI label. The AI never says the creator read, remembers or
  felt anything. An approved draft is always shown as one.
- **Calm and premium.** Quiet luxury: craft, calm, service and honesty, never status or
  exclusivity language. No guilt trips, no meters, no purchase offered as the way out of a
  failure.
- **Fast.** Acknowledgment within 300 ms (p95). First approved sentence within 4.5 s p95 at
  the start of the pilot, 2.5 s warm as the target after the provider switch. Takeover visible
  within 500 ms.
- **Small.** A creator is set up in ten minutes. A fan reaches a first message in four screens.
- **Accessible and finished.** WCAG AA in Light and Night. Screen readers hear who is speaking
  before the body. Every state is designed: loading, empty, offline, error, denied.

## 4. What can never bend

### 4.1 Design principles, in priority order (the earlier rule wins)

1. Who is speaking is always answerable in under a second, on every surface.
2. The AI must be worth talking to on its own: useful, cited, remembering.
3. Access is explained by what you can do now, never by a slogan.
4. The handoff is the product: packet, mode, price, deadline and refund rule on one screen.
5. Keep the relationship warm between human moments, without pretending.
6. The honest version of an existing industry. No setting hides the label.
7. Presence is cheaper than replies, and fans value it more.
8. Creator side: setup in ten minutes, control forever.

### 4.2 The identity system

Every message has exactly one authorship state, set by the server: `ai`, `approved_draft`,
`human_creator`, `human_call`, `human_broadcast` (a Note), `human_reaction`, `team`, `fan`,
`system`. Each has a **word**, a **glyph** and a **color**, rendered into the content itself,
never color alone. Full table: [BRIEF section 5](../BRIEF.md). The identity strip at the top of
a thread never scrolls away. The primary button in a thread is always the AI; the only
person-colored button is "Ask Maya to step in", and it opens the packet, never a payment sheet.

### 4.3 The invariants (INV-01 to INV-25)

The text of record is in the [Domain Model](../source/Domain_Model_and_Behavioral_Contract.md).
If your work needs one to bend, **stop and ask the founder through the integrator**. Do not
design around it.

| | | | |
| --- | --- | --- | --- |
| 01 Closed authorship set | 02 Approval is personal and exact | 03 One sender authority per thread | 04 Handback is announced |
| 05 The AI may remember, never claim the creator does | 06 Disclosure is persistent | 07 Pass is reach, tier is depth | 08 Retrieval is scoped by grant |
| 09 Only the promised service completes a commitment | 10 Capacity shown is capacity enforced | 11 Context is thread-local | 12 Consent never expands |
| 13 Packet disclosure is exact | 14 Pantopus boundary | 15 Deletion propagates | 16 Charge only on acceptance |
| 17 The AI creates no obligation | 18 Every transition is idempotent | 19 Safety is not an access tier | 20 Mode governs guardrails |
| 21 The AI never sells | 22 Named human acts are signed | 23 Sensitive memory needs consent | 24 One-to-many is always labeled |
| 25 Paid influence is disclosed | | | |

### 4.4 Copy is part of the contract

Use the fixed sentences verbatim and never use the forbidden words
([BRIEF section 11](../BRIEF.md)). The product is `Qelvora` / `qelvora` / `QELVORA`: one
unbroken word, no possessive, no abbreviation. User-facing text lives in `config/copy.json`
and goes through the copy review checklist in the working agreement.

## 5. Decisions already made

| Date | Decision |
| --- | --- |
| 2026-10-08 | Build around the five moments. The pilot is architecture slice 1 plus a minimal share card. |
| 2026-10-08 | Phone apps first. The fan site is the first answer from a link with no install. |
| 2026-10-09 | **Option A.** The pilot's native app is the fan app. Creators use the Studio in the phone browser (installable, passkey signing). A separate native "Qelvora Studio" app follows after the pilot. The fan app gets no new creator features. App ids: `com.pantopus.qelvora` and, reserved, `com.pantopus.qelvora.studio`. |
| 2026-10-08 | The Anthropic API is the production provider, switched before the first real creator publishes, as one engine revision, with the embedding provider chosen first. |
| 2026-10-08 | Comparison stays installed and off. The creator-authored FAQ set replaces the fan-sample publish gate. |
| 2026-10-08 | Paid replies in the native apps (Q04): continue on the web during the pilot. |
| 2026-10-08 | Tests are required for money and for sign-in (the earlier "no new test code" rule is lifted for those). |
| 2026-10-09 | Aim for a private web alpha first (about 10 invited adults, web only, payments in Stripe test mode), then the TestFlight and closed-testing pilot, then the public release. |

Still open, owned by the founder: the pilot sign-in option and the 18+ method
([identity contract](../operations/pantopus-identity-contract.md)), hosting and domain,
store accounts, Stripe keys, written replies before voice notes, and the launch-quality bars.

## 6. In and out for the pilot

**In:** fan site and fan apps (onboarding with processor consent, Home, Discover, creator page,
thread in every state, memory, packet and checkout, status and receipt, notifications with push,
me and privacy, Notes in the thread, spending, verification page, share card); creator Studio on
the web (verification and onboarding, My AI, requests queue, packet with signing, threads with
takeover and audit, Offers, basic Publish, minimal Earnings, Team, Notes and replies, license,
weekly digest); safety, a minimal ops console, export and delete, push, pilot instrumentation,
the "who wrote this?" study.

**Out, planned for later (not dropped):** one-to-one calls, the pass and pool earnings, voice
notes (paid and AI), Insights and the producer, public answers and credits, the full publishing
library, fan-derived comparison replay, native configuration screens, the native Studio app,
Instagram comment automation, referral incentives, extra locales, tips. Do not build these. If
your work would touch one, say so in your report.

## 7. Where things stand

Read [CURRENT](../operations/CURRENT.md) (state and plan), the
[launch plan](../LAUNCH_PLAN.md) (scope and order) and the
[launch review](../operations/launch-review-2026-10-08.md) (what the code does, with file
references). In one paragraph: the engine is strong (identity labels, signing, money rules,
delivery, safety) and passes its checks, but only the development host runs the product. The
connections to a real person are mostly missing: sign-in and hosting, speed, memory, Note
delivery and push, the money scheduler, a creator flow that is two taps, and native parity.

## 8. Who owns what

Each backend module and each web feature folder has exactly one owner. Native splits by
platform. Shared pieces belong to the integrator. A change to a file you do not own is a
**ticket to its owner** (see the working agreement), unless it is a small additive change the
integrator approves.

| Lane | Backend (`apps/backend/src`) | Web (`apps/web`) | Other |
| --- | --- | --- | --- |
| 1 Identity and trust | `modules/access`, `modules/trust`, `modules/identity` except the generation and publication files | `features/identity`, `app/{auth,identity,onboarding,ops,support,trust,status}` | |
| 2 Platform and hosting | `operations`, new production composition files | | `infra/*` (except `migrations.json`), deployment, workers hosting |
| 3 AI engine | `modules/{agent,conversation,ingestion,sources}`, `modules/identity/{generation-*,public-ai-*,publication-*}` and their `schema-*.sql`, `workers`, `realtime` | `features/{conversation,creator-ai}`, `app/{chat,threads,you}` | |
| 4 Money | `modules/{commerce,payments}` | `features/commerce`, `app/{commerce,requests}` | money tests |
| 5 Presence and reach | `modules/{growth,content}` | `features/{growth,content}`, `app/{home,discover,creators,invite,share,verify,notifications,unsubscribe,sitemap.ts}` | |
| 6 Creator Studio | `modules/studio` | `features/studio`, `app/studio`, the app shell (`layout.tsx`, `theme.tsx`, `globals.css`, `error.tsx`), PWA | `packages/ui-web` use |
| 7 Phone apps | | | `apps/ios`, `apps/android` |
| Integrator | `server.ts`, `integration.ts`, `config.ts`, `features.ts`, `app.ts`, `core`, `db` | `app/api` proxies are owned by the lane of the feature they serve | `infra/migrations.json`, `packages/*`, generated code, `config/*`, `docs/*`, `.github/*`, `scripts/*` |

Frozen (planned for later, owner is the integrator, do not extend): `modules/media`,
`modules/session`, `features/calls`, `features/media`, `app/calls`, `app/media`.

## 9. Where to look, and what wins

1. [`docs/source/`](../source/) is authoritative for behavior. When the brief and a source
   disagree, the source wins and the brief is corrected.
2. [`docs/BRIEF.md`](../BRIEF.md) is the condensed product, identity system, screen inventory,
   copy system and decision log.
3. [`design/`](../../design/) is authoritative for appearance. The corrected tokens are
   `design/handoff/tokens.json` plus the corrections in `docs/BUILD_PROMPT.md` section 9
   (neutral selected states, warm-paper Night creator plate, fan words in sans, no-wrap pills,
   dialogs over a scrim). The `.dc.html` boards do not render standalone; use
   `scripts/visual-reference.mjs`.
4. [`docs/workstreams/`](../workstreams/) is history and some working contracts. Q13
   (off-the-record) and Q14 (library) are recorded in `coordination/W3.md` and `status/W5.md`
   although `DECISIONS.md` still lists them as open.
5. [`docs/operations/`](../operations/) records the current state.

Glossary: **packet**, the request with its disclosure set; **commitment**, what a captured
request promises; **hold** and **capture**, the card authorization and its settlement; **Note**,
a one-to-many human post; **signed act**, a passkey assertion bound to a content hash;
**control epoch**, the counter that orders AI and human sending in a thread; **thread scope**,
the isolation boundary for one creator and fan pair; **engine revision**, the pipeline
revision a published version is bound to by fingerprint.

## 10. Who decides what

- **A lane decides** how to build inside its scope and contracts.
- **The integrator decides** cross-lane contracts, migration order and merge timing.
- **The founder decides** anything that touches an invariant, the safety posture, money
  semantics, user-facing copy, brand, scope, legal or compliance, and any spending. Lanes ask
  through the integrator and propose a default.

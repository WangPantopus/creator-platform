# Launch review: what the code does today

Point-in-time record, 2026-10-08, main at `4bdf3e1cd` with PRs #351 to #353 still open.
The decisions and the sequence built on it are in [LAUNCH_PLAN](../LAUNCH_PLAN.md).
Nothing here changes what [source/](../source/) requires.

**Method.** Seven read-only reviews (Android, iOS, comparison, growth and entry, the AI
pipeline, presence and money, the three open PRs), then spot checks of the
highest-impact claims against the code. Nothing was run; timings come from retained
artifacts. *Inferred* means reasoned from code, not observed. Paths are relative to the
repository root; line numbers refer to main unless a PR is named. Re-verify a line before
building on it. Sizes (S up to 3 days, M about a week, L two weeks or more, for one
engineer) are reviewer estimates.

**Update, later the same day.** #351, #352 and #353 were merged (`f41f297d3`,
`73360885c`, `95abce43c`); main's tree equals #353's CI-green tree. The proposals in
section 12 were applied in a follow-up documents PR, except the two `CreatorAI.tsx` fixes
in section 11, which wait for someone who can operate that panel with seeded data. The
sections below are otherwise unchanged and describe main before the follow-up.

## 1. Headline

1. **Only the development host runs the product.** `apps/backend/src/server.ts` composes
   the domain routes only when `IDENTITY_ADAPTER=development`; with any other value it
   serves health, the OpenAPI document and identity capabilities and nothing else. No
   Pantopus identity adapter exists (Q01).
2. **The engines are strong and the connections are missing.** The commerce recovery
   worker is declared and never constructed (`modules/payments/inbox.ts:67`). The growth
   stack is not composed: no notification can fire, no share can be created, no pilot
   metric is emitted. The memory processor is built only when a generator is passed and
   the host passes none (`modules/conversation/host.ts`, `runtime.ts:129`). Fans cannot
   read Notes in the composed host (`tenure` is not wired in `server.ts`; inferred).
3. **Slowness is overhead, not the model.** Most of the 19 to 27 s to the first sentence
   (roughly 15 s or more) is repeated authority re-verification, a 1 s worker poll and a
   full refetch to paint. The provider path alone takes 2.6 to 4.4 s.
4. **The phone apps cannot ship yet.** Release builds cannot sign anyone in. There are no
   universal or app links, no push, no iOS icon, entitlements or privacy manifest, and no
   native creator Studio. Paid requests are disabled in both apps.
5. **A creator cannot publish a second version in a pilot.** Any version after the first
   requires a replay on real fan questions (`modules/agent/service.ts:1085-1126`).
6. **#351 is required.** The comparison migrations cannot be removed (section 10), and
   while the comparison profile is registered, every account export fails without #351.

## 2. The five moments against the code

| Moment | Works today | Missing before a person can feel it | Size |
| --- | --- | --- | --- |
| 1 First answer | Pipeline end to end on the development host: cited, labelled, consent first, delivery gate | 19 to 27 s to the first sentence (bar 4.5 s); the guard blocks ordinary advice; the publish gate needs fan samples; entry links, creator page, invite | M to L |
| 2 Remembered | Memory chips, view, edit and delete on all three clients | Extraction and follow-up not wired; the guard cannot pass memory; only a manual "Remember" | M to L |
| 3 The person shows up | Signed Note and heart reaction on web | Fans cannot read Notes; no delivery to the thread or phone; no push; every Note reply waits for an ops decision | M to L |
| 4 Honest money | Packet, limit, hold, signed accept, capture, decline, receipt; invariants enforced | Nothing drives expiry or auto-refund; Stripe never run; the apps cannot send a request (Q04) | M to L |
| 5 The creator's five minutes | Web Studio Notes, queue and threads | Accept and deliver takes 12 taps and 2 ceremonies; no rule cards; digest empty; native Studio absent | M; L per platform natively |
| Share card | Every part except the join | Creation call, grant id, words on the verify page, share sheet | 8 to 12 days |

## 3. Cross-cutting findings

| # | Finding | Evidence | Smallest fix | Size |
| --- | --- | --- | --- | --- |
| 1 | No production composition | `apps/backend/src/server.ts` | Compose with an injected adapter, production config and the workers; the real adapter is external | M, plus L external |
| 2 | Pinned catalogues hash every relation, so any later migration changes the checksums and export and delete refuse to run until re-reviewed (inferred) | `apps/backend/src/core/purpose-catalogue.ts:35-60` | Script the catalogue regeneration and its review before the first launch migration | M |
| 3 | One serial generation worker: pool `max: 1`, 1 s poll | `apps/backend/src/workers/generation-host.ts:72` | See section 4 | M |
| 4 | Heavy client polling: identity heartbeat every 4 s re-keys screens; Android thread about 52 requests a minute | iOS and Android reviews | Push and the WebSocket frame instead of polling | M |
| 5 | Strict JSON decoding in the Android client (`ignoreUnknownKeys=false`), so any additive field breaks shipped apps | Android review | Tolerant decode | S |

## 4. Moment 1: the first answer

**Where the time goes** (retained artifacts plus code reading; single-user, one-sentence answers).

- Acknowledgement 1.1 to 3.8 s: one small model call (the safety classifier) and about
  eight transactions before the message is accepted.
- Accepted to first stored sentence: 19.4 to 20.5 s on seven retained runs, 19.1 s on the
  latest. It does not depend on the answer. Authority is re-verified about 625 times
  against the W1 catalogue and 450 times against consumer catalogues per answer (retained
  counters 715 and 512; the model agrees within 7 to 12%), plus a 1 s worker poll and
  three serial provider admissions.
- Stored to visible: at least 1.4 to 2.9 s (inferred). The WebSocket frame only triggers a
  refetch of the whole page.
- Stored to terminal 3.1 to 3.5 s, when the composer unlocks.
- Provider alone: 2.6 to 4.4 s.

**Ranked changes** (gains inferred). Do not release a sentence before its guard returns.

| Rank | Change | Gain | Risk |
| --- | --- | --- | --- |
| 1 | Stop repeating verification inside one held transaction; keep begin and end catalogue checks and the fresh per-stage scope | -10 to -14 s | Medium-high: five owner contracts |
| 2 | Cache function-definition hashes keyed by `schema_migration` only if still needed; keep ACL, role and RLS reads live (DDL triggers do not see role drift) | -1 to -3 s | High |
| 3 | Move the model safety classifier off the pre-acknowledgement path; the worker classifier already handles crisis | Ack 1.1 to 3.8 s becomes about 0.3 s | Medium-high; founder safety sign-off |
| 4 | Wake the worker on accept instead of polling | -0.7 to -1.5 s | Low |
| 5 | Paint from the WebSocket frame after the gate check; drop the BFF pre-fetch | -1.4 to -2.9 s perceived | Low-medium |
| 6 | Fewer transactions: merge admissions, drop the second bookend, merge deliver and readback | -1 to -2 s | Medium |
| 7 | Run the classifier in parallel with embed and retrieve | -0.4 to -0.8 s | Medium |
| 8 | Small fast guard with offset-based schema, cached prefixes, pre-warm, fast classifier model | -0.5 to -1.5 s | Medium; do with the provider switch |
| 9 | Scale: multi-worker, per-creator lock redesign, hold sizing, unknown-cost policy | n/a | Medium |

Realistic result after ranks 1 and 3 to 7: acknowledgement about 0.3 s and first sentence
about 3 to 4.5 s. The 2.5 s warm bar needs rank 8 and is a stretch.

**The guard** (`modules/agent/pipeline.ts`, `hardBlock` about 309-339, then an LLM verdict
at 744-822).

- `hardBlock` has no word boundaries. Checked against the pattern itself: "Spread your
  glaze in one even coat", "Thread your wire through the clay", "A cone 6 satin base
  costs about $40 a bucket" and "You can buy test tiles at any supplier" are all blocked.
  BRIEF section 11 forbids "unlock" and "upgrade" inside AI replies, so part of the
  pattern is intentional; the fix is subject anchors and creator-text exceptions. Whether
  a price from the creator's own materials may appear in an AI reply is a founder call
  (INV-21).
- The guard must echo curly apostrophes, dashes, non-breaking spaces and trailing spaces
  exactly; drift becomes `citation_invalid`. Fix: the guard returns integer offsets and
  code slices the text; normalize both sides; one re-run on structural failures only; store
  sub-codes plus a text hash.
- Evidence starvation: history is taken before evidence and over-budget passages are
  skipped. Follow-ups embed only the current message and retrieve nothing. Reserve an
  evidence floor; embed the last user turn plus the message.
- Fallback copy ("I'm Maya's AI. I can't answer that from the approved sources. You can ask
  Maya directly.") also shows when the `dependency` pattern catches a distressed fan, which
  INV-21 forbids, and it arrives after about 27 s.
- Measure the fallback rate on the creator's own FAQ set; no rate exists today.
- Revision discipline: `hardBlock` is shared by revisions 12 to 14, and a published version
  binds the revision in its fingerprint (`modules/agent/pipeline.ts`, `PIPELINE_REVISION`
  and `AgentPipeline.fingerprint`). Changing the patterns in place would change what a
  published version does under an unchanged fingerprint, so these fixes ship as the next
  revision, with the provider switch, and the earlier revisions keep their behavior.

**Publishing.** Any version after the first needs a feed, at least one fan-derived sample
under 7 days old, a passing replay bound to the draft, live version and samples, and a
reproducible live engine (`modules/agent/service.ts:382-407`, `1085-1126`). The sanitizer
rejects any paraphrase containing a digit. In a pilot this is unreachable, so creators could
not republish after a correction. A creator-authored FAQ-set check must replace the gate:
about 350 lines, M (an S variant of about two days drops the gate and appends the FAQ set to
the evaluation plan). The current judge prompt treats a refusal as success, so the FAQ
judge needs its own prompt.

**Citations.** A chip opens the whole roughly 400-token chunk under an identical "Source /
Read the original passage" label, not the quoted span. Re-ingestion deletes every chunk and
creates new ids, so older answers show "No longer accessible to you" after any creator edit
(inferred). Fix: store offsets in provenance and keep a snapshot while the source is
approved.

**Hazards under load** (inferred from SQL).

- Fixed 60 s lease with no renewal (`modules/identity/schema-generation-scope.sql:203`);
  each extra sentence costs about 3.5 to 4 s, so four or five sentences reach it.
- `ai_workspace` row locks: generation begin takes `FOR UPDATE NOWAIT` while every accept
  takes `FOR SHARE`, so two simultaneous fans of one creator can fail a generation.
- Cost hold is about $4 per generation against the daily cap (`spent + held + ceiling >
  cap`), so a $5 cap admits one at a time.
- Any `cost_micros IS NULL` row, produced by an HTTP 429, 5xx or timeout, blocks all new
  generations for that creator.

**Invariants.** INV-01 and INV-11 hold. INV-03 and INV-04 hold in the database; takeover
during a 20 s generation is unqualified. INV-05 and INV-21 are partial (regex false
positives, no deterministic subject check). INV-25 holds.

**Entry** (growth review). No universal or app links anywhere (no apple-app-site-association
or assetlinks route, no entitlements, `CREATOR_LINK_HOST: ""`, Android only
`qelvora://app`). The signed-out creator page is blank for real creators because
`modules/growth/creator-projection.ts` hard-codes empty biography, category, reliability,
capacity, presence and photo caption. Per-post "Ask about this" is blocked twice
(`modules/growth/content.ts:277` hard-codes `aiContextEligible: false`; begin-conversation
takes no context). The invite page is generic; there is no og:image; a push tap for a
returning fan lands on first-conversation consent. The path to a first message is six
screens or more (prototype 5.1: four). The public read path runs `refreshCreator`
(`FOR UPDATE`) up to twice per request and the web calls it twice per page, with no caching
and no rate limit, so a link-in-bio spike serializes on one row.

## 5. Moment 2: being remembered

| Item | State | Evidence |
| --- | --- | --- |
| Chips, view, edit, resolve, delete | Built on web, iOS and Android | `apps/web/features/conversation/AccountScreen.tsx:546-640`; `modules/conversation/memory.ts:393-596` |
| Extraction and open-loop creation | Not wired | Only `ConversationGenerationProcessor` calls `generator.extract` (`modules/conversation/generation.ts:474-515`); it is built only when a generator is passed (`runtime.ts:129`) and `host.ts` passes none |
| Follow-up on return | Absent | No such code |
| Consent | Stricter than the design | Every item stays `proposed` until the fan taps "Remember" on the You screen; no in-thread prompt. Sensitive proposals are stored before consent, where INV-23 says drop and ask once (inferred) |
| Exclusion | Over-broad | Any `memory_exclusion` row makes the worker context return no history, no memory and no intro (`modules/conversation/migrations/0095_w3_generation_purpose_consumers.sql:86-92`), so deleting or refusing one item makes the thread stateless |
| Guard | Blocks memory-based sentences | The guard input has no memory or history and bars fan statements as evidence (`modules/agent/pipeline.ts:752-766`); "Last time your glaze crawled" fails in expert and blend modes (inferred) |
| Cost if wired as the legacy path | Up to 7 extra calls and 10 s before the composer unlocks | Run it as a job after the answer is final; the `memory` usage category exists |

## 6. Moment 3: the person shows up

Works: web Studio drafts, signs (passkey) and publishes a Note and signs a heart reaction;
the audience label is built server-side and shown (`modules/content/service.ts:917-933`,
`apps/web/features/content/Content.tsx:406-419`). It has never been run with a real passkey.

| # | Gap | Evidence | Size |
| --- | --- | --- | --- |
| 1 | Fans cannot read members, tier or follower Notes in the composed host: `server.ts` omits `tenure` and `creatorTenure`, which `modules/content/development-server.ts:285` wires; the follow migration 0185 is reserved, not applied (`infra/migrations.json:1004`) | Inferred from code | S to M |
| 2 | Nothing delivers a Note or reaction to a fan's thread or phone: no code inserts `human_broadcast` or `human_reaction` messages; the reaction effect is never drained (`modules/content/service.ts:2846`, no caller of `drainEffects`) and Growth maps only ai, approved and human_creator messages | Code reading | M |
| 3 | No push can send: the APNs and FCM adapters are never constructed; iOS `CreatorPushEnabled` is defined nowhere; Android Firebase properties are empty; offline pushes are dropped (APNs expiration 0, FCM ttl 0 s) | Growth review | M |
| 4 | 0 of 19 notification types can fire: 8 have producer code that is never mounted, 11 have none (answered_publicly, content_match, announcement, slot_change, commitment_due, guardrail, pool_share, note, reaction, public_answer, spending_reminder) | Growth review | M to L |
| 5 | Every fan reply to a Note opens a safety case and waits for a human decision (`modules/trust/reply-review.ts:36-38`, migration `0069_w8_reply_review.sql`) | Code reading | M (auto-allow clean replies) |
| 6 | Native clients render Notes, reactions and calls as bare text with no audience label or glyph, because `W3Message` has no audience field; this breaks "audience always named" | iOS and Android reviews | S |
| 7 | Weekly impact and 72-hour digests have no producer (`modules/growth/weekly-impact.ts:83`) | Code reading | M |
| 8 | "Let my AI use this" sets an effect that is never drained | Code reading | S (hide the toggle) |

## 7. Moment 4: honest money

Enforced in TypeScript and in SQL triggers: INV-02 (approval signs the exact draft version),
INV-09 (only `deliver()` completes a commitment), INV-16 (capture only after a consumed
signed accept; manual capture; a SQL check requires `accepted_act_id`), INV-22 (begin is
creator-only; consume checks owner, hash and a 5-minute window; a trigger recomputes the
hash). The spend limit is checked before capacity. Provider calls happen outside database
locks. INV-10 is partial (the public profile returns `capacity: ""`; reservations never
expire without the worker). Tests exist for T-01, 03, 04, 11, 18, 23, 24 (allowance only),
27, 28, 30 and 34; they are absent for T-10, 13, 16, 29, 33 and 38.

| # | Defect | Smallest fix | Size |
| --- | --- | --- | --- |
| 1 | No scheduler or webhook ingress: `CommerceRecoveryWorker` is never constructed, `reconcileDeadlines` runs only from it, and no webhook route is mounted in `server.ts` (only the W4 development host mounts it, `modules/commerce/development-server.ts:107`). Expiry, late-delivery auto-refund (INV-16), capacity release and crash recovery happen only when a user taps | Implement the work index, start the worker, mount the inbox with an insert-only pool; stopgap: expire lazily on reads. The worker takes a `CommerceWorkIndex` that the identity or operations adapter must issue (`modules/payments/inbox.ts`) and no implementation exists, so the scheduler follows the adapter work | M to L (stopgap S) |
| 2 | `decide` refuses a decline after `decision_at` (`modules/commerce/service.ts:1539`); `deliver` refuses after due (`:2054`) | Allow decline; expire on read | S |
| 3 | Stripe code has never touched Stripe (`docs/workstreams/status/W4.md:282`); no backend tests for packets or capacity | One scripted test-mode run (hold, accept, decline, 3DS, refund); fake-provider tests for T-10, 16, 24, 29 | S plus M |
| 4 | Accept, reply and deliver is three screens and two passkey ceremonies | Auto-deliver on `send-draft` when one open written commitment exists (S); later a composite signed act (founder review of INV-22) | S, then M |
| 5 | `commerce_mode.eligibility` is never writable, so any fan can request (T-07 dormant) | Add the field and form | S |
| 6 | The retry key hashes the single-use `paymentMethodId` (`CommerceScreen.tsx:716`), so a re-entered card after a lost response makes a second hold; no minimum price; recovery lists at most 1,000 PaymentIntents then throws | Stable draft key; validate; metadata search | S each |
| 7 | Public profile capacity and ETA are blank | Read the capacity row; compute reliability | M |
| 8 | A pending publication stays stuck after the 5-minute signature window | Clear on `signed_act_required` | S |
| 9 | Passkey recovery marks every past signature revoked (`modules/identity/passkeys.ts:211-218`) | Register two passkeys; ops guidance | S |
| 10 | Scheduled, photo and voice Notes need a publication worker that is never started (`workers/start.ts publication`, no npm script); paid voice cannot be offered (`fulfillmentModes` is set nowhere) | Run the worker; hide voice for the pilot | S, or L for voice |
| 11 | "Ask Maya to step in" always shows in the thread footer (`ConversationScreen.tsx:1238`; inferred: no safety-state check) | Hide it in crisis and guardrail states | S |
| 12 | Copy: "Ask for more information" sends the reply text as the question (`Studio.tsx:2467`); "Let AI answer" only releases the hold and the fan sees "passed on this one" | Fix both | S |

**Stripe.** `stripe@22.6.2`, test keys only by design (`sk_test_`; live objects rejected,
`modules/payments/provider.ts:71-74,345`), so production needs a code change. Variables:
`COMMERCE_CURRENCY`, `STRIPE_SECRET_KEY`, `STRIPE_API_VERSION`, `STRIPE_COLLECTION_ACCOUNT`,
`STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `COMMERCE_STRIPE_PRODUCTS_PATH`.

**Native money (Q04).** `nativeReplyPurchase` is false and both apps disable "Send request"
(`CommerceFeature.swift:65-67,265-266`, `CommerceFeature.kt:296`). Status, withdraw, receipt
and sharing screens work for requests made on web. Membership purchase is real (StoreKit 2,
Play Billing, server verification) but needs store products, config paths and notification
routers that `server.ts` does not mount.

| Option | What it takes |
| --- | --- |
| Keep on web | S. Add an entry link; the status screens already cover the rest |
| Web link-out | S to M. A "continue on web" button, a sign-in handoff (native and web sessions are separate), a universal-link return, and counsel per storefront |
| Charge now, auto-refund | M to L. A second payment mode, refund-on-decline paths (the machinery exists) and a native card form. "Charged only when Maya accepts" becomes false, and in-app purchase cannot hold or capture |

**Shortest path to a first real test** (all code exists, development host): run the host
with the Stripe variables; register a passkey with Touch ID on localhost and have ops approve
the proof; the creator saves a written-reply offer; a second development account sets a limit
and pays with a 4242 card; the creator accepts and signs, replies in the thread and links the
reply; the fan opens the receipt. Expiry and refund paths cannot be shown until defect 1 is
fixed.

## 8. Moment 5: the creator's five minutes

Web Studio at phone width: a Note takes 3 taps plus a biometric (prototype 5.3: 1 tap plus a
biometric); each reaction 2 taps plus a biometric, heart only; accepting and delivering a
written reply takes 12 taps, 2 biometrics and 3 screens (prototype 5.3: 2 taps); a decline
takes 4 taps. Studio polls every 4 s (`Studio.tsx:485,830`).

Design against code:

- Queue header, rule cards and a draft-ready flag (4c-01) are a static capacity line; no AI
  draft is generated (`modules/commerce/approvals.ts:40`); there is no memory panel (4c-05).
- The digest page exists and has no data (4c-10).
- The packet lacks the ETA line, "$5 of your $60 limit" and the in-flow limit (the limit is a
  separate page); "Maya usually decides" is absent because `reliability` is empty (4a).

Native has Team and a digest viewer only. `PasskeyCeremony.assert` and `beginSignedAct` have
no call sites and the signing sheet is static. A native creator daily Studio is L per
platform and can be staged: Notes, then replies, then the queue; the generated API already
has `saveContent`, `studioContentReplies`, `contentReplyReaction` and `beginSignedAct`.

## 9. The share card, pilot measurement and the phone apps

**Share card.** Every piece exists except the join: the grant (creator toggle on web only; the
fan's choice is hard-coded "hidden" on all three clients), share storage, the public `/share`
page (noindex, no OG tags), a web PNG and ZIP renderer, a native PDF with the system share
sheet, and the four-state verify page. Missing: the `shareSource` and `shareStatus` owners
are unimplemented (default "unavailable"); no client calls `POST /v1/growth/shares`; the
commerce detail does not expose the grant id; `/verify` can never show the words
(`public_command` is set only by `setSignatureVisibility`, whose sole caller passes
`publicContent=false`); card text duplicates lines and has no glyph; native shares a PDF
only; the URL is `/share/<uuid>`; the public JSON leaks internal ids. A grant exists only for
delivered paid requests (D-15). Size: 8 to 12 development days.

**Pilot measurement.** 16 metric types and zero emitters. The k of at least 5 suppression
rule hides most per-creator data at 5 to 10 creators. `useful_answer` is never recorded, so
the install-after-first-value prompt (O16) never triggers. There is no arrival counter. The
launch kit is a single "create and copy invitation" button.

**Both phone apps** (iOS and Android are near twins).

- Release builds cannot sign in: only a DEBUG development-actor chooser exists
  (`FanShell.kt` about 263-277); on iOS the non-debug `beginSignIn` ends in a fixed "Pantopus
  account authorization is not connected for this native app." Production sign-in needs the
  Q01 contract: L.
- Creator Studio is absent. 27 of 53 components are catalogue-only (queue card, signing
  sheet, studio tab bar, terms block, ETA line, composer, step-in, memory chip, reaction chip,
  share card, notification row, dialog, toast and others), so "Charged only when Maya
  accepts" appears nowhere live in native.
- Thread: step-in hard-codes the "M" seal and stays visible while the creator is present
  (two person-colored buttons on Android); the composer lacks trial, ended, capacity and
  paused states; citations are generic; no 3-hour reminder; no 18+ screen; Notes, reactions
  and calls are bare text.
- Streaming frames only trigger a refetch; the offline cache is a 5 s lease renewed by a
  timer, so the readable-from-cache promise is not met.
- Notification lists are text-only (no glyph, color, time or unread), which breaks word plus
  glyph plus color.

**iOS.** No `.entitlements`, no `PrivacyInfo.xcprivacy`, no asset catalogue or app icon;
`UIBackgroundModes [audio]` and LiveKit and CallKit are compiled in although calls are later
(review risk); StoreKit 2 membership is real but `Transaction.updates` is heard only while
the pane is open; about 470 literal English strings against about 210 copy lookups; tests
cover the delivery gate, identity and 110 macOS snapshots, nothing covers the session,
Keychain, thread model, commerce, trust or push; no signposts or MetricKit, so on-device
latency cannot be measured.

**Android.** `compileSdk 35`, `minSdk 26`, `targetSdk 35`; the docs record that Google Play
requires target 36 from 2026-08-31 with an extension to 2026-11-01 (verify in Play Console).
No build types (no R8, signing, launcher icon or versioning); ten permissions plus LiveKit,
camera and foreground services ship though calls are later; no `BackHandler`, edge-to-edge or
IME configuration; drafts are lost on rotation; `InputStream.readNBytes(int)` (API 33) at
`Growth.kt:57` with `minSdk 26` likely crashes on Android 8 to 12 (inferred);
`HttpURLConnection` in Growth, Content, Trust and Media is never cancelled; the identity strip
scrolls away at large font scale or in landscape; passkeys need API 28, so Android 8 and 9
users cannot sign.

**Good assets to keep.** The delivery gate (tested), Keystore and Keychain custody with
issuer binding, token-faithful components (28 colors match the handoff `tokens.json`),
StoreKit and Play Billing seams, consent before AI, a report control on every AI message,
in-app export and delete, the Team workspace and bundled fonts.

## 10. Comparison: what exists and what to freeze

15 backend files (3,447 lines), 8 registered SQL files (0239 to 0246, wave
`20261008-comparison`), about 290 mention lines in shared files, web about 440 lines, iOS
about 114, Android about 130, and 114 evidence files.

1. Publishing is gated on fan-derived samples (section 4), so the FAQ-set check replaces the
   gate.
2. The wave cannot be removed: registry-driven composition asserts all eight ledger rows at
   Trust and Conversation startup; export and delete assert installed equals prepared; every
   account export is captured.
3. Main refuses new exports while the comparison profile is registered (#351).
4. Comparison is off when `TRUST_DEVELOPMENT_COMPARISON_POLICY` is unset. The development
   authority window ends 2026-11-01, and `AgentService.read` calls `comparisonSamples`
   without a try/catch when a feed exists, so a lapse would throw the whole Studio read
   (inferred). The fan "Me and privacy" screen still reads "AI comparisons are not available
   yet" on all three clients, and the creator Test tab polls every 5 s taking a workspace
   `FOR UPDATE` lock each time.
5. The privacy closure is mostly built (SQL cascade wipe on withdrawal, worker purge in
   `TrustWorker.tick`, file unlink) and proven only by recorded operations. Gaps: merge #351
   and #353; a withdraw-only mode when the feature is off; retry for withdrawals refused
   under `NOWAIT`; no production authority or artifact store (local disk only); no alert on
   overdue purge.
6. After the provider switch a creator with a live version can neither compare, publish nor
   roll back (`publishedEngine` returns 409).

Proposed definition of done *(to confirm)*: merge #351, #352 and #353 in order; withdraw-only
mode with retry; one native withdrawal exercised; SQL-level checks on a disposable
PostgreSQL; a runbook (wave applied, flag unset); an overdue-purge alert; the FAQ-set check
in place of the gate. Deferred: sanitizer corpus, production authority, object store,
per-fan limits.

## 11. The three open PRs

| PR | Change | Verdict |
| --- | --- | --- |
| [#351](https://github.com/WangPantopus/creator-platform/pull/351) | +4,317/-11, 29 files; about 35 source lines in `modules/trust/worker.ts`, `modules/agent/privacy-export-snapshot.ts` and `modules/agent/privacy-stream.ts`. Fixes a deterministic bug: the export stream and the held source each mint their own `agent-export:<uuid>` (`privacy-stream.ts:34`, `privacy-export-snapshot.ts:514` on main), so sealing finds no capture. A second fix removes a self-inflicted `55P03` that dead-lettered the job at attempt 8. Limits: single host, no regression test, proven on an empty 39-byte export; a 200 KB conversation export used at least 26 s of its 45 s deadline | Merge as is, then smoke-test a comparison-enabled export (8 of 8 domains on attempt 1) |
| [#352](https://github.com/WangPantopus/creator-platform/pull/352) | +25,708/-3, 96 files; about 10 source lines in two opt-in native journey tests plus 7.99 MB of evidence (38 PNGs, six byte-identical pairs, a 420 KB index of 1,166 off-repo files). Its one launch-relevant datum: first stored sentence 19.1 s against the 2.5 s bar | Merge; trimming is optional |
| [#353](https://github.com/WangPantopus/creator-platform/pull/353) | +445/-12; `CreatorAI.tsx` +80/-11. Conceals comparison results when offline, hidden, on identity change or on a failed read. Direction right, unproven: the recovery has no artifact; background, identity change and late response never ran; `refresh()` clears on every focus even when nothing was hidden (collapsing open `<details>`); returning to Versions paints stale items first; the response is cast, not parsed; 403 and 500 show "Reconnect to review them"; zero tests. Its docs re-point `CLAUDE.md` to an "immediate" handoff that contains an "Authorization and scope" section | Merge, then fix in one follow-up PR: the two `CreatorAI.tsx` gaps (stale first paint, over-clearing), and remove the `CLAUDE.md` pointer and the immediate handoff's authorization section |

Claim accuracy (17 spot-checked): 14 hold; typecheck, lint and bundle hold by CI only (the
build logs are 85-byte slot lines); the restart claim is half-evidenced; "Fresh-read recovery
verified" has no artifact (only the before, offline and failed-read screenshots).
`DESIGN_PLAN.md:134` and the finish plan still carry 26.992 s and 3.767 s where #352
measured 19.081 s.

**Merge mechanics.** Branches are not deleted on merge, so retarget each PR before merging
it. Never squash a stacked PR. Concurrency cancels in-progress main runs, so only the last
merge's run completes. If GitHub reports a conflict after a retarget, run
`git merge-base --all`: two merge bases (a criss-cross) make GitHub diff against the older
one, which repeats the earlier PR's changes. Merging main into the PR branch clears it, and
when the merged tree equals the CI-green tree (`git merge-tree --write-tree`) nothing new is
untested. That happened to #352 (merge commit `3376ac99e`).

```bash
gh pr merge 351 --merge
gh pr edit 352 --base main && gh pr merge 352 --merge
gh pr edit 353 --base main && gh pr merge 353 --merge
```

## 12. Documents and repository weight

- **Handoff sprawl.** `docs/operations/session-handoff-2026-10-08.md` is 616 lines with 12
  "Continue on <branch>" instructions and a "Start here" that still says PR #335 is merged
  and zero PRs are open. #353 adds a 160-line immediate handoff with process ids, ports,
  session ids and statuses that were already false. A committed file is not a user
  authorization, so its "Authorization and scope" section must not be followed; remove it.
  Proposal: `CLAUDE.md` points to a stable `docs/operations/CURRENT.md` (about 60 lines:
  state, open PRs, next step, link to the launch plan); archive older handoffs; keep machine
  state out of git.
- **Decision log.** The rows #352 and #353 add sit under section 15 of `docs/BRIEF.md`
  without a table header, so they will not render as a table. About 144 added tokens run
  together ("cost921", "returns403", "compileded709286e"), which breaks search.
- **Weight.** `.git` is 538 MB, about 265 MiB reachable, 84% of it `artifacts/`. Tracked
  `artifacts/` is 299 MiB in 5,479 files (PNG 228 MiB in 1,544 files). Each worktree checks
  out its own 222 to 320 MiB copy. #352 alone equals everything already under
  `artifacts/pr-review/2026-10-08` on main. The repository is public and the evidence carries
  home-directory paths, database names and credential-file locations (not credentials).
- **Evidence policy (proposed).** Keep at most 1 MB per PR and 300 KB per file in git: a
  README, a manifest of at most 20 entries (path, sha256, bytes), at most five optimized
  screenshots that carry a decision, and receipts under 20 KB. Move raw logs, `.xcresult`
  trees, accessibility dumps, per-appearance sets, tarballs and patches to one bundle per
  milestone outside git, with checksums in the manifest. Never commit absolute home paths or
  environment and admin file locations. Add a CI check that fails a PR adding more than 1 MB
  under `artifacts/`, any file over 300 KB, or duplicate blobs. Use a sparse checkout without
  `artifacts/` in agent worktrees and CI. No history rewrite while 368 remote branches and
  cited SHAs exist.
- **`CreatorAI.tsx`.** 2,972 lines and 121 KB; one component spans 2,745 lines (37 `useState`,
  18 `useRef`, 14 `useEffect`); 28 commits in 10 days; no test imports it; `page.tsx` renders
  it with and without `identity`, so each identity effect has two behaviors. When next
  touched, add one browser test first, then extract `useComparisonFeed` and
  `ComparisonPanel`, then split sections as they are touched. `Studio.tsx` (163 KB) and
  `CommerceScreen.tsx` have the same shape.

## 13. Anthropic switch checklist

To verify at migration time. Anthropic facts come from the bundled API reference cached
2026-10-06, not live documentation.

1. Choose and freeze the embedding provider first. Changing the embedding model marks every
   approved source failed and pauses every creator's live version
   (`modules/ingestion/worker.ts:26-41`). The reviewed reference lists no embeddings endpoint;
   keeping OpenAI embeddings means naming two processors in the consent copy.
2. New adapter: Messages streaming, structured output (which rejects length and most numeric
   and array constraints, so keep client-side validation), and typed 429, 529 and refusal
   mapping. Treat a non-2xx before any body as known zero cost, or the unknown-cost block
   fires on every rate limit.
3. Rebuild the usage mapping and rates (`modules/agent/response-usage.ts:31-78` assumes
   OpenAI semantics; Anthropic reports cache reads and writes separately). Remove rates and
   the policy reference from the behavioural fingerprint (`modules/agent/model.ts:259-269`)
   so a price edit does not invalidate every published version.
4. Replace the tokenizer (`js-tiktoken` undercounts Claude by about 15 to 20%) and bump
   `PIPELINE_REVISION`.
5. Set low effort and thinking on the classifier, guard and reply, or first-token latency
   grows.
6. Replace `prompt_cache_key` with `cache_control` after the creator-static prefix; never put
   a breakpoint over fan memory (INV-15). Pre-warm.
7. Warm every structured schema at boot.
8. Re-run the six boundary tests, the regression cases and the FAQ harness. Native citations
   cannot combine with structured output, so offset-based verification stays.
9. Update consent, the data-processing terms and retention. The synthetic policy requires
   `providers[0].name === "OpenAI"` (`modules/conversation/development-policy.ts:53`) and the
   comparison consent names OpenAI (`modules/trust/development-comparison.ts:55`).

**Timing.** Before any creator publishes, the switch is free. Afterwards every live version
goes to "updating" (accept refuses with `ai_updating`) and needs the privacy-safe shadow
upgrade that the frozen comparison work was meant to provide. Do the provider, guard schema,
prompts and fingerprint redesign as one revision before the first real creator publishes.

## 14. Not reviewed

Calls, media and voice (later scope); the pass and pool journals; the ops console and trust
authorities beyond what is cited; `fulfillment-plans.ts` (2,159 lines); `Studio.tsx` beyond
Notes, requests, packets and thread controls; terminal-journal internals; translation, style
and lifecycle modules; the test suites; any runtime behavior (nothing was run); and design
files beyond the screens named.

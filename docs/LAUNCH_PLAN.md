# Launch plan: scope, decisions and what comes later

Decided with the founder on 2026-10-08 and checked against the code the same day (see the
[launch review](operations/launch-review-2026-10-08.md)). This file sets the **sequence** of
the work. It removes nothing from the product: the documents in [source/](source/) still
define behavior, and everything under "Planned for later" is planned, not dropped. Items
marked *(to confirm)* are recommendations that still need a yes.

## 1. What the launch must get right: five moments

Make five moments extraordinary rather than fifty features adequate.

1. **The first answer** (minutes 0 to 2). A fast, in-voice answer from the creator's own
   work, with a citation that opens the exact passage. Free first conversation, no card.
2. **Being remembered.** On the next visit the AI follows up on an open loop, and the fan
   can see and edit what it remembers.
3. **The person shows up.** A Note in the fan's own thread, "Maya reacted to your reply",
   a signed reply. Cheap for the creator, valuable to the fan; this is the daily habit.
4. **Asking for her, with honest money.** The packet, "charged only when she accepts", a
   signed reply with a keepsake receipt. A decline is gentle and free.
5. **The creator's five minutes, and proof it worked.** A Note, a few reactions, the
   queue, and the weekly "you helped N people" digest.

Distribution is the creators' own audiences: the link in bio and per-post "Ask about this"
links, with a small launch kit. No paid advertising until the retention gates in section 5
are met.

## 2. Decisions recorded

| Decision | Detail |
| --- | --- |
| Pilot cut line | The launch is slice 1 of the [architecture build sequence](source/System_Architecture.md) (section 12) plus the share card below. Everything else is in section 4. All ten finish-plan milestones stay in scope; this only orders them (section 9). |
| Phone apps first | The native iOS and Android apps are the primary launch surface for fans. Web stays supported: it must deliver the first answer from a creator's link with no install, and it carries the configuration screens (My AI, Offers, Earnings, Team, License). Creators' daily work was decided native on 2026-10-02 in [DECISIONS](workstreams/DECISIONS.md), but the review found it unbuilt (L per platform). Decided 2026-10-08: Notes and reactions are native at launch; requests and accept open the phone-width web Studio first, with native right after (section 8, step 5). |
| Share card is in | A minimal card: a signed written reply, with its public verification page, as an image and a link. The fan chooses how their handle appears, and either side can revoke it (D-15). Pulled forward from slice 3. |
| Model provider | The Anthropic API is the intended production provider. Development continues on the existing synthetic OpenAI configuration, which is development-only and not a production approval. Decided 2026-10-08: switch before the first real creator publishes, as one engine revision, with the embedding provider chosen first (section 8, step 2, and the provider notes below). |
| Comparison scope freeze | Comparison stays installed and off. Done means: merge #351, #352 and #353 in order; a withdraw-only mode with retry; one native withdrawal exercised; SQL-level checks on a disposable database; a runbook; an overdue-purge alert; and a creator-authored FAQ set that replaces the fan-sample publish gate. Parked: sanitizer corpus, production authority, object store, per-fan limits. The wave cannot be removed, because export and delete are composed from it. Confirmed 2026-10-08. |

## 3. Launch scope

**Fan (phone apps; web supported):** creator home and entrances (link in bio, post, invite)
that open the app when installed and otherwise answer on the web; S-F1 onboarding with
processor consent; S-F2 Home, S-F3 Discover, S-F4 creator profile; S-F5 thread in every
state; S-F6 memory; S-F7 packet, spend limit and checkout; S-F8 request status and receipt;
S-F11 notifications with push; S-F12 me and privacy; S-F13 post view ("Ask about this");
S-F14 Notes in the thread; S-F15 spending and time; S-F16 verification page; the share card.

**Creator (daily work on the phone, responsive web for configuration):** S-C1 verification
and onboarding with passkey, license and interview (S-C14); S-C2 My AI; S-C3 requests queue;
S-C4 packet detail with signing; S-C5 threads (takeover, handback, audit, "I'd never say
that"); S-C6 Offers; S-C7 Publish (basic); S-C9 Earnings (minimal); S-C10 Team (basic);
S-C12 Notes and Replies; S-C13 license and sponsorships; the weekly impact digest.

**Platform:** safety (report, block, crisis protocol), a minimal ops console, export and
delete, push notifications, instrumentation for the pilot gates, and the "who wrote this?"
comprehension study (T-21).

## 4. Planned for later (not dropped)

| Item | Source | Start when |
| --- | --- | --- |
| One-to-one calls | S-F9, S-C11, slice 2 | Notes, replies and reactions have proven out; call provider chosen (Q06) |
| The pass | S-F10, slice 4 | About 30 creators with active fans (D-23) |
| Pool earnings and payouts | S-C9 full, slice 4 | With the pass |
| Paid voice notes | D-25, W6 media stack | After written replies have proven out; no way to offer a voice mode exists today *(recommended)* |
| AI voice notes | D-25, slice 3 | After the pilot, with a license that lists AI voice, C2PA marking and a watermark |
| Insights, producer, group answers | S-C8, F13, F14, slice 3 | Once fans generate enough questions (minimum group of five) |
| Public answers and credits | D-19, D-27, slice 3 | After the pilot; economics undecided (Q08) |
| Full publishing: tier builder, library, live, community | S-C7 full, Q14, slice 3 | After the pilot |
| Fan-derived comparison replay | Architecture section 6, A12 | After the pilot produces real fan data and a consent and privacy review |
| Native configuration screens | O19 | After the pilot; web remains the home for configuration |
| Instagram "comment" automation | A13 | After the launch kit; needs Meta approval |
| Referral incentives, extra locales, tips, fan agent, real-time AI voice or video | O18, O20, D-H, D-G | Later; some are reserved by design |

## 5. Launch criteria

Pilot gates, from the [Second Review](source/Second_Review_Strategy_Behavior_and_Additions.md)
section 8 (proposed thresholds, to be agreed before the pilot):

- At least 40% of fans who land on a creator's home send a first message.
- At least 50% of fans who send a message return within 7 days.
- At least 70% of creators post two or more Notes a week in week four.
- At least 5% of monthly active fans buy a human mode within 30 days, and at least 60% of
  first-month members renew.
- At least 90% correct on "who wrote this?", zero leaks between threads, zero unlabeled AI text.
- Median creator time under two hours a week, and at least three in five creators ask to continue.

Proposed launch-quality bars *(to confirm)*: acknowledgment p95 at most 300 ms; first
approved visible sentence p95 at most 4.5 s at the start of the pilot, with 2.5 s warm as
the target after the provider switch (the review measured 19 to 27 s today and judged 2.5 s
a stretch even after the overhead is removed); a fallback rate on a creator's own FAQ set low
enough that creators do not need to file corrections for it (threshold set with the first
creators); each of the five moments exercised on a real iPhone and a real Android phone in
Light and Night.

## 6. What choosing phone apps first adds

- **Paid replies inside the app (Q04).** Memberships use in-app purchase (D-14) and calls
  are paid outside it, but asynchronous written replies bought in the app are still open with
  counsel. In-app purchase cannot hold and then capture, so "charged only when she accepts"
  needs a decision. Both apps disable "Send request" today. Options: continue on the web
  with a signed handoff, charge now with an automatic full refund on decline (breaks the
  promise), or keep human modes on web. Decided 2026-10-08: continue on the web during the
  TestFlight and closed-testing pilot; settle the public-release approach with counsel.
- **Distribution.** Run the pilot through TestFlight and Google Play closed testing, and
  release publicly after the pilot gates. Store accounts, an 18+ rating, in-app account
  deletion, a report control on every AI message and consent before data goes to a
  third-party AI are release requirements either way.
- **Links.** A link from a social app must open the app when it is installed and otherwise
  give the first answer on the web, then offer the app after the first useful answer.
  Nothing supports this today: there are no universal or app links, no entitlements, and the
  link host is empty. Push is the main retention channel for "the person shows up".
- **Share card.** It needs the system share sheet on both platforms and a verification page
  that works signed out.

## 7. Where the build stands

The review found a strong engine with the connections missing. The detail, with evidence and
sizes, is in the [launch review](operations/launch-review-2026-10-08.md).

| Moment | Works today | Missing |
| --- | --- | --- |
| 1 First answer | Cited, labelled answer end to end on the development host | 19 to 27 s to the first sentence; the guard blocks ordinary advice; a second version cannot be published without fan samples; entry links and creator page |
| 2 Remembered | Memory view, edit and delete | Extraction and follow-up are not wired |
| 3 The person shows up | Signed Note and heart on web | Fans cannot read Notes; nothing reaches the thread or phone; no push |
| 4 Honest money | Packet, limit, hold, signed accept, capture, decline, receipt | Nothing drives expiry or refund; Stripe never run; apps cannot send a request |
| 5 The creator's five minutes | Web queue, Notes, threads | 12 taps and 2 ceremonies to accept and deliver; native Studio absent |
| Share card | All pieces | The join (creation call, words on the verify page, share sheet) |
| Phone apps | Fan thread, custody, delivery gate, store billing seams | Release sign-in, links, push, store requirements |

Underneath all of it: **only the development host runs the product.** A non-development
backend serves health and nothing else, and no Pantopus identity adapter exists (Q01).

## 8. Build order: vertical steps

Build in steps that each end with a person other than the author doing the moment on a real
iPhone and a real Android phone, in Light and Night, instead of hardening one layer at a
time. The result is written down in one page; evidence bundles stay out of git (review
section 12). Steps 2 to 5 can run in parallel once step 1 has a host. A weekly walk of the
five moments on the two phones is the progress report. Sizes: S up to 3 days, M about a week,
L two weeks or more.

**Step 0: clear the deck (days).**
- Done 2026-10-08: #351, #352 and #353 merged in order (`f41f297d3`, `73360885c`,
  `95abce43c`), plus a documents PR with this plan, the review, a short
  [CURRENT](operations/CURRENT.md), the decision-log rows inside the table, and the older
  handoffs marked as history.
- Deferred: the two `CreatorAI.tsx` fixes (stale first paint on re-entry, clearing on every
  focus) wait until someone can operate the panel with seeded data. They matter only when
  comparison is switched on.
- Comparison stays installed and off. Add withdraw-only mode with retry, an overdue-purge
  alert and a short runbook, then stop comparison work.
- Evidence policy: written into `CLAUDE.md` and CURRENT. A CI guard (fail a PR that adds
  more than 1 MB under `artifacts/`, any file over 300 KB, or duplicate blobs) is still to
  build.
- *Exit:* main's run on the merged stack is green, a comparison-enabled export completes on
  the first attempt (smoke test), and the documents agree.

**Step 1: a real host on real phones (blocks everything real).**
- Compose the production backend (`server.ts`) with an injected identity adapter, production
  configuration and the workers: generation, publication, commerce recovery, growth. M.
- Real sign-in: the Pantopus adapter (Q01) or an agreed interim; release sign-in on both
  phones. L external, M each.
- Domain and relying-party ID (Q09), then associated domains, app links and passkeys on
  devices; push credentials.
- Store requirements: iOS app icon, privacy manifest, entitlements and trimmed background
  modes; Android target level, R8, signing, icon, Back handling, edge-to-edge, tolerant JSON
  decode and the API-33 call.
- TestFlight and Play closed-testing builds for a founder-only cohort.
- *Exit:* the founder signs in on both phones against the real host, opens a creator link
  that launches the app (or falls back to the web), and receives a test push.

**Step 2: the first answer (moment 1).**
- Latency: stop repeating verification inside a held transaction, wake the worker on accept,
  paint from the frame, merge transactions, and (with safety sign-off) take the model safety
  classifier off the path before acknowledgement.
- Guard: word boundaries and subject anchors, offset-based verification, normalization,
  failure sub-codes, a distress-safe fallback, and the price rule (founder call, INV-21).
- Publishing: the FAQ-set check replaces the fan-sample gate.
- Citations that survive re-ingestion.
- Entry: creator page content, invite with the creator's note, share image, link to app else
  web, first message in four screens, a cached public read path.
- Reliability for a handful of simultaneous fans: lease renewal, lock collisions, hold
  sizing, unknown-cost handling.
- The provider switch as one engine revision, with the embedding provider decided first.
- *Exit:* the bars in section 5 are measured on the phones.

**Step 3: remembered, and the person shows up (moments 2 and 3).**
- Memory: extraction as a job after the answer; "Want me to remember this? Only if you say
  yes." in the thread; follow-up on return; an exclusion removes only what was excluded; the
  guard can use memory.
- Notes: wire tenure so members and tier see Notes; deliver Notes and reactions into the
  thread and as push; show the audience label and glyph natively; allow clean replies
  automatically and review flagged ones; the weekly digest producer.
- *Exit:* a Note signed by the founder appears in a test fan's thread with a push, and the AI
  follows up on an open loop on return.

**Step 4: honest money (moment 4).**
- Scheduler and webhooks (expiry, auto-refund, capacity release); decline after the deadline;
  one scripted Stripe test-mode run (hold, accept, decline, 3DS, refund) and the money tests;
  deliver automatically when the reply is sent; the eligibility field; a minimum price.
- Phone entry for paid requests per Q04 (section 6).
- *Exit:* request, accept, signed reply and receipt, and a decline and an expiry that cost
  nothing, run twice including 3DS.

**Step 5: the creator's five minutes (moment 5).**
- Flow first, on every platform: accept and send in two taps and one signature; queue rule
  cards and a draft-ready flag; Note and reaction without extra steps.
- Native: Notes and reactions (the daily habit) in the apps; requests and accept open the
  phone-width web Studio until native follows.
- *Exit:* the founder, as Maya, completes a day's five minutes on a phone in under five.

**Step 6: share card, measurement and release readiness.**
- Share card: the creation call, grant id, words on the verify page, system share sheet, image
  and link on both platforms (8 to 12 days).
- Measurement: emitters for the pilot gates, an arrival counter and `useful_answer`, and an
  aggregate pilot view (the small-group rule hides most per-creator data at pilot size).
- Operations: the minimal ops console, a named reviewer for Note replies and safety cases, the
  T-21 study, and the production-readiness list in finish-plan milestone 10.

## 9. The ten finish-plan milestones, ordered for launch

| # | Milestone | Launch status | Step |
| --- | --- | --- | --- |
| 1 | Safe comparison evidence and its privacy producer | Installed and off. #351 to #353 merged; withdraw-only mode next, then stop. Export and delete cannot be separated from the wave | 0 |
| 2 | Existing creator upgrade | Demonstrated once on the development creator; more later. A provider change after a creator publishes needs it, which is why the switch comes first | 2 |
| 3 | Useful response latency and grounding | Launch, pulled forward | 2 |
| 4 | Generation reliability and access | Launch (takeover, revocation, sensitive memory, idempotency, lease, lock collisions, hold sizing); shared-pass accounting later | 2, 3 |
| 5 | Complete privacy and recovery | Launch for export, delete and retention; comparison parts ride with the wave | 0, 6 |
| 6 | Human presence and creator or team work | Launch | 3, 5 |
| 7 | Commerce and content publication | Launch for membership and packet money; the group publisher is later | 4 |
| 8 | Recording and real calls | Voice notes cannot be offered today and move later; calls are later | n/a |
| 9 | Growth and complete cross-platform experience | Entry links, push, share card, verification and phone parity launch; Insights and discovery extras are later | 1, 2, 3, 6 |
| 10 | Production readiness and pilot | Launch | 1, 6 |

## 10. Inputs and decisions needed from the founder

Decided on 2026-10-08 (recommendations confirmed):

1. **Native creator Studio.** Notes and reactions native at launch; requests and accept on the
   phone-width web Studio first, native right after. Fix the tap count and the two ceremonies
   either way.
2. **Comparison done.** The definition in section 2.
3. **Anthropic timing.** Before the first real creator publishes, as one engine revision, with
   the embedding provider chosen first.
4. **Paid replies in the apps (Q04).** Continue on the web during the pilot; counsel before the
   public release.
5. **Merging the open stack.** Done (section 8, step 0).

Still to confirm:

1. **Voice notes.** Written replies first; voice later (section 4).
2. **Launch-quality bars** in section 5.
3. **Calls only the founder can make.** Whether an AI reply may state a price from the
   creator's own materials (INV-21); taking the model safety check off the path before
   acknowledgement; a single signed act for accept and deliver (INV-22); formalizing Q13 and
   Q14, which the working documents already treat as decided.

Inputs only the founder can supply:

1. The Pantopus sign-in contract (Q01), or a decision to launch the pilot with an interim
   sign-in.
2. The final domain and relying-party ID (Q09). Passkeys and universal links depend on it.
3. Apple Developer and Google Play accounts, TestFlight and closed testing, and at least one
   physical iPhone and one Android phone (Q10, Q11).
4. Stripe test-mode keys and the account topology (Q03).
5. A real passkey ceremony (Touch ID) for the development creator, plus the creator
   verification approval. This unblocks signed Notes, replies, reactions and acceptances.
6. Counsel on Q04.
7. A first cohort of three to five creators, and a named reviewer for Note replies and safety
   cases.
8. The consent wording that names the model providers (`[AI PROVIDERS]`), once final.

## Provider switch notes (to verify at migration time)

The full checklist is in the [launch review](operations/launch-review-2026-10-08.md), section 13.

- **Timing.** A model or provider change alters every published version's engine
  fingerprint, so it is an engine upgrade. Until a creator publishes, it is free. Afterwards
  every live version stops serving until it is upgraded, and the upgrade path is the
  comparison work this plan freezes. Decided 2026-10-08: switch before the first real
  creator publishes.
- **Embeddings.** Decide first. Changing the embedding model marks every source failed and
  pauses every creator's live version. If the Anthropic API offers no embeddings model, a
  second provider is named in the consent text.
- **Token counting.** The context budget counts tokens with OpenAI encodings and refuses
  unknown tokenizer models, and they undercount Claude, so it needs a method that suits
  Claude models.
- **Also redo:** usage and cost mapping (cache reads and writes are reported separately),
  prompt caching, structured output for the classifiers, the streaming adapter, rate
  handling (a rate limit must not read as an unknown cost), thinking and effort settings, and
  the retention and no-training terms. Update the processor consent text to name the final
  provider.

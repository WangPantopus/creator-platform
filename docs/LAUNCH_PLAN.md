# Launch plan: scope, the road to the pilot, and what comes later

Decided with the founder on 2026-10-08 and 2026-10-09, and re-baselined on 2026-11-02 to the
phases in the [consolidation plan](CONSOLIDATION_PLAN.md) (section 7), which the founder approved on
2026-11-01. This file sets the **sequence** of the work. It removes nothing from the product: the
documents in [source/](source/) still define behavior, and everything under "Planned for later" is
planned, not dropped. Items marked *(to confirm)* still need the founder's yes. The current state is
in [STATUS](STATUS.md).

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

## 2. What "done" means

**For the pilot.** Each item is checked by someone other than its author, on a real iPhone and a
real Android phone, in Light and Night:
1. **The five moments work end to end on the real host.**
2. **Every launch screen (section 3) exists in every state,** with the fixed copy word for word and
   no forbidden words.
3. **INV-01 to INV-25 hold,** and their acceptance tests (T-xx) pass. The isolation test T-11 runs
   in CI.
4. **The quality bars in section 5 are met.**
5. **The release requirements are met:** an 18+ rating, in-app account deletion, Report on every AI
   message, provider consent before the first AI message, and links that open the app or fall back
   to the web.

**For public release:** the pilot gates in section 5, then the founder's release decision.

## 3. Launch scope

The launch is slice 1 of the [architecture build sequence](source/System_Architecture.md)
(section 12) plus the share card. Everything else is in section 4.

- **Fans** use the native iOS and Android apps. The web stays supported: it gives the first answer
  from a creator's link with no install, and it carries the configuration screens.
- **Creators** use the web Studio on their phones, with passkey signing (option A). A separate
  native Qelvora Studio app follows after the pilot, Notes and reactions first.
- **Sign-in** is option D: Qelvora sign-in with Apple and Google, plus an 18+ date-of-birth step.
  A Pantopus account link stays the long-term path.
- **Order:** a private web alpha (about ten invited adults, Stripe test mode), then TestFlight and
  Google Play closed testing, then public release after the pilot gates.

**Fan (phone apps; web supported):** creator home and entrances (link in bio, post, invite)
that open the app when installed and otherwise answer on the web; S-F1 onboarding with
sign-in, the 18+ step and processor consent; S-F2 Home, S-F3 Discover, S-F4 creator profile; S-F5
thread in every state; S-F6 memory; S-F7 packet, spend limit and checkout; S-F8 request status and
receipt; S-F11 notifications with push; S-F12 me and privacy; S-F13 post view ("Ask about this");
S-F14 Notes in the thread; S-F15 spending and time; S-F16 verification page; the share card.

**Creator (the web Studio, phone first for daily work):** S-C1 verification and onboarding with
passkey, license and interview (S-C14); S-C2 My AI, including the FAQ check; S-C3 requests queue;
S-C4 packet detail with signing; S-C5 threads (takeover, handback, audit, "I'd never say that");
S-C6 Offers; S-C7 Publish (basic); S-C9 Earnings (minimal); S-C10 Team (basic); Today, the first
Studio tab; S-C12 Notes and Replies; S-C13 license and sponsorships; the weekly impact digest.

**Platform:** safety (report, block, crisis protocol), a minimal ops console, export and
delete, push notifications, instrumentation for the pilot gates, and the "who wrote this?"
comprehension study (T-21).

The decisions behind this scope:

| Decision | Detail |
| --- | --- |
| Pilot cut line (2026-10-08) | Slice 1 plus the share card. It orders the work; it removes nothing |
| Phone apps first (2026-10-08), option A (2026-10-09) | The pilot's native app is the fan app; creators use the web Studio in the phone browser; the native Studio app follows after the pilot. This replaced the 2026-10-08 plan to make Notes and reactions native at launch |
| Sign-in, option D (2026-10-15, confirmed 2026-11-01) | Qelvora sign-in with Apple and Google and an 18+ date-of-birth step, built on `main`; native wording "Sign in to continue" |
| Share card is in (2026-10-08) | A signed written reply with its public verification page, as an image and a link. The fan chooses how their handle appears, and either side can revoke it (D-15). Pulled forward from slice 3 |
| Model provider (2026-10-08) | The Anthropic API is the intended production provider. Switch before the first real creator publishes, as one engine revision, with the embedding provider chosen first. Development stays on the synthetic OpenAI configuration, which is not a production approval |
| Comparison freeze (2026-10-08) | Comparison stays installed and off. The creator's FAQ check replaced the fan-sample publish gate (#441). The wave cannot be removed, because export and delete are composed from it |
| Paid replies in the apps, Q04 (2026-10-08) | Continue on the web during the TestFlight and closed-testing pilot; settle the public-release approach with counsel (section 6) |

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
| The native Qelvora Studio app | Option A (2026-10-09) | After the pilot proves the daily loop, Notes and reactions first; earlier if pilot creators miss Notes because of the web |
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

Quality bars for the pilot, used as the definition of done in the consolidation plan (section 2)
*(to confirm)*:
- acknowledgment p95 at most 300 ms;
- first approved visible sentence p95 at most 4.5 s at the start of the pilot, and 2.5 s warm as
  the target after the provider switch (the October review measured 19 to 27 s; lane 3 brought the
  first sentence's median to about 7 to 8 s on the fakes);
- takeover visible within 500 ms;
- 99.9% monthly API availability;
- RPO 5 minutes and RTO 1 hour, proven by a restore drill;
- zero leaks between threads and zero unlabeled AI text;
- WCAG AA;
- nightly money reconciliation with zero mismatches;
- a fallback rate on a creator's own FAQ set low enough that creators don't need to file
  corrections for it (the threshold is set with the first creators).

## 6. What choosing phone apps first adds

- **Paid replies inside the app (Q04).** Memberships use in-app purchase (D-14) and calls
  are paid outside it, but asynchronous written replies bought in the app are still open with
  counsel. In-app purchase cannot hold and then capture, so "charged only when she accepts"
  needs a decision. Both apps disable "Send request" today, and the hand-off to the web is not
  built. Decided 2026-10-08: continue on the web during the TestFlight and closed-testing pilot;
  settle the public-release approach with counsel.
- **Distribution.** Run the pilot through TestFlight and Google Play closed testing, and
  release publicly after the pilot gates. Store accounts, an 18+ rating, in-app account
  deletion, a report control on every AI message and consent before data goes to a
  third-party AI are release requirements either way.
- **Links.** A link from a social app must open the app when it is installed and otherwise
  give the first answer on the web, then offer the app after the first useful answer. No
  universal or app links exist yet: they need the domain. Push is the main retention channel for
  "the person shows up".
- **Share card.** It needs the system share sheet on both platforms and a verification page
  that works signed out.

## 7. Where the build stands

Nearly every launch screen exists on web, iOS and Android, but only on a development host with
fake identity, payment, model and push providers. None of it has been accepted on a real device or
against a real provider. The moment-by-moment detail is in the
[consolidation plan](CONSOLIDATION_PLAN.md) (section 3.1), and the current state is in
[STATUS](STATUS.md).

| Moment | Works on the development host | Missing for the pilot |
| --- | --- | --- |
| 1 First answer | Public creator page and entrances, web sign-in and consent, the labeled thread with citations, takeover and handback, guard revision 16, the FAQ check | A real host, the Anthropic switch and real-model latency, universal and app links, native sign-in on devices |
| 2 Remembered | View, edit and delete memory everywhere | Memory extraction and "Want me to remember this?" (its SQL is unregistered), follow-up on return, a native memory prompt |
| 3 The person shows up | Signed Notes and reactions in the web and native threads, the Studio composer | Push end to end, follower Notes, withdrawn replies suppressing queued reactions (#400) |
| 4 Honest money | Packet, spend limit, hold, capture, decline, receipt, the scheduler and signed webhooks | A Stripe test-mode run with 3-D Secure, the phone-to-web hand-off, live keys |
| 5 The creator's five minutes | Today, Notes, the queue, threads and takeover, passkey signing on the web, one live stream instead of polling | Accept and deliver are two signing ceremonies (INV-22 is the founder's call), no digest producer, no installable Studio |
| Share card | The share endpoint, pages and native share sheets | The owner that supplies a share's source (#459 and #392) |
| Platform | Report, block, crisis, the ops console, an eight-domain export | The production host and its adapters, a real license verifier, pilot metrics, whole-account deletion (Q16), store readiness |

## 8. The road to the pilot

Build in vertical steps. Each ends with someone other than its author doing the moment on a real
iPhone and a real Android phone, in Light and Night, instead of hardening one layer at a time. A
weekly walk of the five moments on the two phones is the progress report. The durations assume the
hosting, domain and credential decisions arrive early in phase 1, and each phase ends with something
the founder can do on their own phones.

| Phase | What | Exit |
| --- | --- | --- |
| 0. Consolidate (about 2 weeks) | Consolidation plan, section 5 | Zero open PRs, `main` green and protected, docs current |
| 1. A real host (about 3 weeks) | Below | The founder signs in on both phones against staging, opens a creator link that launches the app, and receives a test push |
| 2. The five moments (about 4 weeks, 2 to 3 streams) | Below | Each moment done by someone other than its author on two real phones, in Light and Night; latency measured against the bar |
| 3. Pilot readiness (about 2 weeks; the web alpha can start midway) | Below | The private web alpha runs, then TestFlight and Play closed-testing builds go to the first creators |
| 4. The pilot | Pilot creators, measured against the gates in section 5. The size is undecided (below) | The founder's release decision |

**Phase 0: consolidate.** Waves 1 to 4 are done: all 66 pull requests that were open on 2026-11-01
are merged or closed with a note. Wave 5 (docs, CI path filters and the repository steps) is in
progress, and Wave 6 makes migration registration data-driven ([STATUS](STATUS.md)).

**Phase 1: a real host.**
- A production composition root with real adapters: option D accepted by the production config, a
  license verifier, the model, payments and push. `server.ts` is the development composition root;
  production hosts inject their adapters into the same `createConfiguredBackend` seam.
- Deploy images for the backend, web and workers, and a staging environment.
- The domain, the passkey origin, universal and app links, and the app entitlements that links and
  push need.
- Apple and Google credentials.
- The Anthropic switch as one engine revision, with the embedding provider chosen first (see the
  provider notes below).
- Logs, error tracking, alerts, backups and a restore drill.

**Phase 2: the five moments.**
- **Design first:** the launch screens and states that have no design
  ([design plan](DESIGN_PLAN.md#missing-launch-surfaces)).
- **Moment 1:** latency down to the bar; the guard and citations on the real model.
- **Moment 2:** memory extraction as a job after the answer, "Want me to remember this? Only if you
  say yes." in the thread, and follow-up on return.
- **Moment 3:** push for Notes and reactions, follower Notes, and reaction withdrawal (#400).
- **Moment 4:** a scripted Stripe test-mode run (hold, accept, decline, 3-D Secure, refund) and the
  phone-to-web hand-off for paid requests (Q04).
- **Moment 5:** accept and send in two taps; one signature for both only if the founder's INV-22
  call allows it; the digest producer; an installable Studio. The founder, as Maya, completes a
  day's five minutes on a phone in under five.
- **The share card,** end to end (#459 and #392 return here).

**Phase 3: pilot readiness.**
- Metric emitters and an aggregate pilot view (the small-group rule hides most per-creator data at
  pilot size).
- Whole-account deletion, after Q16 is decided.
- The ops console and a named reviewer for Note replies and safety cases.
- Store requirements: app icons, the iOS privacy manifest and trimmed background modes, and the
  Android target level, release build, signing and R8, Back handling and edge-to-edge.
- An accessibility pass, the T-21 comprehension study, a security review, a load test at pilot size,
  and runbooks.

**Phase 4: the pilot.** The pilot size is undecided. The Second Review proposes 5 to 10 creators
split across both cohorts for four to six weeks (section 8, and Q2 in section 7); the October launch
plan asked for a first cohort of three to five. The founder decides the size, the creators and the named reviewer.

The October finish plan's ten milestones are folded into these phases; the plan itself is in the
[archive](archive/operations/product-finish-plan-2026-10-08.md).

## 9. Founder decisions

**Made:**
1. **Native creator Studio:** option A (2026-10-09).
2. **Comparison done:** the definition in section 3 (2026-10-08).
3. **Anthropic timing:** before the first real creator publishes, as one engine revision, with the
   embedding provider chosen first (2026-10-08).
4. **Paid replies in the apps (Q04):** continue on the web during the pilot; counsel before the
   public release (2026-10-08).
5. **Pilot sign-in:** option D, with 18+ by a date-of-birth attestation plus platform age signals
   (counsel to confirm) and a Qelvora-specific account id (2026-10-15); the native wording (2026-11-01).
6. **The consolidation plan** and its defaults (2026-11-01).

**Still open** (the full list is in [STATUS](STATUS.md#decisions-the-founder-still-owes)):
1. Hosting, the domain and passkey relying-party ID (Q09), and the final app identifiers.
2. Apple and Google sign-in client IDs, counsel on the 18+ method, and the age-step copy.
3. The creator license terms and verifier.
4. The embedding provider, the Anthropic production key and terms, and the consent wording that
   names the providers (`[AI PROVIDERS]`).
5. Stripe test keys and the account topology (Q03); counsel on Q04 before public release.
6. Apple Developer and Google Play accounts, push credentials, one iPhone and one Android phone
   (Q10, Q11).
7. The invariant and policy calls: the INV-21 price rule, INV-22 one signature for accept and
   deliver, the A5 safety sign-off (taking the model safety check off the path before the
   acknowledgment), deletion D1 to D4 and Q16, and ops P1 to P5.
8. The pilot size, the creators and a named reviewer for Note replies and safety cases.
9. The quality bars in section 5, and voice notes after written replies (section 4).

## Provider switch notes (to verify at migration time)

The full checklist is in the [launch review](archive/operations/launch-review-2026-10-08.md), section 13.
The day-to-day setup is in [Claude as the generation provider](operations/anthropic-provider.md).

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

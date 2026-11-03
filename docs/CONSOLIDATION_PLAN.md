# Qelvora: consolidation review and plan

Written 2026-11-01 from a full review of `docs/`, `design/`, the code on `main` and on every open pull
request, the real CI logs, local runs on this Mac, and the October 27 handoff. Numbers were measured
from Git, GitHub or a local run on 2026-11-01 unless marked otherwise.

**Status (2026-11-02):** the founder approved the plan on 2026-11-01, with the recommended defaults
for the native sign-in wording ("Sign in to continue" and "Sign-in is unavailable right now. Try again
in a moment."), the home glyph for Today, and the local installs. Waves 1 to 4 are merged (#518 to
#527), and all 66 original pull requests are merged or closed with a note. Wave 5 is in progress:
the docs cleanup (one-page [STATUS](STATUS.md), the [docs index](README.md),
[engineering/](engineering/README.md) and [archive/](archive/)), the CI path filters, and the
repository steps that wait on the founder. The current state and queue are in [STATUS](STATUS.md),
which replaces the [coordination handoffs](archive/operations/handoff-2026-11-02.md). The section 6
working rules and the other section 8 decisions are still open. The tables below record the state on
the review day; links to moved files point at their new paths.

## 1. Bottom line

- **The product is well defined, and most launch screens already exist in code. The app is still not
  close to a pilot.** Nearly every launch screen is built on web, iOS and Android, but only on a
  development host with fake providers. There is no build that serves real accounts. The production
  shell rejects the sign-in you chose, a real creator cannot license an AI, and push, links, metrics
  and account deletion are not connected. About 15 launch screens or states were never designed.
- **`main` has not moved since 2026-10-16.** Two and a half weeks of work sit in four stacked draft
  pull requests (#514 → #515 → #517, plus #516). Their CI is red for three small, diagnosed reasons
  (section 3.3).
- **The 66 open pull requests fall into six groups.** 25 land when the integration stack lands, and 22
  land with one merge of #508. That leaves 19 to decide one by one, and none of those is wasted work
  (section 4).
- **The chaos has removable causes.** Too many parallel producers fed one slow merge path. CI waits
  hours for macOS runners. Verification lived on one Mac instead of in CI. The docs became evidence
  ledgers instead of instructions (section 3.4).
- **Recommendation:** spend about two weeks consolidating (section 5). The goal is that every PR is
  merged or closed with a reason, `main` is green, and the docs shrink to a few current files. Then
  build toward the pilot in vertical steps with `main` always green (sections 6 and 7).

## 2. What we are building, and what "done" means

**The product** (BRIEF and `docs/source/`): each creator has an authorized, clearly labeled AI. It talks
one-on-one with every fan, remembers them and cites the creator's own work. The creator stays present
through signed Notes and reactions and can step in. Fans can pay for a signed written reply, charged
only if the creator accepts. "Who is speaking" must be answerable in under a second on every surface.

**Launch scope** (LAUNCH_PLAN §3, decided 2026-10-08 and 2026-10-09):
- What ships: architecture slice 1 plus a minimal share card.
- Fans use the native iOS and Android apps. The web gives the first answer from a link and stays
  supported.
- Creators use the web Studio on their phones (option A).
- Sign-in is option D: a Qelvora-owned sign-in with Apple and Google plus an 18+ date-of-birth step.
  It is built and on `main`, but its decision is not yet recorded in the BRIEF or the source documents.
- Order: a private web alpha (about ten invited adults, Stripe test mode), then TestFlight and Play
  closed testing, then public release after the pilot gates.

**Done for the pilot.** Each item below must be checked by someone other than its author, on a real
iPhone and a real Android phone, in Light and Night:

1. **The five moments work end to end on the real host:** the first answer, being remembered, the
   person shows up, asking for her with honest money, and the creator's five minutes.
2. **Every launch screen exists in every state.** The fixed copy is used word for word, with no
   forbidden words.
   - Fan: creator home and entrances, S-F1 to S-F8, S-F11 to S-F16, and the share card.
   - Studio: S-C1 to S-C7, S-C9, S-C10, S-C12 to S-C14, the weekly digest and the signing sheet.
   - Platform: report, block and crisis; a minimal ops console; export and delete in every domain.
3. **INV-01 to INV-25 hold,** and their acceptance tests (T-xx) pass. The isolation test T-11 runs in
   CI.
4. **Quality bars:**
   - acknowledgment p95 at most 300 ms;
   - first approved sentence p95 at most 4.5 s at the start of the pilot, and 2.5 s warm after the
     provider switch;
   - takeover visible within 500 ms;
   - 99.9% monthly API availability;
   - RPO 5 min and RTO 1 h, proven by a restore drill;
   - zero leaks between threads and zero unlabeled AI text;
   - WCAG AA;
   - nightly money reconciliation with zero mismatches.
5. **Release requirements:** an 18+ rating, in-app account deletion, Report on every AI message,
   provider consent before the first AI message, and links that open the app or fall back to the web.

The pilot gates that decide public release are in LAUNCH_PLAN §5:
- arrival 40%;
- return within 7 days 50%;
- creators posting two Notes a week 70%;
- 5% of fans buying a human mode, and 60% of first-month members renewing;
- 90% comprehension of who wrote what;
- creator time under 2 h a week.

## 3. Where things stand

### 3.1 The product, moment by moment

Everything below works only on the development host with fake identity, payment, model and push
providers. None of it has been accepted on a real device or against a real provider.

**1. The first answer**
- **Works today:**
  - public creator page and entrances, web sign-in (option D) and consent;
  - the thread with authorship labels, citations, takeover and handback;
  - guard revision 16, sentences painted from frames, FAQ-based publishing (#517).
  - First sentence p50 is about 6.9 to 8 s, on fakes.
- **Missing for the pilot:**
  - a real host;
  - the Anthropic switch: embeddings provider, Claude token counting, and a measured real-model
    latency against the 4.5 s bar;
  - universal and app links;
  - native sign-in tested on devices with real provider sheets.

**2. Being remembered**
- **Works today:** view, edit and delete memory on every surface.
- **Missing for the pilot:**
  - memory extraction and "Want me to remember this?", whose SQL is unregistered;
  - follow-up on return;
  - a native memory prompt.

**3. The person shows up**
- **Works today:**
  - signed Notes and reactions;
  - Notes and reactions in the web and native threads (#517);
  - the Studio Note composer.
- **Missing for the pilot:**
  - push end to end: the APNs/FCM sender is never created, and there are no entitlements or Firebase
    config;
  - follower Notes, which need 0255's runtime check;
  - withdrawn replies suppressing queued reactions (#400);
  - two native implementations to reconcile (#508).

**4. Honest money**
- **Works today:**
  - packet, spend limit, hold, capture, decline and receipt;
  - the scheduler and signed webhooks, composed in the development host (#517).
- **Missing for the pilot:**
  - a run against Stripe test mode, including 3DS;
  - in both apps "Send request" is disabled, and the hand-off to the web is not built;
  - the processor-notification login (#425);
  - live keys are refused in code.

**5. The creator's five minutes**
- **Works today:**
  - Studio Today, Notes, the queue, threads and takeover;
  - passkey signing on the web.
- **Missing for the pilot:**
  - accept and deliver are two signing ceremonies (INV-22 is your call);
  - no producer feeds the weekly digest;
  - no installable Studio (no manifest or service worker);
  - Studio polls every 4 s (#488 fixes it).

**Share card**
- **Works today:** the share endpoint, pages and native share sheets.
- **Missing for the pilot:** the owner that supplies a share's source returns nothing, so no card can
  be created. #392 and #459 hold the backend half.

**Platform**
- **Works today:** report, block, crisis, the ops console and an eight-domain export.
- **Missing for the pilot:**
  - **Production host:**
    - the production assembly needs seven adapters, and no adapter module exists;
    - the AI generation host refuses anything but development;
    - there is no Dockerfile for the backend or web;
    - the production config refuses option D.
  - **Real creators cannot license an AI:** only a development license verifier exists.
  - **No pilot metrics are recorded:** the metrics function has no callers.
  - **Whole-account deletion is blocked,** and the Q16 money-retention decision is open.
  - **Store readiness:** no app icons, and no Android release build, signing or R8.

**Top pilot blockers, in order:**
1. A production host (L).
2. Option D identity on that host (M).
3. Creator license authority, which needs counsel (M).
4. The Anthropic switch before any creator publishes (M).
5. Push end to end (M).
6. Domain, links and the passkey origin (S once the domain is chosen).
7. Real money in Stripe test mode, plus the phone-to-web hand-off (M–L).
8. The native trunk and store readiness (M).
9. Instrumentation and the digest (M).
10. Whole-account deletion (M–L).

### 3.2 Design coverage

The design phases are complete for what was drawn.

**Launch surfaces with no design:**
- **Sign-in and onboarding:**
  - option D sign-in: Apple/Google, date of birth, under-18 refusal, sign-in failure, handle taken.
- **The thread:**
  - the S-F6 memory card, open-loop follow-up and the intro-card offer;
  - 12 of the 21 launch honest states;
  - the creator's hand back.
- **Money:**
  - web membership checkout, 3DS, the app-to-web request hand-off and Play Billing.
- **Studio:**
  - S-C7 Publish and the S-C14 interview;
  - passkey registration, pending review and lost device;
  - signing sheets for each act type;
  - FAQ-set authoring;
  - license switches and Pause everything;
  - the Today screen.
- **Sharing:**
  - share-card handle choice and revocation.
- **Safety, account and ops:**
  - report, block and crisis UI;
  - delete account and notification settings;
  - the ops reviews and pauses.
- **Measurement:**
  - the pilot aggregate view;
  - the full T-21 study kit.

**Stale or wrong boards:**
- "Continue with Pantopus" appears in nine boards.
- "Sign with Face ID" is drawn for what is now a web Studio.
- Creator setup is drawn only at desktop width under option A.
- Deferred voice, call and public modes are still drawn.
- INV-22's single signature is drawn as if decided.
- A few boards contradict the fixed copy ("What Maya will see").
- `DESIGN_PLAN.md` ticks several missing boards as done.
- 13 contradictions between the BRIEF, LAUNCH_PLAN and the sources need correcting. The list is in the
  review notes and goes into the docs cleanup.

### 3.3 The repository

| Item | State |
| --- | --- |
| `main` | `b154252e3`, last changed 2026-10-16; CI green then |
| Integration stack | #517 contains #514, #515, #516, #511 and 20 lane-3 PRs: 177 commits, 214 files, +30,210/−1,489, a strict descendant of `main` with no conflicts |
| What #517 adds | About 7.5k hand-written code and config lines (backend +4.7k, web +1.0k, iOS +1.3k, Android +0.6k); 13.4k lines of scenario scripts; 4.1k of docs (21 new); 2.9k of migration wave JSON; 0.77 MB of evidence. No TODOs, debug leftovers or secrets |
| CI on #514, #516, #517 | Web and backend (`pnpm check`, including 157 backend tests on real PostgreSQL), evidence budget, and Android unit and screenshot tests pass. **iOS UI test, Android device test and web visual fail** |
| Migrations | 119 registered on `main` (to 0251). #517 registers 0252 workspace lock, 0253 reply review, 0254 creator/fan denial and 0255 follower metadata. 0255's runtime check never ran. 26 SQL files are neither registered nor reserved |
| Tests | 9 backend test files (157 tests), no web unit tests, 30 visual specs, 158 scenario scripts (about 46k lines) that never run in CI |
| Docs and evidence | 318 doc files (6.9 MB); 5,613 evidence files (320 MB) under `artifacts/`; a 260 MB Git pack |
| Branches | 532 on GitHub: 392 already merged, 66 behind open PRs, 74 unmerged with no PR |
| GitHub settings | Public repository; `main` has no branch protection and no required checks |
| CI speed | Jobs take 3 to 25 minutes, but a full run took 94 minutes at the median and 192 at p90 (October 15–28), mostly waiting for macOS runners; 134 of 257 runs were cancelled by newer pushes |

**Why #517's CI is red.** The causes come from the real logs and were reproduced locally:

1. **iOS:** `FoundationFlowTests.testWelcomeSignInFailsClosedInBothThemes` still expects "Pantopus
   sign-in is not connected in this local build." #514 now shows "Sign-in is unavailable right now. Try
   again in a moment." and renames the button "Sign in to continue". The behavior is intended; the test
   is stale.
2. **Android:** `NativeAcceptanceTest.unavailableSignInNeverPretendsToAuthenticate` fails for the same
   reason: it taps "Continue with Pantopus" and expects the old sentence.
3. **Web visual:** the catalog comparison fails on 14 Studio boards and three components (StudioTabBar,
   Sidebar, QueueCard).
   - #517 implemented your 2026-10-15 decision that Today replaces Notes as the first Studio tab, but
     the reference designs still show Notes.
   - Queue-card buttons now render only when a handler is passed, and the design catalog passes none.
   - Locally, `main` passes 13 of 13 visual tests and #517 fails the same 4 as CI.
   - The fix is to add Today as a reference correction and pass empty handlers in the catalog preview.

Locally, #517 also passes `generate:check`, all seven typechecks and lint.

**The 74 unmerged branches without a pull request** are mostly the early-October workstream branches.
About 95% of their added code is already in #517, measured line by line. Three are worth a look before
deletion:
- `codex/w5-native-content-session-20261003`, a 190-line work-in-progress checkpoint;
- `codex/w5-original-studio-session-20261003`, Studio session guards, partly moved by the later Studio
  split;
- an unregistered `0110` SQL file on `codex/w3-generation-terminal-consumer`.

The `cost` branch holds your cost and revenue spreadsheet, which is not on `main`.

### 3.4 Why it became chaotic

This is the fourth pile-up of open work:
- October 7: 18 PRs consolidated into #132;
- October 8: #351 to #353;
- October 15–16: the lane batches;
- now: 66.

The same causes recur each time:

1. **More parallel producers than merge capacity.** Seven lanes, an integrator and separate Codex streams
   each opened stacked PRs. Merging needed a founder list, green CI and an integrator session. Lane 7's
   stack grew 22 PRs deep, and the integration branch grew for 2.5 weeks without landing.
2. **CI is slow for the wrong reason.** Waiting for macOS runners, not the work itself, makes a run take
   hours. So merges were batched, and the batches went stale.
3. **Verification lived on one Mac, not in CI.**
   - The scenario scripts are run by hand against long-lived local databases, with "never reset" rules,
     preserved clocks and evidence in `/tmp`. None of that exists on this Mac.
   - The late-October work went mostly into qualifying three migration registrations on numbered local
     stacks. Migration 0255 alone is 136 lines of SQL with about 3,500 lines of wave files, catalogues,
     scripts and reports around it.
4. **Documents became ledgers.**
   - There are 318 doc files.
   - The "current" boards disagree: `main`'s CURRENT dates from October 15, #517's from October 27, and
     the README still points at the eight-workstream plan.
   - The handoffs are dense enough that the next session struggles to act on them.
   - `AGENTS.md`, which Codex reads, carries none of the project rules in `CLAUDE.md`.
5. **Evidence in Git.** 320 MB of screenshots and receipts in the tree slow every clone and checkout.

## 4. The 66 open pull requests

| Group | PRs | Count | Disposition |
| --- | --- | ---: | --- |
| A. Lane 3 AI engine, already inside #517 | #433 #436 #438 #441 #444 #446 #451 #455 #456 #464 #468 #473 #477 #482 #489 #490 #491 #492 #494 #495, and the wave #511 | 21 | Land with the integration stack. With merge commits, GitHub marks them merged automatically |
| B. Integration stack | #514 #515 #516 #517 | 4 | Fix the three stale checks, then land in three steps (section 5, wave 1) |
| C. Lane 3 follow-ups | #512 #513 | 2 | Merge #512. Rework #513 to keep #514's FAQ draft fix, then merge |
| D. Lane 7 native stack | #401 #452 #457 #460 #462 #465 #466 #471 #493 #496–#508 | 22 | One merge of #508 after the stack, resolving its conflicts once. #452's presence reader and #462's under-18 screen give way to #516 and #514 |
| E. Lane 5 drafts (October 10, lane stopped) | #388 #389 #392–#400 | 11 | Merge #388, #392, #393, #394, #395 and #396. Rework #389, #397 and #400. Defer #398. Close #399 and keep its branch |
| F. Lanes 1, 4 and 6 | #425 #439 #459 #487 #488 #509 | 6 | Merge #488. Rework #425, #439 and #459 into a pilot migration wave (#459 together with #392). Park #487. Fold #509 into the docs |

None of the 19 PRs in groups C, E and F duplicates #517.

**Eight PRs carry unregistered SQL:** #397, #398, #399, #400, #425, #439, #459 and #487. Four of them
(#397, #398, #400, and #439's "It's lost or broken") break something if merged before their SQL is
registered.

The full per-PR table is in the appendix.

## 5. Consolidation plan (about two weeks)

**Goal:** zero open PRs, every one merged or closed with a reason, a green `main`, and a clean, current
set of docs. No new features during this period.

**Wave 0: set up this Mac (half a day).**
- Already working: Node 26, npm, Docker 29, Xcode 27.1 and `gh`.
- To install:
  - pnpm 12.5.1 permanently (via npm or Homebrew) and Node 24, which CI uses;
  - for Android: JDK 17 and the Android SDK;
  - for iOS: `xcodegen`;
  - the `pgvector/pgvector:pg17` image for the local stack.
- The repo's rules require your yes for the image download.

**Wave 1: land the integration stack, in three steps (2–3 days).** All steps use merge commits, never
squash, so GitHub closes the contained PRs automatically.
1. **The AI engine.**
   - What: #511's wave plus the engine follow-ups and 0252, the commit at `0a20ee8ae`. On the native
     side it touches only regenerated API and copy files.
   - Check: CI green (it installs every registered migration on a fresh database and runs the backend
     suite) and lane 3's key scenarios.
   - Closes: #511 and the 20 lane-3 PRs.
2. **The app-completion work.**
   - What: #514 and #516, plus the three test fixes from section 3.3.
   - Check: CI green on all six jobs; the sign-in, Studio, web-presence and money scenarios; one
     fake-provider native sign-in run per platform; #516's native presence harness.
   - Before merging: retarget #516 to `main`.
   - Closes: #514 and #516.
3. **Reply review and the authority guards.**
   - What: #515 and #517 (0253, 0254, 0255).
   - Check: on a fresh local stack, run the reply-review, creator/fan-denial and follower scenarios,
     including the follower runtime check that never ran.
   - Fallback: if 0255's check fails, land 0253 and 0254 now and fix 0255 in its own PR.
   - Closes: #515 and #517.

**Wave 2: the native stack (4–5 days; can overlap with wave 3).**
- **Merge #508 once** on a branch cut from `main` after wave 1. Resolve its 20 conflicts:
  - regenerate the six copy files from the union of `config/copy.json` (no key is shared);
  - keep #516's presence reader and #514's sign-in and under-18 handling;
  - rebuild the two `W3FanFeatures` files from #508's side, then re-apply #516's small changes.
- **Clean up after the merge:**
  - point lane 7's scenarios at "Sign in to continue";
  - remove the duplicate harness route;
  - prune screenshots under the 1 MB evidence limit.
- **Check:**
  - both apps build, and their unit and UI tests pass;
  - the never-run checks from #505, #506 and #507 are run.
- **Closes** all 22 lane-7 PRs.
- **Open question:** #516's 2-second re-read plus #506's polling exceeds the request budget in E7.8. My
  proposal: accept it for now, and move native presence onto the existing live stream as a follow-up.

**Wave 3: small merges (1–2 days, in parallel with wave 2).**
- Merge #512, #488, #388, #392, #394 (without its status rewrites), #395 and #396.
- Merge #393 after re-running its browser check.
- Rework #513 (FAQ fix) and #389 (rate limit) first.
- The lane-5 drafts never ran CI, so each one gets a CI run before it merges.

**Wave 4: one pilot migration wave, 0256 onward. Done on 2026-11-02 through #527.** A trial on
2026-11-01 showed that registering all five files by hand would take three to four days, so the founder
chose "three now, rest later".
- **One PR registers** #439 (passkey retirement), #397's invite-note column and #425 (processor login)
  as 0256 to 0258 in one wave. None of the three adds a function that needs its own catalogue check.
- **Carried into feature work** (closed with notes, branches kept): #400 (reaction availability) into
  the push work, and #459 with #392 (share status) into the share-card work. When they return, each
  gets the registered-source guard its code is missing.
  - Lane 1's ops SQL that merged without registration (#472, #475, #478) joins the next wave if it is
    still unregistered.
- **Parked** #487 and #399, and deferred #398. Each has a closing note, and its branch is kept.
- **Simplify registration right after consolidation,** before the next migration-heavy feature, so a
  wave is a small mechanical PR. Generate the wave and review files with a script, and stop
  hand-editing baseline arrays.
- **Defer restore and upgrade drills** until a production database exists. Keep the fresh install and
  the catalogue check in CI.

**Wave 5: docs, evidence and repository hygiene (1–2 days).**
- **Docs:**
  - `docs/README.md` (where to start), a one-page `STATUS.md` (replaces CURRENT), and the BRIEF with its
    13 contradictions fixed and the missing decision rows added (option D, Today, author header,
    passkey retirement, cost hold, FAQ check);
  - LAUNCH_PLAN re-baselined to section 7;
  - `engineering/` for setup, the local stack, migrations, CI and release;
  - `archive/` for the workstreams, lanes, dated operations reports, handoffs and implementation
    notes;
  - `DESIGN_PLAN.md` corrected to what actually exists.
- **Agent rules:** `CLAUDE.md` and `AGENTS.md` carry the same rules. The README points at
  `docs/README.md`.
- **Evidence:** tag the current tree, remove `artifacts/` from the working tree, and keep the
  evidence-budget check. Shrinking the 260 MB history needs a force-push, which is optional and best
  done once no PRs are open.
- **Branches:** tag, then delete, the 392 merged branches and the 74 orphan branches. Turn on
  "delete branch on merge".
- **`main`:** protect it with required checks. Run the macOS jobs only when native, shared-UI or visual
  paths change, plus every night.

**Effort:** about ten working days for one integrator, or one to one and a half weeks if waves 2 to 4
run as separate sessions on separate files.

## 6. How we work from now on

1. **One trunk, always green.**
   - `main` is protected and every change goes through a PR.
   - Required checks pass before a merge, and we merge with merge commits.
   - A PR merges within two working days or is closed with a reason.
   - No stack is more than two deep, and no integration branch lives longer than three days.
2. **One merge owner at a time, and at most three build sessions,** each owning separate files. Aim for
   PRs under about 600 hand-written lines.
3. **CI is the referee.**
   - A fast required gate runs in under 15 minutes: generate, typecheck, lint, format, backend tests on
     PostgreSQL, build, and a scenario smoke on a fresh stack.
   - Native and visual jobs are required when their paths change, and the full matrix runs every
     night.
   - A flaky check gets fixed the day it appears.
4. **Scenarios stay the acceptance standard, and they run in CI** on a disposable stack. Evidence of
   "I ran it by hand" no longer counts as proof.
   - I recommend also allowing focused unit tests for pure logic (money arithmetic, guard patterns,
     state machines, parsers) and one regression test per fixed bug. That reverses the October 9 rule,
     so it is your call.
5. **Disposable environments only.** Every scenario creates its own accounts and data on a fresh
   stack. No preserved databases, clocks or accounts act as gates, and nothing important lives only in
   `/tmp` or on one Mac.
6. **Migrations stay strict where it matters:** applied SQL never changes, checksums stay, and a fresh
   install plus the catalogue check run in CI. Registration becomes a small scripted PR, and restore
   drills are automated once a production database exists.
7. **Docs stay small and current.**
   - Three living documents: the BRIEF (product and decisions), LAUNCH_PLAN (scope and order) and
     STATUS (one page), plus the engineering how-tos.
   - A decision becomes one BRIEF row the day it is made.
   - Sessions update STATUS instead of adding dated handoffs, in plain words, with no port numbers or
     machine paths.
   - Evidence goes in the PR description and CI artifacts, never in Git.
8. **Work is tracked as GitHub issues,** one per pilot task, each with acceptance criteria, grouped by
   the five moments on a project board. Every PR links an issue.
9. **A weekly demo is the progress report:** the five moments on a real iPhone and a real Android
   phone (LAUNCH_PLAN §8).
10. **Definition of done for a PR:**
    - CI is green;
    - its scenario is in CI;
    - copy is checked against the contract;
    - STATUS and the BRIEF are updated;
    - UI changes have Light and Night screenshots in the PR description, not in Git.

## 7. From consolidation to the pilot

The durations assume your hosting, domain and credential decisions arrive early in phase 1. Each phase
ends with something you can do yourself on your phones.

| Phase | What | Exit |
| --- | --- | --- |
| 0. Consolidate (about 2 weeks) | Section 5 | Zero open PRs, `main` green and protected, docs current |
| 1. A real host (about 3 weeks) | See below | You sign in on both phones against staging, open a creator link that launches the app, and receive a test push |
| 2. The five moments (about 4 weeks, 2–3 streams) | See below | Each moment done by someone other than its author on two real phones, in Light and Night; latency measured against the bar |
| 3. Pilot readiness (about 2 weeks; the web alpha can start midway) | See below | The private web alpha runs, then TestFlight and Play closed-testing builds go to the first creators |
| 4. Pilot | 3 to 5 creators (or 5 to 10: the documents disagree), measured against the gates | Your release decision |

**Phase 1: a real host.**
- A production composition root with real adapters: option D accepted by the production config, a
  license verifier, the model, payments and push.
- Deploy images for the backend, web and workers, and a staging environment.
- The domain, passkey origin and universal/app links.
- Apple and Google credentials.
- The Anthropic switch as one engine revision, with the embedding provider chosen first.
- Logs, error tracking, alerts, backups and a restore drill.

**Phase 2: the five moments.**
- **Design first:** the screens and states listed in section 3.2.
- **Moment 1:** latency down to the bar; the guard and citations on the real model.
- **Moment 2:** memory extraction, the prompt and follow-up on return.
- **Moment 3:** push for Notes and reactions, follower Notes and reaction withdrawal.
- **Moment 4:** Stripe test mode with 3DS, and the phone-to-web hand-off.
- **Moment 5:** two taps and one signature (if INV-22 allows), the digest producer and an installable
  Studio.
- **The share card,** end to end.

**Phase 3: pilot readiness.**
- Metric emitters and the aggregate view.
- Whole-account deletion, after Q16 is decided.
- The ops console and a named reviewer.
- Store requirements: icons, Android release build, signing and R8, and the privacy manifest.
- An accessibility pass, the T-21 comprehension study, a security review, a load test at pilot size,
  and runbooks.

## 8. Decisions needed from you

**To start the consolidation (this week):**
1. **The plan:** approve the PR dispositions and the order above. Authorize me to push branches, merge
   to `main` with merge commits, retarget and close PRs with comments, and delete merged branches
   after tagging them.
2. **Sign-in wording.** Confirm option D formally: Apple, Google and a date-of-birth step. Confirm the
   native button "Sign in to continue" and the message "Sign-in is unavailable right now. Try again in a
   moment." These replace "Continue with Pantopus" and fix two of the three CI failures.
3. **Today's icon:** confirm the home glyph for the Today tab. You chose Today on 2026-10-15; the icon
   was left open.
4. **Local downloads:** the PostgreSQL image, Node 24, a JDK, the Android SDK and `xcodegen`.
5. **How we work (section 6):**
   - protect `main` with required checks;
   - scenarios in CI;
   - unit tests allowed for pure logic and bug regressions;
   - the docs cleanup, including removing `artifacts/` from the tree;
   - parallel sessions under one merge owner.
6. **Native presence request budget:** accept #516's 2-second re-read for now, and move it to the live
   stream later?
7. **Repository visibility:** it is public, with the full source, designs and internal docs. Should it
   be private?
8. **The old Mac's preserved stacks and dates:** may we treat them as history rather than gates? Is that
   machine still in use?
9. **The `cost` spreadsheet:** add it to `docs/research/` on `main`?

**For the pilot path (next one to three weeks):**
1. **Hosting:** provider, region, budget and account. Lane 2's latest recommendation (2026-10-22) is
   Fly.io with Crunchy Bridge, about $150 to $250 a month, or $250 to $400 with a standby database.
2. **Domain:** the domain and passkey relying-party ID (Q09), and the final app identifiers.
3. **Sign-in credentials:** the Apple and Google sign-in client IDs; counsel on the 18+ method; approval
   of the age-step copy.
4. **Creator license:** counsel-reviewed terms and a verifier approach.
5. **Model provider:** the embedding provider; the Anthropic production key and terms; the consent
   wording that names the providers.
6. **Payments:** Stripe test keys and the account topology (Q03). Counsel on paid replies in the apps
   (Q04) can come before public release.
7. **Stores and devices:** Apple Developer and Google Play accounts, push credentials, one iPhone and one
   Android phone.
8. **Your calls on the invariants and policies:**
   - the INV-21 price rule;
   - INV-22, one signature for accept and deliver;
   - the A5 safety sign-off;
   - deletion D1 to D4 and Q16 (money records when a fan deletes their account);
   - ops P1 to P5.
9. **Pilot cohort:** its size, the creators, and a named reviewer for Note replies and safety cases.

## Appendix: every open pull request

Group letters match section 4. "CI then" is the last Foundation checks result on the PR's head; the
lane PRs were checked against an older `main`.

| PR | Group | State | CI then | What it is | Disposition | Why |
| --- | --- | --- | --- | --- | --- | --- |
| [#388](https://github.com/WangPantopus/creator-platform/pull/388) | E | draft | none | WP 5.6: remove withdrawn posts from public pages | Merge after #517 | Removes edited, unpublished or archived posts from public pages; fixes a UUID typing bug still present in #517. Re-run e5-5. |
| [#389](https://github.com/WangPantopus/creator-platform/pull/389) | E | draft | none | WP 5.6: cache and bound public creator page reads | Rework, then merge | Cached, bounded public creator page (launch step 2). Fix the rate limit (keyed on the socket, so all server-rendered views share one budget); drop its status-file rewrites. |
| [#392](https://github.com/WangPantopus/creator-platform/pull/392) | E | draft | none | WP 5.8: restrict share cards to signed human replies | Merge with #459 as the share-card PR | Share cards only for signed human replies (founder decision). |
| [#393](https://github.com/WangPantopus/creator-platform/pull/393) | E | draft | none | WP 5.10: prepare creator launch links and checklist | Merge after re-running E5.10 | Launch kit endpoint, checklist and share action; its old blocker was fixed on main. Land before #397. |
| [#394](https://github.com/WangPantopus/creator-platform/pull/394) | E | draft | none | WP 5.3: retain Android push IDs while offline | Merge, minus status rewrites | Android push stays deliverable while a phone is offline (TTL 0 to 24 h). |
| [#395](https://github.com/WangPantopus/creator-platform/pull/395) | E | draft | none | WP 5.5: document and check missing digest owners | Merge | Docs and scenario: the digest has no connected data source (still true). |
| [#396](https://github.com/WangPantopus/creator-platform/pull/396) | E | draft | none | WP 5.9: define metric owners and expose missing events | Merge | Docs and scenario: metric events have no production caller (still true). |
| [#397](https://github.com/WangPantopus/creator-platform/pull/397) | E | draft | none | WP 5.7: add public invitation notes and retry-safe entry links | Rework into the pilot migration wave | Invitation note, retry-safe links and four-screen entry. Reads a column that does not exist until its SQL is registered; rebase on #393. |
| [#398](https://github.com/WangPantopus/creator-platform/pull/398) | E | draft | none | WP 5.6: propose growth-owned public profile fields | Rework later, second wave | Growth-owned biography and profile fields: new table, never-run scenario, missing Studio form and copy. |
| [#399](https://github.com/WangPantopus/creator-platform/pull/399) | E | draft | none | WP 5.4: add encrypted creator web push delivery | Close, keep the branch | Creator web push: needs VAPID keys, a Studio service worker and its own SQL. Not on the pilot path; note it in the backlog. |
| [#400](https://github.com/WangPantopus/creator-platform/pull/400) | E | draft | none | WP 5.2: suppress queued reactions after reply withdrawal | Rework into the pilot migration wave | Queued reaction pushes check the reply was not withdrawn (moment 3). Add the registered-source guard or every reaction push retries forever; fix ids.mjs. |
| [#401](https://github.com/WangPantopus/creator-platform/pull/401) | D | open | green | WP 7.3: Preserve encrypted drafts and usable composers | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#425](https://github.com/WangPantopus/creator-platform/pull/425) | F | draft | none | WP 4.2: a non-owner login to claim processor notifications (migration, needs registration) | Rework into the pilot migration wave | The processor-notification login; its consumer is already in #517. |
| [#433](https://github.com/WangPantopus/creator-platform/pull/433) | A | open | green | A6: count an interrupted reply's unknown cost as its whole hold | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#436](https://github.com/WangPantopus/creator-platform/pull/436) | A | open | green | A6: a dropped request no longer locks the creator's AI | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#438](https://github.com/WangPantopus/creator-platform/pull/438) | A | open | green | A6: size the reply cost hold as a strict bound from the creator's configuration | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#439](https://github.com/WangPantopus/creator-platform/pull/439) | F | open | green | WP 1.5: a lost passkey retires and past signatures stay valid | Rework into the pilot migration wave | Lost passkey retires while past signatures stay valid (founder decision). "It is lost or broken" fails until its column exists. |
| [#441](https://github.com/WangPantopus/creator-platform/pull/441) | A | open | green | B2: replace the fan-sample publish gate with the creator's FAQ check | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#444](https://github.com/WangPantopus/creator-platform/pull/444) | A | open | green | A2: wake the generation worker when a message is accepted | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#446](https://github.com/WangPantopus/creator-platform/pull/446) | A | open | green | B9: hide step-in after a crisis or safety refusal, drop comparison-off copy, stop idle ... | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#451](https://github.com/WangPantopus/creator-platform/pull/451) | A | open | green | A6: answers wait briefly for the creator's AI workspace row (finding 15, migration prop... | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#452](https://github.com/WangPantopus/creator-platform/pull/452) | D | open | green | 7.4: Notes and reactions in the thread (C4) | Merge via #508, partly superseded | Drop its presence reader (replaced by #516); keep author labels, hairline and scenarios retargeted. |
| [#455](https://github.com/WangPantopus/creator-platform/pull/455) | A | open | green | A6: finish an answer at once when its authority ends after the claim (finding 8) | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#456](https://github.com/WangPantopus/creator-platform/pull/456) | A | open | green | A6: finding 9 (crash after a sentence) proposed to lane 4, status only | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#457](https://github.com/WangPantopus/creator-platform/pull/457) | D | open | green | 7.4: the creator's initial on the step-in seal | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#459](https://github.com/WangPantopus/creator-platform/pull/459) | F | draft | green | Lane 5 ticket: share cards, commerce answers growth's shareSource and shareStatus (migr... | Rework, fold into the share-card PR with #392 | Commerce answers share source and status. Add the registered-source guard, wire it in server.ts, add the public-read refusal, register its SQL. |
| [#460](https://github.com/WangPantopus/creator-platform/pull/460) | D | open | green | 7.4: the fixed provider sentence before the first message | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#462](https://github.com/WangPantopus/creator-platform/pull/462) | D | open | green | 7.4: the designed under-18 state when the server refuses an account | Merge via #508, partly superseded | Its under-18 screen is replaced by #514; keep its harness flag and scenarios. |
| [#464](https://github.com/WangPantopus/creator-platform/pull/464) | A | open | green | A4: fewer transactions per answer (first sentence p50 8.2 to 6.9 s) | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#465](https://github.com/WangPantopus/creator-platform/pull/465) | D | open | green | 7.4: a refused source no longer hides the Android thread | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#466](https://github.com/WangPantopus/creator-platform/pull/466) | D | open | green | 7.4: status and resume notes | Fold docs into the #508 consolidation | Status and handoff docs only. |
| [#468](https://github.com/WangPantopus/creator-platform/pull/468) | A | open | green | B4: retrieve with the fan's previous turn and an evidence floor (engine revision 15) | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#471](https://github.com/WangPantopus/creator-platform/pull/471) | D | open | green | 7.4: the iOS thread no longer freezes and keeps its newest row in view | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#473](https://github.com/WangPantopus/creator-platform/pull/473) | A | open | green | B1: guard revision 16 (anchored, normalized patterns, price rule, distress-safe fallback) | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#477](https://github.com/WangPantopus/creator-platform/pull/477) | A | open | green | B3: citations survive a same-revision rebuild and open their exact span | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#482](https://github.com/WangPantopus/creator-platform/pull/482) | A | open | green | A7: paint approved sentences from their frames on the web thread (C5) | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#487](https://github.com/WangPantopus/creator-platform/pull/487) | F | open | green | WP 4.9: the public summary says how long the creator usually takes to decide (decision ... | Park (close, keep the branch) | "Usually decides in {range}" shows nothing with under five outcomes, i.e. for the whole pilot. Its function check would trust a hand-installed function. |
| [#488](https://github.com/WangPantopus/creator-platform/pull/488) | F | open | green | 6.9: replace Studio's 4-second polling with one live stream | Merge after #517 | One live stream replaces Studio 4-second polling (32-80 to 16-18 idle requests a minute). Keep both sides of lane-6.md; re-run e6-9 and E6.1. |
| [#489](https://github.com/WangPantopus/creator-platform/pull/489) | A | open | green | A5: acknowledge after the synchronous safety check; the worker answers a crisis first | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#490](https://github.com/WangPantopus/creator-platform/pull/490) | A | open | green | B5: the worker proposes memory after the answer (migration proposal, off until registered) | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#491](https://github.com/WangPantopus/creator-platform/pull/491) | A | open | green | B5: ask the fan about each memory proposal in the web thread | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#492](https://github.com/WangPantopus/creator-platform/pull/492) | A | open | green | B5: an exclusion removes only what it names in the AI's context (finding 18, migration ... | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#493](https://github.com/WangPantopus/creator-platform/pull/493) | D | open | green | 7.4: Android keeps following the thread when rows shift above | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#494](https://github.com/WangPantopus/creator-platform/pull/494) | A | open | green | A7: the realtime gateway waits up to the scope window for its authority read (finding 5) | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#495](https://github.com/WangPantopus/creator-platform/pull/495) | A | open | green | Finding 6: retry the settlement when the thread row is locked | Close as merged via #517 | Exact head already inside #514/#517; GitHub marks it merged automatically when #517 lands with a merge commit. |
| [#496](https://github.com/WangPantopus/creator-platform/pull/496) | D | open | green | 7.4: the comparison placeholder is gone (P11) | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#497](https://github.com/WangPantopus/creator-platform/pull/497) | D | open | green | 7.4: the composer follows the creator, the AI and a pause (P3) | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#498](https://github.com/WangPantopus/creator-platform/pull/498) | D | open | green | 7.4: a chat link opens the person's existing conversation | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#499](https://github.com/WangPantopus/creator-platform/pull/499) | D | open | green | 7.4: notification rows with authorship, time and Unread (P2) | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#500](https://github.com/WangPantopus/creator-platform/pull/500) | D | open | green | 7.4: named pickers instead of typed ids (P5) | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#501](https://github.com/WangPantopus/creator-platform/pull/501) | D | open | green | 7.4: the 3-hour reminder (P8) | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#502](https://github.com/WangPantopus/creator-platform/pull/502) | D | open | green | 7.4: the packet's terms in the approved wording (P9) | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#503](https://github.com/WangPantopus/creator-platform/pull/503) | D | open | green | 7.4: status, results, decisions and handoff | Fold docs into the #508 consolidation | Status and handoff docs only. |
| [#504](https://github.com/WangPantopus/creator-platform/pull/504) | D | draft | green | 7.10: copy lookups for every user-facing string in both apps | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#505](https://github.com/WangPantopus/creator-platform/pull/505) | D | draft | green | 7.11: accessibility pass on both apps | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#506](https://github.com/WangPantopus/creator-platform/pull/506) | D | draft | green | 7.8: less polling, sentences painted from frames, honest offline | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#507](https://github.com/WangPantopus/creator-platform/pull/507) | D | draft | green | 7.12: open the web Studio from the fan app | Merge via one #508 consolidation | Unique native work; lands with one merge of #508 onto main after #517 (conflicts resolved once). |
| [#508](https://github.com/WangPantopus/creator-platform/pull/508) | D | draft | green | status: handoff after 7.10, 7.11, 7.8 and 7.12 | Fold docs into the #508 consolidation | Status and handoff docs only. |
| [#509](https://github.com/WangPantopus/creator-platform/pull/509) | F | open | green | Status: twelve pull requests merged; #439 waits for its migration | Fold into the docs cleanup | Lane 1 status; "activate 0156" is now 0253. |
| [#511](https://github.com/WangPantopus/creator-platform/pull/511) | A | open | green | Merge wave: land #433 to #495 on main | Close as merged via #517 | The lane-3 merge wave; its head is inside #514/#517. |
| [#512](https://github.com/WangPantopus/creator-platform/pull/512) | C | open | green | Finding 7: E3A.4 flags only an unknown cost that locks the creator | Merge after #517 (retarget to main) | Scenario correction for E3A.4. |
| [#513](https://github.com/WangPantopus/creator-platform/pull/513) | C | open | green | B8: split My AI into a hook, the layout and one file per screen | Rework, then merge | Splits the 3,032-line CreatorAI.tsx; re-apply #514's FAQ draft restoration fix (ade3b2515) and re-run the page comparison. |
| [#514](https://github.com/WangPantopus/creator-platform/pull/514) | B | draft | red | Integrate native sign-in, reliable AI replies, commerce recovery and privacy export | Merge (inside #517) | App completion: native sign-in, commerce host, Studio Today, web presence, export. Lands with #517. |
| [#515](https://github.com/WangPantopus/creator-platform/pull/515) | B | draft | red | Qualify exact private-reply review and signed reaction delivery | Merge (inside #517) | Reply review, migration 0253. Lands with #517; retarget to main first so GitHub marks it merged. |
| [#516](https://github.com/WangPantopus/creator-platform/pull/516) | B | draft | red | Show authorized Notes and reactions in iPhone and Android conversations | Merge (inside #517) | Native Notes/reactions with strict freshness. Lands with #517; retarget to main first. |
| [#517](https://github.com/WangPantopus/creator-platform/pull/517) | B | draft | red | Qualify creator/fan and follower metadata; reuse web and native presence | Fix CI, then merge | Carries #511, the 20 lane-3 PRs, #514, #515 and #516. Fix three stale tests, decide Today vs Notes, retarget to main, merge with a merge commit. |

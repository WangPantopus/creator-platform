# Qelvora status

Updated 2026-11-04. This page replaces the old `CURRENT.md` and the dated handoffs, which are now in
the [archive](archive/operations/). Update this page in place instead of adding a dated handoff.
Refresh the Git and GitHub facts before acting on them.

## What we are building

- Each creator has an authorized, clearly labeled AI that talks one-on-one with every fan, remembers
  them and cites the creator's own work.
- The creator stays present through signed Notes and reactions, and fans can pay for a signed written
  reply, charged only if the creator accepts.
- "Who is speaking" is answerable in under a second on every surface, with a word, a glyph and a color.

The product is defined in the [BRIEF](BRIEF.md) and the [source documents](source/), which are
authoritative. The [launch plan](LAUNCH_PLAN.md) sets the scope and the order: fans use the iOS and
Android apps, and the web gives the first answer from a link; creators use the web Studio on their
phones; sign-in is Qelvora sign-in with Apple and Google plus an 18+ date-of-birth step.

**Done** means:

- **for the pilot:** the five moments work end to end on a real host, every launch screen exists in
  every state, INV-01 to INV-25 hold, and the quality bars and store requirements are met, each
  checked by someone other than its author on a real iPhone and a real Android phone
  ([launch plan, section 2](LAUNCH_PLAN.md#2-what-done-means));
- **for public release:** the pilot gates ([launch plan, section 5](LAUNCH_PLAN.md#5-launch-criteria));
- **for the consolidation (phase 0):** zero open pull requests, `main` green and protected, and the docs
  reduced to a few current files.

## Where the product stands

- Nearly every launch screen exists on web, iOS and Android, but only on a development host with
  fake providers. No build serves real accounts.
- A real creator can't license an AI. Push, links, metrics and whole-account deletion are not
  connected.
- About 15 launch screens or states were never designed ([design plan](DESIGN_PLAN.md#missing-launch-surfaces)).

## Consolidation: Waves 1 to 4 are done

All 66 pull requests that were open on 2026-11-01 are resolved: 59 merged and 7 closed with a note.
The 59 merged through nine integration pull requests, each merged with a merge commit after every CI
check passed.

| PR   | Wave | What landed                                                                                                         |
| ---- | ---- | ------------------------------------------------------------------------------------------------------------------- |
| #518 | 1    | The lane 3 AI-engine wave and migration 0252 (#511 and the 20 lane 3 PRs)                                           |
| #519 | 1    | App completion, native presence, CI fixes and the consolidation plan (#514, #516)                                   |
| #520 | 1    | Migrations 0253 and 0254 (#515)                                                                                     |
| #521 | 1    | Migration 0255, followers-only Notes, with a direct follower check (#517)                                           |
| #522 | 3    | Studio live stream, public post withdrawal, Android push lifetime, lane 5 docs (#512, #488, #388, #395, #396, #394) |
| #523 | 2    | The whole native stack: the 22 lane 7 PRs, #401 to #508                                                             |
| #524 | 3    | The My AI split (#513)                                                                                              |
| #525 | 3    | The public creator page cache and the launch kit (#389, #393)                                                       |
| #527 | 4    | Migrations 0256 to 0258: passkey retirement, invite notes and the processor-notification login (#439, #397, #425)   |

Also merged: #526 and #528, the two coordination handoffs (#526 also runs the iOS UI tests on the
iPhone 18 Pro). #509, lane 1's status, was closed as out of date; its facts are in Git history and
in the Wave 6 queue.

## Wave 5: done

- **Docs: done,** #529 (merged on 2026-11-03 as `8ce419f50`): this page,
  [docs/README.md](README.md), [engineering/](engineering/) and [archive/](archive/), and the
  corrected BRIEF, launch plan and design plan.
- **CI: done,** #530 (merged on 2026-11-03 as `37a47bd84`). The macOS jobs run only when their paths
  change, and the full matrix runs every night ([engineering/ci.md](engineering/ci.md)). #531
  (merged as `befa9da77`) described the merged CI and updated the agent rules.
- **Archive: done,** #532 (merged on 2026-11-03 as `471978957`): the 16 docs #529 kept in place
  moved into [engineering/](engineering/) or [archive/](archive/).
- **Repository steps,** each run by the coordinator with the founder's yes, all done on 2026-11-03:
  - **The branch cleanup.** 535 branches were tagged `archive/<branch-name>` at their last commit,
    then deleted from GitHub. 461 were fully contained in `main`. The other 74 were 36 closed-PR
    branches from early October, 25 branches with commits added after their PR merged, 12 branches
    with no PR, and #509's branch. GitHub keeps `main`, the six parked branches and `cost` (the
    founder's spreadsheet, whose future is still open). To restore an archived branch, see
    [setup](engineering/setup.md#archived-branches).
  - **"Delete branch on merge"** was turned on.
  - **`main` is protected.** Every change goes through a pull request, and the six CI jobs are
    required checks ([engineering/ci.md](engineering/ci.md#branch-protection)).
  - **`artifacts/` is removed** ("tag the tree, then remove `artifacts/`"). The tag
    `archive/artifacts-2026-11-03` (`37a47bd84`) holds all 5,648 files, 324 MB. Read one with
    `git show archive/artifacts-2026-11-03:artifacts/<path>`, or browse them
    [on GitHub](https://github.com/WangPantopus/creator-platform/tree/archive/artifacts-2026-11-03/artifacts).
    `artifacts/` is now ignored, and the evidence check refuses any new file under it: evidence goes
    in the pull request description or the CI artifacts.

## Wave 6: done

Wave 6 made migration registration data-driven, in six steps (#538, #541 and #543 to #546). The
ops-console wave is the first registration by its procedure (#547).

- **The triage is merged** (#533). The [migration queue](engineering/migration-queue.md) has a row
  for each unregistered SQL file. It counted 61: 5 needed for the pilot, 2 for the founder to
  decide, 27 needed later, 16 obsolete and 11 that aren't migrations. Five of those 11 were
  evidence copies under `artifacts/`, and the ops-console wave registered 3 of the 5 pilot
  files, so 53 are left in the tree.
- **Four places failed on every real database:** three in the ops console (naming a reviewer,
  supervisor audits and lifting a pause), which the ops-console wave fixed, and one in Team
  triage. The founder left Team triage out of the pilot
  ([decision log](BRIEF.md#14-decision-log), 2026-11-03). The Studio no longer offers the
  Triage role, and the server refuses to grant it with 403 `team_role_unavailable` (#537).
- **The generator is merged** (#538). `pnpm generate` builds the wave packets and `chain.json`
  from `infra/migrations.json`, and `generate:check` verifies them and 37 pinned records in CI.
  `wave-pins` measures the catalogue pins on marked scratch databases
  ([engineering/migrations.md](engineering/migrations.md)).
- **`migrate-trust` reads the chain** (#541). Every source of a wave after the canonical
  bootstrap is activation-only, so it never applies a wave's files one by one. Before it applies
  anything, it refuses a registered wave it has no matching review for, a registry that
  `chain.json` doesn't match, a chain that doesn't match its packets or the canonical line fixed
  in its code, and a canonical file whose bytes changed.
- **The local installer reads the chain** (#543). Its waves and their order come from
  `chain.json`, not `FRESH_WAVES`, through the reader and the table of reviewed waves it shares
  with `migrate-trust`. Before any SQL runs, it refuses a chain wave it has no matching review
  for, with `migrate-trust`'s message.
- **The head profile walks the table of reviewed waves** (#544). It selects the product's pins
  with one walk over the waves from `20261008-comparison` on, in the chain's order, instead of a
  function per wave, and keeps every refusal and its message. The table moved to
  `apps/backend/src/db/reviewed-waves.ts`, so the runtime and the scripts share one list of
  waves. A registration adds its wave's row there, with the head profile's two refusals for it.
- **`activate-wave` reads the chain** (#545). The waves it accepts, and their order, come from
  `chain.json`, the October waves included, through the shared reader: "a wave requires every
  wave before it" is that order. It loops over the reviews instead of naming each wave in its
  own lists and booleans, and keeps every refusal, its message, the order they fire in and every
  ceremony. Each wave's refusals moved to its row in the table of reviewed waves, so a
  registration no longer edits the operator. Before anything connects, it refuses a chain wave
  with no row, with `migrate-trust`'s message.
- **The role checks and the trust catalogue modules select by wave id** (#546), the last step of
  [the plan](engineering/migrations.md#wave-6-the-plan).
  - The generation role check takes the newest installed wave and checks it against its own
    review.
  - The privacy role check takes the wave whose privacy stage holds, and checks the fixed pins
    of the wave before it, through one function per catalogue module instead of one per wave.
  - The table's role-check names went, and with them their guard. The table refuses two rows
    for one wave instead.
  - The local installer's final checks take the chain's head, so `checkedHead` went.
  - `migrate-trust`'s checks and unapplied lines for the head waves loop over the rows.
  - Every refusal and its message is kept.
- **Registration is data-driven.** A new wave is a registry edit, its generated packet, a
  measured review and one table row
  ([registering a file](engineering/migrations.md#registering-a-file-today)). An incomplete
  registration fails closed at `stack up` and at `activate-wave`, so the rule to register no new
  wave until `migrate-trust` read the chain stays lifted.
- **The ops-console wave is registered** (#547), the first registration by the data-driven
  procedure: `20261103-ops-console`, 0259 to 0261. The founder can name and remove reviewers
  with the runbook as the trust owner, a supervisor sees every reviewer's audit records, and a
  supervisor can lift a pause.
  - `pending-supervisor-audits.sql` was revised before registration, with the coordinator's
    yes: its new function is no longer executable by PUBLIC, which the operator's role check
    refuses.
  - Nothing beyond the table row was taught to the operator or the runtime.
  - The procedure gained a step: `migrate-trust` on the scratch databases, because `wave-pins`
    doesn't run the role checks
    ([registering a file](engineering/migrations.md#registering-a-file-today)).
  - A database at 0258 moves with `activate-wave`.

## Next

1. **The pilot's next migration waves,** each waiting on the founder. Files are registered only as
   features need them, one wave per feature
   ([registering a file](engineering/migrations.md#registering-a-file-today)).
   - **Memory,** once the founder confirms lane 3's INV-15 default for memory exclusions.
   - **Store memberships,** if the founder decides D-14 that way.
2. **Pilot phase 1, a real host** (about 3 weeks, waiting mostly on the founder's hosting and
   credential decisions): a production composition root with real adapters; staging, the domain
   and app links; Apple and Google credentials; the Anthropic switch; observability, backups and a
   restore drill. Its exit: the founder signs in on both phones against staging, opens a creator
   link that launches the app, and receives a test push. Phases 2 to 4 are in the
   [launch plan](LAUNCH_PLAN.md#8-the-road-to-the-pilot).

## Parked pull requests

Each returns with the feature or decision that needs it. The first five rows were closed with a
note and their branches kept. #549 and #551 stay open and unmerged: the founder deferred them on
2026-11-04, because Pantopus sign-in stays.

| PR            | What                                                             | Returns with                                                                |
| ------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| #400          | Reaction pushes recheck a withdrawn reply                        | Push (moment 3). Needs a registered-source guard                            |
| #459 and #392 | Share-card status, and share cards for signed human replies only | The share card. Needs a guard, wiring into `server.ts`, and a trust refusal |
| #399          | Creator web push                                                 | Later. Needs web push (VAPID) keys and a Studio service worker              |
| #398          | Profile fields                                                   | Later. Needs the form and the copy decided                                  |
| #487          | "Usually decides in"                                             | Later. It shows nothing until a creator has five outcomes                   |
| #549          | Removing the remaining Pantopus sign-in wording                  | The founder's sign-in decision                                              |
| #551          | Apple and Google on every signed-out web page                    | The founder's sign-in decision                                              |

## Decisions the founder still owes

Approved on 2026-11-01: the consolidation plan, the native sign-in wording ("Sign in to continue"
and "Sign-in is unavailable right now. Try again in a moment."), the home glyph for Today, the local
installs, "three now, rest later" for Wave 4, and one coordinating session plus one work session
per task. Approved on 2026-11-03: the required checks, no Team triage in the pilot, and tests that
are end-to-end only. No unit tests from now on: every change is proven by end-to-end tests that
launch the real apps against a real stack. That declines the plan's proposal to allow unit tests for
pure logic and bug regressions, and confirms the 2026-10-09 rule. Also confirmed on 2026-11-03: the
native recent-sign-in line (#548). Decided on 2026-11-04: Pantopus sign-in stays for now, with
#549 and #551 left open, and Home hides blocked threads and paused creators until their states are
designed ([decision log](BRIEF.md#14-decision-log)). Still open:

- **How we work:** the working rules in [plan section 6](CONSOLIDATION_PLAN.md#6-how-we-work-from-now-on)
  (scenarios in CI, parallel sessions); whether the existing suites keep running in CI as regression
  gates (the 2026-10-09 rule keeps them); the native presence budget; repository visibility (public
  today); the old Mac's preserved stacks; the cost spreadsheet.
- **The road to the pilot:** hosting; the domain and passkey ID; Apple and Google sign-in IDs, and
  counsel on the 18+ method; the creator license terms and verifier; the embedding provider, the
  Anthropic key and the consent wording; Stripe keys and the account topology; store accounts, push
  credentials and test phones; the pilot size and cohort.
- **Sign-in:** how Pantopus sign-in, which stays (2026-11-04), fits option D's Qelvora sign-in with
  Apple and Google (2026-10-15), which the BRIEF, the launch plan and this page still describe.
  #549 and #551 return with it.
- **Home's closed and paused rows** (#555): their words, and whether a fan may learn that a
  creator's account was deleted, as distinct from paused.
- **Invariant and policy calls:** the INV-21 price rule, INV-22 one signature for accept and deliver,
  the A5 safety sign-off, deletion D1 to D4 and Q16, and ops P1 to P5.
- **The migration queue** ([triage](engineering/migration-queue.md), #533):
  1. whether pilot memberships are sold through the App Store and Google Play (D-14);
  2. whether the pilot collects Helpful / Not helpful and offers the fan intro, which needs a
     production successor to 0207;
  3. confirming lane 3's INV-15 default for memory exclusions before the memory wave;
  4. when the 16 obsolete files may be deleted and the 29 stale reservations released.

## Follow-ups to schedule

The [native device checks](engineering/native-device-checks.md) ran on `main` on 2026-11-04: lane
7's E7.1 to E7.12 (those with a scenario), #505's A2 to A5, #506's P3 and P4 and #507's Z3, on the
iOS simulator and an Android emulator. Most passed after small fixes to the checks, and no app code
changed. The results page numbers their follow-ups, with the evidence and a suggested fix for each.

**Fixed on 2026-11-04:**

- **Stale native copy** (#548): the four native messages that said "Continue with Pantopus again"
  now end with "Sign in to continue." or, on Your data, "Sign in again if asked to verify your
  account." The rest of the Pantopus sign-in wording stays, with #549 parked.
- **D-11 in an open thread** (follow-up 1, #554): a refused request, or the live connection's new
  4403 close, now brings the adults-only state instead of "Your session ended", within about 3 s
  on iOS and 5 s on Android.
- **Android's session check against the real API** (follow-up 12, #552): both API clients share one
  pool that closes idle sockets after 3 s, before the server's 5 s, and nothing is sent twice.
  Android D6 passed 9 of 10 runs without a proxy; the one failure, a dialog that closed, has no
  known cause.
- **Home after a deleted conversation** (follow-up 13, #553): the account's list leaves the deleted
  conversation out, and Home skips a conversation that answers `scope_revoked` instead of refusing
  the page. Until their states are designed, that hides a blocked thread and a paused creator too.
- **The creator's Studio Threads** (#555): a fan's deletion or block no longer refuses the whole
  page; that fan leaves the list. Trust can now say why a scope is closed, for Home's future rows.

**Still open:**

- **Native presence** (follow-ups 3 and 4, a founder call): a thread open and idle sends 64 (iOS)
  and 66 (Android) requests a minute against E7.8's 12. Half are #516's presence reads, which come
  every 2 seconds and break four of lane 7's C4 rules. Decide the rules and the budget; the plan is
  to move native presence onto the live stream.
- **The offline lease** (follow-up 5, a founder call): the saved conversation is hidden within about
  7 s (the five-second lease), not kept as WP 7.8 expects.
- **iOS N14** (follow-up 2): an unknown link, then Back, shows Home as "Unavailable" with two tab
  bars.
- **iOS D3** (follow-up 9): Send sits 3 points under the keyboard in landscape at the largest text.
- **Android's switch role** (follow-up 6): the accessibility tree doesn't report `Role.Switch`.
  Probably the check; confirm with TalkBack.
- **iOS's tab bar at the largest text** (follow-up 7) takes a third of the screen.
- **CI's Android APK** (follow-up 8) has no web origin, and CI publishes no instrumentation APK, so
  Android Z1, Z3, D7 and D7U can't run on this Mac.
- **Release builds still register `qelvora://`** (follow-up 10; WP 7.6 waits on the domain).
- **iOS reads the page twice per offline retry** (follow-up 11). Harmless; worth one fetcher when
  presence is reworked.
- **Under-18 latency on Home:** an account flagged under 18 after sign-in is noticed at the next
  session check, within about 30 seconds instead of 4. In a thread it now shows within seconds
  (#554). Refusal at sign-in is unchanged.
- **Trusted proxy:** the public limiters trust forwarded addresses only from the machine itself.
  Hosting needs a trusted-proxy setting.
- **Publication worker:** it checks only whether a key was revoked, so an act signed just before its
  key retired can still publish.
- **Invitation bursts:** under heavy load an invitation create can be refused after about 5.5
  seconds; it writes nothing and can be retried (#527).

**New:**

- **Access-token expiry in an open thread** (in progress, in its own work session): when the
  15-minute access token expires, the gateway closes the thread's live connection as a denial, and
  iOS discards the draft.
- **#554's two residuals,** where an account flagged under 18 can still see "Your session ended":
  - **the upgrade's plain 401:** when the flag lands between a reconnect's page read and its
    upgrade, the gateway refuses the upgrade with a plain `401`;
  - **the 5-second deadline:** when the 2-second check's session lookup takes longer than 5 s, the
    gateway closes the connection with 1013 first. The session is revoked anyway, so the
    reconnect's page read gets a plain `401`.
- **Keep-alive behind a load balancer** (hosting, #552): if a load balancer in front reuses its
  connections to the backend, the backend's `keepAliveTimeout` (5 s today) must be longer than the
  balancer's idle timeout, and `headersTimeout` longer still. Otherwise the balancer sends requests
  on sockets the backend has just closed, and answers 502.
- **The iOS content screen re-reads while refused** (#548): while content reads were refused, it
  re-read `/v1/content/<creator>/mute` about every 2 seconds (14 reads in 27 s).
- The smaller items that #552 to #555 left open are on the
  [results page](engineering/native-device-checks.md#follow-ups), with follow-ups 1, 12 and 13.

## How work runs

- Since 2026-11-01: one coordinating session plus one work session per task.
- **The coordinator** keeps the plan and this page, the pull request queue and merges, the questions
  for the founder, and starts work sessions. It writes no feature code.
- **A work session** owns one task, one branch and one pull request. It doesn't merge, and it ends
  with a report: the PR link, the exact check results and what was not checked.
- Two sessions never write the same files at the same time. Each work session is briefed completely,
  because it starts from nothing.
- Pull requests merge with merge commits only, after every check passes. Security-sensitive work gets
  an independent review first. The app's PR monitor watches CI, and nobody polls it.
- **Rules that never bend:** never reset a used database or device; never rewrite applied SQL or
  publication fingerprints; never invent consent; never advance clocks; never settle an unknown cost
  without a receipt; INV-01 to INV-25 and the fixed copy are not negotiable; the product name is
  always Qelvora.

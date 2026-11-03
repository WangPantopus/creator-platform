# Qelvora status

Updated 2026-11-03. This page replaces [operations/CURRENT.md](operations/CURRENT.md) and the dated
handoffs, which are now in the [archive](archive/operations/). Update this page in place instead of
adding a dated handoff. Refresh the Git and GitHub facts before acting on them.

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

| PR | Wave | What landed |
| --- | --- | --- |
| #518 | 1 | The lane 3 AI-engine wave and migration 0252 (#511 and the 20 lane 3 PRs) |
| #519 | 1 | App completion, native presence, CI fixes and the consolidation plan (#514, #516) |
| #520 | 1 | Migrations 0253 and 0254 (#515) |
| #521 | 1 | Migration 0255, followers-only Notes, with a direct follower check (#517) |
| #522 | 3 | Studio live stream, public post withdrawal, Android push lifetime, lane 5 docs (#512, #488, #388, #395, #396, #394) |
| #523 | 2 | The whole native stack: the 22 lane 7 PRs, #401 to #508 |
| #524 | 3 | The My AI split (#513) |
| #525 | 3 | The public creator page cache and the launch kit (#389, #393) |
| #527 | 4 | Migrations 0256 to 0258: passkey retirement, invite notes and the processor-notification login (#439, #397, #425) |

Also merged: #526 and #528, the two coordination handoffs (#526 also runs the iOS UI tests on the
iPhone 18 Pro). #509, lane 1's status, was closed as out of date; its facts are in Git history and
in the Wave 6 queue.

## Wave 5: in progress

- **Docs:** this page, [docs/README.md](README.md), [engineering/](engineering/) and
  [archive/](archive/), and the corrected BRIEF, launch plan and design plan.
- **CI**, in a separate session: run the macOS jobs only when native, shared-UI or visual paths
  change, plus a nightly full run, so the required gate takes under 15 minutes
  ([engineering/ci.md](engineering/ci.md)).
- **Repository steps** (the coordinator runs each one only with the founder's yes):
  - **Done on 2026-11-03: the branch cleanup.** 535 branches were tagged `archive/<branch-name>`
    at their last commit, then deleted from GitHub. 461 were fully contained in `main`. The other
    74 were 36 closed-PR branches from early October, 25 branches with commits added after their PR
    merged, 12 branches with no PR, and #509's branch. GitHub keeps `main`, the six parked branches
    and `cost` (the founder's spreadsheet, whose future is still open). To restore an archived
    branch, see [setup](engineering/setup.md#archived-branches).
  - Still waiting on the founder, one at a time: turn on "delete branch on merge"; protect `main`
    with required checks; tag the tree, then remove `artifacts/` from it.

## Next

1. **Wave 6, migration registration.** 42 SQL files are still unregistered, 18 of them with
   reserved numbers, among them lane 1's #472, #475 and #478 (the list is in #527's description).
   First triage which are still needed and which are obsolete. Then make registration data-driven:
   generate the wave and review files, and stop hand-editing baseline arrays. Register files only as
   features need them ([engineering/migrations.md](engineering/migrations.md)).
2. **Pilot phase 1, a real host** (about 3 weeks, blocked mostly on the founder's decisions): a
   production composition root with real adapters; staging, the domain and app links; Apple and
   Google credentials; the Anthropic switch; observability, backups and a restore drill. Its exit:
   the founder signs in on both phones against staging, opens a creator link that launches the app,
   and receives a test push. Phases 2 to 4 are in the [launch plan](LAUNCH_PLAN.md#8-the-road-to-the-pilot).

## Parked pull requests

Closed with a note and their branches kept. Each returns with the feature that needs it.

| PR | What | Returns with |
| --- | --- | --- |
| #400 | Reaction pushes recheck a withdrawn reply | Push (moment 3). Needs a registered-source guard |
| #459 and #392 | Share-card status, and share cards for signed human replies only | The share card. Needs a guard, wiring into `server.ts`, and a trust refusal |
| #399 | Creator web push | Later. Needs web push (VAPID) keys and a Studio service worker |
| #398 | Profile fields | Later. Needs the form and the copy decided |
| #487 | "Usually decides in" | Later. It shows nothing until a creator has five outcomes |

## Decisions the founder still owes

Approved on 2026-11-01: the consolidation plan, the native sign-in wording ("Sign in to continue"
and "Sign-in is unavailable right now. Try again in a moment."), the home glyph for Today, the local
installs, "three now, rest later" for Wave 4, and one coordinating session plus one work session
per task. Still open:

- **How we work:** the working rules in [plan section 6](CONSOLIDATION_PLAN.md#6-how-we-work-from-now-on)
  (required checks, scenarios in CI, unit tests for pure logic, parallel sessions); the native
  presence budget; repository visibility (public today); the old Mac's preserved stacks; the cost
  spreadsheet.
- **The road to the pilot:** hosting; the domain and passkey ID; Apple and Google sign-in IDs, and
  counsel on the 18+ method; the creator license terms and verifier; the embedding provider, the
  Anthropic key and the consent wording; Stripe keys and the account topology; store accounts, push
  credentials and test phones; the pilot size and cohort.
- **Invariant and policy calls:** the INV-21 price rule, INV-22 one signature for accept and deliver,
  the A5 safety sign-off, deletion D1 to D4 and Q16, and ops P1 to P5.

## Follow-ups to schedule

- **Native presence request budget:** #516 re-reads loaded presence pages every 2 seconds, which
  with #506's polling exceeds lane 7's E7.8 target. Move native presence onto the live stream.
- **Under-18 latency:** an account flagged under 18 after sign-in is noticed within about 30 seconds
  instead of 4. Refusal at sign-in is unchanged.
- **Stale native copy:** some error copy still says "Continue with Pantopus again".
- **Trusted proxy:** the public limiters trust forwarded addresses only from the machine itself.
  Hosting needs a trusted-proxy setting.
- **Publication worker:** it checks only whether a key was revoked, so an act signed just before its
  key retired can still publish.
- **Device checks never run on the merged native stack:** lane 7's E7.1 to E7.12, #505's A2 to A5,
  #506's P3 and P4, and #507's Z3.
- **Invitation bursts:** under heavy load an invitation create can be refused after about 5.5
  seconds; it writes nothing and can be retried (#527).

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

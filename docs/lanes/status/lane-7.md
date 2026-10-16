# Lane 7: Phone apps (iOS and Android) status

Updated: 2026-10-16 (evening), by the resumed lane 7 session (one session, both platforms).

## Handoff (2026-10-16, evening): resume here

**WP 7.4 is built, except P10** (it waits on the share-card contract). Every pull request is
stacked on the one before; merge in this order. Never rebase: a fix on a lower branch is merged
upward, branch by branch, and each is pushed.

| PR                                                                | Branch                          | What                                                      |
| ----------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| [#401](https://github.com/WangPantopus/creator-platform/pull/401) | `lane-7/keyboard-drafts`        | WP 7.3 keyboard and drafts                                |
| [#452](https://github.com/WangPantopus/creator-platform/pull/452) | `lane-7/notes-reactions`        | P1 Notes and reactions                                    |
| [#457](https://github.com/WangPantopus/creator-platform/pull/457) | `lane-7/step-in-seal`           | P3 the creator's seal                                     |
| [#460](https://github.com/WangPantopus/creator-platform/pull/460) | `lane-7/provider-consent`       | P6 the provider sentence                                  |
| [#462](https://github.com/WangPantopus/creator-platform/pull/462) | `lane-7/adults-only`            | P7 the under-18 state                                     |
| [#465](https://github.com/WangPantopus/creator-platform/pull/465) | `lane-7/citation-refusal`       | P4 a refused source on Android                            |
| [#466](https://github.com/WangPantopus/creator-platform/pull/466) | `lane-7/status-7-4`             | Status and decisions                                      |
| [#471](https://github.com/WangPantopus/creator-platform/pull/471) | `lane-7/thread-freeze`          | The iOS thread no longer freezes and keeps its newest row |
| [#493](https://github.com/WangPantopus/creator-platform/pull/493) | `lane-7/android-follow`         | Android keeps following the thread when rows shift above  |
| [#496](https://github.com/WangPantopus/creator-platform/pull/496) | `lane-7/comparison-placeholder` | P11 the comparison placeholder is gone                    |
| [#497](https://github.com/WangPantopus/creator-platform/pull/497) | `lane-7/composer-states`        | P3 the composer states                                    |
| [#498](https://github.com/WangPantopus/creator-platform/pull/498) | `lane-7/chat-link`              | A chat link opens the person's existing conversation      |
| [#499](https://github.com/WangPantopus/creator-platform/pull/499) | `lane-7/notification-rows`      | P2 notification rows with authorship, time and Unread     |
| [#500](https://github.com/WangPantopus/creator-platform/pull/500) | `lane-7/named-pickers`          | P5 named pickers instead of typed ids                     |
| [#501](https://github.com/WangPantopus/creator-platform/pull/501) | `lane-7/long-session`           | P8 the 3-hour reminder                                    |
| [#502](https://github.com/WangPantopus/creator-platform/pull/502) | `lane-7/packet-terms`           | P9 the packet's terms in the approved wording             |
| this one                                                          | `lane-7/status-7-4b`            | Status, results, decisions, these notes                   |

Results for every piece are in [the spec](lane-7-rendering-parity.md) and its pull request;
evidence is under `artifacts/lane-7/` (`7-4-*`). Auto-fix watches the pull requests' CI; do not
poll.

**Next, only after the founder sends "Next for lane 7":** 7.10, 7.11, 7.8 and 7.12. Waiting on
others: P10 (the share-card contract and a domain), chip titles for P4 (lane 3), the ETA line for
P9 (lane 4's `reliability`).

**Warm resources, left running for reuse.** Simulator `qelvora-lane7-ios`
(925D2C3D-510E-4E1E-B5B0-52335B122ECF) booted; emulator `qelvora-lane7-android` (`emulator-5574`,
restarted cold on 2026-10-16 after its display froze; if it is down:
`emulator -avd qelvora-lane7-android -port 5574 -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect`,
then `adb reverse tcp:56473 tcp:56473`) with the debug app for the fake installed; the fake API on
56473 and the iOS link driver on 56475, both started from the worktree
`.claude/worktrees/lane-7-phone-apps-resume-15e5a3` (restart them after editing harness files or
the link driver). Helper scripts in `~/Library/Caches/qelvora-lane7/diag/`: `env.sh` (its `W`
points at that worktree), `ios-p3-build.sh`, `android-debug.sh` (debug app for the fake, built and
installed), `run-ios.sh <log> <suite args>` (an iOS suite with the freeze watchdog),
`watchdog.sh`, `ci-skip-check.sh`, `p3-gates.sh`, `p1fix-gates.sh`, `locked.sh`,
`manifest-update.mjs`.

**A new session gets a new worktree** and the app does not let it write another worktree's files:
work in the new one on the same branches (`git switch` a `lane-7/*` branch there, or point the
session branch at it), repoint `W` in `env.sh` and `locked.sh`, run `pnpm install --frozen-lockfile
--offline`, and restart the fake and the link driver from it. The first iOS build from a new path
recompiles the packages (about 15 minutes).

## WP 7.4 stop and report (2026-10-16, evening)

- **#471 is ready.** Removing the bottom anchor was not enough: the presence flow R5 still froze,
  on #471's first version and on `lane-7/status-7-4`, in SwiftUI's lazy stack layout. The thread is
  now a plain stack at every text size, and only the reader moving the rows stops it following new
  rows. The same runs found the iOS thread had been losing its bottom since P1 (E7.1 L1 to L5
  failed on `lane-7/status-7-4`); fixed in #471. Android had the same fault after a reconnect
  (#493).
- **Built, each in its own pull request, both apps, flows and gates:** P11 (#496), P3 composer
  states (#497), P2 (#499), P5 (#500), P8 (#501), P9 (#502), and #498 (a chat link opens the
  existing conversation; found by P2's flows).
- **Decisions taken as the proposed default** (founder may veto): the iOS thread is a plain stack;
  E7.1 L1 and L5 follow C4 (a Note is read on open, return or reconnect, never pushed); a system
  notice keeps the design's inbox tile; P3's compact paused layout keeps one step-in button, at the
  thread's end (the header has the paused line); P5 clears a linked creator who is not among the
  person's conversations, so an unnamed id is never sent; P8 does not count time while the AI is
  paused, keeps the count per account (id hashed) so a relaunch within the break keeps it; P9 says
  "Price unavailable" when a mode has no price (the web's words; iOS said "Unset", Android "Price
  not set"); a chat link without post context opens the existing conversation.
- **For the founder:** `draftNotice` ("{name} may answer with her AI's draft; you'll see that
  label.") also says "her"; not changed (new copy needs approval).
- **Process notes:** at the start this session pointed its own empty branch at #471 with `git reset
--hard` (nothing lost; the working agreement says never, noted). One local merge committed
  conflict markers; it was amended before anything was pushed. The emulator's display froze during
  a gate run and the emulator was restarted cold.
- Spend: no model gateway call, no download.

## WP 7.4 stop and report (2026-10-16)

Every WP 7.4 piece that needed no decision is built, proven on both apps against the fake API, and
in a pull request. They are stacked, each on the one before; merge in this order:
[#401](https://github.com/WangPantopus/creator-platform/pull/401) (WP 7.3) →
[#452](https://github.com/WangPantopus/creator-platform/pull/452) (P1 Notes and reactions, plus an
Android fix keeping the thread at its bottom) →
[#457](https://github.com/WangPantopus/creator-platform/pull/457) (P3 the creator's seal) →
[#460](https://github.com/WangPantopus/creator-platform/pull/460) (P6 the provider sentence) →
[#462](https://github.com/WangPantopus/creator-platform/pull/462) (P7 the under-18 state) →
[#465](https://github.com/WangPantopus/creator-platform/pull/465) (P4 a refused source on
Android) → this status update. The spec with every piece's rules and results:
[lane-7-rendering-parity.md](lane-7-rendering-parity.md).

- Founder decisions 2026-10-16: P2 "Unread"; P3 composer states follow the design reference; P11
  remove the comparison placeholder; the under-18 screen keeps nothing else (no Crisis help); the
  seal shows "F" for "🌿 fern studio". Approved the same day: P5 picker words, P8 the reminder
  rule, P9 the charge wording (all in the spec).
- Waiting on others: P10 the share-card contract and a domain; chip titles for P4 (lane 3).
- **Found, not fixed: an intermittent iOS freeze** in a long thread at normal text size when the
  person types and then swipes fast while Notes are still being placed (2 of about 13 attempts
  with Notes rows, 0 of 5 without). The main thread spins in SwiftUI's lazy stack under the
  bottom-anchored scroll position, as in the WP 7.3 largest-text freeze. Proposed fix, its own pull
  request: scroll to the newest row explicitly, as Android does, then rerun the WP 7.3 draft flows,
  the P1 flows and D3T. A diagnosis test is kept outside the repository.
- Spend: no model gateway call, no download.

## Resume update (2026-10-15)

- #379 (WP 7.2) is merged. The founder **accepted the compact persistent author header**; `origin/main`
  through `7ca3982fe` is merged into `lane-7/keyboard-drafts` (#401), which is ready for review.
- The Mac had restarted: the lane's simulator, emulator and build caches were gone. Both devices
  were recreated with the same names from installed runtimes (the simulator has a new id; the iOS
  runner now finds it by name). Gradle's pinned 8.9 wrapper was fetched before asking (reported);
  with the founder's yes, the pinned iOS packages (~150 MB) and Android dependencies (+254 MB).
- The post-merge D6 rerun found a WP 7.3 defect (a session check could cancel an already-sent
  deletion, leaving the encrypted draft); fixed on both apps and proven with a held-answer race
  (D6R). Details: [WP 7.3](lane-7-keyboard-drafts.md).
- WP 7.4 has started on `lane-7/notes-reactions` (stacked on #401): the shared spec and the C4
  harness update first.

## Resume update (2026-10-09)

- The founder approved continuing in the existing warm lane 7 worktree. PR 369 is now
  **merged**; PR 379 contains WP 7.2. No comments or reviews were present at the final local check.
  Merged `origin/main` into this branch at `678484ade`, without rebasing.
- The Codex session has no manual simulator-control tool. The founder explicitly approved
  **XCUITest operating the same real iOS flows**, with no new unit tests or downloads.
  `Lane7NavigationFlows.swift` and the lane's `ios-navigation.mjs` / `ios-link-driver.mjs`
  run against the fake API. A separate focused flow passed against the real API and PostgreSQL on both apps. All **13 operated iOS flows pass,
  with no skips**, including the remaining flows and a repeat of N1.
- After the merge: the harness contract check passes **51/51**; the Android debug build
  passes and is installed. The old temporary iOS derived-data cache was absent; the local
  Swift package cache was reused for the rebuild.
- The required app CI reader returned **"Connect your GitHub account to continue"**.
  CI has not been inspected in this session; no CLI fallback or polling was used.
- Both apps passed focused navigation on lane 2's disposable real API/PostgreSQL stack,
  including warm/cold links, restart, owner state and wrong-person denial. Identity and
  the model provider remain synthetic. The full navigation matrix uses the fake API.
- The first operated iOS N5 failed: Spending and Help returned to You correctly, but an
  edge swipe from You selected Home and then opened Manage membership underneath the
  swipe. The screenshot and request log confirm the extra destination. A gesture
  arbitration fix (`NativeBackSwipe`) passed N5, N1 and the full iOS run. It also
  preserves vertical scrolling at the edge; screenshots and API checks corroborate it.

Working on: nothing; WP 7.4 is built and in review (see "Handoff" above).

Waiting on: review and merging of the stack; "Next for lane 7" for 7.10, 7.11, 7.8 and 7.12. Backend domain erasure is still blocked/retrying (lane 1 ticket).

Next: on "Next for lane 7", 7.10, 7.11, 7.8 and 7.12. WP 7.5/7.6/7.7/7.9 wait on C1, domain, credentials, accounts and icon art.

## Resume here

1. Read [lane-7-handoff.md](lane-7-handoff.md) first after the founder rules. It supersedes the old mid-navigation handoff and records the exact next work, evidence, limits and traps.
2. Resume the authorized warm worktree; the newest branch is `lane-7/status-7-4` (the tip of the WP 7.4 stack). Earlier: resume on `lane-7/keyboard-drafts`. Fetch, verify clean status and inspect PR metadata/reviews. PR 369 is merged; PR 379 remains ready/open with no review comments at the handoff check. Main through `21b3d4836` is merged. Never rebase or merge a PR.
3. WP 7.1/7.2 are done. WP 7.3 proves E7.2's draft restoration. Do not repeat completed matrices without a relevant change or failure. If the compact header is rejected, change only the presentation on both apps and rerun D1/D3 and Android D3I/D3S; storage/recovery need no blanket rerun.
4. Approved draft policy: device only, encrypted, account/thread bound; cleared on accepted send, sign-out, accepted deletion or conversation removal; unsent input never uploaded. Pending sends keep their existing idempotency key; restart checks acceptance and never automatically sends again.
5. Final generic gates build with an empty API origin and Android instrumentation uninstalls the app. Before the next operated flow, rebuild/install debug for the fake (or explicit debug override). Use the [harness runbook](lane-7-harness.md), own devices and serial heavy-build lock. The machine-specific cache pointer is in the handoff memory.

## Traps that cost time (so you do not pay twice)

- **Android instrumentation uninstalls the debug app when it finishes.** Install the debug APK again before the next operated scenario; otherwise `am start` reports "Activity class ... does not exist".

- **Do not swipe fast right after typing in a long iOS thread** in a test: it can freeze the app
  (see the WP 7.4 stop report above). The P1, P3 and P4 flows scroll with slow drags.
- **XCUITest details for the thread**: at normal text size the thread is a lazy stack, so a row off
  screen does not exist until scrolled to; at the largest text the development banner is a scroll
  view of its own (pick the scroll view that holds the text); a SwiftUI `Link` is a button; an
  exact-label subscript asserts on very long labels (use a predicate).
- **The harness runs old code until it is restarted.** `L.ensureHarness()` starts one only if none answers, so after editing a harness file kill the old process (check its working directory is this worktree first) and start `node tests/scenarios/lane-7/harness/server.mjs`.
- **A debug launch's extras come back after the process dies** (`harness_reset`, `harness_actor`, `return_to`): Android re-delivers the original intent. For restore tests do a plain relaunch (`run-app.mjs android` with no flags) first, then test.
- **iOS builds must be ad-hoc signed** or every Keychain call fails; `xcodebuild` rewrites `apps/ios/Package.resolved` (restore it with `git checkout -- apps/ios/Package.resolved` before every commit).
- **The Mac is shared and loaded (load average 20 to 35).** A full Android navigation run takes 40 minutes or more; do not start a second heavy job while a scenario runs, or its timings move.
- **iOS taps while typing are asynchronous**: wait, take a screenshot, then tap Send (the layout shifts while the keyboard animates).
- **iOS simulator tool tips** (the edge swipe needs `touch_path`, `simctl openurl` asks "Open in Qelvora?", tap coordinates, waiting for a thread to load) are in [lane-7-navigation.md](lane-7-navigation.md).
- **Do not use bare `git stash`** (shared across worktrees), `git worktree remove`, `git clean -fdx`, `git reset --hard`.
- **Devices and ports** are in [lane-7-harness.md](lane-7-harness.md): own simulator `qelvora-lane7-ios`, own emulator `qelvora-lane7-android` (serial `emulator-5574`), the fake on port 56473.

## Scenarios

The original 7.1 flows and full 7.2 matrix use the fake API. A focused 7.2 flow also passed on the real stack, as recorded in the navigation report. Both devices need debug builds installed; the harness starts itself if none is running.

| ID                                                                                   | Result                                                                                                           | Command                                                                                          |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Contract check, 64 checks (11 for C4 presence, 2 for comparisons)                    | pass                                                                                                             | `pnpm exec tsx tests/scenarios/lane-7/harness/check-contract.mjs`                                |
| H1 to H12 sign-in, session end, network drop                                         | pass on iOS and Android                                                                                          | `node tests/scenarios/lane-7/e7-1-signin.mjs [ios\|android]`                                     |
| S1 to S8 states and switches, E1 server error, L1 to L5 live delivery                | pass on iOS and Android                                                                                          | `node tests/scenarios/lane-7/e7-1-states.mjs [ios\|android]`                                     |
| F1 to F2 first conversation                                                          | pass on both (Android by script; iOS by hand through the simulator tool)                                         | `node tests/scenarios/lane-7/e7-1-first-conversation.mjs [ios\|android]`                         |
| Request rate, thread open and idle (WP 7.8 "before")                                 | iOS 49 a minute, Android 51 a minute                                                                             | `node tests/scenarios/lane-7/baseline-requests.mjs both 60`                                      |
| R1.1 to R1.9 Notes and reactions (WP 7.4 P1, R1.7 included; R1.10 and R1.11 not run) | pass on iOS and Android                                                                                          | `node tests/scenarios/lane-7/e7-4-presence.mjs`; iOS `ios-navigation.mjs <xctestrun> --presence` |
| R1.12 the thread keeps its bottom when Notes arrive (P1)                             | pass on both (Android failed before its fix)                                                                     | `e7-4-presence.mjs R10`; iOS `--presence R10`                                                    |
| S3.1 to S3.3 the creator's seal (P3)                                                 | pass on both                                                                                                     | `e7-4-seal.mjs`; iOS `--seal`                                                                    |
| P6.1 to P6.5 the provider sentence (P6)                                              | pass on both                                                                                                     | `e7-4-consent.mjs`; iOS `--consent`                                                              |
| P7.1 to P7.3 the under-18 state (P7)                                                 | pass on both                                                                                                     | `e7-4-adults.mjs`; iOS `--adults`                                                                |
| P4.1 to P4.3 citations (P4)                                                          | pass on both (Android P4.2 failed before its fix)                                                                | `e7-4-citations.mjs`; iOS `--citations`                                                          |
| K1 to K4 no comparison placeholder (P11)                                             | pass on both                                                                                                     | `e7-4-comparison.mjs`; iOS `--comparison`                                                        |
| Q1 to Q5 the composer states (P3)                                                    | pass on both                                                                                                     | `e7-4-composer.mjs`; iOS `--composer`                                                            |
| H1, H2 a chat link opens the existing conversation                                   | pass on both                                                                                                     | `e7-4-chat-link.mjs`; iOS `--chat-link`                                                          |
| U1 to U4 notification rows (P2)                                                      | pass on both                                                                                                     | `e7-4-notifications.mjs`; iOS `--notifications`                                                  |
| V1 to V5 named pickers (P5)                                                          | pass on both                                                                                                     | `e7-4-pickers.mjs`; iOS `--pickers`                                                              |
| T1 to T5 the 3-hour reminder, durations shortened (P8)                               | pass on both                                                                                                     | `e7-4-long-session.mjs`; iOS `--long-session`                                                    |
| M1 to M3 the packet's terms (P9)                                                     | pass on both                                                                                                     | `e7-4-packet.mjs`; iOS `--packet`                                                                |
| N1 to N21 navigation (WP 7.2)                                                        | Android: 21 of 21 pass. iOS: 13 XCUITest flows pass, plus prior manual results ([details](lane-7-navigation.md)) | `node tests/scenarios/lane-7/e7-2-navigation.mjs [N1 ...]`                                       |
| Release builds contain none of the hook                                              | pass, both; repeated for 7.2                                                                                     | `artifacts/lane-7/7-2-gates.txt`                                                                 |

Existing suites for 7.1 (Android unit and Paparazzi 19, Lint 0 errors, instrumentation 8 with 4 skipped by design; iOS `swift test` 18, UI tests 6 with 4 skipped by design): `./gradlew :app:testDebugUnitTest :app:verifyPaparazziDebug :app:lintDebug`; `swift test`; `xcodebuild test`. The 7.2 run of these is recorded in [lane-7-navigation.md](lane-7-navigation.md).

## Tickets and observations

WP 7.4 tickets (2026-10-16, evening): **lane 3**, the web conversation screen's composer to follow
the design reference (P3), a structured composer state on the conversation page (trial, ended,
capacity), and a server field if the 3-hour count should span devices (P8); the server's
`comparison_unavailable` message is the removed placeholder sentence (P11, lane 3's B9 covers the
web). **Lane 5** (`apps/web/features/growth/actions.tsx`) and **lane 6** (`packages/ui-web`
`NotificationRow`): the unread dot, stronger preview, sender color and "Unread" for screen readers
(P2). **Lane 6** (`packages/ui-web` `TermsBlock`): uses "If she declines …" literally; use
`chargeRule` and `ifDeclines` (P9). **Integrator**: the brief's copy of the old `chargeRule`. **Design
system** (`design/design-system/project/components/TermsBlock`): the README and bundle still say
"she". **Founder**: `draftNotice` says "her".

WP 7.4 tickets (details in the spec): lane 3, a structured composer state on the conversation
page, the fixed provider sentence on the web consent screen, and citation summaries on the thread
page; lane 6, the web `StepIn` takes `name.charAt(0)` (half of an emoji); lane 1, the web support
form asks for typed references; the integrator, the brief's decision log could record the seal
letter rule once the founder confirms it.

Ticket to lane 1/trust integration and domain owners: local thread-deletion jobs deny access immediately but domain erasure remains blocked/retrying; files, errors and requested follow-up are in [the 7.3 report](lane-7-keyboard-drafts.md). Observations for the integrator (not tickets, because the files are lane 7's): `xcodebuild` rewrites `apps/ios/Package.resolved`, so every local iOS build leaves it modified and it must not be committed; the release `Info.plist` keeps `NSAllowsLocalNetworking`, a 7.9 item. The decisions the brief lists (minSdk, stripping the call permissions and services, icon art, export-compliance answer) are needed by 7.9.

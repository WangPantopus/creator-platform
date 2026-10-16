# Lane 7: Phone apps (iOS and Android) status

Updated: 2026-10-16, by the resumed lane 7 session (one session, both platforms).

## Handoff (2026-10-16): resume here

**Pull requests, stacked; merge in this order.** Never rebase: a fix on a lower branch is merged
upward, branch by branch, and each is pushed.

| PR                                                                | Branch                    | What                                                    |
| ----------------------------------------------------------------- | ------------------------- | ------------------------------------------------------- |
| [#401](https://github.com/WangPantopus/creator-platform/pull/401) | `lane-7/keyboard-drafts`  | WP 7.3 keyboard and drafts                              |
| [#452](https://github.com/WangPantopus/creator-platform/pull/452) | `lane-7/notes-reactions`  | P1 Notes and reactions, Android keeps the bottom        |
| [#457](https://github.com/WangPantopus/creator-platform/pull/457) | `lane-7/step-in-seal`     | P3 the creator's seal                                   |
| [#460](https://github.com/WangPantopus/creator-platform/pull/460) | `lane-7/provider-consent` | P6 the provider sentence                                |
| [#462](https://github.com/WangPantopus/creator-platform/pull/462) | `lane-7/adults-only`      | P7 the under-18 state                                   |
| [#465](https://github.com/WangPantopus/creator-platform/pull/465) | `lane-7/citation-refusal` | P4 a refused source on Android                          |
| [#466](https://github.com/WangPantopus/creator-platform/pull/466) | `lane-7/status-7-4`       | Status, decisions, these notes                          |
| [#471](https://github.com/WangPantopus/creator-platform/pull/471) | `lane-7/thread-freeze`    | The iOS freeze fix, **draft**: newest branch, work here |

**CI at handoff.** #457, #460 and #462 got opt-in fixes for their new iOS flows (CI runs every UI
test with nothing listening; a flow must skip before any call); the new runs were pending. #457's
Android job was cut off at 50 minutes (the same code passed on #460). #401's iOS check was re-run
(CI's simulator failed to launch the app; not code). Auto-fix reports failures; never poll CI.

**In flight: #471.** Verified: the build, and the freeze reproduction froze 0 of 10 rounds (2 of
about 13 before). To do, in this order, then record the results in #471 and the spec and mark it
ready (if a flow fails, run it on `lane-7/status-7-4` too, to tell a regression from an old
problem):

1. `node tests/scenarios/lane-7/ios-navigation.mjs <xctestrun> --presence` (R1 to R10).
2. `… --drafts D1 D2 D3 D3T D4 D4R D5 D7 D7U D8`, then `… --seal` and `… --citations`.
3. `node tests/scenarios/lane-7/e7-1-states.mjs ios` (L1 to L5, a streamed reply stays in view).
4. The iOS gates: existing UI tests, release build, `swift test` (`p3-gates.sh` runs them).

The freeze reproduction lives outside the repository in `~/Library/Caches/qelvora-lane7/diag/`:
copy `Lane7FreezeDiag.swift` into `apps/ios/UITests/` only while running `run-freeze.sh presence`,
and delete it before committing.

**Then WP 7.4, decided 2026-10-16** (rules in [the spec](lane-7-rendering-parity.md)), each its own
pull request stacked on the newest branch, both apps, operated flows, gates: P11 remove the
comparison placeholder; P3 the composer states per the design; P2 notification rows with "Unread"
(new key `growthUnread` in `config/copy.json`); P5 named pickers (approved words, new keys); P8 the
3-hour reminder (approved rule); P9 the packet terms (change `chargeRule` and `ifDeclines` in
`config/copy.json` to the approved wording, regenerate, ticket the integrator for the brief). Then
stop and report. 7.10, 7.11, 7.8 and 7.12 wait for "Next for lane 7".

**Warm resources, left running for reuse.** Simulator `qelvora-lane7-ios`
(925D2C3D-510E-4E1E-B5B0-52335B122ECF) booted; emulator `qelvora-lane7-android` (`emulator-5574`)
running headless with the debug app for the fake installed (if not:
`emulator -avd qelvora-lane7-android -port 5574 -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect`);
the fake API on 56473 and the iOS link driver on 56475, started from this worktree (check
`curl -s http://127.0.0.1:56473/__harness/health`; restart them after editing harness files). Build
caches: iOS derived data `~/Library/Caches/qelvora-lane7/ios-dd` (built for the fake on #471's
branch), Gradle `~/.gradle` (offline builds work), node_modules installed. Helper scripts in
`~/Library/Caches/qelvora-lane7/diag/`: `env.sh` (toolchain PATH, `W`, `SP`; no secrets),
`ios-p3-build.sh` (iOS test build for the fake), `locked.sh` (the heavy-build lock, with retry),
`ci-skip-check.sh` (runs suites the way CI does), `p3-gates.sh` (both apps' gates),
`p1fix-gates.sh` (Android gates), `manifest-update.mjs` (the artifact manifest).

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

Working on: #471, the iOS freeze fix (draft): its regression flows are next (see "Handoff" above).

Waiting on: review and merging of the stack; "Next for lane 7" for 7.10, 7.11, 7.8 and 7.12. Backend domain erasure is still blocked/retrying (lane 1 ticket).

Next: finish #471; then WP 7.4 P11, P3 composer states, P2, P5, P8 and P9, as decided. WP 7.5/7.6/7.7/7.9 wait on C1, domain, credentials, accounts and icon art.

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
| Contract check, 62 checks (11 for C4 presence)                                       | pass                                                                                                             | `pnpm exec tsx tests/scenarios/lane-7/harness/check-contract.mjs`                                |
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
| N1 to N21 navigation (WP 7.2)                                                        | Android: 21 of 21 pass. iOS: 13 XCUITest flows pass, plus prior manual results ([details](lane-7-navigation.md)) | `node tests/scenarios/lane-7/e7-2-navigation.mjs [N1 ...]`                                       |
| Release builds contain none of the hook                                              | pass, both; repeated for 7.2                                                                                     | `artifacts/lane-7/7-2-gates.txt`                                                                 |

Existing suites for 7.1 (Android unit and Paparazzi 19, Lint 0 errors, instrumentation 8 with 4 skipped by design; iOS `swift test` 18, UI tests 6 with 4 skipped by design): `./gradlew :app:testDebugUnitTest :app:verifyPaparazziDebug :app:lintDebug`; `swift test`; `xcodebuild test`. The 7.2 run of these is recorded in [lane-7-navigation.md](lane-7-navigation.md).

## Tickets and observations

WP 7.4 tickets (details in the spec): lane 3, a structured composer state on the conversation
page, the fixed provider sentence on the web consent screen, and citation summaries on the thread
page; lane 6, the web `StepIn` takes `name.charAt(0)` (half of an emoji); lane 1, the web support
form asks for typed references; the integrator, the brief's decision log could record the seal
letter rule once the founder confirms it.

Ticket to lane 1/trust integration and domain owners: local thread-deletion jobs deny access immediately but domain erasure remains blocked/retrying; files, errors and requested follow-up are in [the 7.3 report](lane-7-keyboard-drafts.md). Observations for the integrator (not tickets, because the files are lane 7's): `xcodebuild` rewrites `apps/ios/Package.resolved`, so every local iOS build leaves it modified and it must not be committed; the release `Info.plist` keeps `NSAllowsLocalNetworking`, a 7.9 item. The decisions the brief lists (minSdk, stripping the call permissions and services, icon art, export-compliance answer) are needed by 7.9.

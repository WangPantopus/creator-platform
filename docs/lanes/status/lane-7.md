# Lane 7: Phone apps (iOS and Android) status

Updated: 2026-10-09, by the resumed lane 7 session (one session, both platforms).

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

Working on: Clean handoff on `lane-7/keyboard-drafts`; see [handoff](lane-7-handoff.md) and [WP 7.3 spec/results](lane-7-keyboard-drafts.md). WP 7.2 is complete and PR 379 is ready. WP 7.3 operated layout, lifecycle, recovery and real thread-deletion checks pass on both platforms; final local regression gates also pass (exact counts/skips in `artifacts/lane-7/7-3-gates.txt`).

Waiting on: Founder approval of the compact persistent author label in constrained layouts (charter 4.2); keep WP 7.3 draft until answered. GitHub connection for the app's CI reader. Four earlier defaults remain in [navigation](lane-7-navigation.md). Backend domain erasure is blocked/retrying; see the lane 1/domain-owner ticket in the 7.3 report.

Next: Resolve the header decision when answered; otherwise continue independent WP 7.4, then 7.10, 7.11, 7.8, 7.12. WP 7.5/7.6/7.7/7.9 wait on C1, domain, credentials, accounts and icon art.

## Resume here

1. Read [lane-7-handoff.md](lane-7-handoff.md) first after the founder rules. It supersedes the old mid-navigation handoff and records the exact next work, evidence, limits and traps.
2. Resume the authorized warm worktree on `lane-7/keyboard-drafts`. Fetch, verify clean status and inspect PR metadata/reviews. PR 369 is merged; PR 379 remains ready/open with no review comments at the handoff check. Main through `21b3d4836` is merged. Never rebase or merge a PR.
3. WP 7.1/7.2 are done. WP 7.3 proves E7.2's draft restoration. Do not repeat completed matrices without a relevant change or failure. If the compact header is rejected, change only the presentation on both apps and rerun D1/D3 and Android D3I/D3S; storage/recovery need no blanket rerun.
4. Approved draft policy: device only, encrypted, account/thread bound; cleared on accepted send, sign-out, accepted deletion or conversation removal; unsent input never uploaded. Pending sends keep their existing idempotency key; restart checks acceptance and never automatically sends again.
5. Final generic gates build with an empty API origin and Android instrumentation uninstalls the app. Before the next operated flow, rebuild/install debug for the fake (or explicit debug override). Use the [harness runbook](lane-7-harness.md), own devices and serial heavy-build lock. The machine-specific cache pointer is in the handoff memory.

## Traps that cost time (so you do not pay twice)

- **Android instrumentation uninstalls the debug app when it finishes.** Install the debug APK again before the next operated scenario; otherwise `am start` reports "Activity class ... does not exist".

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

| ID                                                                    | Result                                                                                                           | Command                                                                  |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Contract check, 51 checks                                             | pass                                                                                                             | `pnpm exec tsx tests/scenarios/lane-7/harness/check-contract.mjs`        |
| H1 to H12 sign-in, session end, network drop                          | pass on iOS and Android                                                                                          | `node tests/scenarios/lane-7/e7-1-signin.mjs [ios\|android]`             |
| S1 to S8 states and switches, E1 server error, L1 to L5 live delivery | pass on iOS and Android                                                                                          | `node tests/scenarios/lane-7/e7-1-states.mjs [ios\|android]`             |
| F1 to F2 first conversation                                           | pass on both (Android by script; iOS by hand through the simulator tool)                                         | `node tests/scenarios/lane-7/e7-1-first-conversation.mjs [ios\|android]` |
| Request rate, thread open and idle (WP 7.8 "before")                  | iOS 49 a minute, Android 51 a minute                                                                             | `node tests/scenarios/lane-7/baseline-requests.mjs both 60`              |
| N1 to N21 navigation (WP 7.2)                                         | Android: 21 of 21 pass. iOS: 13 XCUITest flows pass, plus prior manual results ([details](lane-7-navigation.md)) | `node tests/scenarios/lane-7/e7-2-navigation.mjs [N1 ...]`               |
| Release builds contain none of the hook                               | pass, both; repeated for 7.2                                                                                     | `artifacts/lane-7/7-2-gates.txt`                                         |

Existing suites for 7.1 (Android unit and Paparazzi 19, Lint 0 errors, instrumentation 8 with 4 skipped by design; iOS `swift test` 18, UI tests 6 with 4 skipped by design): `./gradlew :app:testDebugUnitTest :app:verifyPaparazziDebug :app:lintDebug`; `swift test`; `xcodebuild test`. The 7.2 run of these is recorded in [lane-7-navigation.md](lane-7-navigation.md).

## Tickets and observations

Ticket to lane 1/trust integration and domain owners: local thread-deletion jobs deny access immediately but domain erasure remains blocked/retrying; files, errors and requested follow-up are in [the 7.3 report](lane-7-keyboard-drafts.md). Observations for the integrator (not tickets, because the files are lane 7's): `xcodebuild` rewrites `apps/ios/Package.resolved`, so every local iOS build leaves it modified and it must not be committed; the release `Info.plist` keeps `NSAllowsLocalNetworking`, a 7.9 item. The decisions the brief lists (minSdk, stripping the call permissions and services, icon art, export-compliance answer) are needed by 7.9.

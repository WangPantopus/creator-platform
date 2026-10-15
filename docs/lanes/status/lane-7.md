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

Working on: WP 7.2 publication, PR 379. Local verification is complete: Android 21/21 and iOS 13/13 fake-API flows, both focused real-stack flows, native regression suites, release builds/hook checks, contract check and repository gates. The two iOS defects found during operation (row tap during Back; cold creator link skipping Discover) are fixed and rerun.

Waiting on: GitHub connection for the app's CI reader; CI has not been inspected. This does not block the next local work. Four flags with defaults remain in [lane-7-navigation.md](lane-7-navigation.md).

Next, in order: 7.3 keyboard, insets, rotation and drafts; 7.4 rendering parity (C4 is on main); 7.10 copy lookups; 7.11 accessibility; 7.8 polling/offline; 7.12 web Studio link. Waiting, not started: 7.5 (C1), 7.6/7.7 (domain and credentials), 7.9 (accounts and icon art).

## Resume here

1. Continue in the authorized warm lane 7 worktree. Verify branch/status and read PR 379 for new comments; PR 369 is merged. Do not rebase or merge a PR. Main was merged into navigation at `678484ade`.
2. WP 7.1 and WP 7.2 verification are done; do not repeat them without a new change or failure. The exact results, earlier manual checks and checks not run are in [lane-7-navigation.md](lane-7-navigation.md). E7.2's draft restoration is still WP 7.3.
3. Start WP 7.3 on its own branch/PR. The founder authorized this default (state it in the PR and keep going): drafts stay on the device only, encrypted, bound to the account and thread, cleared on send, sign-out, data deletion or when the conversation goes away, and never uploaded. Preserve an unconfirmed send's existing idempotency key across restart; check acceptance without automatically sending again.
4. Baselines for 7.3: iOS truncates the header, composer and tab labels at the largest text size; Android's identity strip scrolls away. Main now hides tabs inside a thread, so operate the current build before choosing layout changes. See `artifacts/lane-7/7-1-largest-text.png`.
5. This session continues into 7.3. Its own devices, fake API and link driver may still be running; verify ownership before starting/stopping anything. The real stack is stopped with its disposable lane 7 data kept for reuse. Use [lane-7-harness.md](lane-7-harness.md), keep native jobs serial, and rebuild when changing API origins.

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

Tickets to other lanes: none. Observations for the integrator (not tickets, because the files are lane 7's): `xcodebuild` rewrites `apps/ios/Package.resolved`, so every local iOS build leaves it modified and it must not be committed; the release `Info.plist` keeps `NSAllowsLocalNetworking`, a 7.9 item. The decisions the brief lists (minSdk, stripping the call permissions and services, icon art, export-compliance answer) are needed by 7.9.

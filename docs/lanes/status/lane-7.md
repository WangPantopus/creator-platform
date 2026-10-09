# Lane 7: Phone apps (iOS and Android) status

Updated: 2026-10-09, by the lane 7 session (one session, both platforms), at a handoff to the next session.

Working on: WP 7.2, system navigation. Branch `lane-7/navigation`, draft pull request (find it with `gh pr list --head lane-7/navigation`), stacked on `lane-7/harness` (pull request 369, open, CI green, no review yet). Android is done and proven (21 flows, all passed); on iOS six flows passed by hand and eleven are not run.

Waiting on: the integrator for pull request 369. Nothing from the founder to keep going. Four flags with defaults are in [lane-7-navigation.md](lane-7-navigation.md) (an iOS copy change, a new iOS gesture, the predictive-Back opt-in, the trail not surviving a restart).

Next, in order: finish 7.2 (iOS flows, fix, update the pull request, mark it ready); 7.3 keyboard, insets, rotation and drafts (the draft part of E7.2 lives here); 7.4 rendering parity (lane 5's C4 is on `main` now: read it); 7.10 copy lookups; 7.11 accessibility; 7.8 polling and offline (C5); 7.12 deep link to the web Studio. Waiting, not started: 7.5 (needs C1), 7.6 and 7.7 (domain and credentials), 7.9 (accounts and icon art).

## Resume here

0. At the handoff the emulator, the simulator, the fake API and the Gradle daemon were shut down (the devices and their installed debug builds are kept). Start them as [lane-7-harness.md](lane-7-harness.md) "Run it" says; rebuild both apps after any pull.
1. `git fetch origin`; read the two pull requests (`gh pr view 369`, then the 7.2 one) for new comments or CI results before anything else. Do not trust this file over them.
2. You are on `lane-7/navigation`. `main` has moved since the harness branch point (lane 5's C4 and notices, additive generated API code); merge `origin/main` into the branch (never rebase a pushed branch) when you finish 7.2, rebuild both apps, run `check-contract.mjs` and the scenarios again.
3. Finish 7.2 from [lane-7-navigation.md](lane-7-navigation.md): its "Resume here" table says what is proven and what is not.
4. Then 7.3. Open question to settle before coding drafts: **where a draft is kept.** Proposed default for the founder (privacy posture, so say it in the pull request and keep going): a draft is kept on the device only, encrypted, bound to the account and the thread, cleared when it is sent, when the person signs out, deletes their data, or the conversation goes away; it never leaves the device. E7.2 and E7.3 both need "kill the process and relaunch: the draft comes back".
5. Baselines the harness already shows for 7.3: iOS truncates the thread header, composer and tab labels at the largest text size; on Android the identity strip scrolls away. See `artifacts/lane-7/7-1-largest-text.png`.

## Traps that cost time (so you do not pay twice)

- **The harness runs old code until it is restarted.** `L.ensureHarness()` starts one only if none answers, so after editing a harness file kill the old process (check its working directory is this worktree first) and start `node tests/scenarios/lane-7/harness/server.mjs`.
- **A debug launch's extras come back after the process dies** (`harness_reset`, `harness_actor`, `return_to`): Android re-delivers the original intent. For restore tests do a plain relaunch (`run-app.mjs android` with no flags) first, then test.
- **iOS builds must be ad-hoc signed** or every Keychain call fails; `xcodebuild` rewrites `apps/ios/Package.resolved` (restore it with `git checkout -- apps/ios/Package.resolved` before every commit).
- **The Mac is shared and loaded (load average 20 to 35).** A full Android navigation run takes 40 minutes or more; do not start a second heavy job while a scenario runs, or its timings move.
- **iOS taps while typing are asynchronous**: wait, take a screenshot, then tap Send (the layout shifts while the keyboard animates).
- **iOS simulator tool tips** (the edge swipe needs `touch_path`, `simctl openurl` asks "Open in Qelvora?", tap coordinates, waiting for a thread to load) are in [lane-7-navigation.md](lane-7-navigation.md).
- **Do not use bare `git stash`** (shared across worktrees), `git worktree remove`, `git clean -fdx`, `git reset --hard`.
- **Devices and ports** are in [lane-7-harness.md](lane-7-harness.md): own simulator `qelvora-lane7-ios`, own emulator `qelvora-lane7-android` (serial `emulator-5574`), the fake on port 56473.

## Scenarios

All "on the harness", never the real backend; re-run them on lane 2's stack when it lands. Both devices must have the debug builds installed; the harness starts itself if none is running.

| ID                                                                    | Result                                                                                          | Command                                                                  |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Contract check, 51 checks                                             | pass                                                                                            | `pnpm exec tsx tests/scenarios/lane-7/harness/check-contract.mjs`        |
| H1 to H12 sign-in, session end, network drop                          | pass on iOS and Android                                                                         | `node tests/scenarios/lane-7/e7-1-signin.mjs [ios\|android]`             |
| S1 to S8 states and switches, E1 server error, L1 to L5 live delivery | pass on iOS and Android                                                                         | `node tests/scenarios/lane-7/e7-1-states.mjs [ios\|android]`             |
| F1 to F2 first conversation                                           | pass on both (Android by script; iOS by hand through the simulator tool)                        | `node tests/scenarios/lane-7/e7-1-first-conversation.mjs [ios\|android]` |
| Request rate, thread open and idle (WP 7.8 "before")                  | iOS 49 a minute, Android 51 a minute                                                            | `node tests/scenarios/lane-7/baseline-requests.mjs both 60`              |
| N1 to N21 navigation (WP 7.2)                                         | Android: 21 of 21 pass. iOS: 6 pass by hand, the rest not run ([details](lane-7-navigation.md)) | `node tests/scenarios/lane-7/e7-2-navigation.mjs [N1 ...]`               |
| Release builds contain none of the hook                               | pass, both (checked for 7.1; **not re-checked for 7.2**)                                        | see pull request 369                                                     |

Existing suites for 7.1 (Android unit and Paparazzi 19, Lint 0 errors, instrumentation 8 with 4 skipped by design; iOS `swift test` 18, UI tests 6 with 4 skipped by design): `./gradlew :app:testDebugUnitTest :app:verifyPaparazziDebug :app:lintDebug`; `swift test`; `xcodebuild test`. The 7.2 run of these is recorded in [lane-7-navigation.md](lane-7-navigation.md).

## Tickets and observations

Tickets to other lanes: none. Observations for the integrator (not tickets, because the files are lane 7's): `xcodebuild` rewrites `apps/ios/Package.resolved`, so every local iOS build leaves it modified and it must not be committed; the release `Info.plist` keeps `NSAllowsLocalNetworking`, a 7.9 item. The decisions the brief lists (minSdk, stripping the call permissions and services, icon art, export-compliance answer) are needed by 7.9.

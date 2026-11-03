# Lane 7: system navigation (WP 7.2): the spec, the scenarios, and where to resume

Written by lane 7. One spec for both platforms. A difference between the platforms is a defect, so
every rule below is implemented the same way in `apps/android/.../identity/NavigationHistory.kt` and
`apps/ios/Sources/QelvoraUI/NavigationHistory.swift` (the parent map and the tab inference are the same
table in two languages), and wired the same way into `FanSession` in `FanShell.kt` / `FanShell.swift`.

## Resume here (2026-10-09)

PR 369 is merged. `origin/main` was merged into `lane-7/navigation` at `678484ade`.
WP 7.2 local verification is complete. Both real-stack flows, the full fake-API runs and the affected iOS gates pass after the cold-link fix. PR 379 is ready for review after publishing this evidence.

| Piece              | State                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android N1 to N21  | All 21 pass in one uninterrupted run after the merge                                                                                                                                                  |
| iOS navigation     | The approved XCUITest run passed 13 flows with no skips: N1, N2, N5, N6, N8, N13–N17, N19, N20, and the Creator access half of N21. Earlier manual passes remain N3, N4, N7, N10, and Spending in N21 |
| Regression gates   | Both debug builds, existing native suites, both release builds/hook checks and the 51-check contract check pass; root checks pass                                                                     |
| E7.2 draft restore | WP 7.3; not run here                                                                                                                                                                                  |

Next: WP 7.3, on a separate branch and pull request. Draft restoration remains there. CI could not be read: the app's PR checks tool requires a GitHub connection.

## The spec

### Resumed iOS operation

The founder approved using XCUITest in the resumed Codex session because the manual simulator
control tool is unavailable there. `apps/ios/UITests/Lane7NavigationFlows.swift` drives the real
app's controls, gestures and OS links, and checks the fake API's requests and state. It skips
unless explicitly enabled by `tests/scenarios/lane-7/ios-navigation.mjs`; these are operated
end-to-end flows, not unit tests. The real backend is not proved by these runs.

Build the app with the runbook's signed simulator command, using `build-for-testing` in place
of `build`. Start the existing harness and `node tests/scenarios/lane-7/ios-link-driver.mjs`
(loopback port 56475, only the lane's simulator and fixed scenario links). Then run:

```sh
node tests/scenarios/lane-7/ios-navigation.mjs <derived-data>/Build/Products/QelvoraApp_iphonesimulator26.5-x86_64.xctestrun N5 N1
```

Omit the flow IDs to run all fake-API flows implemented in that file. The runner takes the heavy-build
lock, disables parallel testing, keeps result bundles outside Git, and refuses to report success
if any selected flow was skipped or absent. `LANE7_OUT` selects the evidence directory.

The first N5 run found an edge swipe activating the Memberships row under the finger. The
screen and request log showed Manage membership instead of Home. A plain SwiftUI gesture
also failed this case. The replacement `NativeBackSwipe` recognizer passed N5 and N1, then the complete 13-flow
run. It gives the horizontal edge drag priority and cancels the row's tap; vertical edge
drags still scroll, and sheets retain their own dismissal. N5 also checks the vertical
scroll, Spending and Help API reads, and the final Home screen. The result bundle retains
screenshots, accessibility trees and request metadata for each flow.

### Real-stack check

After the fake-API run, stop the harness (its port 56473 is needed by the model fake).
Start `node infra/local/stack.mjs up --lane 7 --no-web --growth --ack-only`.
This creates only lane 7's disposable PostgreSQL and runs the real API with synthetic
identity and model-provider edges. The smoke creates fan one's profile and conversation
through real endpoints. No native navigation result is claimed until the following runs pass.

- Install the debug APK again after instrumentation (that task removes it).
- Android: `node tests/scenarios/lane-7/stack-navigation.mjs android` uses the debug API
  origin override for lane 7's port 56471, then checks the real API state and denial to
  a signed-out visitor and another fan.
- iOS: rebuild with `CREATOR_API_URL=http://127.0.0.1:56471` (a cold OS link needs the
  built-in origin), keep the lane's link driver on 56475, then run
  `node tests/scenarios/lane-7/ios-navigation.mjs <built.xctestrun> --stack` followed by
  `node tests/scenarios/lane-7/stack-navigation.mjs verify`.
- Both walk Home > Maya thread > Back, a warm account link > Back (iOS from the background),
  process stop/relaunch > thread > parent, and a cold creator link > Discover > Home.
- Android: **pass**, including API state and wrong-person denial.
- iOS: **pass after a real failure and fix**. The first run reached Home directly from a
  cold creator link, skipping Discover. `onOpenURL` had pushed the startup Home route.
  The shell now remembers whether its scene has ever been active: an initial link replaces,
  while a later link pushes, including one arriving from the background. The real-stack
  rerun passed all four journeys, with screenshots and no skips. A discarded scene-delegate
  approach broke startup and was removed; the final fix preserves SwiftUI scene ownership.
- The full 21/13-flow matrices above remain fake-API proof.

### Navigation rules

1. **The trail.** The app keeps the screens you moved through, newest last, with the tab each was in.
   Paths and tab names only: no credential, message text, or account data. At most 24 entries.
2. **Back** goes to the last entry. With no trail (a link into a stopped app, or after a restart),
   Back goes to the screen this one _belongs under_ (the parent map below), and from any tab other
   than Home it ends at Home. At Home there is nowhere to go: Android leaves the app (the system does
   it), iOS shows no Back and ignores the swipe.
3. **Tab roots reset the trail.** `/home`, `/discover`, `/requests` and `/you` start their tab fresh.
4. **Some moves replace instead of push**, so Back never returns to a screen the person did not choose:
   the consent screen into the first conversation, a tapped notification (it forwards and replaces
   itself), restoring the saved place on launch, and removing the arrival context.
5. **A screen with a view of its own closes that view first**: the thread's "Me and privacy" view, the
   development sign-in chooser, a commerce sub-screen. Android: nested `BackHandler`. iOS: `holdBack` /
   `releaseBack`. The thread's privacy view is an inline view on Android and a sheet on iOS; both now
   carry the same "Back" button at the top (the iOS sheet had none and relied on the system swipe-down,
   which the sheet's pull-to-refresh competes with). Compose `Dialog`s (the source passage, the
   comparison choice) and SwiftUI sheets close themselves.
6. **Links.** A link while the app is open pushes (Back returns to where you were). A link into a
   stopped app has no trail, so Back goes to the parent, then Home. A link the app does not know
   changes nothing.
7. **Restart.** The place comes back (the existing saved place). The trail lives in the process on
   both platforms: rotation and backgrounding keep it, a restart does not (Android tags the saved
   trail with a per-process token and drops a trail written by an earlier process; iOS keeps it in
   memory only). After a restart, Back goes to the parent.
8. **Sign-out and account change clear the trail**, so a new account never inherits the last one's.
9. **A control that names its destination must go there.** The post screen's back control says
   "Back to {name}'s page" only when that is where Back goes; otherwise it says "Back".
10. **Gestures.** Android: system Back, the back gesture and predictive Back (opted in with
    `android:enableOnBackInvokedCallback="true"`; a handler is enabled only when there is somewhere to
    go, so at Home the system plays its own leave-the-app animation). iOS: the in-screen Back, a swipe
    in from the left edge (new; the same gesture Android has; it never takes a tap or a scroll), and
    VoiceOver's escape gesture.

### The parent map (same on both platforms)

| Screen                                                                   | Back goes to, when there is no trail       |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| `/home`                                                                  | nowhere (Android leaves the app)           |
| `/discover`, `/requests`, `/you`                                         | `/home`                                    |
| a tab root with a query, e.g. `/you?creatorId=...`                       | the tab root                               |
| `/creators/<handle>`                                                     | `/discover`                                |
| `/creators/<handle>/chat`, `/requests`, `/access`, `/posts/<id>`         | `/creators/<handle>`                       |
| `/notifications`                                                         | `/home`                                    |
| `/notifications/settings` and other children                             | `/notifications`                           |
| `/notifications/<uuid>`                                                  | forwards to its target and replaces itself |
| `/commerce/spending`                                                     | `/you`                                     |
| other `/commerce/*`, `/requests/<id>`                                    | `/requests`                                |
| `/support*`, `/trust*`, `/identity/*`, `/onboarding/handle`, `/studio/*` | `/you`                                     |
| anything else (threads, calls, unavailable)                              | `/home`                                    |

The tab shown as selected follows the trail entry's tab, so a creator page opened from Discover keeps
Discover highlighted and a money screen opened from Requests keeps Requests highlighted.

## Scenarios

Android: `node tests/scenarios/lane-7/e7-2-navigation.mjs [N1 N7 ...]` (the harness starts itself;
the emulator `qelvora-lane7-android` must be running with the debug build installed). Every flow walks
forward through real screens, then presses Back and checks the trail in reverse, ending with the app
leaving (the launcher takes focus). "On the harness": the fake API, not the real backend.

### Results (2026-10-09, on the harness)

Android: all 21 flows pass in one uninterrupted run after merging main.
iOS: 13 flows passed in one XCUITest run with no skips after both the gesture and cold-link fixes; prior manual
results are identified explicitly. All use the fake API, not the real backend.

| ID  | What it walks                                                           | Android result (what was seen, in order)                                                                                                                                                                                       | iOS                                                                                    |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| N1  | Home to a thread: Back returns to Home, not You                         | pass: home > thread > home > app left                                                                                                                                                                                          | pass: button and edge swipe both return Home (XCUITest rerun)                          |
| N2  | Discover, creator, consent, thread: Back skips the consent              | pass: discover > creator > consent > thread > creator, not the consent > discover > home, the tab's parent > app left                                                                                                          | pass: thread > creator > Discover > Home; exactly one consented Priya thread           |
| N3  | Step-in packet: Back returns to the thread                              | pass: thread > packet > thread, not Requests > home                                                                                                                                                                            | pass (prior manual run; not rerun)                                                     |
| N4  | A view inside a thread closes first                                     | pass: thread > privacy > thread > home                                                                                                                                                                                         | pass (prior manual run; not rerun)                                                     |
| N5  | Account screens: Back returns to You, then Home                         | pass: you > spending > you > help > you > home, the tab's parent                                                                                                                                                               | pass: You after Spending and Help, then Home; vertical edge scroll also works          |
| N6  | Notifications: a tapped item, Back to the list, Back to Home            | pass: list > post > its back control says Back, not Back to Maya's page > in-screen Back: list > creator page > system Back: list > home                                                                                       | pass: post > list > creator > list > Home; Back accessibility label; both notices read |
| N7  | A link while the app is open: Back returns to where you were            | pass: discover > thread > discover, where you were > home > app left                                                                                                                                                           | pass (prior manual run; not rerun)                                                     |
| N8  | A link into a stopped app: Back goes Home, then leaves                  | pass: thread > home > app left                                                                                                                                                                                                 | pass: cold thread > Home; cold creator > Discover > Home                               |
| N9  | Rotation keeps the trail                                                | pass: thread > thread after rotating > home, the trail survived                                                                                                                                                                | not run: iOS rotation is WP 7.3                                                        |
| N10 | Stopped and reopened: the place returns, Back goes Home                 | pass: thread > thread restored > home > app left                                                                                                                                                                               | pass (prior manual run; not rerun)                                                     |
| N11 | The back gesture goes back, and at Home leaves the app                  | pass: thread > home > app left                                                                                                                                                                                                 | not applicable: iOS edge swipe covered by N1/N5                                        |
| N12 | Sign-in chooser: Back closes it, then leaves                            | pass: welcome > chooser > welcome > app left                                                                                                                                                                                   | not applicable: iOS has no system Back                                                 |
| N13 | Wrong person: a new account never inherits the last one's trail         | pass: devon's thread > account > signed out > chooser > priya, back on the account screen > Back: priya's You, not devon's thread > Back: home > Back: app left, nothing stale to go to > priya never asked for devon's thread | pass: Priya account > her You > Home; no Devon thread read; Devon session revoked      |
| N14 | A link the app does not know changes nothing                            | pass: discover > still on discover > home                                                                                                                                                                                      | pass: unknown link leaves Discover unchanged > Home                                    |
| N15 | Repeat: the same link twice is one step, fast Back presses do not skip  | pass: discover > thread > thread still > one Back: discover > thread again > two quick Backs: home                                                                                                                             | pass: repeated link adds one entry; consecutive edge swipes reach Home and stop        |
| N16 | Race: a link arrives while a thread's privacy view is open              | pass: thread > privacy > creator page > thread, privacy closed                                                                                                                                                                 | pass: privacy sheet > creator > thread with privacy closed                             |
| N17 | Boundary: thirty screens deep, the trail holds 24 and Back never loops  | pass: on the last screen > left after 27 presses (expected 27)                                                                                                                                                                 | pass: 24 trail entries > You > Home (26 Backs); another edge swipe stays Home          |
| N18 | The system reclaims the app: the place returns, Back goes to its parent | pass: post > post restored > creator page, not the list                                                                                                                                                                        | not run separately: iOS process restart covered by N10                                 |
| N19 | A new fan on the handle form can still leave with Back                  | pass: handle form > app left, not trapped                                                                                                                                                                                      | pass: Back keeps the handle form; no profile write                                     |
| N20 | Edit profile: Back through the account screen to You, then Home         | pass: you > account > handle form > in-screen Back: account > system Back: you > home                                                                                                                                          | pass: handle form > account > You > Home                                               |
| N21 | Requests tab: money screens go Back to Requests, not to You             | pass: requests > spending > in-screen Back: requests, not you > access > system Back: requests > home                                                                                                                          | pass: Spending (prior manual); Creator access > Requests > Home (XCUITest)             |

Logs: [Android](../../../artifacts/lane-7/7-2-android-run.txt) and
[iOS](../../../artifacts/lane-7/7-2-ios-run.txt). The iOS runner asserts screen transitions,
notification read state, consent creation, session revocation and account-scoped API requests.
The resumed Android N13 check now matches `/conversations/` (the real API path); the old
`/threads/` match was ineffective. Its existing screen assertion had caught the deliberate
sign-out mutation, but that did not prove the old request assertion.

**The assertions can fail.** I broke three behaviors on purpose, rebuilt, and ran the flows that guard
them: with the trail not cleared at sign-out N13 failed ("Back: priya's You, not devon's thread"); with
the trail limit raised from 24 to 30 N17 failed (31 presses instead of 27); with the consent into the first
conversation pushed instead of replaced N2 failed (Back landed on the consent). Restored, all three passed
again.

### iOS flow recipe (original manual-tool instructions)

This is the original recipe and tool guidance retained for later manual checks. The results
above supersede its original completion notes. The founder approved XCUITest for the unfinished
flows; all applicable unfinished rows now passed in the operated run.

iOS has no system Back, so these use the in-screen Back, the left-edge swipe, links with `xcrun simctl openurl <udid> 'qelvora://app/<path>'`, and kills with
`xcrun simctl terminate <udid> com.pantopus.qelvora` and a plain `simctl launch`. Start each from a
clean app: `node tests/scenarios/lane-7/run-app.mjs ios --reset --actor devon [--to <path>]`. Read the
screen with the screenshot and `L.screenText("ios", ...)` (OCR) or your own eyes.

**The edge swipe needs a sampled path.** The tool's single `swipe` action sends too few touch points for
SwiftUI's drag gesture and does nothing. Use `touch_path` with several samples, starting at x of about
10 pt (not within 4 pt of the edge, which the tool turns into the OS gesture instead), for example
`(10,500) (22,501) (40,502) (70,503) (110,504) (160,505) (230,505)` with 40 ms between points. It went
from the thread to Home that way. Taps need the layout to be still: wait for the screen, take a
screenshot, then tap (about 0.437 pt per pixel of a 920 px wide screenshot).

**`simctl openurl` makes iOS ask "Open in Qelvora?"**: tap Open (about 275, 474 pt). The thread's
"Me and privacy" is a sheet on iOS (inline on Android): it now has a "Back" button at the top (about
46, 100 pt); before, it had no close control and the system swipe-down competed with its
pull-to-refresh. The thread takes a few seconds to load after a tap on a cold start: a tap on
"Me and privacy" before that lands on nothing.

| ID                | Do                                                                                                            | Expect                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| N1                | Home, tap "Kiln Club" row, in-screen Back; then again with the edge swipe                                     | Thread, then Home both times (done)                                                                                                                    |
| N2                | `--actor priya --to /discover`: search "Lena", the creator, "Message Lena Park's AI", Start; Back three times | Creator page (not the consent), Discover, Home                                                                                                         |
| N3                | Kiln thread, "Ask Kiln Club to step in", Back                                                                 | Thread (not Requests) (done)                                                                                                                           |
| N4                | Kiln thread, "Me and privacy", Back                                                                           | The sheet closes first, then the thread (done)                                                                                                         |
| N5                | `--to /you`: "Spending and time", Back; "Help and safety", Back; Back                                         | You, You, Home                                                                                                                                         |
| N6                | Home, Notifications, the Friday glaze clinic row, Back; the bisque row, Back; Back                            | Post, list, creator page, list, Home. The post's back control reads "Back" (accessibility label: check in the Accessibility Inspector or mark not run) |
| N7                | `--to /discover`, then `simctl openurl` the Kiln thread, Back                                                 | Thread, then Discover, then Home (first two done)                                                                                                      |
| N8                | Terminate, `simctl openurl` the Kiln thread (cold), Back                                                      | Thread, then Home                                                                                                                                      |
| N10               | Home, Kiln thread, terminate, plain launch                                                                    | The thread is back; Back goes Home (done)                                                                                                              |
| N13               | Devon: Kiln thread, link `/identity/account`, Sign out, Continue, Priya; Back                                 | Priya's account, then her You, then Home. Nothing of Devon's. Check the harness log: Priya never asks for Devon's thread                               |
| N14               | `--to /discover`, `simctl openurl qelvora://app/admin`                                                        | The screen does not change; Back goes Home                                                                                                             |
| N15               | Open the same link twice; double-tap Back quickly                                                             | One entry; two quick Backs end at Home, never past it                                                                                                  |
| N16               | Kiln thread, "Me and privacy", `simctl openurl` the Maya creator page, Back                                   | The thread with the privacy view closed                                                                                                                |
| N17               | Optional: 30 alternating links, then Back until Home                                                          | 24 trail entries, then You, then Home (27 presses to leave on Android)                                                                                 |
| N19               | `--actor new fan`: the handle form                                                                            | The in-screen Back does nothing harmful (iOS has no screen to leave to)                                                                                |
| N20               | `--to /you`: Edit handle and intro, Edit public profile, Back, Back                                           | Account, You, then Home                                                                                                                                |
| N21               | `--to /requests`: "Spending and time", Back; "Creator access", Back                                           | Requests both times, not You (Spending half done)                                                                                                      |
| N9, N11, N12, N18 | Not applicable on iOS (rotation is WP 7.3; there is no system gesture or chooser Back; a restart is N10)      |                                                                                                                                                        |

## Gates (2026-10-09, after merge `678484ade` and the navigation fixes)

| Gate                                                | Result                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Android unit and Paparazzi                          | pass: 19 tests, 0 failures                                                                              |
| Android Lint                                        | pass: 0 errors                                                                                          |
| Android `connectedDebugAndroidTest`                 | pass: result XML has 8 tests, 4 passed, 4 skipped by design, 0 failures                                 |
| Android release build and debug-hook absence        | pass: all three hook markers present in debug DEX, absent from release; fake origin absent              |
| iOS existing UI suites                              | pass: 2 Foundation tests; 4 ConnectedJourney tests skipped by design; no failures                       |
| iOS operated navigation                             | pass: 13 tests, no skips; separate from the regression suites                                           |
| iOS `swift test`                                    | pass: 18 tests, 0 failures                                                                              |
| iOS release build/hook absence                      | pass: simulator Release built; all four debug-hook markers absent, fake origin absent, API origin empty |
| `pnpm` format, lint, typecheck, generate check      | pass: typecheck 7/7 (forced); eslint/prettier; generated resources and 119 operations                   |
| Harness contract check against current real schemas | pass: 51/51                                                                                             |
| GitHub CI                                           | not run: app PR checks tool needs a GitHub connection; no polling                                       |

Evidence: [local gate report](../../../artifacts/lane-7/7-2-gates.txt). The connected journey
skips do not count as operated navigation passes. Release distribution signing and installation
are WP 7.9 and are not run here.

## What changed in the harness during 7.2 (found by these scenarios)

- **Each response now says `Connection: close`.** Node closed idle keep-alive sockets after 5 s; the
  `adb reverse` tunnel does not pass that close on, so the emulator reused a dead connection and the
  next request failed with "unexpected end of stream". It showed up as "Account unavailable" on
  screens after a few idle seconds, and as "Pantopus sign-in is not connected" after an in-app
  sign-out. The real server is not affected.
- **Home lists a conversation that has no message yet**, as the real service does (`home.ts`): the
  system label, an empty preview, and the privacy-notice time. It used to answer 500, which made Home
  say "The service is unavailable" right after "Start with ...'s AI".

## For the founder (flags, each with a default)

1. **Copy change on iOS:** the "Me and privacy" view's Back said "Back to You" and now says "Back"
   (Android already said "Back"). The post screen's back control now reads "Back" unless Back goes to
   the creator's page. Default: keep, because a label must not promise a place Back does not go to.
2. **A new iOS gesture:** a swipe in from the left edge goes back, as Android's system gesture does.
   Default: keep (parity).
3. **Predictive Back** is opted into in the Android manifest. Default: keep.
4. **The trail does not survive a restart** on either platform (spec rule 7). Keeping it would mean
   writing it with the saved place in the Keychain / Keystore record, which is lane 1's storage
   code and a security-posture change. Default: leave as is.

## Not checked

- VoiceOver's escape gesture: not run. The iOS post's Back accessibility label passed N6.
- Prior manual iOS flows N3, N4, N7, N10 and Spending in N21 were not repeated after the merge.
- Right-to-left layouts: the iOS swipe uses the physical left edge.
- Android predictive Back's _animation_: the opt-in and the handler priority are visible in `logcat`
  (`CoreBackPreview ... mIsAnimationCallback=true`), but the cross-fade itself was not looked at.
- Screens whose Back I rewired but no flow reaches: calls (`/calls/<id>`), the Studio screens
  (`/studio/*`), the notification settings screen, and the Help and safety sub-forms.
- The real backend: everything is on the harness.
- Rotation on iOS (WP 7.3).

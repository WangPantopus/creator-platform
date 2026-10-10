# Lane 7: the fake API harness (WP 7.1) runbook

Written by lane 7. The integrator moves this to its permanent place. It says how to run each phone
app signed in on a simulator and an emulator without the full stack, what the fake serves, and what
it does not.

## What it is, and what it is not

A small Node program that answers the way the Qelvora API answers, so the fan apps can be operated
until lane 2's one-command stack is on `main`. It is a fake of **our own API**, which the working
agreement allows only because WP 7.1 asks for it. So:

- A scenario run on it proves the **app**: what it sends, what it shows, what it does when the
  answer is slow, wrong or missing. It does **not** prove the backend. Every scenario result says
  "on the harness". When lane 2's stack lands, the star scenarios are run again on it.
- Its answers are checked against the real contracts (the Zod schemas the real backend uses) by
  `check-contract.mjs`, so it cannot drift quietly. 51 checks, all passing.
- It binds to loopback only, holds everything in memory, and has no secrets. A restart is a clean
  world and ends every session (the apps then show the "session ended" state, which is a scenario).

## Run it

Toolchain, once per shell (see the working agreement, section 3.7):

```
NB="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
export PATH=$NB/node/bin:$NB/bin/fallback:$PATH JAVA_HOME=$HOME/.local/tooling/jdk-17.0.20.1+1/Contents/Home ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$HOME/.local/tooling/xcodegen-2.46.0/xcodegen/bin:$PATH
```

1. **The harness** (port 56473, the lane's "fakes" port):
   `node tests/scenarios/lane-7/harness/server.mjs`
2. **Devices** (own, never the existing ones): simulator `qelvora-lane7-ios`
   (`xcrun simctl create qelvora-lane7-ios com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro com.apple.CoreSimulator.SimRuntime.iOS-26-5`),
   emulator `qelvora-lane7-android` (Pixel 7, Android 35 `google_apis` x86_64). Set `hw.gpu.enabled = yes`
   and `hw.gpu.mode = swiftshader_indirect` in its `config.ini`: with the default `hw.gpu.enabled = no`
   the Android 35 image crashes SurfaceFlinger in a boot loop on this Mac. Start it headless:
   `emulator -avd qelvora-lane7-android -port 5574 -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect`.
3. **Build the debug apps pointing at the harness**, one at a time under the lock:

   ```
   cd apps/android && node ../../scripts/with-heavy-build-lock.mjs --owner LANE-7 -- \
     ./gradlew --offline :app:assembleDebug -PcreatorApiUrl=http://127.0.0.1:56473
   cd apps/ios && xcodegen generate && node ../../scripts/with-heavy-build-lock.mjs --owner LANE-7 -- \
     xcodebuild -project QelvoraApp.xcodeproj -scheme QelvoraApp -configuration Debug \
     -destination 'platform=iOS Simulator,id=<udid>' -derivedDataPath <dir> \
     CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=NO CREATOR_API_URL=http://127.0.0.1:56473 build
   ```

   **The iOS build must be ad-hoc signed.** With `CODE_SIGNING_ALLOWED=NO` the simulator gives the
   app no entitlements, every Keychain call fails, and the app opens on "This device could not clear
   its saved private data". The address is baked in at build time (not passed per launch) so it
   survives a process kill; both apps also accept a debug override (`--api-url`, `api_url`).
   `xcodebuild` rewrites `apps/ios/Package.resolved` (it drops the `swift-issue-reporting` pin and
   changes the hash). Do not commit that file: `git checkout -- apps/ios/Package.resolved`.

4. **Install and launch**, the same way on both:

   ```
   xcrun simctl install <udid> <dir>/Build/Products/Debug-iphonesimulator/QelvoraApp.app
   adb -s emulator-5574 install -r apps/android/app/build/outputs/apk/debug/app-debug.apk
   node tests/scenarios/lane-7/run-app.mjs ios|android [--reset] [--actor devon] [--to /home] [--appearance light|night] [--shot out.png]
   ```

   Both apps reach the harness at `http://127.0.0.1:56473`: the simulator shares the Mac's loopback;
   `run-app.mjs` runs `adb reverse tcp:56473 tcp:56473` for the emulator, so one address serves both.

## The sign-in hook (one spec, two platforms)

Debug builds only. It signs the app in as a development actor without a tap, and starts a scenario
from a clean app. It uses the same sign-in a person would (capabilities, continue, complete), so
nothing is faked in the app.

| Behavior                                                                                                                                                                                                          | iOS launch argument                    | Android intent extra                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------ |
| Before anything is sent, once per launch: wipe the saved credential, the saved place and the private state                                                                                                        | `--harness-reset`                      | `harness_reset=true`                 |
| After the first session check, only when nobody is signed in: sign in as the actor whose label contains the text (case-insensitive). No match: say `No development actor matches "<text>".`; nothing is signed in | `--harness-actor <text>`               | `harness_actor=<text>`               |
| Go to a destination                                                                                                                                                                                               | `--return-to <path>` (existing)        | `return_to=<path>` (existing)        |
| Force Light or Night                                                                                                                                                                                              | `--appearance light\|night` (existing) | `appearance=light\|night` (existing) |

**A release build contains none of it.** iOS: `DebugHarness.swift` is entirely inside `#if DEBUG`.
Android: the real object lives in `app/src/debug`; `app/src/release` holds an empty twin with the same
name, so the release variant compiles the twin and the code is not there (the app does not shrink yet,
so `BuildConfig.DEBUG` alone would have left it in). The release check is in the pull request.

## The world

`devon` sees every thread state from one signed-in account; the others are account states.

| Sign in as (label)                    | Account state                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| Devon, a fan with every thread state  | Handle `devon_k`, follows Maya and Kiln Club, six conversations, notifications |
| Priya, a fan with nothing yet         | Handle, no conversations, follows nobody: the empty Home                       |
| a new fan who has not chosen a handle | No fan profile: the handle form (`handle_taken` is served too)                 |
| Maya, a creator account               | A creator profile (for the web Studio deep link, WP 7.12)                      |
| an account under 18 (refused)         | `complete` answers 403 `adult_eligibility_required` with the policy sentence   |

Devon's conversations, one creator each (the creator's page, Discover and the posts exist for all of them):

| Creator     | Thread state                                                                                                                  | What the server says                                                                    | Expected in the app today                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Maya        | `ai_active`, every message kind: fan, AI with citation, approved draft, Note, reaction, signed reply, system line; one memory | `canSend`                                                                               | Composer; Notes and reactions as text               |
| Kiln Club   | `human_active` (stepped in), creator and team messages                                                                        | `canSend`                                                                               | "Kiln Club is here"; the step-in button still shows |
| Glazeco     | `ai_paused`                                                                                                                   | "AI messaging is paused in this conversation."                                          | Reason notice                                       |
| Tomás Reyes | AI on, no allowance                                                                                                           | "Your AI access or allowance is unavailable. You can still ask the creator to step in." | Reason notice                                       |
| Ines Duarte | Provider consent not current                                                                                                  | "Review the AI providers before messaging."                                             | Reason notice                                       |
| Noor Haddad | `closed` (the nearest the contract has to "ended")                                                                            | paused sentence                                                                         | Reason notice                                       |

The composer states the brief names (trial, ended, capacity) have no server contract yet (C4 and C6 are
draft), so they are not here. They are added when the contract lands, in the work package that needs them.

## What the harness serves

| Area                     | Served                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity                 | capabilities, continue, complete, session (15 minute sessions), refresh by one-use rotation (7 days), logout, revoke all, fan profile and intro                                                                                                                                                                                                        |
| Home, Discover, creators | Home entries from each thread's last message, posts of followed creators, Discover search and category, creator page and post, follow, notifications (read and unread), preferences, push device registration (recorded, never delivered)                                                                                                              |
| Conversations            | capabilities, account, begin, page (with `before`), replay of frames, the 5 second offline lease (with the real session binding), presence, usage, send to the AI (idempotent, streams sentence by sentence), reply to the person, message status, memory, preferences, consent, audit, and the live connection (subscribe, replay, push, close codes) |
| Commerce                 | the overview in its empty state (payments unavailable, Q04) and one thread's access                                                                                                                                                                                                                                                                    |
| Trust                    | the reads Help and Your data open with (help, capabilities, cases, inbox, access history, privacy jobs)                                                                                                                                                                                                                                                |

**Not served yet** (the app shows its honest failure state, and the log lists the path as unserved):
reports, blocks, export and **deletion** (deletion arrives with real semantics in WP 7.5; one that
"succeeds" without deleting would mislead), request and packet fixtures (WP 7.4), member posts and replies
(`/v1/content`), share and invite pages (WP 7.4, 7.6), creator Studio and calls (out of scope), the push
gateway (WP 7.7), the release sign-in contract C1 (WP 7.5).

## The control plane (`/__harness/`, not in the real API)

| Call                                                                                               | What it does                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /state`                                                                                       | Behind the screen: sessions, accounts, devices, notifications, flags, and every thread with its control, epoch, cursor, revision and messages |
| `GET /log?since=<n>&unserved=1`, `POST /log/clear`                                                 | The request log (each entry says which platform sent it, from the User-Agent)                                                                 |
| `GET /stats?seconds=60&client=ios`                                                                 | Requests in the window by route shape, and the per-minute rate                                                                                |
| `POST /reset`                                                                                      | A clean world. Every session ends                                                                                                             |
| `POST /faults` `{rules:[{match, method?, status?, code?, message?, delayMs?, drop?, remaining?}]}` | Slow, fail or drop (destroy the socket) matching requests                                                                                     |
| `POST /clock` `{advanceSeconds}` or `{reset:true}`                                                 | Move the harness clock (session expiry, offline leases)                                                                                       |
| `POST /flags` `{generationAvailable, policyVerified, replyDelayMs, sentenceDelayMs}`               | The model on or off, the provider policy verified or not, reply pace                                                                          |
| `POST /sessions` `{account, action: "expire"\|"revoke"}`                                           | End a session the app did not end                                                                                                             |
| `POST /threads/<creator>/note\|reaction\|reply\|team`                                              | The person shows up in an open thread                                                                                                         |
| `POST /threads/<creator>/ask`                                                                      | The fan's other device sends a question: the reply streams to open screens                                                                    |
| `POST /threads/<creator>/takeover\|handback\|pause`                                                | A speaker change, with the system announcement the real server writes                                                                         |
| `POST /threads/<creator>/set` `{access, consent, offTheRecord, introShared}`                       | Flip a thread's state                                                                                                                         |
| `POST /sockets/close`                                                                              | End every live connection                                                                                                                     |

## Scenarios (commands)

```
pnpm exec tsx tests/scenarios/lane-7/harness/check-contract.mjs      # the fake against the real contracts (starts its own harness)
node tests/scenarios/lane-7/e7-1-signin.mjs [ios|android]            # H1 to H12
node tests/scenarios/lane-7/e7-1-states.mjs [ios|android]            # S1 to S8, E1, L1 to L5
node tests/scenarios/lane-7/e7-1-first-conversation.mjs [ios|android] # F1 to F2 (Android by script; iOS by hand through the simulator tool)
node tests/scenarios/lane-7/baseline-requests.mjs [ios|android] 60   # requests a minute with a thread open (WP 7.8 baseline)
node tests/scenarios/lane-7/e7-2-navigation.mjs [N1 N7 ...]          # N1 to N21, Back and restore, Android (iOS by hand: see lane-7-navigation.md)
```

Each step looks behind the screen (the harness log and state) **and** at the screen: Android reads the
accessibility tree (`uiautomator`); iOS reads the screenshot with the built-in text recognizer
(`ocr.swift`, which confuses "AI" with "Al": `lib.mjs` puts the word back). Steps that need a tap on iOS
need the simulator panel's "Let Claude use it" access; Android is driven with `adb` (`android-ui.mjs`).

## Operating notes

- **Restart the harness after editing a harness file.** `ensureHarness()` starts one only if nothing answers
  on the port, so an old process keeps serving old code. Find it with `pgrep -fl harness/server.mjs`, check
  its working directory (`lsof -p <pid> | grep cwd`) is your worktree, then `kill` it and start a new one.
- **Every response says `Connection: close`.** The emulator reaches the harness through `adb reverse`, which
  does not pass on Node's idle close of a keep-alive socket after 5 s; OkHttp then reused a dead connection
  and failed with "unexpected end of stream" (it looked like "Account unavailable" or "Pantopus sign-in is
  not connected" after a few idle seconds). One request per connection removes the problem. The real server
  is not affected.
- **Home lists a conversation with no message yet**, as the real `home.ts` does: the system label, an empty
  preview, the privacy-notice time. (It used to answer 500.)
- **A debug launch's extras come back after the process dies** (Android re-delivers the original intent):
  for a restore test, relaunch plainly first (`run-app.mjs android` with no flags).
- **Gesture navigation is on** in `qelvora-lane7-android` (`navigation_mode` 2), so `input swipe 2 ...` from the
  left edge is the real back gesture.

## Adding a fixture

Add it to `world.mjs` (a creator, a thread spec, a notification), run `check-contract.mjs` so the shape is
checked against the real schema, then open it in both apps. When a contract changes (C4, C5, C6, C7), change
the harness in the pull request that consumes it. Never make the harness more forgiving than the real API.

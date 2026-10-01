# W6 actual-app evidence — 2026-09-29

Personally implemented, debugged, built, installed and launched by W6; research assistance read only. No new test code. Implementation/build/launch checkpoint; integrated acceptance and release readiness remain open.

## Build and environment

Shared checkout `/Users/yingpengwang/creator-platform`, HEAD `ba2ee4fe9cc029cb5252b2c0ad2f9c582f925892` plus substantial uncommitted foundation/peer/W6 changes. HEAD alone does not identify the build; `build-manifest.json` records owned-source/copied-source/binary hashes. Node24.13.0, Next16.3.7, API4106, web3006. Isolated Postgres17 `creator_w6`, container `creator-platform-w6-local`, port55436, non-owner role. Foundation0001/identity0002/media0006 applied. Availability proposal unallocated/unapplied.

Canonical W1 development identity mode; no successful signed/captured actor session claimed. Private environment files remain600 outside evidence. No provider credentials/private fan content or audio in captures. Current capabilities are all false.

W6 build copies: web `/private/tmp/creator-w6-workspace`; iOS `/private/tmp/creator-w6-ios-source`, DerivedData `/private/tmp/creator-w6-ios`, packages `/private/tmp/creator-w6-ios-packages`; Android `/private/tmp/creator-w6-android-current`, project cache `/private/tmp/creator-w6-gradle-current-cache`. Shared/Pantopus devices and peer outputs preserved.

Exclusive devices: iPhone17e/iOS27.0 simulator `50C7BB1D-FA6B-45CA-897E-B58E78072CDB`, capture1170×2532 pixels; Pixel5 Android34/arm64 AVD CreatorPlatform_W6, serial `emulator-5566`, capture1080×2340 pixels. These are capture pixel dimensions; matching-reference logical viewport/accessibility acceptance is still open.

## Personally observed results

| Journey | Expected | Observed | Status |
| --- | --- | --- | --- |
| Browser recorder/Record click | Genuine capture or recoverable permission/device error | Functional `/media/voice` rendered; click returned **Requested device not found**, restored Record/error UI | Unavailable state observed; audio unverified |
| Latest browser phone/desktop inspection | Current tab responds to UI tools | CDP focus emulation timed out43.5s; previous new-tab attempt also timed out | Interactive and visual acceptance blocked |
| Latest iOS recorder install/launch | Actual fan app opens owned route | Install succeeded; Light PID82307, Night PID83634; captures inspected | Idle launch/render verified; recording/permission/playback unverified |
| Latest Android recorder install/launch | Actual fan app opens owned route | Install Success; explicit MainActivity launch succeeded; recorder visible behind **Pixel Launcher isn't responding** dialog | Launch observed; visual/interaction acceptance partial |
| Native tap/system sheet | Device Hub exposes simulator/emulator controls | `com.apple.dt.Devices` returned `-10005 timeoutReached` | Interactive recording/permission acceptance blocked |
| Running API capability | Truthful configured availability | HTTP200, media/calls/AI-audio=false | Unavailable capability response verified |
| Current web HTTP route | Current route responds after source sync | HTTP200 | HTTP verified; no user-flow completion implied |
| Record→upload/process/sign/play | Real bytes, genuine scan/signature/audience | MediaAuthority/scanner/C2PA/store/consumer configuration absent | Blocked |
| Two-party call/outcome/receipt | Genuine room/history/clock agreement and W4 settlement | Provider/transport/configured captured actors absent | Blocked; no provider trace/record for this run |

Current captures: `ios-recorder-light-current.png`, `ios-recorder-night-current.png`, `android-recorder-current.png`. iOS current heading, body,0:00,60-second limit and secondary Record button are visible; generic recorder no longer claims creator authorship via a seal. Android screenshot preserves the actual system ANR obstruction. CLI install/launch/capture does not prove taps, microphone capture or domain transitions.

Final registered-root captures: `ios-recorder-registered-current.png` (Light), `ios-offer-auth-current.png` (signed-out offer entry), `android-recorder-registered-current.png` (recorder behind the persisting launcher ANR). All were personally inspected. Earlier Night captures use the same unchanged W6 recorder source. Full final iOS bundle and Android APK hashes plus consumed W1 root/generated policy hashes are recorded in the manifest.

Read-only Android dumpsys identifies `com.google.android.apps.nexuslauncher` with input dispatch timeout waiting5012ms for focus loss (record time17:28:54 device time). The bounded event-log query returned no matching events; it does not negate the current capture/last-ANR record. `android-anr.json` contains the sanitized diagnostic. No UI workaround or system-dialog suppression was used.

Last independently completed integration: Studio current captured-context loader → explicit slots/zones/expiry → W1 passkey review → W4 exact-command verification → W6 idempotent offer transaction. Existing saved offers prevent an unconfirmed submission from silently starting a new act. Recording signature publication retains its exact retry key; browser resume validates digest/size/offset/chunk/progress. These workflows compile and are not runtime-accepted while services/passkeys/captured actors are unavailable.

Historical captures are preserved: initial Welcome/splash images and old `ios-recorder-light.png` showing account-notice overlap/creator seal; earlier `ios-recorder-night.png` improved build. These do not represent latest acceptance. No exact recorder/fan-chooser artboard exists; their missing compositions remain DG-W6-02/DI-14. Call/AI voice artboard fidelity is unaccepted until real authorized content/provider state can be rendered and compared in both themes.

## Checks and measured observations

Latest registered-root Swift application build **BUILD SUCCEEDED**; installed and launched offer/auth then recorder. Latest registered-root Android **BUILD SUCCESSFUL in9m15s**,37tasks,4executed/33up-to-date; installed and freshly launched recorder. Earlier W6-source builds took2m36s and4m18s. Earlier Android cold boots541s and154s are environment startup observations, not product latency. Shared Kotlin compilation stall was isolated by cancelling only W6's confirmed build client and using in-process compilation in its copied source; peer daemons were preserved.

Backend/web TypeScript and targeted W6 ESLint passed. Swift retains a peer Trust.swift unnecessary-await warning and AppIntents metadata warning. Compact check results are in `checks.txt`; binary/source hashes in `build-manifest.json`. Builds do not prove media quality, authority, consent, delivery or money.

The isolated web-copy TypeScript check initially found missing copied Zod dependency links, stale W2 API contracts and missing W8 trust contracts. W6 repaired its copied workspace with read-only copies/dependency links; the repeated check passes. The shared checkout was not changed to fix those copy-only errors. Native generated-model consistency check passes31 OpenAPI operations. W1's CallChip timer now has `aria-live=off`; assistive-technology runtime behavior remains unverified.

Single-request profile: local shared Mac developer host under concurrent native builds, loopback, one request each, unavailable media/provider mode. API `/v1/w6/capabilities` HTTP200 **14.553519s**. Web `/media/voice` HTTP200 **33.034813s**, including dev-server compilation/reload. Earlier capability sample2.456890s was also one observation. No p50/p95/p99, cost, accepted-media latency, call setup/revocation or outcome convergence claim.

## Launch instructions

Use reserved resources only. Existing private configuration is not included here. The servers are already running; do not start duplicates on occupied ports.

```sh
# From the shared checkout; current API intentionally has unavailable media/call services.
node --env-file=/private/tmp/creator-w6-runtime/backend.env --import tsx apps/backend/src/modules/media/runtime.ts
# In the isolated web copy
cd /private/tmp/creator-w6-workspace/apps/web
node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3006
```

Open [functional recorder](http://localhost:3006/media/voice). Both native roots register that actual route. W1 has subsequently registered call factories and regenerated the offer query policy. W6's rebuilt iOS app installed/launched the offer-link entry; `ios-offer-auth-current.png` shows Continue with Pantopus for the signed-out client. Shape-valid nonexistent IDs were used only for this unauthenticated entry; no domain records or call authority were created. This does not prove post-login routing, an authorized offer, token replay denial or provider calling.

```sh
cd /private/tmp/creator-w6-ios-source
xcodebuild -project QelvoraApp.xcodeproj -scheme QelvoraApp -configuration Debug -destination 'platform=iOS Simulator,id=50C7BB1D-FA6B-45CA-897E-B58E78072CDB' -derivedDataPath /private/tmp/creator-w6-ios -clonedSourcePackagesDirPath /private/tmp/creator-w6-ios-packages build
xcrun simctl install 50C7BB1D-FA6B-45CA-897E-B58E78072CDB /private/tmp/creator-w6-ios/Build/Products/Debug-iphonesimulator/QelvoraApp.app
xcrun simctl launch --terminate-running-process 50C7BB1D-FA6B-45CA-897E-B58E78072CDB com.pantopus.qelvora --api-url http://127.0.0.1:4106 --return-to /media/voice --appearance light
```

```sh
cd /private/tmp/creator-w6-android-current
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' ./gradlew --offline --no-daemon --max-workers=2 --project-cache-dir /private/tmp/creator-w6-gradle-current-cache -Pkotlin.compiler.execution.strategy=in-process -Pandroid.aapt2FromMavenOverride=/Users/yingpengwang/Library/Android/sdk/build-tools/35.0.0/aapt2 :app:assembleDebug
/Users/yingpengwang/Library/Android/sdk/platform-tools/adb -s emulator-5566 install -r app/build/outputs/apk/debug/app-debug.apk
/Users/yingpengwang/Library/Android/sdk/platform-tools/adb -s emulator-5566 shell am start -n com.pantopus.qelvora/.MainActivity --es api_url http://10.0.2.2:4106 --es return_to /media/voice
```

Interactive UI tools are required for taps/permissions. No replacement test script is supplied. Browser tab1 may retain a temporary390×844 override from a timed-out resize; restore via browser API when control returns. Timed-out tab2 at the same URL is not acceptance evidence. No unknown peer tab/device/process was closed.

## Device/accessibility acceptance matrix

| Behavior | Browser | iOS Simulator | Android Emulator | Actual iPhone/Android |
| --- | --- | --- | --- | --- |
| Recorder idle/denied | Missing-device error | Actual Light/Night idle | Actual idle behind system ANR | Unavailable |
| Record/interrupt/resume/discard/preview | Missing mic/tool blocked | Tool blocked | Tool/system ANR blocked | Unavailable |
| Upload/corrupt/expiry/sign/play/seek | Authority/provider blocked | Same | Same | Unavailable |
| Two-party call/outcomes/consents/receipt | Provider/config blocked | Provider/transport/captured actor blocked; root registered | Same | Unavailable |
| Bluetooth/wired/speaker/cellular interruption | Unverified | Cannot close hardware gate | Cannot close hardware gate | Required, unavailable |
| Incoming locked/background/terminated/camera/network/battery | Unverified | Provider/W7 blocked | Provider/W7 blocked | Required, unavailable |
| Keyboard/focus/200% text/reduced motion/VoiceOver/TalkBack | Latest interaction blocked | Unverified | Unverified | Unverified |

See `session-outcomes.md` for implemented rules and required genuine provider evidence; [W6 status](../../../../../docs/workstreams/status/W6.md) and [coordination](../../../../../docs/workstreams/coordination/W6.md) for exact owners/next actions. No full stream completion or release gate sign-off.

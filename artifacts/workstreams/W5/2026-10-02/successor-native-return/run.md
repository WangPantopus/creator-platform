# Native Content return and navigation cancellation

Personally implemented source
`50146faccf4acc7739dda9298c6349617fdd6991`, based on W5 review source6b58899b
and captured main7f77d295. No tests or owner authority changes were added.

The actual shipping iOS app built at6ac33b0e was operated through supported
CUA on W5's own preserved78C3590E simulator, with actual API4693cf08 and
canonical61. Development fan-one sign-in reached the saved unsigned Note
route and correctly refused its body. Refresh retained that refusal. Tapping
You then crashed the app to Springboard. The actual19:15:57 PDT crash report
records Swift array bounds failure in ContentFeature.swift:111, followed by
load(refreshThanks:) and the screen refresh task. The mutable session route had
changed to /you while the canceled refresh task continued after Task.sleep.

The screen now captures validated creator/content IDs when its route is
registered, stops after canceled sleeps, and invalidates authority/read results
when the screen disappears. Android's outer Content route checks its shape
before indexing. An Android crash was not observed. A separate actual Night
cold launch of the old iOS binary retained the labelled development session and
refused the unsigned content; this does not qualify the new fix.

Both shipping builds passed at50146fac under separate, sequential exact heavy
build leases. iOS strict codesign verification passed. The actual artifacts are:

- iOS app: /private/tmp/creator-w5-successor-ios-derived/Build/Products/Debug-iphonesimulator/QelvoraApp.app
- iOS executable SHA256: ca3c69ca03351a3e3cda975cbf93df4ccd063a040e9045175595589dc25792c5
- iOS debug dylib SHA256: 0988d58c2900870c99206c0e8ee54281c150a45785586af8543f7399d40a382d
- Android APK: /private/tmp/creator-w5-successor-android-build/outputs/apk/debug/app-debug.apk
- Android APK SHA256: 8d9e2ef7db20ac2dd88966a6f2a6e29e566e56ac046671cd864c98b84253d9db
- Android build API: http://10.0.2.2:41055

Private build logs are /private/tmp/w5-successor-ios-return-build.log and
/private/tmp/w5-successor-android-return-build.log. Backend/web type checks and
the existing generated-resource check passed on the combined source.

Implemented: immutable Content route and canceled/disappeared read guards.
Runnable: both shipping builds, strict iOS codesign and existing source checks.
Integrated: actual native session/router and the owned backend composition.
Verified: the original crash and bounded unsigned refusal at the old sources
above, plus the personally operated fixed iOS journey below. Android personal
operation and populated signed/private acceptance remain pending. No
later-source acceptance is inferred.
Release-ready: false; all nine packages remain incomplete. No virtual
authenticator, fabricated proof/signature or peer device/input permission was used.

## Personally operated fixed shipping artifact

At2026-10-03T02:44–02:48Z, W5 atomically held its own GUI/simulator slot2
(tokenf6829d2a) and installed the exact50146fac signed shipping artifact above
on its preserved78C3590E simulator. Actual API source was
`8d8e4e832d144cf827f00f1e0d2e77b8ae26acf5`, foundationReady=true,
ready=false, canonical61, correctly configured127.0.0.1:41055. The native
source tree at8d8e4e83 is byte-identical to50146fac; the actual artifact and
operation remain qualified to50146fac.

Supported CUA Device Hub input personally reached Content's actual unsigned
refusal, then tapped You: the actual app retained @kilnfire without the original
crash. A Night cold launch with the correct API/saved Content target retained
the labelled development session and refused the unsigned Note. During an actual
twenty-second pause of only the owned API PID13433, Refresh concealed content
and showed the reconnect/current-access state. The guaranteed resume trap
restored the actual API; supported CUA Check current access recovered the
unsigned refusal. Tapping You succeeded again in Night. The fixed processes
remained running through these actual journeys. No genuine signed/private body,
reply/reaction, passkey or verification acceptance is claimed.

Private simulator captures are
/private/tmp/creator-w5-successor-native-shots/ios-50146fac-{light-you-return,night-cold-refusal,night-api-interruption,night-you-return}.png.
Actual supported AX state and screenshots were personally inspected, including
the interruption's failure/reconnect copy.

The exact shipping Android50146fac APK above installed and launched with the
actual10.0.2.2:41055 API and saved Content target. Its owned AVD booted first
on5586 under2 cores/2048MB/no-snapshot-save, then was stopped. Supported Android
Studio selection launched the same actual W5 AVD as5554; no peer AVD started.
The actual guest Welcome screen was visible, but supported CUA guest-coordinate
input failed with noWindowsAvailable. Hardware Input/Tab did not reach guest
controls. This is install/launch/control-failure evidence, not personal Android
journey acceptance. Private capture:
/private/tmp/creator-w5-successor-native-shots/android-50146fac-supported-control-block.png.
No adb input, alternate input tool or peer permission was used.

Only W5's own simulator and actual W5 AVD were stopped; their data remains.
Exact GUI/device leases were released, and physical Android retirement was
confirmed. W8 received the next queued window. Peer devices/containers were
untouched. W5 holds no device/GUI/heavy lease after this operation.

## October 3 current artifact operation

The shipping iOS build at `fc9fdfb1e00bbccc8ee0b8f4c78d371e97e7fb3f`
passed normal build and strict deep codesign verification. Executable SHA256:
`f27c31c1dc94c73782cdeada881bd2db16f5594b3796b116a049a39acb5b5fcd`;
debug dylib SHA256:
`8c564a7e2d1d157bf20ff1b4f75a47200fd960439e22af84c0d5cb33a04bb595`.
Shipping Android build at `eb605a15c1991bc532baef727b3ccfb5c0b878f7`
passed assembleDebug. APK SHA256:
`b11867c93ad5a4e3efda6af45195f3fc986141eb7fcb24d393077f451619c701`.
These native trees are unchanged through captured main f6a2f39c; W6's later
0e0d02ad changes require new builds and are not covered by these observations.

At05:05–05:09Z, W5 personally operated that exact fc9fdfb1 iOS artifact through
supported CUA on owned78C3590E, against actual APIeb605a15/canonical61.
The retained, explicitly labelled development account correctly refused the
actual unsigned Note. Refresh did not reveal its body. Content → You retained
@kilnfire without a crash in Light and Night. The Night launch used an explicit
original Content destination. A separate cold launch without a supplied
destination retained the account but opened Home instead of the previous You
page. This is a saved-destination failure, reported to W1, not an accepted return.

An actual35-second pause of owned API PID39485 concealed the Content view and
showed account reconnect/current-access recovery. The guarded operator resumed
that same process. Supported CUA Check current access restored the unsigned
refusal; You then remained stable. Actual AX state and screenshots were
personally inspected. Private captures are
/private/tmp/creator-w5-shell-operator/shots/ios-fc9fdfb1-{light-unsigned-refusal,light-content-to-you,night-cold-home-without-target,night-api-outage-concealed,night-content-to-you-recovered}.png.
No signed/private-body, proof/passkey or later-source acceptance is inferred.

The exact eb605a15 APK installed and launched on owned W5 Android. The initial
IDE launch and an explicit2048MB launch both raised actual memory to2560MB;
each owned process was stopped immediately after its physical memory audit.
The documented emulator `-lowram` option with explicit2048MB/two cores and
no snapshot load/save then produced actual MemTotal2026148kB/CPUs0-1. The
installed artifact reached Welcome with the correct10.0.2.2:41055 API/Content
target. Supported Studio's mirror did not mount this externally launched engine;
the explicit native-app path was also unavailable. No guest input was issued
through another tool. Android journey acceptance remains open. Private actual
guest capture: android-eb605a15-budget-correct-guest.png in the same shots directory.

Own simulator and Android were normally shut down and exact UUIDc9b81358,
device/inode/raw-owner GUI/device custody released; W3 received the next window.
All eight successor-owned branches were updated and pushed with exact captured
remote main `0e0d02ad476f6e88112b6fc68d11efe95fe7f0eb`. Predecessor and peer
checkouts were preserved. The full nine-package assignment is still incomplete.

At source `6497599ec1381f80e7c0bac00c76b74b03db13c2`, incorporating W6
main0e0d02ad, both normal shipping builds passed. iOS strict deep codesign also
passed. Executable SHA256:
`37c803a09ee8b560958283477350edbe62566dc018bdbb3ed5fed39c17206290`;
debug dylib SHA256:
`edd64515407184f022c574ccd3c7abb531a2ec80cfed1d27672ed057f82f4bfd`;
Android APK SHA256:
`676ca3dc1d672b89e03ccdcfb3c58bc128688360cd481d74cba1736f29950d28`.
Canonical generation114 operations/12 resources and backend/web types passed
at this same branch source. These new artifacts have compilation qualification;
the personal device observations above remain at fc9fdfb1/eb605a15.

Captured main `0a445ec2506b016f981aff46adaec5cdf281f875` adds W4's reviewed
Spend/Requests tab-return fix and W6's reviewed enlarged Android conversation
layout. It is integrated into this branch; an attempted fresh heavy build
returned75 while W1 held the slot. That refusal is not a build pass. Current
artifact operation and genuine signed/private, provider and paid acceptance
remain unverified. No later-commit release readiness is claimed.

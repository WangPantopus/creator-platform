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

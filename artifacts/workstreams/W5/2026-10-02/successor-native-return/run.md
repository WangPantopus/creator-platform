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
above. Personal fixed-binary You/Content return, Android operation and populated
signed/private acceptance remain pending. No later-source acceptance is inferred.
Release-ready: false; all nine packages remain incomplete. No virtual
authenticator, fabricated proof/signature or peer device/input permission was used.

W5's own devices were shut down and exact GUI/device leases released after the
bounded original operation. The shared GUI queue is W2, W3, then rebuilt W5;
W5 holds no device/GUI/heavy lease while waiting.

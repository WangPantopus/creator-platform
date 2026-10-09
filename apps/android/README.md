# Native Android

Kotlin/Compose, Android 8+ (API 26), compile SDK 35, Gradle 8.9 and Java 17. Set `ANDROID_HOME` and run `./gradlew :app:assembleDebug :app:testDebugUnitTest :app:verifyPaparazziDebug`. Run `:app:connectedDebugAndroidTest` on an attached emulator for runtime smoke checks. Paparazzi baselines require reviewed changes before recording new images.

The app starts at Welcome. The DEBUG activity intent extras `catalog=true` and optional `component=Message` open selectable component fixtures. To operate the app signed in without the full stack, run the lane 7 fake API and start the activity with `harness_reset=true` (start from a clean app), `harness_actor=<text>` (sign in as the development actor whose label contains the text) and `return_to=<path>`; build with `-PcreatorApiUrl=http://127.0.0.1:56473` and run `adb reverse tcp:56473 tcp:56473`. The hook lives in `app/src/debug`; the release source set holds an empty twin. See the [harness runbook](../../docs/lanes/status/lane-7-harness.md). Generated tokens, copy, SVG geometry and OpenAPI files are owned by the shared generators. Bundled fonts include OFL licenses. The default Pantopus provider reports unavailable; it never fabricates an account.

See [native verification limits](../../docs/implementation/native-foundation.md).

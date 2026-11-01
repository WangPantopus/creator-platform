# Native Android

Kotlin/Compose, Android 8+ (API 26), compile SDK 35, Gradle 8.9 and Java 17. Set `ANDROID_HOME` and run `./gradlew :app:assembleDebug :app:testDebugUnitTest :app:verifyPaparazziDebug`. Run `:app:connectedDebugAndroidTest` on an attached emulator for runtime smoke checks. Paparazzi baselines require reviewed changes before recording new images.

The app starts at Welcome. The DEBUG activity intent extras `catalog=true` and optional `component=Message` open selectable component fixtures. To operate the app signed in without the full stack, run the lane 7 fake API and start the activity with `harness_reset=true` (start from a clean app), `harness_actor=<text>` (sign in as the development actor whose label contains the text) and `return_to=<path>`; build with `-PcreatorApiUrl=http://127.0.0.1:56473` and run `adb reverse tcp:56473 tcp:56473`. The hook lives in `app/src/debug`; the release source set holds an empty twin. See the [harness runbook](../../docs/lanes/status/lane-7-harness.md). Generated tokens, copy, SVG geometry and OpenAPI files are owned by the shared generators. Bundled fonts include OFL licenses. The default Pantopus provider reports unavailable; it never fabricates an account.

See [native verification limits](../../docs/implementation/native-foundation.md).

## Provider sign-in

The fan shell consumes C1's native nonce, completion and age endpoints. Google uses
the existing Android Credential Manager integration. Build with
`-PcreatorGoogleServerClientId=<server-client-id>` to enable the Google button when
the backend also advertises Google. This is the **server audience** used by
`GetSignInWithGoogleOption`, and must equal the backend's
`QELVORA_GOOGLE_ANDROID_CLIENT_ID`; it is not the Android package's OAuth client ID.
The Android OAuth client still needs the app's signing certificate configured in
the Google project. No client secret belongs in the app.

Birth dates and provider tokens remain in memory only. The backend decides age and
account eligibility; only its successful session token is kept in secure storage.
An existing account's fresh sign-in refuses a different account and attempts to
revoke the unwanted new app session. Cleanup uses the returned token, never the
preserved account's token, with a bounded network timeout. Cancelled sheets
preserve the current app session.

To exercise C1 with lane 1's fake provider, the debug-only launch extras
`harness_native_sub=<synthetic-subject>` and
`harness_provider_url=http://127.0.0.1:<fake-provider-port>` replace only the Google
sheet. The app still obtains its nonce from the real backend, submits the signed
fake ID token there, and renders the real age response. These extras are absent
from the release implementation. Use `adb reverse` for both local ports, and build
with the fake provider's configured Android audience. The real Google sheet and
store-signed build require deployment credentials and remain separate acceptance.

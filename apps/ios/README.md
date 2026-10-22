# Native iOS

SwiftUI, iOS 17+, with a Swift Package library and XcodeGen app host. Run `swift test` for protocol, identity and macOS snapshot regression tests. Generate the project with `xcodegen generate` and open `QelvoraApp.xcodeproj` for simulator execution. The app uses Welcome by default; DEBUG launch arguments `--catalog` or `--catalog-component Message` open the component catalog. Add `--appearance light` or `--appearance night` to force a preview appearance; production follows the system. Root-owned UI tests exercise the simulator host.

To operate the app signed in without the full stack, run the lane 7 fake API and use the DEBUG launch arguments `--harness-reset` (start from a clean app) and `--harness-actor <text>` (sign in as the development actor whose label contains the text), with `--return-to <path>`. The simulator build must be ad-hoc signed (`CODE_SIGN_IDENTITY=-`) or the Keychain fails. None of this exists in a Release build. See the [harness runbook](../../docs/lanes/status/lane-7-harness.md).

Generated tokens, copy, SVG geometry and OpenAPI DTO/client files are owned by the shared generators. Do not edit them manually. Bundled fonts include OFL licenses. Network, identity and signing adapters must be configured before claiming those flows work.

See [native verification limits](../../docs/implementation/native-foundation.md).

## Provider sign-in

The fan shell consumes C1's native nonce, completion and age endpoints. Sign in
with Apple uses AuthenticationServices, hashes the server nonce with SHA-256, and
sends Apple's identity token and authorization code to the backend. The app target
has the Sign in with Apple entitlement; device distribution needs it enabled on
the registered App ID and provisioning profile. The backend's Apple bundle
audience must match the app. No provider secret belongs in the app.

Only Apple currently has an iOS credential adapter. A backend advertising Google
alone does not expose a nonworking button: iOS Google support remains a separate
implementation task. No web callback transports an app session in a URL.

Birth dates and provider tokens stay in memory only. The backend decides age and
account eligibility; only a successful session token is saved in the Keychain.
Fresh sign-in from an existing account refuses a different account and attempts
to revoke that unwanted new app session. Cleanup uses the returned token, never
the preserved account's token, with a bounded network timeout. The age step grants
no private app access.

For an operated C1 scenario with lane 1's fake provider, debug launch arguments
`--harness-native-sub <synthetic-subject> --harness-provider-url
http://127.0.0.1:<fake-provider-port>` replace only Apple's sheet. The real backend
issues and consumes the nonce and returns the age decision. The hook is compiled
out of release builds. The existing stack UI flow has an opt-in
`testNativeSignInOnRealStack` scenario controlled by `QELVORA_SIGNIN_STACK_API` and
`QELVORA_SIGNIN_FAKE_PROVIDER`; the real Apple sheet on a provisioned device remains
separate acceptance.

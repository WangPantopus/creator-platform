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

Google Sign-In uses the official SDK pinned to 10.0.0. The button requires both
backend capability and valid app configuration. Set the public build values:

- `GOOGLE_IOS_CLIENT_ID`: an iOS OAuth client for `com.pantopus.qelvora`.
- `GOOGLE_SERVER_CLIENT_ID`: the Web/server OAuth client in the same Google project.
- `GOOGLE_REVERSED_IOS_CLIENT_ID`: the iOS client ID with dot-separated fields reversed.

`CreatorGoogleClientID` and `CreatorGoogleServerClientID` in Info.plist are passed
explicitly to `GIDConfiguration(clientID:serverClientID:)`. The backend variable
`QELVORA_GOOGLE_IOS_CLIENT_ID` must equal **GOOGLE_SERVER_CLIENT_ID**, the resulting
ID-token audience. It must not contain the app's iOS OAuth client ID for this
configuration. Provider secrets stay on the backend. Empty defaults leave Google
unavailable; the placeholder callback scheme grants no sign-in capability.

The SDK consumes only the configured reversed-client callback scheme and
`/oauth2callback` (plus its managed-account `/emmcallback` restart while an
uncancelled attempt is active), before ordinary app-link handling. SDK/AppAuth validates OAuth
state and PKCE; the backend verifies the ID token's signature, issuer, exact
server audience and the unchanged server nonce. No callback transports an app
session. The app never restores a Google SDK user as app authority or requests
additional Google scopes.

GoogleSignIn writes provider credentials to its own Keychain before returning.
The adapter calls `signOut()` at launch, before a request, on cancellation and
before every callback result is released to C1. This clears SDK state without
revoking the person's Google grant. The SDK exposes neither a nonpersisting mode
nor a programmatic sheet-cancellation API. A cancelled app attempt ignores late
results and blocks another Google SDK attempt until the old callback drains;
the person can dismiss the system sheet. A crash or SDK deletion failure may
leave provider state until a later cleanup attempt. Therefore provider tokens
cannot be described as memory-only with this SDK. Google cookies, granted scopes
and any SDK App Check state are separate from this credential-cache cleanup.

Birth dates and backend age continuations stay in memory only. The backend decides age and
account eligibility; only a successful session token is saved in the Keychain.
Fresh sign-in from an existing account refuses a different account and attempts
to revoke that unwanted new app session. Cleanup uses the returned token, never
the preserved account's token, with a bounded network timeout. The age step grants
no private app access.

For an operated C1 scenario with lane 1's fake provider, debug launch arguments
`--harness-native-sub <synthetic-subject> --harness-provider-url
http://127.0.0.1:<fake-provider-port>` replace only the provider credential edge.
Apple is the default. For Google, use `--harness-native-provider google` with a
synthetic iOS/server client configuration; the configured server client ID must
match the fake backend's iOS audience. No SDK sheet or real Google account is
used by this hook. The real backend
issues and consumes the nonce and returns the age decision. The hook is compiled
out of release builds. The existing stack UI flow has an opt-in
`testNativeSignInOnRealStack` scenario controlled by `QELVORA_SIGNIN_STACK_API` and
`QELVORA_SIGNIN_FAKE_PROVIDER`. `QELVORA_SIGNIN_PROVIDER=google` runs that existing
journey through the Google contract. Real Apple/Google sheets, callbacks,
cancellation, SDK cache cleanup and signed-device behavior remain separate
acceptance; fake tokens do not prove those behaviors.

`--harness-cancel-native-before-proof` cancels the app attempt immediately before
the fake credential edge delivers its signed proof. The operated scenario uses
this to check that a late proof cannot produce an age form or app session; it
also cancels and reopens the real age form. This does not exercise SDK browser
cancellation or Keychain deletion.

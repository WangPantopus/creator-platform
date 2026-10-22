# Native sign-in integration, 2026-10-22

The iOS and Android fan shells now consume C1's provider capabilities, native
nonce, native completion and age-confirmation endpoints. iOS uses the system
Sign in with Apple sheet, with the server nonce hashed as required by C1, state
binding, and the authorization code sent to the backend for grant revocation.
Android uses Credential Manager's explicit Google sign-in option with the server
audience and nonce. Google ID helpers version 1.1.0 were already shipped through
the existing Credential Manager provider; the app now declares that same artifact
directly to use its typed API.

Only backend-issued sessions enter secure storage, followed by a canonical
session read. The birth date, provider proof and age continuation are not saved.
Under-18 refusal clears private state and shows the retention policy without an
account, retry, or app navigation. Expired age forms clear even when their timer
fires during a request. Existing-account sign-in checks the returned account
before clearing the original session. A returned session that cannot be installed
(including a late result, mismatch, or secure-storage failure) receives a bounded,
cancellation-resistant logout attempt using only its new token. Network failure
can prevent that cleanup; it is not a guarantee of server revocation.

## Verification

| Check                                      | Observed result                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| Xcode simulator app and UI-test build      | Pass, both arm64 and x86_64; incidental resolver lockfile changes restored |
| iOS operated `testNativeSignInOnRealStack` | 1/1 pass on an isolated iPhone 17 simulator, iOS 26.5                      |
| Android `assembleDebug`                    | Pass with the fake provider's server audience                              |
| Existing Android `GeneratedContractTest`   | 2/2 pass                                                                   |
| Android operated journey                   | Five captured checkpoints passed on the isolated Android emulator          |
| Whitespace validation                      | `git diff --check` passed                                                  |

Both operated journeys used the actual app, backend and PostgreSQL. Only the
external provider credential was replaced by lane 1's signed fake issuer at the
debug credential boundary. Each journey submitted an impossible date, confirmed
that no app session was exposed, corrected it to an adult date, reached the account
screen, restarted with no provider hook to restore secure credentials, signed out,
then signed in a new synthetic identity and received final under-18 refusal. The
retention policy was expanded and inspected. iOS retained screenshots in its
XCTest result bundle; Android saved UI hierarchy checkpoints and screenshots.

The Android journey found a real lifecycle issue: clearing the previous account
removes the sign-in pane before its credential save completes. Moving sign-in
jobs to the shell's scope keeps that save alive. The corrected journey passed.
A separate static review found the in-flight age-expiry edge; both clients now
recheck the deadline after clearing the busy state.

Temporary evidence is outside git:

- `/tmp/qelvora-native-signin-ios-result` and
  `/tmp/qelvora-native-signin-ios-attachments/`
- `/tmp/qelvora-native-signin-android-{age-invalid-final,adult-final,restored,signed-out,teen-policy}.xml`
- `/tmp/qelvora-native-signin-android-{adult-final,teen-policy}.png`
- `/tmp/qelvora-native-signin-{ios-build,ios-test,android-final-build,android-contract-test}.log`

The opt-in debug hooks and configuration are documented in the [iOS README](../../apps/ios/README.md)
and [Android README](../../apps/android/README.md). Hooks are absent from release
builds. The operated scenarios created no real provider identities or credentials.

## Remaining acceptance

iOS Google has no credential adapter yet; the app does not advertise a nonworking
Google button. Native platform age-signal adapters are not implemented in this
increment. Real Apple/Google sheets, cancellation behavior, device provisioning,
store signing, platform age signals, and provider grant revocation require their
configured device/provider acceptance. The fake-provider journey does not prove
those behaviors. Same-account rejection and late-token cleanup were reviewed in
code, not fault-injected on a physical device. This increment does not close all
of WP 7.5 or the other lane 7 work packages.

# Native Team domain source and compilation

Product source `77cad82ebc10d76cce5de049cb991376331790ef` is an independent
branch from captured remote main `132bc0550a077b9ffe4dad6d2a8d7bc3e0e25e80`.
The complete [constructor contract](../../../../../docs/workstreams/contracts/W5-native-team-workspace.md)
belongs to W5's standalone domain component; W1 keeps shipping root, navigation,
profile gates and session/credential integration. No shared Navigation, root,
session model, backend, active SQL, new test or test assertion was changed.

At that exact product source, canonical generation and generate:check verify
115 operations and 12 resources; scoped canonical-copy formatting and diff checks
pass. The first Xcode invocation used an invalid `-parallelizeTargets NO` option
and exited65 before compilation. It is preserved and excluded. Installed Xcode27
help confirmed that flag takes no argument and `-jobs 1` bounds concurrency.
The corrected actual shipping Xcode project build, Debug/generic iOS Simulator,
strict concurrency complete, jobs1 and CODE_SIGNING_ALLOWED=NO, exited0 with
BUILD SUCCEEDED. Both simulator architectures compiled the actual new component.
The produced app was normally prepared with an ad hoc development code signature;
`codesign --verify --deep --strict` exited0. This is app artifact preparation,
not a human passkey ceremony, proof or personal content signature.

The actual Android shipping app assembleDebug used installed Java17/API35,
offline Gradle, no daemon, at most two workers, an owned output directory and
the original host-emulator API URL `http://10.0.2.2:41055`. It exited0:
BUILD SUCCESSFUL in38s, all37 tasks executed. APK SHA256:
`843587e2309316f83ddfc6522be30e28d3173f66c9ff18b62e831c8ddbc7b856`.
iOS app executable SHA256 after development signing:
`a63a9f40e02f06639a16b31e804ecd17f4aaa4204aead7d8ba2b9548f6c61bd6`.
These observations are tied to77cad82e, not a future integration or merge.

Actual guarded builds were sequential, each normal heavy release was verified;
W7 was notified for its next build. Private0600 logs are
`/private/tmp/w5-native-team-77cad82e-ios.log` (invalid invocation),
`/private/tmp/w5-native-team-77cad82e-ios-corrected.log`,
`/private/tmp/w5-native-team-77cad82e-signing.log` and
`/private/tmp/w5-native-team-77cad82e-android.log`. Own output paths are
`/private/tmp/w5-native-team-77cad82e-ios` and
`/private/tmp/w5-native-team-77cad82e-android`. No simulator/emulator, GUI lease,
native input, provider or private database operation was used for compilation.

Implemented: actual captured-client workspace/Team reads and exact-role editor,
bounded metadata lifetime, current membership bookends and explicit unknown/stale
command handling. Runnable: canonical source compiles in the shipping apps;
the Team component still needs W1's actual root registration/navigation.
Integrated: generated115 and captured132 main contracts are consumed; native
root integration is pending. Verified: source/generation/format/diff and exact
native compilation/artifact preparation above. Unverified: personally operated
native Team, Light/Night, saved return, wrong-account/role/open-view revocation,
outage/recovery, stale/duplicate/interrupted writes and durable records. Invitation
mutations and the rest of native daily Studio remain separate work. Release-ready:
false. All nine original W5 packages remain incomplete; no full package is ticked.

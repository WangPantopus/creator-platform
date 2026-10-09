# Native iOS

SwiftUI, iOS 17+, with a Swift Package library and XcodeGen app host. Run `swift test` for protocol, identity and macOS snapshot regression tests. Generate the project with `xcodegen generate` and open `QelvoraApp.xcodeproj` for simulator execution. The app uses Welcome by default; DEBUG launch arguments `--catalog` or `--catalog-component Message` open the component catalog. Add `--appearance light` or `--appearance night` to force a preview appearance; production follows the system. Root-owned UI tests exercise the simulator host.

To operate the app signed in without the full stack, run the lane 7 fake API and use the DEBUG launch arguments `--harness-reset` (start from a clean app) and `--harness-actor <text>` (sign in as the development actor whose label contains the text), with `--return-to <path>`. The simulator build must be ad-hoc signed (`CODE_SIGN_IDENTITY=-`) or the Keychain fails. None of this exists in a Release build. See the [harness runbook](../../docs/lanes/status/lane-7-harness.md).

Generated tokens, copy, SVG geometry and OpenAPI DTO/client files are owned by the shared generators. Do not edit them manually. Bundled fonts include OFL licenses. Network, identity and signing adapters must be configured before claiming those flows work.

See [native verification limits](../../docs/implementation/native-foundation.md).

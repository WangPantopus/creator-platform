# Native image comparison contract — 2026-09-30

At `f406b09`, Foundation PR run36771424019/job110078505921 passes normally signed shipping iOS UI, but18 Swift checks have110 snapshot failures. Captures now correctly have780×1688 pixels for390×844 points; scale alone was insufficient. Runner: macOS27/Xcode27/arm64. [Original failure log](hosted-f406-ios-failed.log), [Light failure](hosted-f406-welcome-light.png), [Night failure](hosted-f406-welcome-night.png).

W1 commits `cdb828c9dc1a8b47906396f61f70a0c18040404a` and `90240c535f633930b95267888c1c3ea320239fb4` define its native comparison contract: normalize references/captures to sRGB; exact dimensions; at least99.85% of pixels within8 channel units; preserve failure images. W7 personally reviewed that source/evidence and consumes only the comparison contract and three italic-token fixes. No peer branch was merged. Actual bundled italic faces now retain their token/optical size.

**This increment explicitly changes the tolerance.** Earlier W7 kept strict byte equality; that is historical. This consumes W1's calibrated contract instead of rerecording references or hiding macOS27 differences. [Independent diagnosis](native-color-metrics.json) finds539/571 local Welcome pixels beyond8 (0.041%/0.043%), against81557/80638 hosted pixels (6.194%/6.125%). The hosted mismatch still fails the0.15% bound. Automatic AppKit bitmap allocation also failed both strict local themes; [that discarded attempt](native-appkit-failed.log) is retained.

Final capture is explicit2× sRGB with SwiftUI displayScale2. All110 original PNGs are unchanged against Git HEAD; [hashes](native-reference.sha256) record them. No new test case/source-artboard replacement/paid AI call.

Only iOS CI now uses macos-26-intel/Xcode26.5. Web retains its passing runner and Android its preserved platform baseline. [Official runner labels](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) and [Xcode inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md) support this narrow existing-CI repair; W1 remains the shared owner.

## Current local verification

- Full existing Swift suite:18 checks,110 preserved comparisons, zero failures,98.350s. [Complete log](native-color-swift.log).
- Full shipping iOS build: normally ad-hoc signed, BUILD SUCCEEDED. [Complete log](native-color-ios-build.log).
- Exact host: macOS26.7 build25G229/x86_64, Xcode26.5, own iPhone17/iOS26.5. Earlier macOS26.5 labels confused the simulator/toolchain with the host OS; this supersedes them.
- Backend typecheck/ESLint and changed workflow/TypeScript Prettier pass. Home consumes W3's reviewed50-row cursor for two pages/100 relationships, validating fan, duplicates and cursor. Larger accounts fail503 rather than silently truncate; reviewed paged Home and actual owner installation/acceptance remain open.

Matching pushed-head CI is still required. Fixture/component checks do not prove native settings/VoiceOver/TalkBack/all19 providers or complete W7 acceptance.

# W6 native CI continuation — 2026-09-30

GitHub CLI now authenticates as repository owner `WangPantopus`. PR #4 metadata writes and Actions artifact downloads work. The live title/description were updated; the earlier connector HTTP403 and pending device-login observations are historical. No token or OpenAI key contents were read into evidence. No paid AI requests were made.

## Diagnosed checks and fixes

[Run 36756173775](https://github.com/WangPantopus/creator-platform/actions/runs/36756173775) passed web/backend (all18 PostgreSQL/contracts, generation/type/lint/format/build), web visual and Android emulator checks. Android foundation failed exactly the four Composer captures. iOS compiled and passed15 non-snapshot cases, but all110 image assertions failed. Xcode27 alone did not resolve the image differences.

The downloaded Android report identified an obsolete ended-conversation composition. BUILD_PROMPT §9 requires keeping “Ask Maya to step in”; the old images omit it. Android now also matches the web/Swift ended panel and action order: AccessLines and Join in the rounded panel, then StepIn below. Personally inspected Light/Night full ended and catalog captures at390×844. Updated only the four corresponding Android images, preserving the other snapshots. Existing `assembleDebug` passes; all19 existing unit cases and `verifyPaparazziDebug` pass locally (rerun1m50s). This is compilation/render verification, not an operated W6 recording/calling journey.

Current W1 producer commit `a9514f6` independently refreshes the same four images for its unchanged flat layout. W6's panel/order correction follows `packages/ui-web/src/components.ts`, `apps/ios/Sources/QelvoraUI/ThreadComponents.swift` and the existing panel tokens. Do not import the flat-layout images over this correction.

iOS original references embed a display-specific ICC profile. The fresh local captures embed a different profile; even the large uniform background differs. The existing capture now sets `NSWindow.colorSpace = .sRGB` using [Apple's supported property](https://developer.apple.com/documentation/appkit/nswindow/colorspace). Existing110 references were converted with Apple's ColorSync (`sips --matchTo`) to the system sRGB profile. Every image retains its dimensions and alpha; the before/after hashes and original profile hashes are in the [manifest](manifest.json). **No fresh iOS render was accepted as a reference.** Pixel-equality precision remains1. Local macOS26/Xcode26 cannot establish matching macOS27 rendering; the configured CI must verify remaining geometry/font differences. Color normalization is not a waiver of those checks.

Workflow concurrency now groups the same repository/branch across push/PR events, cancelling obsolete runs. Only superseded W6 runs were cancelled manually; peer runs were preserved. Android raw test XML/diff images and Swift `SNAPSHOT_ARTIFACTS` are uploaded on failures, so further diagnosis does not depend on vanished runner files. No checks/cases/suites/harnesses were added or removed and no limits/tolerances were relaxed.

After normalization, the full existing Swift package rerun compiles and passes15 non-snapshot cases; the three snapshot cases still report110 differences on this macOS26/Xcode26 host. The simple Mark comparison drops from nearly the whole image to3113/1,316,640 differing pixels after common-profile conversion, with the uniform background now equal. This does not prove that the remaining differences are only OS rasterization; matching-runner failure artifacts must be inspected. No further local golden recording or precision relaxation was used.

## Owned resources and acceptance limits

Official Temurin21.0.12.1 and Android command-line archives were checksum-verified and extracted under `/tmp/qelvora-w6-android-toolchain-20260930`. SDK35, required build tools, Gradle cache/output and Swift capture/scratch paths are isolated from peers. No emulator or physical phone was operated in this checkpoint. The owned PostgreSQL container remains stopped/preserved; the supplied OpenAI env file was not accessed.

All media/call/AI-audio runtime capabilities still remain false. Genuine media authority/scanner/store/C2PA, approved call policies/provider/history/admission/SDKs, availability allocation and canonical runtime/effects, producer integrations and physical-phone/full functional acceptance remain required. An asynchronous request asks for existing approved provider/policy configuration paths. CI green alone does not make W6 complete or PR #4 ready to merge.

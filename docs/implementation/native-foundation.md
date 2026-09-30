# Native foundation and verification limits

The iOS client is native SwiftUI and the Android client is native Kotlin/Compose. This repository is the build location; Pantopus integration remains a later adapter task. `Qelvora` is the replaceable product placeholder. Pantopus remains the identity provider name.

## Implemented source

Both clients implement all 53 reference components with typed inputs, explicit authorship states, accessible controls and host callbacks. The debug catalog has a selector for every component. `NativeComponentPreview` provides design fixtures; `NativeFoundationCatalog(component:)` / `NativeFoundationCatalog(component)` supports a specific fixture for captures. A registry entry means the implementation and fixture exist, not that its pixels have passed design acceptance.

The component families are:

- Identity: Mark, Seal, Avatar, AuthorLabel, IdentityStrip, ThreadHeader, SignedMarker, SystemLine.
- Conversation: Message, Note, ReactionChip, CitationChip, MemoryChip, Correction, ContextCard, VoiceNote, Composer, StepIn.
- Access and money: AccessLines, ModeList, IncludeList, TermsBlock, EtaLine, RequestStatus, Receipt, SpendLimit.
- Studio: QueueCard, CapacityHeader, LabelPreview, SigningSheet, AuditBanner, SourceRow, InsteadMenu, TestConsole, VersionList, DigestItem.
- Shared: Button, TabBar, Segmented, Notice, NotificationRow, EmptyState, ShareCard, CallChip, ReservedLabel, Countdown, StudioTabBar, Sidebar, Sheet, Dialog, Toast, Skeleton, EmailFrame.

The catalog covers seven author labels; all five renderable message kinds; pending, failed, accepted, streaming and interrupted delivery; split, gradient and stacked approved drafts; AI/human/team/paused/updating identity strips; six composer states; accessible/unavailable citations; saved/consent-question memory; selectable/disabled request modes; packet inclusion and summary editing; request steps; source approval states; recording states; reserved disabled labels; version and boundary-test states; and light/Night themes. Some multi-state fixtures exceed one screen. Separate Android thread-state captures cover the delivery, draft, composer, Note and sponsor variants individually.

The packet summary uses sans typography as required by BUILD_PROMPT §9, which intentionally supersedes the older reference bundle's serif summary style. The native Android signing action uses biometrics terminology. Source SVG geometry is generated from the original reference bundle rather than substituted system icons. Geist, Geist Mono and Newsreader are bundled with their OFL licenses. Newsreader's optical-size axis follows text size, and its platform PostScript names are resolved locally while generated tokens retain canonical family names.

## Runtime boundaries

Welcome uses the exact 4A copy, identity illustration, layout measurements and removable arrival context. Its `PantopusSignInProvider` preserves the return destination and returns only an opaque account ID. The default provider reports that sign-in is unavailable; it cannot invent a signed-in account. The generated OpenAPI clients compile alongside the native components, but no production Pantopus credential flow is connected.

Controls expose callbacks and editors manage local draft state. Charging, signature issuance, verified delivery, voice playback, live calls, moderation and AI publication still require the host adapters and domain workflows. A signature link inside a design fixture is an `example.invalid` address, not an issued or verified signature. The Android signing control is disabled until a signing provider is available. Reserved authorship labels remain disabled and cannot decode as a renderable message kind.

Each thread has a `ThreadDeliveryGate`. It buffers cursor gaps, requires a control boundary before a newer epoch becomes visible, discards old-epoch and duplicate content, and validates generation sequences before advancing the rendered cursor. A drain stages every change and commits atomically after validation, so an invalid buffered sentence cannot consume earlier text that the caller never received. `ThreadDeliveryCheckpoint` persists the cursor, epoch and generation sequence map; applications must store it atomically with the rendered timeline, and replay from the persisted cursor after recreation. Buffered frames are replayed from the server rather than persisted.

## Verification performed

- Swift Package builds compile generated tokens, localized copy, fonts, glyph resources, all components, the OpenAPI client and delivery gate. Protocol tests cover reordered takeover, stale content, duplicate delivery, cursor gaps, wrong-thread frames, sequence gaps, process recreation and rejected atomic drains. Identity tests cover fixed labels, server-kind decoding, creator color ownership, catalog completeness and unavailable sign-in.
- A real iOS application host builds for the iOS Simulator with signing disabled. Root-owned XCUITests cover its actual simulator runtime separately from the macOS captures.
- Android debug APK assembly and local tests pass. Android Compose instrumentation on the existing Android 14 emulator passed four tests for Welcome/unavailable sign-in, removing arrival context, selecting a request mode while keeping a disabled mode disabled, and the real dialog window/actions in both appearances.
- Android Paparazzi records 144 captures: 53 components in two themes, 17 thread-state captures in each theme, Welcome in each theme and the catalog selector in each theme. These are regression baselines created from implementation output and subsequently verified. Dialog and visible Skeleton captures share the production visual surface, while device tests handle Android window behavior; static Skeleton captures do not validate the delay. They are not approval evidence from the design owner.
- Swift SnapshotTesting 1.19.6 is test-only. The macOS suite records Welcome, identity surfaces and 53 component fixtures in both themes (110 captures). The native snapshot executable also emits normalized 390×844 PNG files. macOS NSHostingView rendering is useful regression evidence; it does not establish pixel equivalence on iOS.

## Still pending

Full native screen navigation and domain adapters remain beyond this component foundation. Pixel acceptance against every supplied native screen, all variant states, Dynamic Type/font scale up to 200%, screen-reader order, keyboard/safe-area behavior, reduced-motion behavior, physical-device rendering, biometric/passkey signing, and real identity/AI/voice/call integrations are not complete. Desktop-sized Sidebar and EmailFrame previews fit the phone capture canvas; their intended full-width layouts need separate acceptance captures. A passing compile, a component count, a baseline recording or a smoke test must not be reported as complete product or design acceptance.

## Commands

From `apps/ios`, use `swift test` to verify the current macOS regression baselines. Recording is an explicit review step: `RECORD_NATIVE_SNAPSHOTS=true swift test` writes new goldens and SnapshotTesting intentionally reports record assertions. Root coordinates those records. `swift run qelvora-native-snapshots ../../artifacts/native/ios` emits local reference PNGs. Open the XcodeGen project generated from `project.yml` for the app host and simulator UI tests.

From `apps/android`, set `ANDROID_HOME` to the installed SDK and use `./gradlew :app:assembleDebug :app:testDebugUnitTest :app:verifyPaparazziDebug`. The local SDK is `/Users/yingpengwang/Library/Android/sdk`. To exercise an attached emulator, use `ANDROID_SERIAL=emulator-5558 ./gradlew :app:connectedDebugAndroidTest`. `:app:recordPaparazziDebug` regenerates baselines only after review. Baselines should never be updated solely to hide unexplained regressions.

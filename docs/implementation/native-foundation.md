# Native foundation and verification limits

The iOS client is native SwiftUI and the Android client is native Kotlin/Compose. `Qelvora` is the replaceable product placeholder; Pantopus remains the identity provider name. Canonical local identity/session services and real feature registrations are integrated. Genuine Pantopus native authorization, approved external identities and production/provider acceptance remain open.

Current October1 source includes main `c1c615e6`, public verification, native storage/lifecycle recovery and API-origin validation. The new native source is uncompiled/unoperated under the cleanup restriction. Current generation checks and bounded Swift syntax parsing are supporting source checks; they do not supersede historical app receipts. See [current W1 status](../workstreams/status/W1-resume.md), [storage/foreground source](../../artifacts/workstreams/W1/resume/2026-10-01-native-storage/run.md) and [identity authority](W1-identity-authority.md).

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

The shipping shells consume real account sessions, secure credential stores, validated destinations and account-scoped feature mounts. Both register public verification, W3 conversation, W5 Content, Commerce, Trust, Growth and W6 media/call consumers. Registration supplies no license, role, consent, provider, deployment or release readiness. DEBUG alone exposes explicit development actors when the server advertises development mode; production Pantopus authorization remains explicitly unavailable until configured.

Welcome retains its removable arrival context and the source's author distinction. Its independent `PantopusSignInProvider` preserves the return destination and returns only an opaque account ID; its default cannot invent an account. The generated OpenAPI clients accompany the components, while current shared-source consumer compilation remains pending.

Release API configuration requires an absolute HTTPS origin without user information, query, fragment or path prefix. DEBUG overrides retain only their existing loopback hosts. iOS's canonical `project.yml` supplies empty-default `CREATOR_API_URL`/`CREATOR_LINK_HOST` settings to `CreatorAPIURL`/`CreatorLinkHost` plist properties. The project/plist must be regenerated before validating a configured build; generated `App/Info.plist` is not hand-edited. Android uses the existing `creatorApiUrl` build property. No production domain is selected. Universal/App Link associations and genuine RP/store identities still require approved configuration; setting a host does not establish an association.

Native private cleanup checks OS persistence results, closes private screens first, attempts credential and W3 cleanup independently, and provides a failed-clear Retry before another account can install. The shared read fences last for the process and are not persistent deletion proof after failure/restart. Active/resumed lifecycle starts an immediate identity read and owns the existing four-second polling loop; domain refresh cadence and freshness deadlines remain unchanged. Actual storage/foreground/account/revocation acceptance is still open.

Controls expose callbacks and editors manage local draft state. Charging, signature issuance, verified delivery, voice playback, live calls, moderation and AI publication still require the host adapters and domain workflows. A signature link inside a design fixture is an `example.invalid` address, not an issued or verified signature. The Android signing control is disabled until a signing provider is available. Reserved authorship labels remain disabled and cannot decode as a renderable message kind.

Each thread has a `ThreadDeliveryGate`. It buffers cursor gaps, requires a control boundary before a newer epoch becomes visible, discards old-epoch and duplicate content, and validates generation sequences before advancing the rendered cursor. A drain stages every change and commits atomically after validation, so an invalid buffered sentence cannot consume earlier text that the caller never received. `ThreadDeliveryCheckpoint` persists the cursor, epoch and generation sequence map; applications must store it atomically with the rendered timeline, and replay from the persisted cursor after recreation. Buffered frames are replayed from the server rather than persisted.

## Historical supporting verification

The following foundation receipts were recorded in original checkpoint `5e104cd` on September29. They describe that source, not current October1 application acceptance. Later normally signed shipping iOS/Android builds and partial rename at `aade864` are separately recorded in the [September30-main integration receipt](../../artifacts/workstreams/W1/resume/2026-10-01-main-3de0f14/run.md); that source also predates the new native/shared repairs.

- Swift Package builds compile generated tokens, localized copy, fonts, glyph resources, all components, the OpenAPI client and delivery gate. Protocol tests cover reordered takeover, stale content, duplicate delivery, cursor gaps, wrong-thread frames, sequence gaps, process recreation and rejected atomic drains. Identity tests cover fixed labels, server-kind decoding, creator color ownership, catalog completeness and unavailable sign-in.
- A real iOS application host builds for the iOS Simulator with signing disabled. Root-owned XCUITests cover its actual simulator runtime separately from the macOS captures.
- Android debug APK assembly and local tests pass. Android Compose instrumentation on the existing Android 14 emulator passed four tests for Welcome/unavailable sign-in, removing arrival context, selecting a request mode while keeping a disabled mode disabled, and the real dialog window/actions in both appearances.
- Android Paparazzi records 144 captures: 53 components in two themes, 17 thread-state captures in each theme, Welcome in each theme and the catalog selector in each theme. These are regression baselines created from implementation output and subsequently verified. Dialog and visible Skeleton captures share the production visual surface, while device tests handle Android window behavior; static Skeleton captures do not validate the delay. They are not approval evidence from the design owner.
- Swift SnapshotTesting 1.19.6 is test-only. The macOS suite records Welcome, identity surfaces and 53 component fixtures in both themes (110 captures). The native snapshot executable also emits normalized 390×844 PNG files. macOS NSHostingView rendering is useful regression evidence; it does not establish pixel equivalence on iOS.

## Still pending

Shipping native navigation and domain consumers now exist. Full configured-host operation, authorized one-ID call-family lookup, genuine identity/signing/licensing/providers and physical-device outcomes remain open. Full native creator Studio remains O19/Q15 pending an explicit scope/design decision; responsive web Studio is required.

Pixel acceptance against every supplied native screen, all variant states, Dynamic Type/font scale up to 200%, screen-reader order, keyboard/safe-area behavior, reduced-motion behavior, physical-device rendering and genuine biometric/passkey/provider interaction are incomplete. Desktop-sized Sidebar and EmailFrame previews fit the phone capture canvas; their intended full-width layouts need separate acceptance captures. All53 component contracts and all54 supplied previews (including extra Cover) are personally source-read; this is not visual acceptance. Native control APIs remain disabled, with no alternative automation authorization inherited. A compile, registry entry, baseline or existing check is not full product acceptance.

## Commands

Do not run local builds, installs, servers or native devices while the October1 cleanup restriction is active. Previously recorded SDK paths, simulator UUIDs and emulator serials are historical and must not be reused as leases. When explicitly resumed, discover surviving tools and allocate only owned resources; preserve the canonical lockfiles and reference bytes.

The existing iOS `swift test` checks macOS regression baselines. Generate the shipping Xcode project from canonical `project.yml` before its configured build. Current hosted diagnostics must be inspected through Code Review `pull_requests_checks`; no CLI/Actions fallback. A peer-reported Xcode27 image failure remains independently uninspected by W1, and no root-cause or repaired capture claim is made.

Existing Android supporting tasks are `:app:assembleDebug`, `:app:testDebugUnitTest`, `:app:verifyPaparazziDebug` and, on an authorized owned device, `:app:connectedDebugAndroidTest`. They are not personal app acceptance. Never regenerate references to hide a regression: all110 original iOS references are preserved. The sole current exception covers four Android Composer references with exact provenance in `artifacts/workstreams/W7/takeover/20261001/native-reference-review/manifest.json`; it grants no further reference changes.

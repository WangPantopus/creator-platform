# W7 personally performed runtime record — 2026-09-29

This folder retains successive checkpoints from the same workstream; earlier failed/harness captures are not final acceptance. Primary performed implementation, compilation, migration of only creator_w7, launching, app operation, inspection and fixes. Subagents only researched information. No new tests or test code were written. No external outreach or genuine push/email send occurred.

## Environment and build identity

- Shared checkout `/Users/yingpengwang/creator-platform` contains substantial uncommitted peer foundation; no reset/stash/branch switch/commit was performed. [W7 source fingerprints](source-sha256.txt) and [actual native build-copy fingerprints](native-build-sha256.txt) identify this checkpoint rather than pretending HEAD identifies the build.
- Backend: Node 24/TypeScript, explicit development runner, loopback4107, PostgreSQL 17 container `creator-platform-w7` on55437, database `creator_w7`, separate non-owner runtime/worker roles. All W7 source migrations applied only here. Current health says synthetic-development, canonical-development-bridge, providers unconfigured. Restarted final backend after privacy correction; persisted public data survived.
- Web: Next 16.3.7, port3007, isolated source/cache `/private/tmp/creator-w7-web/apps/web`, webpack dev runtime. Canonical W1 identity API4101 is separately configured; synthetic actor selection is labeled in the development console. Phone screenshot viewport390×844; Studio desktop1280×900. Latest route compilation/control connection is recorded below.
- iOS: full Swift app host, dedicated iPhone 17/iOS 27 simulator `3F2AAE9E-57DF-4977-8166-732B95D52A47`; screenshot1206×2622 pixels (402×874 logical). Isolated source `/private/tmp/creator-w7-ios`, DerivedData `/private/tmp/creator-w7-ios-derived`. Final full build includes W6 Media and shipping W1 Growth registration; no temporary exclusion/root patch. [Build log](ios-build.log): `BUILD SUCCEEDED`.
- Android: full Kotlin/Compose APK, leased `CreatorPlatform_W7`, Google APIs API 34 arm64, exclusive serial `emulator-5570`; screenshot1080×2400 pixels,420dpi (approximately411×914dp). Isolated source `/private/tmp/creator-w7-android`, Gradle cache `/private/tmp/creator-w7-gradle-cache`. [Build log](android-build.log): `BUILD SUCCESSFUL in 5m 2s`, 37 tasks. Used cached/offline dependencies and in-process Kotlin compilation after diagnosing a hang in W7's Gradle process; no peer daemon/process was stopped.
- Synthetic roles: W7 fan, W7 creator and categorical fans 1–20 development controls; public Maya/post projections explicitly synthetic. Real authorization/persistence code handles these values, but they do not prove upstream identity/signing/commerce/content correctness. W1 development session bridge uses W1-issued credentials only. No real private fan data or secrets appear in captures.

## Browser journeys personally operated

| Action / expectation                                                                          | Observed / evidence                                                                                                                                                                                                                                                              | Status                                                                |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Publish explicit development public creator/post; Discover at phone width                     | Real PostgreSQL-backed Maya card/search/categories. Initial horizontal overflow found and fixed through border-box sizing/search composition. [Initial Discover](discover-light.jpg) predates final correction.                                                                  | Partial visual evidence; not complete Light/Night comparison          |
| Open Maya public profile and eligible post; preserve originating post into sign-in/chat entry | Context remained a relative content-ID route, removal action existed; missing W3 processor showed unavailable state, no fabricated AI response.                                                                                                                                  | Entry/context boundary exercised; first-answer journey blocked        |
| Consume development Note, inspect inbox                                                       | Visible `Maya · to followers` human broadcast with post destination. [Inbox](inbox-light.jpg).                                                                                                                                                                                   | Verified synthetic Note in web; not all 19 actual domain actions      |
| Enable optional push, set22:00–07:00 America/Los_Angeles, save/reload                         | Values persisted and returned on reload; in-app record remained. [Preferences](preferences.jpg).                                                                                                                                                                                 | Verified local web persistence; cross-client/OS permission unverified |
| Four distinct unresolved fans, then fifth; Accept recommendation                              | Below-five topic absent, five-fan report visible. [Below-five](insights-below-five.jpg), [Five](insights-five-light.jpg). The latter captures busy action; subsequent DB inspection proved Accept persisted, not a success-toast inference.                                      | Verified synthetic cohort/decision; publication/credit blocked        |
| Revisit latest measurement/Discover after final changes                                       | CDP binding repeatedly times out at `Emulation.setFocusEmulationEnabled`; a fresh tab also failed navigation. Cold compilation stalled; primary restarted only the identified W7 Next process, then Discover returned200 with rendered public data. CDP control still times out. | Latest browser tap-through blocked; earlier screenshots retained      |

## Native launch and observed defects

| Capture / action                                                                                                                                            | Observed / status                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Final iOS Discover](ios-discover-final.png), full installed app →API4107                                                                                   | Visible actual Maya projection, supplied fonts/tokens, four shared tabs, truthful unavailable capacity. Personally inspected. App launch/data rendering verified; no claim of tap-through from CLI launch/screenshot.                                                                                   |
| Earlier full iOS runtime                                                                                                                                    | A fetched creator caused `Theme.swift:19 Unknown text style: meta`. Primary diagnosed the actual crash, replaced W7 `meta` with existing `data-sm` in Swift/Kotlin, rebuilt and reinstalled. [Corrected checkpoint](ios-discover-corrected.png) predates final shared tabs/pass/incoming-route changes. |
| External URL `qelvora://app/creators/maya/posts/...0004`                                                                                                    | Reached actual `Open in Qelvora?` platform confirmation. [Capture](ios-post-final.png). Device Hub returns -10005 timeout; Open tap not performed. The prompt remained over [Night cold launch](ios-post-night-cold-launch.png). External-link completion/sign-in/cold fallback unverified.             |
| iOS restart of only leased device, direct public-post Night launch                                                                                          | [Restarted capture](ios-post-night-restarted.png) records the actual result. Route launch is distinct from accepting the external-link system sheet. No user data erased.                                                                                                                               |
| [Final Android Discover](android-discover-final.png), full APK →API4107 using explicit adb reverse                                                          | Live Maya data appears behind `System UI isn't responding`. Rebooted only W7 emulator, preserved its data, installed latest APK and relaunched; dialog returned. This obstructed native acceptance is a failure.                                                                                        |
| Historical `ios-discover.png`, `android-discover.png`, `ios-post-full.png`, `ios-discover-full.png`, `ios-discover-latest.png`, `android-discover-full.png` | Earlier temporary harness/network/unavailable/crash/System UI checkpoints retained. None establishes final native happy-path acceptance.                                                                                                                                                                |

Device Hub errors and CDP timeouts prevent taps, typing and permission/system-sheet verification. No alternate UI automation technology was used to bypass the unavailable control. Matching390 reference layouts, complete Light/Night screenshots, keyboard/safe areas, VoiceOver/TalkBack, 200% text and reduced-motion acceptance remain open. Source style-key inspection/build success alone cannot establish accessibility.

## Live API/database diagnostics personally performed

These are manual operations against the running development controls and leased database, not newly written test code or a substitute for actual owner/client journeys.

- Public projection/index returned current published verified Maya/post; index paths omit invite/share/private objects. Canonical identity capabilities bridge returned200. Backend restart preserved projection/preferences/report state.
- A repeated fan1 signal left six distinct fan/topic/week rows, rather than adding a seventh. Fan6 version2 resolved state replaced version1. A stale version1 unresolved signal preserved version2. Conflicting equal version2 returned409. Version3 restored unresolved state. Closing2026-09-14 froze a six-fan report; late version4 returned409.
- Closing2026-09-07 with four distinct fans created a closed window and **zero** eligible snapshots. A fifth fan afterward returned409. Thus an initially suppressed closed cohort cannot accumulate into a later report.
- Final aggregate query:2026-09-07→0 eligible clusters;2026-09-14→1 cluster/6 fans;2026-09-21→1 cluster/5 fans. No raw fan keys/text were exposed in reports/evidence.
- Recommendation Accept persisted. Small-cohort metric dashboard returned empty/null rather than invented conversion/retention percentages. Optional delivery rows are queued/suppressed in local persistence; providers remain absent, so no send/receipt claim.
- Account/creator privacy hook is deliberately not acknowledged without W8's durable job/account ownership proof. No irreversible account deletion was performed to manufacture evidence.

## All 19 notification kinds: implementation versus runtime

All kinds use the strict C09 envelope, aggregate/version/current authorization checks, persistent in-app dedupe/read state and optional delivery controls. This is implementation coverage, not a generated demonstration matrix. Actual producers and genuine APNs/FCM/email are missing. `System` sender never borrows creator authorship; human/AI/approved labels follow the owner state. Calls use safe status-update copy and are suppressed after ending; content_match requires explicit matching consent.

| Kind              | Authorized recipient role | Required authorship                      | Personally demonstrated                                   |
| ----------------- | ------------------------- | ---------------------------------------- | --------------------------------------------------------- |
| ai_reply          | fan                       | AI                                       | Unverified actual W2/W3 action                            |
| approved_draft    | fan                       | Creator-approved draft                   | Unverified signed action                                  |
| personal_reply    | fan                       | Creator/call human                       | Unverified actual delivery                                |
| request_status    | fan                       | System                                   | Unverified W4 action                                      |
| call_reminder     | fan/creator               | System, scheduled/joinable               | Unverified W4/W6 +physical background/locked              |
| answered_publicly | fan                       | System                                   | Unverified W5 action                                      |
| content_match     | fan                       | System +matching consent                 | Unverified W5 matched delivery                            |
| announcement      | fan                       | Human broadcast or explicitly named team | Unverified W5 action                                      |
| creator_offer     | fan                       | Human creator                            | Unverified W4 action                                      |
| slot_change       | fan                       | System                                   | Unverified W4 action                                      |
| new_packet        | creator/team              | System                                   | Unverified W4 action                                      |
| commitment_due    | creator                   | System                                   | Unverified W4 action                                      |
| guardrail         | creator/ops               | System                                   | Unverified owner action                                   |
| pool_share        | creator                   | System, amount-redacted preview          | Unverified W4 action                                      |
| note              | fan                       | Human broadcast +explicit audience       | Web in-app synthetic Note verified; push/email unverified |
| reaction          | fan                       | Human reaction                           | Unverified W5 action                                      |
| public_answer     | fan                       | System                                   | Unverified W5 action                                      |
| spending_reminder | fan                       | System, amount-redacted preview          | Unverified W4 action                                      |
| weekly_impact     | creator                   | System                                   | Unverified genuine aggregates/email                       |

Implementation includes token replacement/revocation and invalid-provider-response handling, encrypted verified-email binding, bounce/unsubscribe and RFC8058 unauthenticated one-click POST, visible unsubscribe link, next-day creator/Monday fan bounded digests, current-state/pref recheck, leases/retries/dead state and per-registration receipts for partial-send recovery. None of the missing real-device/provider lifecycle cases is marked verified. APNs/FCM receipt means provider acceptance, not proven user delivery.

## Validation and performance limits

- W7-owned TS/TSX ESLint passed. Web `tsc --noEmit` passed. Swift full build and Android full assemble passed; both latest binaries installed successfully.
- Latest whole-backend `tsc --noEmit` emitted peer commerce `service.ts:422` missing `reminders_on` and operations `local-server.ts:77/80/119/120/137` recursive-inference errors. No W7 diagnostics. Earlier successful checks do not override these current whole-backend blockers. A mistyped lint path was corrected to actual route paths before the successful run.
- Local Mac14,13 (12 CPUs,32GiB RAM)/loopback/PostgreSQL 17 with concurrent compilers/simulators; n=1 per API path, HTTP200: creators connect0.000269s /first byte1.601786s /total1.602246s; post0.001865s /3.374598s /3.374687s; index0.004024s /0.451492s /0.451578s. Mixed warm/cold state and concurrent host load are not controlled. No p50/p95/p99, availability, recovery/load or end-to-end target claim.
- Real model/provider costs and message acknowledgment/approved visible sentence/takeover/revocation targets not measured. No retention uplift, pilot-bar approval or comprehension-user study claimed.

## Launch the recorded local environment

Use existing reserved resources; do not reuse a peer database/device. See [implementation](../../../../../docs/implementation/growth.md) for configuration/registration and [status](../../../../../docs/workstreams/status/W7.md) for owner blockers. The development key is supplied from the existing secret file; never print it or check it in.

```sh
# From the shared repo; existing creator_w7 schema and non-owner roles required.
QELVORA_GROWTH_DEVELOPMENT=true \
W7_ENCRYPTION_KEY="$(cat /private/tmp/creator-w7-key)" \
W7_IDENTITY_API_URL=http://127.0.0.1:4101 PORT=4107 \
pnpm --filter @qelvora/backend exec tsx src/modules/growth/development.ts
```

Web isolated copy uses `QELVORA_GROWTH_DEVELOPMENT=true`, `QELVORA_GROWTH_API_URL=http://127.0.0.1:4107`, `QELVORA_API_URL=http://127.0.0.1:4101`; run its installed `next dev -p3007 --webpack`. Source sync excludes node_modules/.next/build-info; outputs remain isolated. `/growth-development` selects explicitly synthetic actors. Shipping configuration must use reviewed canonical owners and HTTPS origin; do not promote this runner or its actor headers.

```sh
xcodebuild build -project /private/tmp/creator-w7-ios/QelvoraApp.xcodeproj \
  -scheme QelvoraApp \
  -destination 'platform=iOS Simulator,id=3F2AAE9E-57DF-4977-8166-732B95D52A47' \
  -derivedDataPath /private/tmp/creator-w7-ios-derived CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-
xcrun simctl install 3F2AAE9E-57DF-4977-8166-732B95D52A47 \
  /private/tmp/creator-w7-ios-derived/Build/Products/Debug-iphonesimulator/QelvoraApp.app
xcrun simctl launch --terminate-running-process 3F2AAE9E-57DF-4977-8166-732B95D52A47 \
  com.pantopus.qelvora --api-url http://localhost:4107 --return-to /discover

/private/tmp/creator-w7-android/gradlew -p /private/tmp/creator-w7-android \
  --project-cache-dir /private/tmp/creator-w7-gradle-cache \
  :app:assembleDebug --offline --no-daemon --max-workers=1 \
  -Pkotlin.compiler.execution.strategy=in-process
adb -s emulator-5570 install --no-streaming -r \
  /private/tmp/creator-w7-android/app/build/outputs/apk/debug/app-debug.apk
adb -s emulator-5570 reverse tcp:4107 tcp:4107
adb -s emulator-5570 shell am start -n com.pantopus.qelvora/.MainActivity \
  --es api_url http://127.0.0.1:4107 --es return_to /discover
```

Production integration, remaining owner adapters, migration registry reconciliation, provider/physical-device evidence and complete UI/accessibility/design comparison remain open. This manifest does not declare the workstream release-ready.

## Final correction checkpoint

Source comparison of the actual native text post identified missing back/creator header,34-unit heading and labeled AI explanation panel. Primary added the existing back glyph/Avatar/AuthorLabel, supplied heading token and AI surface/line on both platforms. The W5 video/media/related-content read model is absent; no invented media or restricted teaser is displayed. These text-post corrections do not complete the video artboard comparison. Both full rebuilds passed; Android post-composition build took4m43s. [Android corrected post](android-post-corrected.png) visibly shows these changes behind the persistent System UI ANR.

The unsigned intermediate iOS composition build caused Keychain/session lookup failure. [Failed Night check](ios-post-corrected-night.png) and [unsigned invalid-route capture](ios-invalid-post-unsigned.png) are failures. Primary restored normal simulator ad-hoc signing (bound com.pantopus.qelvora identifier/Info.plist/resources) and made native public reads anonymous rather than dependent on session storage. Private operations still require canonical credentials. [Signed build](ios-signed-build.log) passed; installed final [Night post](ios-post-signed-night.png) visibly shows the public data, corrected header/34-unit heading and AI label/panel without account warning. Tap-through remains blocked by Device Hub. No shipping TLS/ATS or identity protection was weakened.

Live publication diagnostic: development creator version2 unpublished →Discover empty, public index empty, public post404. Restored published version3 afterward. This is live API/DB evidence; current browser control remains unavailable.

Final Android public-read build [log](android-public-build.log) passed in3m15s and installed successfully. Final iOS [signed build](ios-signed-build.log) passed and installed. Live role checks: anonymous notifications401; synthetic fan requesting actual `/insights`403. An initially mistyped `/studio/insights` API path returned404 and was corrected before the403 check. Final invalid-post [capture](ios-invalid-post-signed.png) records recovery separately from the unsigned failure.

Final captures personally inspected: [signed iOS Light post](ios-post-signed-light.png), [signed iOS Night post](ios-post-signed-night.png), [signed invalid-post recovery](ios-invalid-post-signed.png), [final Android post](android-post-final.png). Valid iOS text-post data/author/header/AI panel render in both themes; invalid post shows “This destination is no longer available.” without private detail or account warning. Android final post visibly loads the same public data but is still obstructed by System UI ANR. These observations do not certify inaccessible back/CTA taps, external confirmation, accessibility, canonical auth or the absent video/related-content composition.

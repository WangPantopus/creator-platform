# Actual local availability journeys — October 2

The W6 implementation exposes verified-owner availability in the existing Studio More route on web, iOS and Android. All requests use the actual session, expected account and held W8 creator/thread restrictions. Call offers, paid booking and transport remain unavailable.

## Operated application and database

- Source base `b1a3b022` plus the availability implementation committed with this record. API logs still identify the earlier immutable `3ee80fb2` release; that field is **not** an exact-source acceptance claim. The API was restarted with the final 422/409 validation source before the final Android/browser cases.
- Actual loopback API4106, Next development web3006, disposable PostgreSQL `creator_w6_human_media_20261001`. This database has historical experimental migration application and **is not canonical-registry acceptance**. W8's separate fresh57/backup upgrade validation is still required.
- Labelled synthetic accounts signed in through the actual development identity flow. No token injection or fake successful responses. Production Pantopus authorization, production HTTPS operation and paid obligations are not accepted.
- Shipping iOS app was built with normal Simulator signing, installed and launched on the owned iPhone17e/iOS27 simulator. The opt-in XCUI operational driver, outside the canonical test target, passed its one actual journey in62.175seconds. It checked actual fan denial, signed out, signed in as the creator, completed real handle onboarding when required, read both saved DST windows, saved, cold launched and restored the actual fan account. Build and UI-driver logs/xcresult stay in the private local runtime directory; screenshots were exported from its four retained attachments.
- Shipping Android debug APK was built (final rebuild17seconds), installed on owned API34 emulator5582, and personally operated with adb/UIAutomator. Actual fan denial, creator sign-in, owner read, stale409/input retention, reload, save and cold Night launch were checked against the actual database. No unit tests were added.

## Observed results

The repeated Los Angeles November1 hour is represented by separate explicit UTC offsets. First occurrence01:30−07:00 maps to08:30Z; second01:30−08:00 maps to09:30Z. Database version5 contains08:30–08:45Z and09:30–10:15Z. Five successful commands have five idempotency rows; rejected stale/overlap commands did not change that state.

The browser lost-response case forwarded a genuine PUT using Playwright `route.fetch()`, let the server commit version2, then aborted its response. The UI locked editing/reloading and retained the exact command. Clicking Retry sent identical bytes and returned version2 without another version. This is not a mocked-success case. The adjacent redacted browser receipt records the equality and observed result.

The real overlap case initially exposed a403/auth-loss classification defect that discarded input. The clients now distinguish validation from loss of authority, and the backend returns422 for invalid windows and409 for stale versions. The repeated browser overlap request returned422, kept08:35Z in the second start field, and explicit confirmed reload restored09:30Z. Android actually attempted its version3 save after browser version4, received409, kept both fields, reloaded and committed version5.

Removing adb reverse alone did not terminate existing HTTP connections; that attempt is not counted as offline acceptance. With reverse absent **and a cold app launch**, actual session refresh failed and the app concealed availability. Restoring the real reverse did not automatically recover because W1's shell only polls when its in-memory session is non-null. An actual relaunch restored the retained Keystore session and availability. This concrete shell defect was sent to W1 for an owner fix; automatic offline recovery remains unaccepted pending that fix and repeated operation.

Screenshots were personally inspected. Android Light/Night and iOS Light render the actual retained windows within safe areas and scrollable content. Web390 has document width390, with no horizontal overflow. VoiceOver/TalkBack,200% text, native timezone-alias/minute-only input and full scheduling/call journeys are still outstanding; this record does not claim them.

## Evidence and limits

`database-receipt.json` is an admin **read** of labelled disposable development data. It is not a product authorization substitute. `browser-receipt.json` omits credentials, ticket data and raw commands. PNGs show actual app screens; no screenshot success is substituted for the database receipts.

Existing backend/web typechecks and changed-source lint passed. Exact-head hosted checks are re-read after push; queued checks are not passes. Human voice recording still needs an actual microphone; production C2PA trust, call transport, real paid capture/settlement and W8 canonical activation remain separate dependencies.

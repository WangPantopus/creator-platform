# Lane 7: Phone apps (iOS and Android)

## Mission

A fan app that feels finished on both platforms, with parity, ready for TestFlight and Google
Play closed testing. Under option A this is the **only native app in the pilot**: it is the fan
app, and it gets no new creator features. It has **two tracks, iOS and Android**, that implement
the same behaviors from one written spec per feature.

**What a person should feel.** They install from a link, sign in, and talk to the creator's AI in
a thread that always says who is speaking. A Note shows its audience. A push opens the right
screen. Back, the keyboard and rotation behave. Offline is honest. They can delete their account
inside the app.

## What great looks like

- Every feature behaves the same on both platforms; each pull request states the behavior spec
  and which track did it.
- Authorship is word, glyph and color everywhere, including Notes, reactions and notification
  lists (today they are bare text).
- System Back, edge-to-edge, the keyboard and rotation work without losing a draft.
- The store-review checklist is met: icon, privacy manifest, data safety, 18+ rating, in-app
  deletion, review notes and a demo account, signing and shrinking for release.
- The app can be operated by anyone on a simulator or emulator without the full stack.

## Scope

**In:** an operated-verification harness; system navigation and state restore; keyboard, insets
and drafts; parity of rendering (Notes and reactions with audience label, composer states,
step-in seal and visibility, citations, the 3-hour reminder, the 18+ confirmation, explicit
provider consent, deletion and block pickers without raw ids); release sign-in screens; links;
push registration and tap routing; polling reduction and honest offline behavior; store
readiness; copy lookups instead of literal strings; an accessibility pass; a deep link from the
fan app to the web Studio for creators.

**Out:** creator features in the app (Notes composer, queue, signing), calls and voice, the pass,
configuration screens, the native Studio app.

## You own and do not touch

Own: `apps/ios`, `apps/android`.

Do not touch: generated API files by hand (regenerate), `packages/*`, backend, web. Native work
that needs a backend or contract change is a ticket to the provider lane.

## Read first

1. Launch review section 9 and the lint and manifest notes in `CURRENT`.
2. `apps/ios/README.md`, `apps/android/README.md`, `docs/implementation/native-foundation.md`;
   iOS: `App/QelvoraApp.swift`, `Sources/QelvoraUI/*`; Android: `MainActivity.kt`,
   `identity/FanShell.kt`, `conversation/W3FanFeatures.kt`.
3. BRIEF sections 9 (fan app), 10 (honest states), 12 (compliance: 3-hour reminder, 18+,
   processor consent) and 13 (platform and accessibility); design boards `phase4a-fan-core`,
   `phase4b-fan-account`, `phase4e-4i`.
4. Domain Model: INV-01, 03, 06, 12, 24; the delivery gate (`ThreadDeliveryGate`) is tested and
   stays.

## Work packages (each is done on both platforms)

| WP | Work | Size | Gate |
| --- | --- | --- | --- |
| 7.1 | **Operated-verification harness**: a small fake API so the app can be run signed in on a simulator or emulator, until lane 2's stack replaces it | M | none |
| 7.2 | **System navigation**: Android Back and predictive back; iOS back stack (thread Back is hard-coded to `/you` today); restore state | M | none |
| 7.3 | **Keyboard, insets and rotation**: edge-to-edge, IME, `rememberSaveable` drafts on Android; the iOS equivalents | M | 7.1 |
| 7.4 | **Rendering parity**: Notes and reactions with label, glyph and color (**C4**); composer states (trial, ended, capacity, paused); step-in seal initial and rules; citations; 3-hour reminder; 18+ confirmation; explicit provider consent; no raw ids in pickers; the terms block and ETA line live in the packet ("Charged only when Maya accepts" appears nowhere in the apps today); notification rows with glyph, color, time and unread; the share sheet for the card; remove the "AI comparisons are not available yet" copy | M to L | C4, C6 |
| 7.5 | **Release sign-in screens** (**C1**): system-browser or native credential flow, fresh sign-in for signing, sign-out | M each | **C1 from lane 1** |
| 7.6 | **Links**: associated domains and App Links, entitlements; the custom scheme stays development-only | S to M | domain, lane 5 files |
| 7.7 | **Push**: the iOS capability and `aps-environment`, Android FCM, registration, tap routing, a permission ask in context (**C7**) | M | credentials |
| 7.8 | Reduce polling (the identity heartbeat re-keys screens every 4 s on iOS; about 52 requests a minute in a thread on Android) and honest offline cache behavior | M | C5 |
| 7.9 | **Store readiness**: icons and launch assets, privacy manifest upkeep, data-safety content (with lane 1), 18+ rating, in-app deletion, review notes and demo accounts, signing and R8, versioning, TestFlight and Play pipelines, `targetSdk` 36 (SDK and plugin upgrade) and the `minSdk` decision, export-compliance answer, and a decision on the unused call permissions and services for the pilot | L | accounts, icon art |
| 7.10 | Replace literal strings with copy lookups (about 470 on iOS) | M | none |
| 7.11 | Accessibility pass: largest text, VoiceOver and TalkBack hear authorship first | M | none |
| 7.12 | Deep link from the fan app to the web Studio for creators | S | none |

## Contracts

Consumes **C1, C4, C5, C6, C7**. Provides nothing to other lanes except tickets.

## Rules that bite

Run native builds one at a time under the heavy-build lock. Authorship is never color alone
(INV-06). Never show a purchase as the way out of a failure. Do not add creator features. Debug
conveniences stay behind `BuildConfig.DEBUG` or `#if DEBUG`.

## Verification and exit demo

Build with the local JDK and XcodeGen; run Lint and the unit and snapshot tests; run on a
simulator or emulator in Light and Night and at large text. **Exit demo on real devices:** install
from TestFlight and Play closed testing; sign in; open a thread with a labeled Note; tap a push
and land on the right screen; press Back; rotate with a draft; go offline; delete the account.

## Known risks

CI on a single macOS runner is slow (an hour or more per cycle), so use the local builds first.
Several sign-in, links and push items wait on the founder's accounts and domain. Android 8 and 9
cannot use passkeys; decide `minSdk` with the founder.

## Decisions needed

`minSdk` (26 or 28); whether to strip the call permissions and services for the pilot (recommended
yes, to avoid foreground-service declarations); icon art; the export-compliance answer.

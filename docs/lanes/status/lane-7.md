# Lane 7: Phone apps (iOS and Android) status

Updated: 2026-10-09, by the lane 7 session (one session, both platforms)

Working on: WP 7.1, the fake-API harness, pull request `lane-7/harness`. First round only: waiting for review and for "Next for lane 7".

Done: WP 7.1 (open, not merged). A Node fake of the API on port 56473 that both debug apps run signed in against; a debug-only sign-in hook, one spec on both platforms (`--harness-reset` / `--harness-actor` on iOS, `harness_reset` / `harness_actor` on Android); launchers, an Android driver and an iOS screen reader; scenarios H1 to H12, S1 to S6, L1 to L5, F1 to F2; a contract check against the real Zod schemas; the runbook [lane-7-harness.md](lane-7-harness.md). Release builds of both apps checked: none of it is in them.

Next, in order, after "Next for lane 7": 7.2 (system navigation) and 7.3 (keyboard, insets, rotation, drafts: the harness already shows the two baselines, iOS truncating the thread at the largest text and Android scrolling the identity strip away); then 7.4, 7.10, 7.11, 7.8 (the "before" request rate is recorded in the pull request), 7.12. Waiting, not started: 7.5 (needs C1), 7.6 and 7.7 (domain and credentials), 7.9 (accounts and icon art).

Blocked on: nothing for 7.2 and 7.3. For the founder: the simulator panel's "Let Claude use it" on `qelvora-lane7-ios`, so iOS steps that need a tap can run (they are marked not run). The decisions the brief lists (minSdk, stripping the call permissions and services, icon art, export-compliance answer) are needed by 7.9.

Scenarios (all "on the harness", never the real backend; re-run them on lane 2's stack when it lands). Both devices must have the debug builds installed, and the harness runs itself if it is not already running:

| ID | Result | Command |
| --- | --- | --- |
| Contract check, 51 checks | pass | `pnpm exec tsx tests/scenarios/lane-7/harness/check-contract.mjs` |
| H1 to H12 sign-in, session end, network drop | pass on iOS and Android | `node tests/scenarios/lane-7/e7-1-signin.mjs [ios\|android]` |
| S1 to S6 thread states, L1 to L5 live delivery | pass on iOS and Android | `node tests/scenarios/lane-7/e7-1-states.mjs [ios\|android]` |
| F1 to F2 first conversation | Android pass; iOS reaches the consent screen, taps not run | `node tests/scenarios/lane-7/e7-1-first-conversation.mjs [ios\|android]` |
| Release builds contain none of the hook | pass, both | see the pull request |

Tickets to other lanes: none. Observations for the integrator (not tickets, because the files are lane 7's): `xcodebuild` rewrites `apps/ios/Package.resolved` (drops the `swift-issue-reporting` pin and changes the hash), so every local iOS build leaves it modified and it must not be committed; the release `Info.plist` keeps `NSAllowsLocalNetworking`, a 7.9 item.

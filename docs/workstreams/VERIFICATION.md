# Verify the running product

The founder's instruction is to build features and verify the actual app, with **no new unit-test, coverage, snapshot-test, integration-test or E2E-test code in this phase**. This playbook uses interactive operation, existing tools, provider sandboxes, traces and durable state inspection. Existing historical test artifacts are preserved; they do not establish feature completion.

**The assigned primary agent personally launches, operates, diagnoses, fixes and re-verifies the app.** Subagents may only research or check information; they cannot perform app acceptance or implementation on the owner's behalf. Interactive browser/device tools may be used to operate the running app, but do not write new test scripts or suites from those actions.

## Environment and run discipline

W8 reserves the revision, port pair, development database, queues/provider sandbox, iOS simulator UUID and Android emulator serial before a run. Use the same backend/contracts and known actors across platforms. Do not run against the user's Pantopus devices or data merely because they are already available. Do not overwrite accepted references or prior evidence. See [platform inventory and launch commands](research/platform-inventory.md#available-manual-launch-commands).

Recommended fixture actors/data: two creators (expert and companion), two independent fans plus enough synthetic distinct fans for aggregation, one permitted triage team member, one disallowed role, one scoped ops reviewer; public and restricted source/content, active/expired/revoked grants, current/expired license, and sandbox-only payment/call records. Clearly identify synthetic development identities. A development actor is useful for workflow work but cannot demonstrate the real Pantopus identity integration.

1. Compile/build affected code, run relevant type/lint/format/generated consistency checks, apply migrations to the leased database, and start the configured runtime pools. Commands such as `pnpm check` include existing tests; use narrower commands when compilation is the purpose. Do not add test suites to satisfy this plan.
2. Open the **functional route** in the Codex in-app browser. Use a separate browser context for another actor. The `/design` gallery is an independent reference aid, not the route being accepted.
3. Build/install and **launch the actual iOS app in Simulator** and **actual Android APK in Emulator**, bringing the relevant simulator/emulator to the visible desktop during inspection. Follow feature routes through the actual app host; native catalog callbacks alone are insufficient. Use named device IDs, not global `booted` or an unspecified `adb` target.
4. Connect the clients to the leased backend. Configure proper per-platform addressing and trusted local/staging transport; emulator `localhost` is not the host Mac. Do not weaken production TLS/ATS/cleartext policy to make a local run pass.
5. Perform the journey through taps/typing/system sheets. Observe the visible result, refresh/relaunch/return, then check redacted API/network/provider/DB evidence for the claimed domain transition. Confirm what another participant actually sees.
6. Exercise relevant failure and concurrent paths with browser network tools, leased device connectivity controls, provider dashboards/replay, worker stop/restart or existing operational tools. Use a disposable environment; no hidden production bypass endpoints for testing.
7. Record defects, fix them in the owning stream, repeat the affected actual journey, and update evidence. Broaden rechecks when the change touches a shared contract, identity, money, consent, transport or native adapter.

## Cross-platform acceptance matrix

| Journey | Browser | iOS Simulator | Android Emulator | Additional release evidence |
| --- | --- | --- | --- | --- |
| Fan arrival/auth/profile/deep link | Required, desktop + phone viewport | Required | Required | Real account integration; signed-app association files and cold launch |
| AI thread/memory/consent/return | Required with real configured provider | Required | Required | Multi-device scope/reconnect; recorded provider terms/costs |
| Membership/request/status/receipt | Required with payment sandbox | Required through platform purchase path | Required through platform purchase path | Store sandbox/release-installed purchase, restore, refund and server reconciliation |
| Notes/reactions/public content | Fan + Studio responsive web | Fan consumption/actions | Fan consumption/actions | Privacy/author comprehension and exact sharing outputs |
| Creator setup/daily Studio | Required phone + desktop as designed | Mobile Safari if supported | Mobile browser if supported | Creator interview/passkey/human signing on suitable real hardware |
| Human voice/calls | Two actors/clients | UI/flow/media where supported | UI/flow/media where supported | Physical iPhone and Android: audio route, background/terminated arrival, interruption, camera and connectivity |
| Notifications | In-app + email preview/delivery | Simulated UI plus delivery where supported | Emulator delivery where supported | Real APNs/FCM delivery foreground/background/locked/terminated, token lifecycle |
| Ops/support/deletion | Required role-isolated web | Fan initiation/result | Fan initiation/result | Job/retention/domain acknowledgments and backup restore behavior |

A browser-only feature does not require a fictitious native implementation to pass. The required native product is the fan app; native Studio is a separately tracked opportunity. All supported native fan workflows need both platforms. Physical devices remain necessary when simulator support cannot reproduce the relevant behavior; unavailable hardware is recorded, not counted as success.

## Visual and usability inspection

For each source artboard and all its meaningful states, capture the original and implemented route at matching content, width, height, theme and scroll position. Use the existing design renderer/capture capabilities or interactive screenshots, then inspect side by side/overlay. No new snapshot-test code or coverage program is required. Do not accept the implementation merely because its own earlier screenshot matches.

Check the reference 390-wide phone and 1280-wide desktop layout, plus narrow/wide responsive behavior, safe areas and keyboard. Review typography, exact words, author bands, Newsreader use for creator words, sans for fan summary, unbroken metadata, plate/text contrast, dialogs/scrims and accessible focus. Record every intentional correction from BUILD_PROMPT §9. A missing design is an open design-gap entry, not permission for an arbitrary new style.

Use keyboard-only web navigation, VoiceOver and TalkBack, 200% text, reduced motion and denied permissions. Confirm author is announced before message body, streamed text does not flood announcements, countdowns do not speak every second, dialogs restore focus, and touch targets meet the design/accessibility requirement. Pixel inspection alone cannot establish usability. WCAG 2.2 adds relevant focus visibility and accessible authentication requirements; use its criteria during the review. [W3C guidance](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/).

Run all five source prototypes as actual product journeys, not clickable reference cards: **5.1 link in bio to first cited answer; 5.2 step-in to signed reply/share; 5.3 creator daily five minutes; 5.4 onboarding to published AI; 5.5 authorship comprehension**. Also exercise takeover/handback under real streaming within the integrated journeys. The [design inventory](research/design-inventory.md) supplies exact card order and labels. W8 coordinates a real creator/fan comprehension session before pilot; agents checking their own understanding cannot stand in for users.

## Performance and resilience targets

These targets come from `docs/source/System_Architecture.md` §5/§11. They are not measured achievements. Report raw sample count/window, device/OS, network latency/bandwidth/loss, region, provider/model/configuration, revision, concurrency, error rate, p50/p95/p99 and cost. Warm and cold are separate cohorts; component p95s do not add to end-to-end p95.

| Measurement | Target | Owners |
| --- | --- | --- |
| Durable accepted-message acknowledgement | p95 ≤300 ms end to end | W3/W4/W8 |
| Context assembly / input classifier | p95 ≤150 ms / ≤200 ms | W2 |
| Large-model first token / first sentence generation | p95 ≤800 ms / ≤600 ms after first token | W2 |
| First-sentence output classification | p95 ≤150 ms | W2 |
| First approved visible sentence | p95 ≤2.5 s warm; ≤4 s cold; publish p99 | W2/W3/W8 |
| Full reply / visible takeover | p95 ≤8 s / ≤500 ms | W2/W3 |
| Async settlement/memory/events | Within 10 s target | W2/W3/W4/W7 |
| Source/authorization/license invalidation where specified | Within 5 s | W1/W2/W3/W8 |
| Interactive service availability | 99.9% monthly target, observed over time | W8 + domain owners |
| Database recovery | RPO ≤5 min; RTO ≤1 hour; restore drill before pilot | W8 |

Pilot profile: 500 concurrent sockets, 2 generation starts/s, roughly 8 concurrent generations, 4 call participants, one archive ingestion. Design profile: 50,000 sockets, 200 starts/s, roughly 800 generations before retries, 400 call participants, 20 archives. These are **separate staged validation goals**, not a request to drive that traffic from this laptop immediately. Use existing load/traffic tools and provider capacity agreements in an isolated environment; no new load-test code project. Synthetic transport load must be labeled and cannot demonstrate actual model cost/latency or real media quality.

Measure event-loop lag, database/connection saturation, queue ages and fair-share behavior under a burst concentrated on one creator. Verify overload backpressure, readable threads during AI outage, requests remaining available when their dependencies are healthy, circuit breakers and recovery. Test money and calls through current provider truth; missing callbacks do not mean failure or completion.

## Evidence manifest

Store sanitized captures/traces under `artifacts/workstreams/WN/<increment>/<run>/`; summarize in `docs/workstreams/status/WN.md`. Each record includes:

- Workstream/increment, source F/INV/T/design references, revision and build ID.
- Actual route, platform/OS/device class, viewport/theme, backend environment and provider mode.
- Actor roles and seed identifiers, setup, actions, expected result and observed result.
- Screenshots/video/design comparison plus redacted correlation/provider/domain record references where needed.
- Failure/recovery and accessibility results, performance context, discovered defects and fixes.
- Status: verified, failed, partial, or blocked/unverified; exact reason and next owner.

Use no real private fan content or secrets in evidence. A sandbox run proves only its sandbox scope. A disabled feature can be a correctly verified unavailable state while the feature itself remains undelivered. Gate sign-off references the combined evidence and unresolved items; it never replaces them with “all tests passed.”

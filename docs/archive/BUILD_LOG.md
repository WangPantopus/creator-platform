# Build log

## 2026-09-29 — Foundation slice started

Current user decisions override older references: Node.js backend, Next.js web,
native Swift/SwiftUI iOS, and native Kotlin/Compose Android. Build in this repository
first and integrate with Pantopus later. The final product name remains undecided.

### Foundation plan

- Screens: port the 53 reference components and preview catalog; implement 4A-02
  Continue with Pantopus, 4A-13 handle entry, and 4A-01 public creator home using the
  supplied layouts. Other artboards remain clearly labeled design previews until
  their owning modules and flows are implemented.
- Shared packages: generated design tokens, fixed copy, centralized temporary
  brand configuration, validated API schemas/OpenAPI, typed React components.
  Generate Swift and Kotlin tokens and strings from the same sources.
- Backend: standalone modular Node host with a Pantopus identity adapter seam,
  server-derived authorship, scoped repositories, Postgres FORCE RLS on a
  non-owner role, transactional outbox and verified inbox, and epoch/cursor
  delivery primitives. Provider integrations remain disabled until configured.
- Native: SwiftUI and Compose foundation catalogs and generated resources;
  keep React Native/Expo out of new application code.
- Endpoints: health, identity capability status, validated profile/onboarding
  boundaries and authenticated realtime foundation; no fake production sign-in.
- Verification: strict types, lint/format, build, isolation and authorship
  regressions, stale-frame takeover/reconnect tests, generated-file drift,
  Playwright renders in Light and Night against source artboards.
- Risks: missing canvas support.js and stale visual-review paths require a
  local reference renderer; supplied Night tokens still contain audit finding
  14; Pantopus auth is intentionally not connected yet; providers, storefront
  purchase policy and license terms retain their documented open decisions.

### Explicit design corrections

Apply BUILD_PROMPT section 9: neutral selected segments/mode rows; warm-paper
creator plate in Night; fan text in sans; unbroken metadata; quiet buttons on
creator surfaces use their text color; ended conversation retains step-in;
status cards stand alone and dialogs have a scrim. These are instructed fixes,
not an independent redesign. Preserve original source artboards as evidence.

### Implemented foundation

Created the pnpm/Turbo workspace, standalone Node.js backend, Next.js web host,
SwiftUI iOS application and Compose Android application. All 53 design component
names have native and typed web implementations with review catalogs. Shared
generators produce tokens, typography, copy, SVG geometry and native API clients
from the canonical resources and OpenAPI contract. `config/brand.json` and
`pnpm brand:rename NewName` preserve the replaceable product name.

The web host renders Welcome and the supplied public creator home. Handle entry
requires an authenticated Pantopus adapter, and the remaining 64 exported
artboards are explicitly design previews. Sign-in reports unavailable until
Pantopus is connected; there is no independent account system. The backend
implements scoped conversation and signed-act boundaries, transactional outbox,
verified inbox and replay primitives. Live generation and provider workers are
disabled until their adapters and workflows exist.

### Verification recorded

| Boundary  | Local evidence                                                                                                                                                                                                                              | Limits                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace | Generated-file drift, strict types, ESLint, Prettier and production builds pass. Two shared rename/resource tests pass.                                                                                                                     | Remote CI has not been run.                                                                                                                             |
| Backend   | 18 tests pass on Postgres 17/pgvector using a real non-owner RLS role. Randomized isolation checks cover 1,000 threads, 10,000 sampled pairs and 30,000 scoped SQL predicates. Actual P-256/WebAuthn assertions test exact-content signing. | Each domain acceptance row is tracked as a tested portion or unavailable in the backend coverage matrix. This is not all T-01–T-40 acceptance.          |
| Web       | Final Playwright run: 13 tests pass. 64 artboards and 53 component compositions are compared in both themes. The six foundation renders have zero pixel differences.                                                                        | Six catalog renders have documented 40–56 one-unit color differences at textarea corners. Product actions in the design gallery are not live workflows. |
| Swift     | 18 test methods pass, including 110 macOS snapshot assertions. iPhone 17/iOS 27 XCUITests exercise unavailable sign-in in Light/Night and labeled AI/creator messages.                                                                      | macOS rendering is regression evidence, not accepted native screen fidelity. Physical-device and full-flow acceptance remain pending.                   |
| Android   | Debug APK, 19 unit/snapshot test methods and 144 Paparazzi assertions pass. Four Android 14 emulator tests cover unavailable sign-in, context removal, mode selection and real dialog actions.                                              | Pixel acceptance against independent design renders and all native states remain pending.                                                               |

See [design evidence](implementation/design-verification.md),
[native verification](implementation/native-foundation.md), and
[T-01–T-40 coverage](implementation/backend-foundation.md) for exact scope.

### Repairs and decisions during implementation

- The Packet and StepIn prototype heading was changed to **Included in your
  request**, as explicitly required by source Product Design S-F7. Original
  exports remain intact; paired before/after images record the correction.
- Native screenshot review corrected contextual Night seals, approved-draft
  bands, rules and nonwrapping counts, plate/glow shadows, dialog presentation,
  status dots, and squeezed actions. Native baselines were recorded only after
  inspecting the identified changes; they remain unaccepted design evidence.
- A rejected buffered realtime drain now leaves cursor and sequence state
  unchanged. Persisted checkpoints include per-generation counters so a process
  restart cannot forget the next sentence number.
- Native generated contracts preserve nullable identifiers and literal
  constraints, including required user verification and disallowed local accounts.
- Turbo now forwards the explicit test database URL and disables test caching.
  CI fails if that URL is absent, so skipped local integration tests cannot
  masquerade as database verification.
- The Swift snapshot host matches macOS 27/Xcode 27. CI uses the documented
  `xcode-27` runner to avoid an implicit OS change; its remote run is still pending.

### Remaining product work

The foundation is implemented and locally checked; the full app and pilot are
not complete. Next slices are creator verification, source ingestion, boundary
tests, publish/versions/digest, then consent and live AI chat, memory extraction,
request packets, holds/capture/refunds, receipts and the Studio queue. Calls,
memberships, native billing, ops and notification/provider integrations follow.
Pantopus integration remains later as requested. Provider names, store policy,
pricing configuration and license terms retain their documented open decisions.
Native design acceptance, full accessibility up to 200%, real network chaos,
physical-device checks and the production latency/load budget still need evidence.

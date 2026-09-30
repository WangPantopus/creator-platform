# Design verification evidence

This record separates reference fidelity from implementation coverage and from
working product behavior. The web gallery renders all supplied artboards and
component previews. A gallery entry is a design fixture, not a completed
backend-backed feature. Native snapshot files are review evidence; native
pixel acceptance remains pending.

## Reference and permitted corrections

The web reference server in `scripts/visual-reference.mjs` serves the original
`design/design-system/project/components/bundle.js`, `bundle.css`, and exported
HTML. `scripts/visual-support.ts` restores the missing canvas `support.js`
runtime. The reference does not import the typed application components. The
application independently compiles the repository artboards and component
previews into React, using `packages/ui-web`.

Both paths use the same locally bundled, licensed Geist, Geist Mono and
Newsreader font files and generated theme tokens. No fallback or network font
was accepted. Chromium, device scale 1, reduced motion and the artboard's own
viewport dimensions are held constant.

The explicit corrections in BUILD_PROMPT section 9 apply to both renders:
Night's warm creator plate and its ink/accent pair, contextual seal colors,
neutral setting selections, sans-serif packet summaries, unwrapped metadata,
quiet controls on creator plates, the ended conversation's retained StepIn
action, standalone request status, and dialog scrims. Original screen exports
remain intact. These are instructed repairs, not inferred redesigns.

An additional behavioral conflict is resolved by BUILD_PROMPT's stated source
precedence. [Product Design S-F7](../source/Product_Design_Flows_Screens_and_Copy.md)
at line 247 explicitly requires **Included in your request** and forbids
**What Maya will see**: request selection controls what is sent for attention;
the adjacent fixed notice explains separately logged conversation access. The
4A Packet export and phase-5 StepIn packet state had the forbidden heading.
`includedInRequest` now supplies the implementation heading, and the served
reference applies that same explicit correction. The checked-in artboards are
unchanged.

[Paired original/corrected heading evidence](../../tests/visual/evidence/packet-heading/README.md)
contains both themes for Packet at 390 × 1700 and StepIn packet state 1 at
390 × 844. For example, compare
[Packet Light original](../../tests/visual/evidence/packet-heading/Packet-light-original-heading.png)
with [Packet Light corrected](../../tests/visual/evidence/packet-heading/Packet-light-corrected-heading.png).
Regenerate those pairs with `node scripts/visual-copy-evidence.mjs`.

## Web comparisons recorded

The final full Playwright run passed 13 tests: six foundation tests, four
catalog tests, one auth behavior test and two auth-contract tests. A catalog test loops through many
independent renders; the test count is not the screenshot count.

| Coverage                                               | Captures compared against fresh reference | Observed result                                                       |
| ------------------------------------------------------ | ----------------------------------------: | --------------------------------------------------------------------- |
| 64 exported artboards, default state, Light and Night  |                                       128 | 122 had zero differing pixels; six had only the corner rounding below |
| 53 component preview compositions, Light and Night     |                                       106 | Zero differing pixels in the initial 920 × 1800 captures              |
| Welcome, creator home, Handle preview, Light and Night |                                         6 | Zero difference against fresh reference and committed source goldens  |

The foundation viewports are Welcome 390 × 844, creator home 390 × 1560 and
Handle preview 390 × 844. Handle's live authenticated save flow is not enabled.
The six committed goldens are in `tests/visual/baselines/`; they were recorded
on macOS, and `.github/workflows/ci.yml` uses macOS for their baseline checks.
Each foundation comparison permits **zero** differing pixels. Fresh source
versus implementation comparison also requires identical PNG buffers.

The catalog permits at most **64 differing pixels per capture**, with a maximum
delta of **2/255 in any RGBA channel**. Both conditions must hold. This bound
was approved only for native-control corner rasterization between independent
Chromium render contexts; it must not be raised to hide typography, color,
copy or geometry changes. The six measured initial differences were:

| Artboard | Light pixels / maximum channel delta | Night pixels / maximum channel delta |
| -------- | -----------------------------------: | -----------------------------------: |
| Packet   |                               56 / 1 |                               40 / 1 |
| Sources  |                               49 / 1 |                               54 / 1 |
| OpsCase  |                               49 / 1 |                               54 / 1 |

[Measured counts](../../tests/visual/evidence/rounding-counts.json) and retained
reference, implementation and red diff images are under
`tests/visual/evidence/`. Those rounding examples predate the heading repair;
the paired heading evidence records the subsequent explicit copy correction.
Every nonzero future comparison attaches both images, its diff and counts to
the Playwright HTML report.

Component tests now capture the full page. Message's long composition was
rechecked in both themes with full-page captures and passed with zero
difference. After the heading repair and the required unwrapped Edited by you
badge, targeted Packet and StepIn state-1 comparisons plus IncludeList in both
themes passed: four tests covering six render comparisons. The general catalog
run covers each artboard's initial state, not every interactive prototype state.

The auth test confirms that an unconfigured Pantopus provider reports failure,
creates no local identity, retains chat/request arrival paths, and redirects
authenticated Handle entry back to sign-in. Provider success, profile saving,
payments, playback and realtime behavior are outside these visual checks.

Run `pnpm test:visual` after installing the pinned Chromium with
`pnpm exec playwright install chromium`. Detailed commands and targeted filters
are in [tests/visual/README.md](../../tests/visual/README.md). Avoid a concurrent
Next build, since it shares `.next` with the test server.

## Native evidence and remaining acceptance

Android has 144 recorded Paparazzi PNGs under
`apps/android/app/src/test/snapshots/images/`: 106 named component/theme fixtures,
two Welcome fixtures, two catalog-selector fixtures, and 34 additional thread
state fixtures. The latter cover five delivery states, three approved-draft
treatments, six composer states, two Note states and sponsor disclosure, each
in both themes. The logical fixture size is 390 × 844 at density 1. The default
catalog screenshots show the selected Mark component and selector; the separate
106 fixtures exercise all 53 registered names.

Swift has 110 recorded PNGs under
`apps/ios/Tests/QelvoraUITests/__Snapshots__/NativeSnapshotTests/`: 106 named
component/theme fixtures, two Welcome fixtures and two combined author-identity
fixtures. `NativeSnapshotTests.swift` uses a macOS `NSHostingView` at logical
390 × 844; its PNGs are 780 × 1688 on this macOS 27/Xcode 27 host. These are **macOS
SwiftUI captures**, not iOS simulator/device pixel acceptance. Separately, two
XCUITests passed on an iPhone 17/iOS 27 simulator: labeled AI/creator messages
and unavailable sign-in in explicitly selected Light and Night appearances.
Five retained device screenshots and their manifest are under
`artifacts/native/ios/device-final/`. CI uses the documented `xcode-27` runner
for the same OS family; remote CI has not been run.

The independent review checked all 106 component captures on each platform,
with additional attention to identity, signing, status and overlays, against
the supplied bundle/CSS. It identified and sent owner-directed fixes for contextual Night
seals, a squeezed Android QueueCard Open control, Android status dots/receipt
and signing glyph differences, Swift approved-draft band layout and signing
hit-area geometry, compressed SystemLine content, wrapped ReservedLabel/CapacityHeader
metadata, and approximate Swift plate/glow shadows. The corrected native
captures were re-recorded, reviewed for the identified repairs, and subsequently
verified: 110 Swift assertions and 144 Android assertions pass. Those checks do
not establish independent source pixel equality.

The Swift dialog fixture now occupies the full viewport. Paparazzi's separate
Android-window capture clipped the dialog; its corrected fixture captures the
same `DialogSurface` used by the production window. Android instrumentation
separately verifies the real window, both appearances, visible action bounds and
Cancel's callback. Its focus requester initially failed at runtime; it now
attaches to the actual safe-action button inside the dialog window.

Skeleton goldens capture the shared visible geometry directly, so they show the
message and row shapes instead of recording before the intentional 300 ms delay.
The runtime components retain the delay and motion settings. Those static
captures do not verify timing or reduced-motion interaction; those checks remain
part of full native flow acceptance.

Some tall compositions extend beyond the native 844-point viewport. Having
all 53 component names in a registry or one fixture per name does not verify
all prop combinations, disabled/loading states, full scroll content, keyboard
interaction or accessibility. Recording a native golden, or matching a later
capture to it, establishes a regression baseline only. No native fixture has
yet been accepted as a pixel match to an independent source render.

Acceptance still requires fresh source-versus-native review at equivalent
logical sizes on iOS and Android, full-state/scroll coverage, real modal
presentation, system theme changes, dynamic text, screen reader author order
and announcements, focus containment, keyboard/safe-area behavior and physical
device interactions. Snapshot tests cannot validate biometrics, signatures,
audio playback, pushes, calls, billing or provider integration.

# Visual verification

Install the pinned Chromium with `pnpm exec playwright install chromium`, then
run `pnpm test:visual`. Playwright starts the Next app and a separate source
reference server. Avoid a simultaneous Next build because both commands write
`.next`.

The reference serves the original JavaScript component bundle and exported HTML,
restores missing `support.js`, applies only the requested BUILD_PROMPT section 9
corrections and uses the same locally bundled fonts and generated theme tokens.
The implementation compiles layouts into React with the typed component port.
Neither reference rendering nor its stylesheet imports application components.

Six committed baselines cover Welcome, creator home and handle entry in Light
and Night. Their baseline and fresh source-to-app comparisons require zero
pixel difference. The committed PNGs were created on macOS; CI uses macOS for
those baseline checks. Fresh reference comparisons avoid OS-specific goldens
for the entire catalog.

Catalog tests compare all 64 exported screens and all 53 component compositions
in both themes. Their limit is 64 differing pixels with a maximum channel delta
of 2/255. This narrowly accounts for Chromium rounding native control corners
between independent render contexts. It cannot hide theme changes, copy changes,
font substitution or layout shifts. Every nonzero comparison attaches both
renders, a bright-red pixel diff and measured counts to the HTML report. Review
retained example evidence under `evidence/` before changing this bound.

Auth tests verify provider-unconfigured failures and preserved arrival paths.
Catalog fidelity does not verify backend behavior, device accessibility,
keyboard flows, store billing or pilot comprehension thresholds.

An additional explicit correction changes the Packet and StepIn packet-state
heading from the original "What Maya will see" to `includedInRequest`. Product
Design S-F7 explicitly requires "Included in your request": request selection
controls what is sent for attention, while the separately logged access notice
explains broader creator/team access. The behavioral source takes precedence
over the conflicting artboard heading. Original `.dc.html` files remain intact.
Paired Light/Night evidence is retained under `evidence/packet-heading/`; regenerate
with `node scripts/visual-copy-evidence.mjs`. Run the affected packet state with
`VISUAL_SCREENS=Packet,StepIn VISUAL_STEP=1 pnpm test:visual --grep Packet,StepIn`.

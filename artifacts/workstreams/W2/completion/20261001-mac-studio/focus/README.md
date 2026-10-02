# Visible Studio action-error acceptance

Personally operated October 1, 2026 (America/Los_Angeles), on `Yingpengs-Mac-Studio.local`, macOS 27 / Chrome. Source: `30cc2866372cfbaa9ed963e9528553c356a87e9f` (PR65 reconciled with main); subsequent merge `8275d993` only incorporates W4's reserved-schema ownership correction.

Actor: development actor one, fictional creator Maya / `kilnfire_w2`, creator ID `97152450-4093-4b15-9148-b12c16053956`. The previously recorded admin verification is a synthetic prerequisite, not real verification. Canonical W1 sign-in and Studio BFF were used. API 4102, web 3002, database `creator_w2` on 55442; non-owner runtime role. No provider credentials or provider calls. Model, indexing, evaluation and publication remain unavailable.

## Operated result

At `/studio/ai/test`, entered “How do I fire a cone 6 glaze?” in Fan message and clicked **Send to draft AI**. The real BFF refused the action with the provider-unavailable notice. In all four visible viewports, the notice was focused and fully in view after smooth scrolling completed:

| Theme | Viewport | Notice top / bottom (CSS px) | Focus | Horizontal overflow |
| --- | --- | --- | --- | --- |
| Light | 1280 × 900 | 0 / 110 | alert wrapper | none observed |
| Night | 1280 × 900 | 0 / 110 | alert wrapper | none observed |
| Light | 390 × 900 | 16 / 146 | alert wrapper | none |
| Night | 390 × 900 | 16 / 146 | alert wrapper | none |

The first immediate desktop observation occurred during the smooth scroll and the notice was temporarily above the viewport; the settled observation and screenshot confirmed its final visible position. This is not a measured scroll-latency claim. **Refresh saved state** preserved the provider error and left focus on the clicked recovery button. Publish remained disabled, six cases remained NOT RUN, and the draft stayed at revision 3.

Captures: [desktop Light](light-1280x900.jpg), [desktop Night](night-1280x900.jpg), [phone Light](light-390x900.jpg), [phone Night](night-390x900.jpg).

## Source and checks

Personally reviewed the synthetic host guards, same-creator proof, text-only uses, current creator/license row checks, development publish/rollback gates and action-error effect. Backend, web and API TypeScript checks passed. Scoped ESLint and Prettier passed. No new tests were written.

The reconciled `30cc2866` hosted checks still include real web-visual and iOS failures (known main defects); backend checks passed. Complete final-head CI is recorded separately before merge. This receipt does not claim provider/publish, full artboard fidelity, reduced-motion operation, 200% text, VoiceOver, native fan operation, p95 or release readiness.

## Host preservation

The original iMac archive and designated OpenAI key file are absent; no other credential locations were searched. The existing Mac Studio private backup was checked: 537,446 bytes, SHA256 `61ad84f2ff203ada5caf7fc8061f4072a6f9453271ec0866e90ddafd3972de07`. No W3/W4 state or peer device/container was changed.

## Successful actions and keyboard recovery

The successor implemented the shared confirmation Toast and restored the initiating control after successful actions only when disabling it left focus on the page body. It never overrides a moved focus, a dialog or an error Notice. The inline confirmation remains after the Toast's four-second display; it does not duplicate the live-region announcement.

Personally saved the fictional weekly update through the real Studio UI using Enter on **Save this week's update** in Light/Night at both 1280×900 and 390×900. The completed save restored that button's focus in all four cases. No horizontal overflow was observed. The phone Toast occupied y=772…820, above the bottom navigation; desktop y=828…876. The update survived reload/navigation. A private backup restored revision 9 and expiry `2026-10-09T04:38:27.106Z`; later repeated saves advanced the revision normally. No provider state was fabricated.

Exact viewport captures: [Light phone](success-light-phone.png), [Night phone](success-night-phone.png), [Light desktop](success-light-desktop.png), [Night desktop](success-night-desktop.png). [Source and capture hashes](success-source.json) identify the patch on base `b63f49d9`. Web typecheck, scoped ESLint and Prettier passed. No new tests were added.

**Capture limit correction:** the original four JPEGs above were ordinary browser captures resized by the capture backend. Their pixel dimensions do not equal the requested viewport. The DOM viewport, geometry and focus observations remain valid; those JPEGs are not exact artboard comparison evidence. The new PNGs use explicit document clips at the observed scroll position and preserve the requested pixel dimensions. These successful-save checks do not establish VoiceOver, 200% text, reduced motion, native operation or full R12 fidelity.

## Populated draft and example focus

Personally authored and saved fictional development content through Studio: expert mode, a manually written and explicitly fictional style card, 20 creator-owned synthetic examples approved/fixed through the UI, four rules, a synthetic never-reveal canary, three handoff triggers, usefulness/style criteria and a $5 daily cost cap. These are synthetic creator-writing inputs, not real creator material or approved provider results. Persisted SQL readback: revision 15, 20 examples, 20 approved/fixed, cap 5,000,000 micros; usage/evaluation/version counts remain 0/0/0.

The journey exposed two additional keyboard defects. Adding an example disabled its initiating button and left focus on the body; removing a focused example did the same. The repair focuses the newly added editor or an adjacent surviving editor (the add field when none remain), while preserving a focus the user moved. Save draft becomes disabled once clean, so its successful continuation focuses the adjacent **Run boundary evaluations** link if focus otherwise landed on the body. Personally verified add → new editor, remove → previous editor, and save → evaluation link with Enter. [Populated style capture](style-saved-light-desktop.png) and [source hashes](style-source.json) record this increment. Existing backend checks passed 18/18, including unchanged T-11 (10,000 pairs / 30,000 scoped queries / 300,000 ms limit) in 80,787 ms. Web typecheck and scoped lint/format checks passed. Full R12 and provider-dependent steps remain open.

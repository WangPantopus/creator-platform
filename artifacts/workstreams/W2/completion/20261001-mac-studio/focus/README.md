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

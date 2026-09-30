# Existing Foundation fixture compatibility proposal

Current source: `da03bb764cd05d0f6ac7e19fcd012611226465c5`. Existing tests and references are untouched. This proposal does not authorize an edit or waive a failure.

The [W8 resume prompt](../workstreams/handoffs/W8-resume-prompt.md) says: “Write no new tests or test code” and “Preserve existing tests without weakening them.” Current C11 only permits registered UUID references and literal query values; accepting old free-text drafts/contexts would weaken the product contract.

| Existing surface | Observed incompatibility | Proposed narrow correction |
| --- | --- | --- |
| `apps/backend/tests/contracts.test.ts` | Its positive unavailable-sign-in continuation uses `context=kiln`, now invalid; current400 is correct for that input. | Use a registered UUID context for the positive unavailable-provider assertion; preserve every status assertion and invalid-arrival case. |
| `tests/visual/auth-contract.spec.ts` | Old positive arrival uses an unregistered large free-text `draft`; negative cases expect the old fallback/error category. Current C11 rejects the draft and reports invalid return with `/home` fallback. | Replace obsolete positive arrival data with registered bounded references and align negative expected error/fallback with current C11; retain every external/backslash/control-character denial and exact valid-destination assertion. |
| `tests/visual/foundation.spec.ts` functional unavailable-sign-in case | Assumes an invented default `/creators/maya/chat` arrival; current fallback is `/home`. | Align only the default-return expectation; preserve explicit creator arrival, unavailable-sign-in, onboarding redirect and every exact screenshot/reference assertion. |
| `apps/android/app/src/androidTest/.../NativeAcceptanceTest.kt` | Its removal case assumes the default welcome contains a creator/post, without supplying an arrival. Current MainActivity starts at `/home`; it does not invent creator/post context. | Supply a genuine scoped development arrival through the existing fixture/setup; preserve the actual touch/description and removal assertions and all other runtime cases. Do not reinstate invented default creator data. |
| `apps/backend/tests/postgres.integration.test.ts` | Setup applies only0001 while current session/profile locks depend on later immutable migrations; setup fails before nine cases run. | Set up a genuinely fresh disposable database with the canonical registry/current roles; preserve all non-owner isolation, revocation, assembler scope and replay assertions. Never add ad-hoc grants, skip checks, or use an owner connection for app operations. |

The exact setup change must account for repeated runs and the canonical checksum ledger; dropping one schema under a retained full ledger is invalid. Use the existing migration runner and an isolated database, with no peer/live data touched. The proposal creates no new test project/cases and changes no golden/reference.

Visual/snapshot failures are separate. Investigate actual implementation captures and approved reference/environment conditions; this proposal does not authorize updating goldens or tolerances. Trust compilation and local shipping builds passing do not make Foundation or the release ready.

Current Android CI reports a touch-injection failure, not a definitive missing-element diagnosis. The missing arrival is a source/setup finding; investigate the actual report before changing that fixture. Download wrappers returned artifact metadata, but their reusable ZIP URLs returned403 from this host. No underlying runtime cause is waived.

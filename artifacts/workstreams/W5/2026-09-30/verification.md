# W5 verification — 2026-09-30

These records establish the stated local transitions only. No tests were added. No paid AI or fake passkey/payment/delivery records were used.

- Backend/web `tsc --noEmit`: pass.
- Targeted backend/content/Studio/API and web feature ESLint: pass at the checkpoint.
- Production `next build` with `CREATOR_NEXT_OUTPUT=.next-w5-build`: pass; final latest build checked again before push.
- Full `QelvoraApp` iOS Simulator build: pass, all shipping owner sources included. Installed/launched on W5-only UUID9E7B3B43-955F-4473-8CE0-6BFEAE685D27 with API4105. Light/Night launch PNGs show sign-in, not W5 content acceptance.
- Canonical migrations through0031 then additive W5 SQL0032–0037 applied to W5 DB; independent upgrade DB and checksum rerun: pass. Runtime role neither superuser nor BYPASSRLS;14 W5 tables ENABLE and FORCE RLS.
- `http-acceptance.json`: real W1 synthetic sessions, persisted team draft/exact idempotent retry, team publication (unsigned/team identity), two fan reads/Thanks, creator digest denial, unpublish/current deep-link denial, both own withdrawals after removal and stale edit denial.
- `http-coordination-acceptance.json`: current W4 audience options, explicitly missing live producer, actual W2 revision, canonical W1 invite/identical recovery/wrong-recipient denial/recipient acceptance/current role/removal. Thanks changes emit durable events. Distribution drain attempts leave them blocked; no downstream receipt claimed.
- Browser’s configured localhost flow reaches the genuine W1 synthetic selector and navigates to Home after choosing creator, but subsequent Studio reads report no session. `browser-signin-blocker.jpg` and `browser-session-blocker.jpg` preserve actual failures. HTTP cookie success does not establish browser success. Root cause unproven; no auth injection.
- `http-account-boundary.json`: stale displayed-account command403 without preference changes, current actor command200, team source-intent grant403. Fresh sessions are genuine W1 synthetic continuations, not fabricated tokens.
- Native reply pagination refresh retains bounded pages and rechecks before/after account boundaries; unsigned team posts never display a personal Signed action; typed/compiled verification only, no operated reply journey claimed.
- `shared-integration.patch` checks cleanly but is unapplied pending required shared-edit approval; generated files untouched. Existing installed/accepted SDK35 copied read-only to own cache; no new license acceptance. Full shipping APK build, dedicated AVD install/launch and actual Light/Night sign-in captures pass.

Not yet measured/verified: genuine creator-signed Note/two private replies/reaction; canonical payment and Approval/voice/provider journeys; integrated fan native content; source/audience races/end-to-end distribution/privacy completion; source-aligned responsive Light/Night layouts; p95, assistive technology and physical devices. Workstream remains incomplete and not release ready.

Audience size is shown only from the current producer’s measured count. The composer disables its display when that adapter is absent; publication rejects unavailable/invalid counts. Clients never substitute an estimate.

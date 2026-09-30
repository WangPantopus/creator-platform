# Existing checks — 2026-09-30

Commands ran in the isolated W2 worktree using bundled Node 24.19.0 and available pnpm 11.25.0 (manifest requests pnpm 12.5.1). Frozen-lock dependencies were reused; no package versions changed.

| Check | Observed result |
| --- | --- |
| `pnpm generate:check` | PASS: 12 web/Swift/Kotlin shared resources and 31 OpenAPI operations. |
| `pnpm lint` | PASS, full configured root scope. |
| `pnpm format:check` | PASS, full configured root scope; inherited mechanical corrections committed separately. |
| `pnpm typecheck` | PASS: all seven packages. |
| `pnpm build` | PASS: backend bundle and production Next.js build, including final pipeline 9 follow-up. Dev server stopped before build and restored afterwards. |
| `pnpm test` | FAIL: shared Node 2/2 pass; backend contracts 8/9 pass; PostgreSQL setup fails and nine cases do not execute. Existing tests unchanged, no new tests/scripts written. |

## Exact existing failures

`apps/backend/tests/contracts.test.ts:79`, “local backend exposes health and honestly refuses sign-in”: expects 503 `identity_unconfigured` for POST `/v1/identity/continue` with only `returnTo`. Newer W1 input/PKCE validation returns 400. The invalid request does not establish unsafe sign-in; fixture/current owner contract need reconciliation.

`apps/backend/tests/postgres.integration.test.ts` beforeAll drops/recreates schema using only immutable `0001_foundation.sql`. Current `Database.withThread` asserts fan ownership through `creator.fan_profile`; runtime permission arrives in later canonical migration 0002. Setup fails with **permission denied for table fan_profile**. Changing historical SQL or weakening ownership would misrepresent the real migration chain. Preserve both; reconcile the owner’s existing harness.

Root tests used `CREATOR_TEST_DATABASE_URL` for disposable cluster `creator-platform-w2-checks-20260930`, database `creator_w2_test`, port 55449. The suite changes the runtime-role password, so it must never share Studio’s cluster on 55442. Secrets were loaded privately; no credential URL is saved. Occupied W3 port 55443 and W4 port 55444 were preserved.

Combined `pnpm check` is not green. Failures and open release acceptance keep PR #1 draft. Actual provider/product-console/API/SQL/browser observations are separate from the existing engineering test result.

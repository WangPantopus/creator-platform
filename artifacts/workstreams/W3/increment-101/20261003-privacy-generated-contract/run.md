# W3 focused Privacy generated-contract repair — 2026-10-03

- Personally read the actual PR36 head4187412a compiler job111205488480 and web jobs111205490409/111205483068 failure logs: generation refused stale OpenAPI before application checks.
- Normally reconciled captured mainb4d3099a into the active W3 branches. On focused Privacy branchb377d8fc, regenerated only the existing optional provider-policy `reference` in OpenAPI and Swift/Kotlin models; no authority, policy acceptance, operation or SQL changed.
- Actual `pnpm generate:check` passes for115 operations. Actual canonical-heavy `pnpm check` passes after deleting only this stopped W3 checkout's stale rebuildable Next route cache. Existing backend tests:9 pass,9 PostgreSQL tests skipped because the local test database is unconfigured; no new test code.
- The first local check's stale host-route validator failure is retained privately. No Next/Turbo configuration or command changed; installed Next16.3.7 README/typegen source and Turbo2.11.5 docs were read.
- New shipping native build/current-head UI qualification and fresh CI remain required. Previous head/UI evidence is not current-head release acceptance. PR36 remains draft; queued checks do not permit merge.
- Detailed actual logs and custody stay private under the W3 `resume71` configuration directory; no credentials, job bodies or screenshots are committed.

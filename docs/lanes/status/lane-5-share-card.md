# WP 5.8: share-card connection gap — 2026-10-09

E5.7 is **not complete**. The stock server has no `shareSource` or
`shareStatus` reader. `configured.ts` retains the unavailable defaults; the
server's Growth owner object supplies Home and discovery only. There is no
production implementation of either share reader elsewhere in the repository.
The existing rendering and export code cannot be proved from a real delivered
reply until this connection exists. No replacement permission owner was added.

## Tickets

| Owner         | Files                                                                            | Change and reason                                                                                                                                                                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lane 4        | `apps/backend/src/modules/commerce/service.ts`, commerce API schema and response | The real `share` command persists `commerce_share_grant` and returns only a commitment ID. Supply the current grant ID/version and a held reader for current fan choice, creator/mode permission, exact delivered version, handle choice and both revocations. Growth must not infer these from private rows. |
| Lanes 1 and 3 | identity signing and conversation signed-subject owner ports                     | Supply a held exact-version signed **human reply** reader, its public words, signature/hash verification and withdrawal/correction state, bound to the real grant. No AI or approved-draft message may satisfy E5.7.                                                                                          |
| Integrator    | `apps/backend/src/server.ts`                                                     | Compose both actual readers into `configureGrowthForBackend({ owners: { shareSource, shareStatus } })`. Refuse when owner authority is absent. Growth creation/page/export already call these seams.                                                                                                          |
| Lane 4        | commerce fan reply/share controls                                                | Pass the returned actual grant ID into `POST /v1/growth/shares`; use its returned random ID for the public link. Keep the real fan handle choice and both withdrawal commands.                                                                                                                                |

Founder question sent: E5.7 says human replies only, but the existing Growth
`ShareSource` contract and export accept `approved_draft`. Proposed correction:
human replies only. No contract or user-facing copy changed while the answer
is pending.

## Real-server evidence

Ran the stock backend, web and PostgreSQL on lane 5 ports, from `origin/main`
at `c0b4ac0f0`. Only development identity was used in this scenario; no fake
sharing, signature, payment or privacy reader. Machine load was 53.93 / 50.60 /
37.26 on 16 CPUs. No timing assertion.

| ID                 | Steps                                                                                    | Expected                     | Observed                                        | Result  | Evidence                                   |
| ------------------ | ---------------------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------- | ------- | ------------------------------------------ |
| E5.7-missing-owner | Fan signs in; four concurrent creation attempts using an unknown grant; read share count | Refusal, no persisted share  | Four 403 `sharing_unavailable`; count unchanged | pass    | `/tmp/qelvora-lane5-share-proof-final.log` |
| E5.7-unknown-link  | Anonymous page and export for a random ID                                                | No words/export              | 404 page; 410 export                            | pass    | same log                                   |
| E5.7-normal        | Delivered signed reply; grant ID; fan handle choice; creation call                       | Usable card                  | Missing canonical readers                       | not run | repository connection trace above          |
| E5.7-author        | AI/draft refusal; altered text hash mismatch                                             | Refusal/mismatch             | Missing canonical readers                       | not run | same                                       |
| E5.7-withdraw      | Fan and creator revoke; racing page/image reads                                          | Neither returns words        | Missing canonical readers                       | not run | same                                       |
| E5.7-render        | Unicode, long text, image, short URL                                                     | Complete labeled text        | No real source                                  | not run | same                                       |
| E5.7-restart       | Restart/failure with an actual card                                                      | Current owner state retained | No real source                                  | not run | same                                       |

Defect in my scenario: first run expected 409 and a flat error object. The
actual API returned `403 {"error":{"code":"sharing_unavailable",...}}`.
First result was 1/2, with five not run; fixed the assertion to the existing
API and reran: 2/2, five not run. Original output is preserved in
`/tmp/qelvora-lane5-share-proof.log`. These two passes prove refusal only;
they do not satisfy the E5.7 star row. No unit tests added.

Run with the Codex Node runtime and fallback bin on PATH, and
`npm_config_manage_package_manager_versions=false`:

```sh
node infra/local/stack.mjs up --lane 5 --growth --no-smoke
node tests/scenarios/lane-5/e5-7-share-card.mjs
node infra/local/stack.mjs down --lane 5
```

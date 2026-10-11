# WP 5.8: human-only share cards and the owner connection — 2026-10-09

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

The founder approved human replies only. `ShareSource` and its runtime schema now
accept only `human_creator`. Creation refuses an unsupported author with the
existing `sharing_unavailable` error. Public reads treat an old draft or malformed
stored source as withdrawn, before consulting the positive owner reader. Web page,
export parser and image renderer no longer render an approved-draft share. Existing
copy is reused. Notification authorship types are unchanged.

This contract correction is implemented, but its real owner-driven positive and
AI/draft cases remain **not run** until the canonical readers above exist. Client
claims of authorship and signed words are refused by the actual strict endpoint;
that is a separate boundary check, not proof that a genuine owner-issued draft was
rejected. Native share rendering belongs to lane 7; keep current server rechecks
and remove any assumption that a newly valid share may be an approved draft.

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

## Follow-up checks after approval

Three real-server checks passed, five not run. The two earlier refusal checks
passed again; the added `E5.7-client-claims` check sent human, approved-draft and AI
authorship plus client-supplied signed words. All three returned 400 `invalid_request`
and the database count stayed unchanged. This is not an owner-issued source proof.
Typecheck passed 7/7 after the correction below; changed-source lint passed.
Machine load was 15.22 on 16 CPUs. Final scenario log:
`/tmp/qelvora-lane5-share-human-proof-final.log`.

| ID                                                 | Steps                                                    | Expected                        | Observed                               | Result  | Evidence           |
| -------------------------------------------------- | -------------------------------------------------------- | ------------------------------- | -------------------------------------- | ------- | ------------------ |
| E5.7-client-claims                                 | POST three author claims and signed words, read DB count | Client cannot supply the source | Three 400 invalid_request; no new rows | pass    | final scenario log |
| E5.7-missing-owner / unknown-link                  | Repeat existing real-server checks                       | No unauthorized share or export | Four 403; page 404/export 410          | pass    | final scenario log |
| E5.7-normal / author / withdraw / render / restart | Real canonical owners                                    | Complete share workflow         | Owner readers still absent             | not run | tickets above      |

Real stock-server refusal checks rerun on this branch, with the same missing owner
readers. Logs: `/tmp/qelvora-lane5-share-human-proof.log`, `-typecheck.log`,
`-typecheck-final.log`, `-lint.log`. No new unit tests. Existing 157 backend tests
were not rerun for this correction; the full run on the preceding Android branch
is not evidence for these changed files.

Own defect during the edit: the first typecheck found a leftover `approved` variable
in the image font branch (`TS2304`). The human font is now unconditional. This is
recorded separately from runtime evidence.

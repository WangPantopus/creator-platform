# WP 5.2: suppress a reaction push after reply withdrawal

The worker now checks the exact creator, reply and recipient before preparing a
reaction notice and again before the provider submits it. A withdrawn reply or a
reply whose current review is no longer allowed suppresses delivery. An unavailable
reader fails closed and retries. No reply words enter this reader or the push.

Branch: `lane-5/reaction-withdrawal`. **No PR while #385 is open.** The founder
approved this limited reader on 2026-10-09, with integrator privacy review before
registration. This does not approve an engine revision or broader private reads.

## Migration proposal

`apps/backend/src/modules/content/migrations/pending_w5_reaction_available.sql`
adds `creator.content_reaction_available(creator,reply,account) -> boolean`.
Its owner, `creator_content_reaction_notice`, cannot log in, bypass RLS, inherit
roles, create roles/databases or replicate. No role receives membership in it.
Only the original `creator_runtime` login can obtain a true result. PUBLIC cannot
execute it. It has column grants for IDs, withdrawal/version/review state and
public fan-account binding, **no text, review hash, signature bytes or writes**.

The request-only reply and review read policies are narrowed from PUBLIC to their
existing `creator_runtime` consumer. Separate policies scope the purpose role to
the requested IDs, with restrictive policies preventing later permissive policies
from widening it. The security-definer function fixes `search_path`, keeps RLS on,
restores its transaction-local settings, and returns no rows or metadata. This is
an internal availability check, not evidence of fan custody or a public endpoint.
It adds no table or private-data copy. Export and erasure keep their current owners.

**Integrator ticket:** review the limited grants and policy consumers, register the
pending SQL after #385, and include the new role/function in any custody catalogue
that enumerates them. Verify the full production host. This branch never edits
`infra/migrations.json`, `server.ts`, `integration.ts` or custody checksums.

## Results, 2026-10-09

Real HTTP server and PostgreSQL, machine load roughly 4–7. No new unit tests.

| ID                                       | Steps                                                                                                  | Expected                                                      | Observed                                                                                                      | Result  | Evidence                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| E5.2 / E5.3 existing notices             | Sign reaction, read list, inspect push, race effects, withdraw, block another fan                      | Right fan, generic wording, once, private text absent         | 5/5                                                                                                           | pass    | `e5-4-reaction-notices.mjs`; `/tmp/qelvora-lane5-reaction-baseline-final.log`            |
| E5.2-retry-withdraw                      | Gateway down; wrong fan withdraws; author submits two identical withdrawals; gateway up; rerun effects | Wrong fan refused; one withdrawal; no retry sent              | 403; 200/200; reply version 2, text replaced; delivery suppressed; zero submissions                           | pass    | `e5-4-reaction-withdrawal.mjs`; `/tmp/qelvora-lane5-reaction-withdrawal-final.log`       |
| E5.2-final-check-race                    | Hold provider after preparation; commit author withdrawal; release provider                            | Final check suppresses previously prepared delivery           | Leased delivery became suppressed, zero submissions                                                           | pass    | Same script/log; real final `beforeSubmit` callback                                      |
| E5.2-review-change                       | Queue reaction; change reviewer outcome to flagged; retry                                              | Current review refuses delivery                               | Boolean false; suppressed; zero submissions                                                                   | pass    | Same script/log; reviewer outcome is a named fixture                                     |
| E5.2-reader-failure                      | Rename SQL function while delivery retries; restore; retry twice                                       | No fallback send; recovery once                               | Queued/0 submissions while absent, then sent/1                                                                | pass    | Same script/log; no owner answer mocked                                                  |
| E5.2-reader-bounds                       | Query live, wrong/null/unreacted IDs; reuse connection; try role change and direct private read        | Exact live binding only; no authority retained                | Seven false results; private rows 0; SET ROLE denied; no text/write/other-role grants; prior setting restored | pass    | Same script/log, actual runtime login                                                    |
| E5.2-restart                             | Persist live and withdrawn retries; terminate and start a new host; release due time                   | Withdrawn suppressed; live once                               | 1/1, suppressed/0 and sent/1                                                                                  | pass    | `--restart`; `/tmp/qelvora-lane5-reaction-restart.log`                                   |
| E5.1 / E5.2 existing audience and thread | Run audience, lifecycle and reaction scripts after SQL change                                          | Current membership, isolation, signing and privacy still hold | 13/13, 6/6, 7/7; undo excluded from pilot                                                                     | pass    | `/tmp/qelvora-lane5-reaction-stars.log`                                                  |
| E5.2 in-flight bytes                     | Withdraw after final read or provider acceptance                                                       | Cannot promise recall of submitted bytes                      | Not exercised                                                                                                 | not run | Boolean check cannot close the interval after it returns; tap still checks current state |
| Full stock host / real devices           | Register role and SQL; production composition; real APNs/FCM                                           | Integrator review and deployment checks                       | Not exercised                                                                                                 | not run | No provider accounts/keys used                                                           |

Fakes: development identity and software passkey; existing fixture outcomes for
creator verification, completed membership, review and denial; push recorder with
down/hold controls; SQL moves only the retry deadline as the clock edge. The real
content owner, signing, notification worker, RLS and database are used. No model
requests, payment calls or private owner modules were replaced by mocks.

Found in this work: the first migration attempted custom function SET clauses and
PostgreSQL refused `permission denied to set parameter "content.reaction_creator_id"`.
It now saves/restores transaction-local settings explicitly. The first new script
had a missing closing brace (`SyntaxError: Unexpected end of input`), then expected
409 for a wrong fan, while the existing `invariant` contract returns 403. That run
was 5/6, and the corrected assertion still requires refusal and no changed state.
The clean final run was 6/6 plus the separate restart 1/1. No failure is hidden.

## Rerun

Put the Codex Node and fallback directories on PATH and set
`npm_config_manage_package_manager_versions=false` in each shell. Use an empty
lane 5 disposable database. Apply the proposal by hand; do not register it here.

```sh
sh tests/scenarios/lane-5/setup.sh
docker exec -i qelvora-lane5-db psql -U postgres -d creator_foundation_lane5 -v ON_ERROR_STOP=1 < apps/backend/src/modules/content/migrations/pending_w5_reaction_available.sql
sh tests/scenarios/lane-5/run-host.sh
```

In another shell, run `node tests/scenarios/lane-5/e5-4-reaction-withdrawal.mjs`.
Stop the host, start it again **without resetting the database**, then run the same
script with `--restart`. For the older scripts that reset between cases, apply the
same pending SQL once to `creator_foundation_lane5_base`, then run:

```sh
sh tests/scenarios/lane-5/run-all.sh e5-1-audience e5-1-lifecycle e5-2-reactions e5-4-reaction-notices
```

Rollback: keep the migration installed if disabling the feature. Removing the
function while this code runs makes reactions retry without sending. Returning to
the old worker behavior would reopen the withdrawal defect. Already submitted
provider bytes cannot be recalled by this change.

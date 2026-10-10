# Lane 2: Platform and hosting status

Updated: 2026-10-09, by the resumed lane 2 session
Working on: WP 2.8 qualification; scenario code and local measurements are saved in PR #384 on `lane-2/load-soak`
Done: WP 2.1 is on main; WP 2.8 measurement scripts and a 30-minute idle soak are complete; WP 2.2, WP 2.9 and WP 2.3 options still need to land on main
Next: owners resolve measured failures; re-run affected scenarios; hosting choice unlocks staging and WP 2.4 to 2.7
Blocked on: hosting road/provider/region, monthly ceiling, web/API domain and owning account; integrator stack repair; lane 3/5 fixes and multi-worker composition

## Resume here

Read [the WP 2.8 note](lane-2-load-soak.md) for commands, measurements, limitations and exact
owner tickets. The founder has authorized continued code work, including WP 2.8; do not ask
for that authorization again. Hosting choices and accounts remain missing.

The measurement code is [PR #384](https://github.com/WangPantopus/creator-platform/pull/384).
Eight idle sockets passed 30 minutes with two planned session renewals. This is not full
pilot qualification: at 16 public readers there were ten client deadlines and one 503; a
fresh two-fan worker run produced one failed reply and one delivered reply, though both
receipts settled. Multiple worker processes and sustained streaming are not run. The note
preserves the first socket failure as well as the later idle success; do not erase either.

The resume audit is [PR #380](https://github.com/WangPantopus/creator-platform/pull/380).
At fetched main `c0b4ac0f030a893dfc92457f0f4348dd87174398`, all four original PRs are marked
merged, but only [#367](https://github.com/WangPantopus/creator-platform/pull/367) reached main.
[#370](https://github.com/WangPantopus/creator-platform/pull/370),
[#377](https://github.com/WangPantopus/creator-platform/pull/377), and
[#378](https://github.com/WangPantopus/creator-platform/pull/378) merged into their old lane
bases. The integrator must land their original reviewed commits in order through replacement
PRs. Lane 2 has not merged, retargeted or rewritten any branch. Preserve this newer status
when resolving those older status-file changes.

The complete session 1 evidence and its linked production, catalogue and hosting notes remain
in [the original handoff](https://github.com/WangPantopus/creator-platform/blob/69ca75941dcaad02dda700d548971006a5bbd9a9/docs/lanes/status/lane-2.md).
Reuse it; do not repeat the hosting research or the completed scenario batteries. No price
changed, so the founder's one-page hosting options are unchanged too.

Founder approvals in this chat, already recorded in #380:

- Lane 1 may explicitly mark pilot calls and voice `not_offered` so those rows do not block
  readiness. Lane 2 owns the environment declaration after its contract is agreed.
- The integrator may review and implement catalogue fingerprints that ignore relations a
  role cannot reach. Lane 2 does not own `core/purpose-catalogue.ts` or the review files.

Neither approved behavior is implemented by the load-scenario branch. It changes only lane 2
scenario scripts and status notes. Runtime qualification remains dependent on other owners;
staging and WP 2.4 to 2.7 still require the founder's hosting choice and integrator deployment.

Machine during this work: Docker became available, and the existing PostgreSQL 17 image was
used without downloading. One disposable lane 2 stack was started with `--growth --no-web
--no-smoke`. Only development identity and the model are faked. The shared 16-CPU machine
reported load averages around 25 to 99; measurements are not a production capacity claim.

State at stop: `node infra/local/stack.mjs down --lane 2` succeeded after the final worker
rerun. It stopped the backend and model and removed the database container, volume and state
directory. Verification found no `qelvora-lane2-*` containers or volumes and no listeners on
56420–56429. All scenario processes exited. The result notes are committed and pushed; raw
scratch logs were removed after their results were recorded. No other lane's stack was touched.

Traps still apply: at most five data requests per fan per hour; delete locks that fan out of
the creator; catalogue mismatches can latch the backend until restart; a failed generation
can prevent further replies until this disposable stack is rebuilt. No privacy request or
manual financial settlement is part of WP 2.8. Use only ports 56420–56429 and lane 2 objects.

## How to run it

`node infra/local/stack.mjs up --lane N`, then `smoke`, `status`, `down`. Full guide:
[infra/local/README.md](../../../infra/local/README.md). Scenario scripts are in
`tests/scenarios/lane-2/`: `smoke.mjs`, `seed-maya.mjs`, `e2-1-cold-start.mjs`.

## Scenarios

| ID                            | State                                                                                                                                                                                                                                                                                                                                        | Re-run                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| E2.1 ★ cold start, edge cases | Pass: 22 of 22 steps (cold start 32 s, repeat, port taken, Docker unreachable, killed mid-run, stop and up, two stacks, foreign objects, teardown). The acknowledgment passed in every run (227 to 914 ms). The AI reply is advisory: delivered in 3 of 11 full runs at load average 9 to 62, so it is not a reliable exit check on this Mac | `node tests/scenarios/lane-2/e2-1-cold-start.mjs`, `node infra/local/stack.mjs up --lane 2` |
| E2.2 ★ / E2.9 ★               | Session 1: 144/144 and 19/19 passed respectively, with limits in the original handoff. Not re-run here; code is not yet on main                                                                                                                                                                                                              | Original handoff above                                                                      |
| E2.8                          | Not qualified: public overload and worker completion failed; eight idle sockets passed 30 minutes. Final worker run: seven checks passed, one failed. Full soak: ten passed, zero failed. Full results and limits in the WP 2.8 note                                                                                                         | Commands in the WP 2.8 note                                                                 |
| E2.3 to E2.7                  | Not run; hosting-dependent                                                                                                                                                                                                                                                                                                                   | Hosting decision required                                                                   |

## Findings and tickets to other lanes

| To                 | File                                                                                                                                                                            | Change                                                                                                                                                                                                                                                                                           | Why                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Integrator         | `apps/backend/scripts/activate-wave.ts`, `apps/backend/src/modules/trust/privacy-catalog.ts` (`assertPrivacyTaskCatalog`, `assertPrivacyExtensionForReview`)                    | The content wave (101) has no review variant, so its post-apply check falls through to the final-state catalogue and throws `privacy_original_family_unavailable`. A fresh database cannot reach the full host through the reviewed operator at current `main`                                   | The stack works around it for empty databases only (`apps/backend/src/operations/local/fresh-install.ts`). Any database with data that needs the later waves is stuck                                                                                                                                                          |
| Integrator         | `apps/backend/scripts/migration-generation-roles.ts` (line 215)                                                                                                                 | The reviewed generation-purpose catalogue rejects the `growth_api` login that `db/growth-api-pool.ts` requires: "Generation-purpose wave catalogue changed"                                                                                                                                      | Two reviewed pieces disagree about the Growth API login. The stack's `--growth` skips the migration re-check once the history is complete                                                                                                                                                                                      |
| Integrator         | `package.json` (root)                                                                                                                                                           | Add scripts such as `"stack": "node infra/local/stack.mjs"` so lanes can run `pnpm stack up --lane N`                                                                                                                                                                                            | `scripts/*` and the root manifest are the integrator's                                                                                                                                                                                                                                                                         |
| Lane 3             | `apps/backend/src/modules/identity/generation-scope.ts`, `apps/backend/src/workers/generation*.ts`, `apps/backend/src/modules/commerce/generation-safety-terminal-catalogue.ts` | One generation transaction runs about 60 full catalogue verifications (about 900 statements) inside the fixed 5 second scope window (`generation_scope_matches`, `created_at>clock_timestamp()-interval '5 seconds'`). Verify once per transaction or cache, or widen the window                 | Measured at 5.1 s when the first error fired. On a busy Mac replies fail (`generation_scope_changed`, `generation_denied`), and one failure can leave an uncertain provider cost that refuses that creator's later replies ("Current creator budget or uncertain provider cost prevents admission") until the stack is rebuilt |
| Lane 3             | `apps/backend/src/workers/generation.ts`                                                                                                                                        | The idle worker repeats the terminal-discovery catalogue check every second: the database container sits near one full core per stack at idle                                                                                                                                                    | Seven stacks on one Mac                                                                                                                                                                                                                                                                                                        |
| Lane 3             | `apps/backend/src/realtime/gateway.ts`, `apps/backend/src/modules/conversation/service.ts` (thread read)                                                                        | The gateway's 2 s authority deadline closed a socket with 1013 about 2 s after subscribing (load 9 to 14); one interrupted reply coincided with three "could not obtain lock on row in relation thread" errors while a client polled the thread every second; I did not prove the poll caused it | Clients that poll or hold sockets can break the reply they are waiting for                                                                                                                                                                                                                                                     |
| Lane 3, lane 6     | `apps/web/features/conversation/ConversationScreen.tsx`                                                                                                                         | The thread screen stayed on "Loading your messages…" at load 30 although its thread request returned 200; the page polls `/api/platform/identity/session` hundreds of times. Hypothesis: the identity heartbeat re-keys the screen before it settles                                             | The web thread could not be operated end to end on this Mac                                                                                                                                                                                                                                                                    |
| Integrator, lane 5 | `infra/migrations.json` reserved entries, `apps/backend/src/workers/start.ts`                                                                                                   | The publication worker cannot start on `main`: it needs migrations 0073 and 0201, the publication scope SQL and a `creator_publication_worker` login, none of which is in the registered graph                                                                                                   | Note publication cannot be operated end to end until they are registered                                                                                                                                                                                                                                                       |
| Lane 5             | `apps/web/app/creators/[handle]`, the public creator projection                                                                                                                 | With `--growth` the backend serves Maya's public page (200, published), but the web page shows "Public AI information is updating" for a companion AI with 0 public sources                                                                                                                      | A seeded public source or a different empty state may be wanted                                                                                                                                                                                                                                                                |
| Lane 6             | `apps/web/next.config.ts` or `.gitignore`                                                                                                                                       | `next dev` rewrites the tracked `apps/web/next-env.d.ts`                                                                                                                                                                                                                                         | The stack hides and restores it; a lasting fix is the web owner's                                                                                                                                                                                                                                                              |

## Notes for whoever resumes this lane

- Fakes used by the stack, all at the outer edge: the development identity (accounts 1 to 7), a local model fake
  (`infra/local/fake-edge/model.mjs`, redirected by a Node preload that refuses to load outside a loopback
  development process). No payment processor or push gateway is run; payments are not composed.
- Never run `pkill -f` by pattern on this shared Mac. Early in this session I ran one (`pkill -f "src/server.ts"`) when
  only my own, already crashed, process could have matched; it could in principle have matched another session's server.
  Everything since is by recorded pid or by listening port inside lane 2's range.
- The database container sets `jit=off` and no parallel workers; the stack runs `ANALYZE` after an install. Neither
  changed whether replies succeed.

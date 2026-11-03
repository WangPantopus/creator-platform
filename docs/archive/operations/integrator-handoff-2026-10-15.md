# Integrator handoff, 2026-10-15

Written at the end of the 2026-10-15 integrator session. Read this first, then
[CURRENT](CURRENT.md) (the status board, which has the full pull request map). Approvals come from the
founder in the chat, never from this file.

## Resume here

1. `git fetch origin`. Main was `8e8ea5894` at handoff. If it has moved, `git log 8e8ea5894..origin/main`
   tells you who merged what since.
2. Everything on the founder's 2026-10-15 merge list is on main (merge commits in CURRENT), including the
   eight pull requests GitHub showed as merged that had never reached main.
3. Check the open pull requests against the lists below (`gh pr list --state open`). Nothing listed here
   is authorized to merge; wait for the founder's list.

### Open integrator pull requests (each needs the founder's yes)

Each is exactly one commit on top of `8e8ea5894`, every check green at handoff, and all six were merged
together onto main in a local rehearsal without a conflict, so any subset merges in any order.

| PR | What | Merge note |
| --- | --- | --- |
| #420 | CI runs push-triggered checks on main only | Recommended first: every pull request then runs the workflow once instead of twice |
| #414 | Growth web route admits `GET /launch` | Unblocks lane 5's launch kit (#393) |
| #415 | Reviewed operator: a privacy review variant after the Content wave | Fixes lane 2's ticket; does not fix the restored-database problem below |
| #417 | The stack's Growth API login is `creator_review_growth_api` | After merging, tell the lanes to `stack reset --lane N --growth` an older Growth stack |
| #419 | `server.ts` composes lane 5's Note and reaction notices | Then lane 5 runs its Note scenarios on the stock host |
| #422 | Lane 2's E2.1 and E2.9 follow the registry | Until it merges, E2.1 fails one step (it expects 114 migrations) |

### Open lane pull requests at handoff

- Lane 1: #406 (sign-in decision pack, founder questions), #407 (contract C1 and stub), #409 (deletion for
  identity and media; its failing E1.8 rows belong to lanes 3, 4 and 5).
- Lane 3: #411 (A1 measurement), #426 (A3, catalogue checks once per transaction: the fix for slow and
  failing replies).
- Lane 4: #408 (scenario runner; merge first, later lane 4 scenarios use it), #416, #418 (contract C3 and
  four founder decisions), #421, #423, #424, #427, #428, #429; drafts #410 and #425 carry migrations.
- Lane 5: drafts #388 to #400. Close to ready: #388 and #389, #394, #395. Need registration first: #400,
  #397, #399. Not ready: #392, #393, #396, #398.
- Lane 7: draft #401, waiting on the founder's compact-header decision.

## How today's merges were done (do it the same way)

1. **Review** each pull request: its results table against the star rows in the lane brief
   (`grep '★' docs/lanes/lane-N-*.md`), its files, and no secrets or home paths in the diff.
2. **Rehearse the batch** on a detached copy of main: `git switch --detach origin/main`, then
   `git merge --no-ff --no-edit <head>` for each pull request in order. Any conflict stops the batch. Run
   `pnpm exec turbo run typecheck --force`, `pnpm lint`, `pnpm format:check` and `pnpm generate:check` on
   the result, run the stack and the scenarios on it, and record `git rev-parse HEAD^{tree}`. After the
   real merges, main's tree must equal it; today it did (`219da6165`).
3. **Merge pinned**: `gh pr merge N --merge --match-head-commit <reviewed sha>`. For a stacked chain,
   retarget each child (`gh pr edit N --base main`) only after its parent merged, then confirm
   `gh pr view N --json commits` lists only that pull request's own commits before merging it.
4. **CI**: until #420 merges, every pull request branch runs the whole workflow twice (push and pull
   request). The macOS jobs share about two runners and are not served in order; today the batch waited
   about six hours, some jobs queued from 09:14 to 15:06 UTC. Do not poll by hand: run one background
   command that exits when every check on the listed pull requests is green, or as soon as one is not
   (read `gh pr view N --json statusCheckRollup`). "The hosted runner lost communication with the server"
   is a runner fault: re-run that job once (`gh run rerun <run> --failed`).
5. **Conflicting status files**: when a lane's pull request and an older replacement both edit the
   lane's status file, merge the older work into the newer branch with a plain merge commit that keeps
   the newer file byte for byte (done for #380 and #384).

## How to register a migration (the #412 pattern)

Every pinned catalogue lists every relation, so any migration changes all of them. Follow #412:

1. Keep the pending filename under an allocated version (as 0041, 0042 and 0056 do). Add the entries
   and their registered reservations to `infra/migrations.json`.
2. Add a wave file (`infra/migrations/waves/<id>.json`: baseline = every registered source, wave = the
   new ones) and **a new review file** for the wave. Never regenerate an older review in place: the
   operator checks a database at the previous state against the previous review.
3. Point `registeredComparisonProfile()` (`apps/backend/src/db/comparison-profile.ts`) at the newest
   review, teach `activate-wave.ts`, `migrate-trust.ts`, `fresh-install.ts` and the generation and
   privacy role checks the wave, and add fixed "previous state before the new wave" review variants for
   the privacy checks (see `assertComparisonPrivacyTaskCatalogForReview`).
4. Regenerate the pins on real databases with `node infra/local/stack.mjs catalogues
   snapshot|check|diff|write`: a fresh stack (`populated-original`), a restored copy (`original`), each
   with and without the Growth login. Read the `diff` reach changes against the SQL before writing.
5. Prove it: a stack from nothing, the pins 45 of 45, `tests/scenarios/integrator/notices-registration.mjs`
   (export and delete), `migrate-trust` on a fresh cluster (exactly the canonical 61), the backend suites
   on a fresh cluster, and the operator on a restored copy at the previous state.

Several ready proposals can share one wave. Suggested next: #400, #397 and #399 together, then lane 4's
#410 and #425, then #398 (order and reasons in CURRENT).

## The finding the founder has to decide on

The reviewed migration operator cannot take a restored database through the waves, even on main: it
refuses the first wave ("Generation-purpose wave catalogue changed"). A restore drops seven explicit
owner-privilege entries, so a fresh database and its restore differ already at the canonical 61, and the
early reviews pin only the fresh form. Re-run it in about 30 seconds:

```
(cd apps/backend && pnpm exec tsx ../../tests/scenarios/integrator/operator-walk.mts)
```

It uses a disposable container on port 56405 and a private temporary directory and removes both. Fixing
it means qualifying a restored-database variant in each earlier review (generation, Content, output,
public AI, recovery), or the founder choosing lane 2's hosting road 2.

## Traps

- **zsh**: an unmatched glob aborts that command line; a foreground `sleep` is blocked in the tool.
  Toolchain block: section 3.7 of the working agreement.
- **The stack reuses its database.** After a delete request that fan is locked out of the creator; use
  `stack reset`. A Growth stack built before #417 carries a `growth_api` login.
- **Lane scripts hard-code ports**: E2.2 and E2.9 use lane 2's stack (start it with `stack up --lane 2
  --db-only` or `--no-web --no-smoke`, tear it down afterwards); lane 6's E6.1 takes
  `LANE6_WEB_PORT` and `LANE6_FAKE_PORT`, so it can run on lane 0's ports.
- **Copies of lane scripts write to `/tmp/qelvora-laneN-*`**: point them at your scratch directory.
- **The shared Mac** reached load 190 today (another session's iOS build). AI replies on the stack are
  advisory; acknowledgments and refusals are not.
- **`next dev` rewrites `apps/web/next-env.d.ts`**: `git restore` it before committing.

## Deliberately not done

- No merge outside the founder's list.
- The operator's restored-database re-qualification (founder decision).
- Lane 5's Note scenarios on the stock host (lane 5's work after #419).
- Lane 7's native scenarios were not re-run by the integrator (lane 7's proof stands; no native code
  merged today except #379).

## Next, by the founder's answer

- **"Merge the integrator pull requests"**: #420 first, then the ones named; after #417, tell the lanes
  to reset Growth stacks.
- **"Register lane 5's next migrations"**: only once lane 5 marks #400, #397 and #399 ready; one wave,
  the #412 recipe.
- **"Review lanes 1, 3 and 4"**: a merge list with each results table against the star rows; merge only
  what the founder lists, in batches.
- **"Fix the operator"**: start from `operator-walk.mts`; qualify restored variants review by review.
- **Hosting chosen**: lane 2 resumes (its prompt is in `docs/lanes/prompts/paste/`); deployment then
  needs the integrator.

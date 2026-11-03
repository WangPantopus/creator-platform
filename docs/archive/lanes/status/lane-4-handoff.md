# Lane 4: handoff, 2026-10-16 (Pacific time, afternoon)

This is where the next lane 4 session starts. Read it first, then `lane-4.md` (status, pull requests,
tickets) and `lane-4-decisions.md` (the founder's decisions). Both are in this directory, on branch
`lane-4/status-refresh` (#447) until that pull request is merged.

## State at handoff

Nothing is in flight. Every lane 4 branch is pushed, and the working tree is clean.

**Merged on main:** #408, #410, #416, #418, #421, #423, #424, #427, #428, #429; and on 2026-10-16, at the founder's request (a rehearsed batch: static gates, the 100 money tests and all 30 lane 4 scenario files on the merged tree), #448, #449, #450, #463, #467, #469, #470, #474, #476, #484, #485 and #486.

**Open:**

| PR           | Branch                     | What                                                                                    | Waits on                                                              |
| ------------ | -------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| #425 (draft) | `lane-4/inbox-login`       | Non-owner login that claims processor notifications                                     | migration registration                                                |
| #447         | `lane-4/status-refresh`    | Status, decisions and this handoff                                                      | merge                                                                 |
| #453         | `lane-4/request-notices`   | Request notices recorded, handed to growth and withdrawn; one `commitment_due` reminder | green CI, then merge (main merged in, #463's conflict resolved)       |
| #510         | `lane-4/departure-history` | `e4-3-departure` counts every accepted request Maya still owes                          | green CI, then merge                                                  |
| #459 (draft) | `lane-4/share-card-owners` | Share cards: `shareSource` / `shareStatus`                                              | migration registration, five catalogue pins, reviews by lanes 1 and 3 |
| #487         | `lane-4/decides-in`        | Decision 5: "usually decides in" from the decision record                               | migration registration and regenerated catalogue pins                 |

**Decided:**

- P1 (2026-10-15), and decisions 6 and 7 (2026-10-16, built in #474).
- On 2026-10-16 the founder said to take the proposed default for every open decision. So:
  - decisions 1, 2, 4 and 5 are built: #485, #486, #484 and #487;
  - decision 3 (two signatures), #467's `text` fallback and the reminder timing (#453) needed no
    change.

**Still open for the founder:** Stripe test keys (WP 4.7), and Q16. Q16's retention period is a
legal question; lane 4 proposed a default only for the product part (`lane-4-decisions.md`).

## Next work

Everything left waits on keys, Q16 or other lanes. When CI or a review reports on a lane 4 pull
request, fix it on that branch, with evidence. Otherwise:

1. **#453 and #510:** merge them once their CI is green, if this session did not.
2. **Stripe test keys arrive:**
   - run WP 4.7 (E4.13);
   - extend decision 1 to memberships and the pass. Their refunds can be matched exactly:
     `credit_note:<note>:<line>` to `invoice_line:<line>`, and `pass-refund:<line>:<ref>` to
     `pass-cash:<line>`. Prove it against Stripe Billing in test mode.
3. **The founder answers #467's fallback with "refuse", after lane 6's WP 6.6 has shipped:**
   - drop the `text` fallback in `decide()`;
   - make `commerce-money-capture.test.ts:133` and `:374` send `question`.
4. **The founder or counsel settles Q16:** commerce's part of a fan's deletion
   (`modules/commerce/operations.ts`, lane 1's #409), per the decision.

## Environment: the stack is running; reuse it

The lane 4 stack is **running** from the desktop app's worktree `lane-4-money-117d77` (under the
repository's `.claude/worktrees`), which is on `lane-4/status-refresh`. Its backend runs main's code
as of the merges of 2026-10-16 (`911c95940`), and it was freshly reset after the last scenario.

- PostgreSQL `qelvora-lane4-postgres` on 56440, 119 migrations, without #487's stand-in migration
  (the scenario removes it);
- backend on 56441, web on http://localhost:56442, model fake on 56443, fake card processor on
  56444;
- started with `--growth`. Maya is live, and nobody is paused.

**How to start, depending on the worktree the session opens in:**

- **In `lane-4-money-117d77`** (nothing to spin up):
  ```sh
  NB=$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies; export PATH=$NB/node/bin:$NB/bin/fallback:$PATH; export npm_config_manage_package_manager_versions=false
  node tests/scenarios/lane-4/stack.mjs status
  ```
- **In any other worktree:** the stack refuses `up` from a checkout other than the one that created
  it. So, once, from the new worktree (about 35 s at low load; up to 90 s under load):
  ```sh
  pnpm install --frozen-lockfile --offline
  node tests/scenarios/lane-4/stack.mjs reset --ack-only --growth
  ```
  This handoff authorises this reset.

**Everyday commands** (with the PATH line above):

- After switching branches, restart the backend: `kill` the `backend` pid from
  `$TMPDIR/qelvora-stack/lane4/pids.json`, then
  `node tests/scenarios/lane-4/stack.mjs up --ack-only --growth` (about 10 s). Also stop the
  scheduler (`node tests/scenarios/lane-4/scheduler.mjs stop`). It runs backend code loaded from disk
  when it started, and a scenario reuses a running one.
- **Money tests** (before every PR):
  ```sh
  export CREATOR_TEST_DATABASE_URL=$(node infra/local/stack.mjs env --lane 4 | sed -n 's/^CREATOR_TEST_DATABASE_URL=//p')
  (cd apps/backend && pnpm exec vitest run tests/commerce-money-*.test.ts)
  ```
- **Scenarios:**
  - all of them: `node tests/scenarios/lane-4/run.mjs` (about 20 minutes under load);
  - one: `node tests/scenarios/lane-4/<file>.mjs`.

  Each ends with the 9-check sweep. Browser scenarios (`e4-9-offer-hours-web`, `e4-8-refund-room`'s
  D1-4, `e4-2-copy-web` from #474) drive system Chrome and need the web app.

- **Gates:**
  - `pnpm exec turbo run typecheck --force --filter=@qelvora/backend --filter=@qelvora/web`;
  - `pnpm exec eslint <files>` and `pnpm exec prettier --check <files>`.

## Traps

- **The stack belongs to one worktree** (see Environment).
- **Switching branches while a suite runs breaks it.** `run.mjs` spawns each scenario file from
  disk, and scenarios restart the scheduler from disk. Wait for the run's pid, not
  `pgrep -f run.mjs`, which matches the waiting command itself.
- **Stack history leaks between branches.**
  - After running #486's code, main's sweep S7 disagrees with the freed slots.
  - Before #485, `e4-8-limits` fails on any stack where `e4-9-capacity` already refunded fan three.
  - Before #470, `e4-9-public-summary` fails once more than 20 cheaper offers pile up.

  Reset the stack, or retire the leftover offers (pause them through the mode command, as #470 does).

- **Scenarios that pause Maya** (`e4-9-paused-creator` from #469; `e4-3-departure` from #463) leave
  her paused. Run them by full name, then reset.
- **#487's migration changes catalogue pins.** Apply it only after the backend has started, and
  remove it afterwards (`e4-9-decides-in` does both). While it is applied, the backend cannot
  restart.
- **Devon's AI is paused on the stack,** so no fan can open a conversation or a request with him.
  Use Maya.
- **Lane 1's public creator check answers "unavailable" for an unknown creator.** Read the profile
  first, as #469 does.
- **Logins reset on `up`.** On main, `scheduler.mjs` re-applies the inbox login on each start.
- **Browser sign-in** must start from `http://localhost:56442`.
- **Shell:** zsh does not split `$var` into words, and `echo ====` is a zsh error. A scratch script
  that imports `@playwright/test` must resolve it from the repository.
- **The machine is shared.** Load can be high. Rerun before calling something a regression.

## Rules that bite (the founder's)

- No subagents.
- No new unit tests: prove everything end to end, failing first where it applies. Updating an
  existing money test to a decided rule is fine; say so.
- One concern per PR, on `lane-4/<topic>` cut from the latest origin/main.
- Never merge or force-push.
- Never edit `server.ts`, `integration.ts`, `Studio.tsx`, `infra/migrations.json` or other lanes'
  files: file a ticket instead.
- Take the proposed default for any decision, record it as "taken as the proposed default" in
  `lane-4-decisions.md`, and keep working. Hard never-rules still hold.
- End every message to the founder with "Working on / Waiting on / Next".

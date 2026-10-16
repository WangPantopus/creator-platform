# Lane 4: handoff, 2026-10-16 (Pacific time)

This is where the next lane 4 session starts. Read it first, then `lane-4.md` (status, pull requests,
tickets) and `lane-4-decisions.md` (the founder's open and settled decisions). Both are in this
directory, on branch `lane-4/status-refresh` (#447) until that pull request is merged.

## State at handoff

Nothing is in flight. Every lane 4 branch is pushed, and the working tree is clean.

**Merged on main:** #408, #410, #416, #418, #421, #423, #424, #427, #428, #429.

**Open:**

| PR           | Branch                          | What                                                                                    | Waits on                                                                     |
| ------------ | ------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| #425 (draft) | `lane-4/inbox-login`            | Non-owner login that claims processor notifications                                     | migration registration                                                       |
| #447         | `lane-4/status-refresh`         | Status, decisions and this handoff                                                      | merge                                                                        |
| #448         | `lane-4/share-grant-id`         | The share call returns `grantId` and `version`                                          | merge                                                                        |
| #449         | `lane-4/summary-members-only`   | The public summary marks `membersOnly`                                                  | merge                                                                        |
| #450         | `lane-4/inbox-outage-fresh`     | `e4-3-inbox-outage` makes its own inbox login                                           | merge                                                                        |
| #453         | `lane-4/request-notices`        | Request notices recorded, handed to growth and withdrawn; one `commitment_due` reminder | integrator wiring; production also needs a W8 worker denial (lane 1) and Q16 |
| #459 (draft) | `lane-4/share-card-owners`      | Share cards: `shareSource` / `shareStatus`                                              | migration registration, five catalogue pins, reviews by lanes 1 and 3        |
| #463         | `lane-4/settle-departure`       | `settleDeparture`, a paused creator's open requests (P1 confirmed)                      | integrator wiring                                                            |
| #467         | `lane-4/more-info-question`     | WP 4.12: a separate `question` field for "Ask for more information"                     | the founder (keep or refuse the `text` fallback); lane 6's WP 6.6            |
| #469         | `lane-4/summary-paused-creator` | The public summary stops listing a paused creator's offers (lane 1's existing check)    | merge; the integrator passes the restoration-gated check in production       |
| #470         | `lane-4/scenario-offers-retire` | Scenarios retire the offers they make                                                   | merge                                                                        |
| #474         | `lane-4/approved-copy`          | WP 4.12: the copy the founder approved (decisions 6 and 7)                              | merge                                                                        |

All of them were mergeable at handoff, and none had a failing check. The slow native and visual CI
jobs were still queued on the newest ones. The desktop app's Auto-fix watches #467, #469, #470 and
#474.

**Decided:** P1 (2026-10-15), and decisions 6 and 7 (2026-10-16, built in #474).

**Still open for the founder:**

- decisions 1 to 5 in `lane-4-decisions.md`;
- #467: keep reading `text` alone as the question for older clients until WP 6.6 ships (built), or
  refuse it;
- Q16 (commerce retention on deletion);
- Stripe test keys (WP 4.7);
- the reminder timing (#453).

## Next work

1. **Fix "1 hours"** (small, lane 4's own). `deadlinePhrase` in
   `apps/backend/src/modules/commerce/public-summary.ts` turns a 1-hour offer into "within 1 hours"
   in the capacity sentence. The web helper in #474 already says "1 hour". This needs its own pull
   request, with a scenario step that shows the sentence for a 1-hour offer.
2. **When the founder answers #467's fallback with "refuse"**, after lane 6's WP 6.6 has shipped:
   - drop the `text` fallback in `decide()` (one line);
   - make `commerce-money-capture.test.ts:133` and `:374` send `question`.
3. **Everything else waits on a decision or another lane** ("Blocked on" in `lane-4.md`). When CI
   or a review reports on a lane 4 pull request, fix it on that branch.

## Environment: the stack is running; reuse it

The lane 4 stack is **running**. It was started from worktree
`/Users/yingpengwang/creator-platform/.claude/worktrees/qelvora-money-lane-10f725`, which is on
`lane-4/approved-copy`, clean, with `node_modules` installed:

- PostgreSQL `qelvora-lane4-postgres` on 56440, 119 migrations;
- backend on 56441, running `lane-4/approved-copy`;
- web on http://localhost:56442, serving that worktree;
- model fake on 56443, fake card processor on 56444;
- started with `--growth`. Maya is live, and nobody is paused.

Nothing else is running: the scheduler, share host and trust host are stopped.

**How to start, depending on the worktree the session opens in:**

- **In `qelvora-money-lane-10f725`** (the fastest; nothing to spin up):
  ```sh
  NB=$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies; export PATH=$NB/node/bin:$NB/bin/fallback:$PATH; export npm_config_manage_package_manager_versions=false
  node tests/scenarios/lane-4/stack.mjs status
  ```
- **In any other worktree:** the stack refuses `up` from a checkout other than the one that created
  it ("This stack was created from another checkout"). The desktop app's hook also stops a session
  from writing another worktree's files. So, once, from the new worktree (about 35 s at low load):
  ```sh
  pnpm install --frozen-lockfile --offline
  node tests/scenarios/lane-4/stack.mjs reset --ack-only --growth
  ```
  This rebuilds lane 4's disposable database and moves the stack to the new worktree. Nothing of
  value is lost. This handoff is the trap that allows this reset.
- **`qelvora-money-lane-ecfdbc`** (the 2026-10-15 worktree) is not used. It was left clean on
  `lane-4/more-info-question` at `9db8c6d11`. The founder can remove it.

**Everyday commands** (with the PATH line above):

- After switching branches, restart the backend: `kill` the `backend` pid from
  `$TMPDIR/qelvora-stack/lane4/pids.json`, then
  `node tests/scenarios/lane-4/stack.mjs up --ack-only --growth` (about 10 s).
- **Money tests** (before every PR):
  ```sh
  export CREATOR_TEST_DATABASE_URL=$(node infra/local/stack.mjs env --lane 4 | sed -n 's/^CREATOR_TEST_DATABASE_URL=//p')
  (cd apps/backend && pnpm exec vitest run tests/commerce-money-*.test.ts)
  ```
- **Scenarios:**
  - all of them: `node tests/scenarios/lane-4/run.mjs`;
  - one: `node tests/scenarios/lane-4/<file>.mjs`.

  Each ends with the 9-check sweep. The browser scenario `e4-2-copy-web.mjs` (#474) drives system
  Chrome through Playwright and needs the web app.

- **Gates:**
  - `pnpm exec turbo run typecheck --force --filter=@qelvora/backend --filter=@qelvora/web`;
  - `pnpm exec eslint <files>` and `pnpm exec prettier --check <files>`;
  - after a contract or copy change, `pnpm generate` and `pnpm generate:check`.

## Traps

- **The stack belongs to one worktree** (see Environment).
- **Scenarios that pause Maya** (`e4-9-paused-creator` from #469; `e4-3-departure` from #463) leave
  her paused, because lane 1's pause also pauses her AI and nothing unpauses it. Once #469 lands,
  `run.mjs` runs them only when named in full. Reset after each.
- **Lane 1's public creator check answers "unavailable" for an unknown creator.** Read the profile
  first, as #469 does.
- **Lane 1's report and block need the reporter's own conversation with the creator.** Devon has no
  AI workspace on the stack, so use Maya, and reset afterwards.
- **The public summary lists 20 offers.** Leftover scenario offers pile up past that until #470
  lands.
- **The request card's title line does not wrap** (#474 finding, lane 6). Check your own elements
  at 320 px, not the whole page.
- **Logins reset on `up`.** On main, `scheduler.mjs` re-applies the inbox login on each start.
- **Hand-applied migrations, or catalogue pins changed by grants on `creator_profile`,
  `fan_profile` or `message`:** see the 2026-10-15 notes in `lane-4.md` findings. A `reset` cures
  the first.
- **Growth scenarios** need `--growth`. **Browser sign-in** must start from
  `http://localhost:56442`.
- **Shell:** zsh does not split `$var` into words, and the shell's directory returns to the session
  worktree after each command. A scratch script that imports `@playwright/test` must resolve it
  from the repository (`createRequire(<repo>/package.json)`).
- **The machine is shared.** Load can be high. Rerun before calling something a regression.

## Rules that bite (the founder's)

- No subagents.
- No new unit tests: prove everything end to end, failing first where it applies.
- One concern per PR, on `lane-4/<topic>` cut from the latest origin/main.
- Never merge or force-push.
- Never edit `server.ts`, `integration.ts`, `Studio.tsx`, `infra/migrations.json` or other lanes'
  files: file a ticket instead.
- Copy, money semantics and invariants go to the founder: propose a default and keep going.
- End every message to the founder with "Working on / Waiting on / Next".

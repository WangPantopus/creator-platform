# Lane 4: handoff, 2026-10-16 (early morning, Pacific time)

This is where the next lane 4 session starts. Read it first, then `lane-4.md` (status, pull requests,
tickets) and `lane-4-decisions.md` (the founder's open and settled decisions). Both are in this
directory, on branch `lane-4/status-refresh` (#447) until that pull request is merged.

## State at handoff

Nothing is in flight. Every lane 4 branch is pushed, and the working tree is clean.

**Merged on main:** #408, #410, #416, #418, #421, #423, #424, #427, #428, #429.

**Open:**

| PR           | Branch                          | What                                                                                        | Waits on                                                                     |
| ------------ | ------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| #425 (draft) | `lane-4/inbox-login`            | Non-owner login that claims processor notifications                                         | migration registration                                                       |
| #447         | `lane-4/status-refresh`         | Status, decisions and this handoff                                                          | merge                                                                        |
| #448         | `lane-4/share-grant-id`         | The share call returns `grantId` and `version`                                              | merge                                                                        |
| #449         | `lane-4/summary-members-only`   | The public summary marks `membersOnly`; its headline describes an offer any fan can ask for | merge                                                                        |
| #450         | `lane-4/inbox-outage-fresh`     | `e4-3-inbox-outage` makes its own inbox login                                               | merge                                                                        |
| #453         | `lane-4/request-notices`        | Request notices recorded, handed to growth and withdrawn; one `commitment_due` reminder     | integrator wiring; production also needs a W8 worker denial (lane 1) and Q16 |
| #459 (draft) | `lane-4/share-card-owners`      | Share cards: `shareSource` / `shareStatus`                                                  | migration registration, five catalogue pins, reviews by lanes 1 and 3        |
| #463         | `lane-4/settle-departure`       | `settleDeparture`, a paused creator's open requests (P1 confirmed)                          | integrator wiring                                                            |
| #467         | `lane-4/more-info-question`     | WP 4.12: a separate `question` field for "Ask for more information"                         | the founder (keep or refuse the `text` fallback); lane 6's WP 6.6            |
| #469         | `lane-4/summary-paused-creator` | The public summary stops listing a paused creator's offers (lane 1's existing check)        | merge; the integrator passes the restoration-gated check in production       |
| #470         | `lane-4/scenario-offers-retire` | Scenarios retire the offers they make                                                       | merge                                                                        |

**Done on 2026-10-16:**

- WP 4.12, backend (#467). `decide` takes a separate `question` for `more_info`, so a reply draft
  sent beside it never reaches the fan. The built default keeps reading `text` alone as the question
  for older clients (today's Studio, two money tests); refusing it waits on the founder and on lane
  6's WP 6.6.
- WP 4.12, copy: decisions 6 (what the fan reads when Maya lets her AI answer, and "Answer by" while
  a question waits) and 7 (the refund rule on the Offers page), in `lane-4-decisions.md`. Nothing
  is built.
- #469: the public summary asks lane 1's existing public creator check first, and a creator ops has
  paused reads like an unknown one.
- #470: each scenario retires the offers it made.
- Tickets, in `lane-4.md`: lane 6 (the WP 6.6 API), lane 1 (confirm the public creator check; the
  Studio's 503 for another creator), lane 5 (the summary's 404 and 503), lane 7 (the "Let AI answer"
  line once approved), and the integrator (the restoration-gated check in production).

**Still open for the founder:** decisions 1 to 7; Q16; Stripe test keys (WP 4.7); the reminder
timing (#453); #467's `text` fallback.

## Next work

1. **When the founder answers decisions 6 and 7:**
   - Add the approved keys to `config/copy.json`, and use them in
     `apps/web/features/commerce/CommerceScreen.tsx`:
     - `status()` (`:356`): for `reason === "ai_answer"`, `declinedForAi`, with an `askAiInstead`
       link to the fan's conversation with the creator;
     - the step label (`:436`): "Answer by" while `state === "more_info"`;
     - the Offers table (`:2185`, `:2208`, and the grid in `commerce.css:331`).
   - Run `pnpm generate`, so the copy reaches Swift and Kotlin.
   - Check the screens in the browser, in Light and Night, at a large text size.
   - File lane 7's ticket for the phone apps.
2. **When the founder answers #467's fallback with "refuse"**, after lane 6's WP 6.6 has shipped:
   - drop the `text` fallback in `decide()` (one line);
   - make `commerce-money-capture.test.ts:133` and `:374` send `question`.
3. **Everything else waits on a decision or another lane** ("Blocked on" in `lane-4.md`).

## Environment

The lane 4 stack is **running**. It was started from worktree `qelvora-money-lane-10f725`, the
2026-10-16 session's worktree:

- PostgreSQL `qelvora-lane4-postgres` on 56440, 119 migrations;
- backend on 56441, running `lane-4/scenario-offers-retire` (#470: main plus a test helper);
- web on http://localhost:56442, model fake on 56443, fake card processor on 56444;
- started with growth (`--growth`). Maya is live, and nobody is paused.

Nothing else is running: the scheduler, share host and trust host are stopped.

```sh
NB=$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies; export PATH=$NB/node/bin:$NB/bin/fallback:$PATH; export npm_config_manage_package_manager_versions=false
node infra/local/stack.mjs status --lane 4                        # what is running
node tests/scenarios/lane-4/stack.mjs up --ack-only --growth      # (re)start; reuses what is healthy
node tests/scenarios/lane-4/stack.mjs reset --ack-only --growth   # rebuild: about 25 s on a quiet machine
```

- **The stack belongs to the worktree that created it.**
  - Its database container is labeled with that worktree, and `up` from any other worktree refuses:
    "This stack was created from another checkout".
  - A session in a new worktree runs `reset` from there once. It rebuilds lane 4's disposable
    database; nothing else is lost.
  - The desktop app's hook stops a session from writing another worktree's files, so a session
    cannot work in the old worktree instead.
- **`qelvora-money-lane-ecfdbc`** (the 2026-10-15 session's worktree) is no longer used by the
  stack. It was left clean on `lane-4/more-info-question` at `9db8c6d11`, because the 2026-10-16
  session switched it there before the hook stopped cross-worktree writes. Switch it back, or remove
  it, when convenient.
- **The backend runs the code that was checked out when it started.** After switching branches,
  `kill` the `backend` pid from `$TMPDIR/qelvora-stack/lane4/pids.json` (your own process), then run
  the `up` line.
- **Money tests** (required before every PR):
  ```sh
  export CREATOR_TEST_DATABASE_URL=$(node infra/local/stack.mjs env --lane 4 | sed -n 's/^CREATOR_TEST_DATABASE_URL=//p')
  (cd apps/backend && pnpm exec vitest run tests/commerce-money-*.test.ts)
  ```
  This uses the stack's own test database, and never prints the value.
- **Scenarios:** run `node tests/scenarios/lane-4/run.mjs` for all of them, or `node tests/scenarios/lane-4/<file>.mjs` for one. Each ends with the 9-check invariant sweep. On 2026-10-16, all 20 files on main passed, and so did #467's and #469's new scenarios.
- **Gates:**
  - `pnpm exec turbo run typecheck --force --filter=@qelvora/backend --filter=@qelvora/web`;
  - `pnpm exec eslint <files>` and `pnpm exec prettier --check <files>`;
  - after a contract change, `pnpm generate` and `pnpm generate:check`.

## Traps

- **The stack belongs to one worktree** (see Environment).
- **Scenarios that pause Maya leave her paused.** These are `e4-9-paused-creator` (#469) and `e4-3-departure` (#463).
  - Lane 1's pause effect pauses her AI before commerce's settlement runs, and nothing can unpause her
    yet.
  - Once #469 lands, `run.mjs` runs them only when named in full. Reset the stack after each.
  - `e4-3-departure` also stops the stack's backend.
- **Lane 1's public creator check answers "unavailable" for an unknown creator.** Read the profile
  first, as #469 does; otherwise an unknown creator becomes a 503.
- **Lane 1's report and block need the reporter's own conversation with the creator.** Devon has no
  AI workspace on the stack, so nobody can talk to, report or ask him. Pause Maya, and reset
  afterwards.
- **The public summary lists 20 offers.** Before #470, leftover scenario offers pile up past that,
  and `e4-9-public-summary` cannot find its own offer.
- **Logins reset on `up`.** `infra/local/stack.mjs up` gives every login role a new password. On
  main, `scheduler.mjs` re-applies the inbox login on each start.
- **Hand-applied migrations.** Once main registers a migration you applied by hand, `up` fails with
  "The canonical migrations were refused". The fix is a `reset`, on your own database only.
- **Catalogue pins.** A migration that grants on, or adds policies to, `creator_profile`,
  `fan_profile` or `message` changes catalogue pins, and the stock backend then refuses to start
  (`usage_expiry_catalogue_changed`).
  - Apply such a migration only after the backend has started.
  - Remove it afterwards (`share-host-control.mjs` on #459).
- **Growth scenarios** need the stack with `--growth`: `e4-3-notices` (#453) and `e4-1-share-card`
  (#459).
- **Sign-in in the built-in browser** must start from `http://localhost:56442`, not `127.0.0.1`.
- **Shell (zsh):**
  - `$var` is not split into words;
  - an unmatched glob aborts the whole line;
  - after each command, the shell's directory returns to the session's worktree.
- **The trust worker hides error codes on main** (`effect_hook_error`). #440 (lane 1) keeps them.
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

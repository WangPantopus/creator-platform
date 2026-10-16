# Lane 4: handoff, 2026-10-15 (evening, Pacific time)

This is where the next lane 4 session starts. Read it first, then `lane-4.md` (status, pull requests,
tickets) and `lane-4-decisions.md` (the founder's open and settled decisions). Both are in this
directory, on branch `lane-4/status-refresh` (#447) until that pull request is merged.

## State at handoff

Nothing is in flight. Every lane 4 branch is pushed, and the working tree is clean. The founder
interrupted the start of WP 4.12, so no WP 4.12 code exists yet.

**Merged on main:** #408, #410, #416, #418, #421, #423, #424, #427, #428, #429.

**Open (CI had no failures at handoff; #447, #459 and #463 were still running):**

| PR           | Branch                        | What                                                                                        | Waits on                                                                     |
| ------------ | ----------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| #425 (draft) | `lane-4/inbox-login`          | Non-owner login that claims processor notifications                                         | migration registration                                                       |
| #447         | `lane-4/status-refresh`       | Status, decisions and this handoff                                                          | merge                                                                        |
| #448         | `lane-4/share-grant-id`       | The share call returns `grantId` and `version`                                              | merge                                                                        |
| #449         | `lane-4/summary-members-only` | The public summary marks `membersOnly`; its headline describes an offer any fan can ask for | merge                                                                        |
| #450         | `lane-4/inbox-outage-fresh`   | `e4-3-inbox-outage` makes its own inbox login                                               | merge                                                                        |
| #453         | `lane-4/request-notices`      | Request notices recorded, handed to growth and withdrawn; one `commitment_due` reminder     | integrator wiring; production also needs a W8 worker denial (lane 1) and Q16 |
| #459 (draft) | `lane-4/share-card-owners`    | Share cards: `shareSource` / `shareStatus`                                                  | migration registration, five catalogue pins, reviews by lanes 1 and 3        |
| #463         | `lane-4/settle-departure`     | `settleDeparture`, a paused creator's open requests (P1 confirmed)                          | integrator wiring                                                            |

**Decided this session:** P1, confirmed by the founder (`lane-4-decisions.md`, "Decided").

**Still open for the founder:**

- decisions 1 to 5 in `lane-4-decisions.md`;
- Q16 (commerce retention on deletion);
- Stripe test keys (WP 4.7);
- the reminder timing (#453): the smaller of 24 h and a quarter of the delivery window.

## Next work: WP 4.12, as the founder asked

> "Build the backend field for 'ask for more information' first, and propose the fan and Offers
> copy for my approval."

Source: `docs/operations/launch-review-2026-10-08.md:220`. The UI half is lane 6's WP 6.6
(`docs/lanes/lane-6-creator-studio.md:69`). `Studio.tsx` is lane 6's file: never edit it.

1. **A separate field for "Ask for more information" (backend, do this first).**
   - **Today:** the decision command overloads `text`. `DecidePacket` in `packages/api/src/commerce/contracts.ts:277` has one `text` for both the reply and the question. `decide()` in `apps/backend/src/modules/commerce/service.ts:1602-1625` stores `body.text` as `packet.question` when `action === "more_info"`, so the Studio sends its reply draft as the question (`Studio.tsx:2467`).
   - **Proposed:** an optional `question` field (trimmed, 1 to 8,000 characters) used for `more_info`. Keep accepting `text` there for older clients, or refuse it; propose which in the pull request.
   - **Then:** regenerate everything (`pnpm generate`; check with `pnpm generate:check`), and write a scenario (for example `tests/scenarios/lane-4/e4-2-more-info.mjs`). The fan's answer path is `moreInfo()` at `service.ts:1742` (`MoreInfoReply`).
   - **Edge cases to run:** a question with a reply draft present; empty; too long; a second question while one is pending (`question_pending`); the fan answers; the wrong person; a repeat with one key.
2. **The "Let AI answer" outcome copy (needs the founder's approval).**
   - **Today:** `action: "ai_answer"` releases the hold like a decline (`service.ts:1576-1600`, `reason='ai_answer'`, end state `declined`), so the fan sees "{name} passed on this one · nothing charged" (`CommerceScreen.tsx:356`, copy key `declined`).
   - **To do:** propose a copy key for the `reason='ai_answer'` outcome, avoiding the forbidden words (Brief section 11; "Maya will reply" is forbidden). Show it on the fan's status screen. Also check what the phone apps show.
3. **Offers page copy (needs the founder's approval).** `CommerceScreen.tsx:2185` hard-codes the column "Refund if late", and `:2208` hard-codes every row as "Full refund". Propose copy keys that say the actual rule: a full refund if it is not delivered by the deadline.

The decision code is in `service.ts` near `decide()`. Open PRs #453 and #463 touch other parts of `service.ts` (`reconcileDeadlines`, and the new `releaseForDeparture` above it), so expect no conflict.

## Environment: reuse it, do not rebuild

The lane 4 stack was left **running** and was reset about half an hour before this handoff:

- PostgreSQL `qelvora-lane4-postgres` on 56440, 119 migrations;
- backend on 56441;
- web on http://localhost:56442;
- model fake on 56443;
- fake card processor on 56444;
- started with growth (`--growth`).

Nothing else is running: the scheduler (56445), share host (56446) and trust host (56447 and 56448) are stopped.

```sh
NB=$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies; export PATH=$NB/node/bin:$NB/bin/fallback:$PATH; export npm_config_manage_package_manager_versions=false
node infra/local/stack.mjs status --lane 4                        # what is running
node tests/scenarios/lane-4/stack.mjs up --ack-only --growth      # (re)start; reuses what is healthy
```

- **The backend runs the code that was checked out when it started.** At handoff that was `lane-4/settle-departure`. After switching to a new branch, restart the backend:
  1. `kill` the `backend` pid from `$TMPDIR/qelvora-stack/lane4/pids.json` (your own process);
  2. run the `up` line above.
- **Money tests** (required before every PR):
  ```sh
  export CREATOR_TEST_DATABASE_URL=$(node infra/local/stack.mjs env --lane 4 | sed -n 's/^CREATOR_TEST_DATABASE_URL=//p')
  (cd apps/backend && pnpm exec vitest run tests/commerce-money-*.test.ts)
  ```
  This uses the stack's own test database, and never prints the value.
- **Scenarios:** `node tests/scenarios/lane-4/run.mjs` (all), or `node tests/scenarios/lane-4/<file>.mjs`. Each ends with the 9-check invariant sweep. All 21 files passed on #453's branch.
- **Gates:** `pnpm exec turbo run typecheck --force --filter=@qelvora/backend --filter=@qelvora/web`, plus `pnpm exec eslint <files>` and `pnpm exec prettier --check <files>`.

## Traps (each cost time this session)

- **Logins reset on `up`.** `infra/local/stack.mjs up` gives every login role a new password. On main, `scheduler.mjs` re-applies the inbox login on each start.
- **Hand-applied migrations.** Once main registers a migration you applied by hand, `up` fails with "The canonical migrations were refused". Fix: `node tests/scenarios/lane-4/stack.mjs reset --ack-only --growth`, about 3 minutes, on your own database only.
- **Catalogue pins.** A migration that grants on or adds policies to `creator_profile`, `fan_profile` or `message` changes catalogue pins, and the stock backend then refuses to start (`usage_expiry_catalogue_changed`). Apply such a migration only after the backend has started, and remove it afterwards (`share-host-control.mjs` on #459).
- **Pausing Maya.** `e4-3-departure` (#463) pauses Maya, there is no unpause, and the scenario stops the stack's backend. Reset the stack after it.
- **Growth scenarios** need the stack with `--growth`: `e4-3-notices` (#453) and `e4-1-share-card` (#459).
- **Sign-in in the built-in browser** must start from `http://localhost:56442`, not `127.0.0.1`.
- **zsh** does not split `$var` into words, and an unmatched glob aborts the line.
- **The trust worker hides error codes on main** (`effect_hook_error`). #440 (lane 1) keeps them.
- **The machine is shared.** Load can be high. Rerun before calling something a regression.

## Rules that bite (the founder's)

- No subagents.
- No new unit tests: prove everything end to end, failing first where it applies.
- One concern per PR, on `lane-4/<topic>` cut from the latest origin/main.
- Never merge or force-push. Never edit `server.ts`, `integration.ts`, `Studio.tsx`, `infra/migrations.json` or other lanes' files: file a ticket instead.
- Copy, money semantics and invariants go to the founder: propose a default and keep going.
- End every message to the founder with "Working on / Waiting on / Next".

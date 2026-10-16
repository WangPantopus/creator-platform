# Lane 6: prompt for the next session (written 2026-10-16, after WP 6.9)

Paste everything below the line into a new session.

---

You are resuming Qelvora lane 6, "Creator Studio (web)", from its 2026-10-16 handoff (after WP
6.9). Same lane, new session. Write to the founder in plain words.

RULES (the founder's): work alone: no subagents, workflows or other sessions. No new unit tests:
prove every change end to end with edge cases (working agreement section 3). Never merge, push to
main, force-push or rebase a pushed branch (merge origin/main into your branch); one concern per
pull request titled "[lane 6] <WP>: <what>". Stay in your lane's files and file tickets for the
rest. Migrations: write the SQL, apply it by hand to your own database, describe it in the pull
request, keep going; the integrator registers it. For decisions (invariants excepted), take the
proposed default, record it in the status file's Decisions as "taken as the proposed default",
and keep working (the founder's standing instruction, 2026-10-16). Be honest; say "not run" for
what you did not run.

START (about five minutes; nothing needs rebuilding):

1. Check you are in your own worktree (`git rev-parse --show-toplevel` contains
   `.claude/worktrees/`), then `git fetch origin`. Toolchain:
   `NB="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"; export PATH=$NB/node/bin:$NB/bin/fallback:$PATH npm_config_manage_package_manager_versions=false CI=1; pnpm install --frozen-lockfile --offline`
   (about 10 seconds).
2. Read the "Resume here" section of `docs/lanes/status/lane-6.md` (from `origin/main` if the
   WP 6.9 pull request is merged, otherwise
   `git show origin/lane-6/no-polling:docs/lanes/status/lane-6.md`), then
   `docs/lanes/status/lane-6-wp-6-9.md`.
3. Check the two open lane 6 pull requests: #443 (WP 6.2, Today) and the WP 6.9 pull request
   (`lane-6/no-polling`). If #443 merged and WP 6.9 did not: merge `origin/main` into
   `lane-6/no-polling`. `Studio.tsx` conflicts: keep both sides, and change `routeView`'s
   default screen from `"notes"` to `"today"`. In `lane-6.md` and this file, keep the WP 6.9
   side, which already contains #443's text. A local branch `scratch/6.9-with-443` (never
   pushed) holds a resolved merge that passed the E6.2 scripts; reuse its `Studio.tsx`.
4. Start the stack in the background:
   `node infra/local/stack.mjs up --lane 6 --provider anthropic --growth` (about a minute).
5. E6.1 captures are in `$HOME/.cache/qelvora-lane6/e6-1/` (README there). To compare a capture
   from before WP 6.9 with one after, use `e6-1-compare.mjs --across-6.9`.

NEXT FOR LANE 6 (only on the founder's go): see "Next" in `lane-6.md`. First, once the
integrator's tab bar change is on `main`: the one-line change marking Today as the current tab
on Notes and in the composer (the `active` mapping in `apps/web/features/studio/Studio.tsx`),
then rerun E6.1.

Traps: after changing a backend file or `config/navigation.json`, restart the stack's backend
(stop its pid, listed in `$TMPDIR/qelvora-stack/lane6/pids.json`, then run `up` again), or the
old code keeps answering. Never edit web source while an E6.1 capture runs. A wait loop on
`pgrep -f <pattern>` matches its own command line; use `pgrep -f "[e]6-1-run"`. Ports: 56460
to 56463 the stack, 56464 and 56465 your E6.1 runs, 56466 and 56467 a baseline from a clean
copy. A foreground `sleep` is blocked: wait with background commands. Headless Chrome always
reports a page as visible (Playwright cannot make a real background tab); `e6-9-recover.mjs`
says how it stands in.

When you stop: take the stack down (`node infra/local/stack.mjs down --lane 6`), update
`docs/lanes/status/lane-6.md`, and end with Working on / Waiting on / Next.

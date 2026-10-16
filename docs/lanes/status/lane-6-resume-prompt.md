# Lane 6: prompt for the next session (written 2026-10-16)

Paste everything below the line into a new session.

---

You are resuming Qelvora lane 6, "Creator Studio (web)", from its 2026-10-16 handoff. Same lane,
new session. Write to the founder in plain words.

RULES (the founder's): work alone: no subagents, workflows or other sessions. No new unit tests:
prove every change end to end with edge cases (working agreement section 3). Never merge, push to
main, force-push or rebase a pushed branch (merge origin/main into your branch); one concern per
pull request titled "[lane 6] <WP>: <what>". Stay in your lane's files and file tickets for the
rest. Migrations: write the SQL, apply it by hand to your own database, describe it in the pull
request, keep going; the integrator registers it. Stop and ask the founder, with a proposed
default, about invariants, money semantics, the safety posture, engine revisions, user-facing
copy, secrets, accounts and downloads. Be honest; say "not run" for what you did not run.

START (about five minutes; nothing needs rebuilding):

1. Check you are in your own worktree (`git rev-parse --show-toplevel` contains
   `.claude/worktrees/`), then `git fetch origin`. Toolchain:
   `NB="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"; export PATH=$NB/node/bin:$NB/bin/fallback:$PATH npm_config_manage_package_manager_versions=false CI=1; pnpm install --frozen-lockfile --offline`
   (about 10 seconds).
2. Read, in this order: the "Resume here" section of `docs/lanes/status/lane-6.md` (from
   `origin/main` if #443 is merged, otherwise
   `git show origin/lane-6/today-note:docs/lanes/status/lane-6.md`); sections 0, 3 and 7 of
   `docs/lanes/01-working-agreement.md`; the WP 6.9 and E6.9 rows of
   `docs/lanes/lane-6-creator-studio.md`. The rest of the pack is unchanged; open it only for a
   specific question.
3. Check #443, "[lane 6] 6.2: Today and the Note composer":
   `gh pr view 443 --json state,mergedAt`. On 2026-10-16 its CI was green (5 of 5) and it was
   mergeable. Branch `lane-6/<topic>` from `origin/main` either way: WP 6.9 does not need #443.
   If #443 merges later, merge `origin/main` into your branch; expect a small conflict in
   `apps/web/features/studio/Studio.tsx` only.
4. Start the stack in the background:
   `node infra/local/stack.mjs up --lane 6 --provider anthropic --growth` (about a minute, fresh
   database; the E6.2 scripts seed their own state; run `e6-2-note.mjs` first).
5. Do not capture a new E6.1 baseline unless you must: saved captures are in
   `$HOME/.cache/qelvora-lane6/e6-1/`, and its README says which folder matches your base and how
   to recapture if Chrome is no longer 155.0.8059.84.

NEXT FOR LANE 6 (the founder's go): WP 6.9, replace Studio's 4-second polling, and nothing else.
Also, once the integrator's tab bar change is on `main` (Today replaces Notes as the first tab,
ticketed on #443), make the one-line change that marks Today as the current tab on Notes and in
the composer (the `active` mapping in `apps/web/features/studio/Studio.tsx`). Then stop and report.

WP 6.9 facts (at `origin/main` dea51a4ff, paths under `apps/web/features/studio/`):

- 4-second timers: `Studio.tsx:185` (the role check), `notes/Notes.tsx:94`,
  `threads/Threads.tsx:219`, `team/Team.tsx:129`, `thanks/ThanksFeed.tsx:67`,
  `ApprovedReply.tsx:211`, `CorrectionReply.tsx:178`. The requests badge
  (`shell/useRequestsCount.ts:53`) is meant to poll every 15 seconds but reruns every 4, because
  its effect depends on `creator.roles`, a new array on every role check. Today does not poll.
- Most of them feed a 5-second authority lease: Studio hides itself ("Reconnect to Studio") and
  Notes, Threads and Team hide their content when no check succeeded in the last 5 seconds.
  Removing the polls without changing the lease would hide Studio after 5 seconds. Changing the
  lease is a safety-posture decision: design it (for example, re-check on every action, on focus
  and on return, plus a server push for role changes), then ask the founder before changing it.
  There is no Studio push channel today.
- Round 1 measured about 75 requests a minute on an open Notes screen, and a tap is silently
  dropped while a refresh runs (`shared/action.tsx:10`).
- E6.9 asks: the network log shows no 4-second polling; updates still arrive; reconnect after
  sleep; a background tab. Keep E6.1 and the five E6.2 scripts green.

Traps: after changing a backend file or `config/navigation.json`, restart the stack's backend
(stop its pid, listed in `$TMPDIR/qelvora-stack/lane6/pids.json`, then run `up` again), or the
old code keeps answering. Never edit web source while an E6.1 capture runs. Ports: 56460 to
56463 the stack, 56464 and 56465 your E6.1 runs, 56466 and 56467 a baseline from a clean copy.
A foreground `sleep` is blocked: wait with background commands.

When you stop: take the stack down (`node infra/local/stack.mjs down --lane 6`), update
`docs/lanes/status/lane-6.md`, and end with Working on / Waiting on / Next.

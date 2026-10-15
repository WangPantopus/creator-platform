# Lane 5 resume prompt (2026-10-09)

Paste everything inside the block into a new session as its first message. It replaces the generic
START steps of [the lane 5 prompt](../prompts/lane-5.md) because this lane is resuming, not
starting. The state it describes is in [lane-5-handoff.md](lane-5-handoff.md).

```text
You are lane 5 of the Qelvora launch program, "Presence and reach", RESUMING after a clean handoff on 2026-10-09. This is not a fresh start: round 1 and most of round 2 are done and merged or open. Seven sessions work in parallel in separate git worktrees; a separate integrator merges. The founder reads what you write, so use plain words.

READ FIRST, IN THIS ORDER (these replace the generic START steps of docs/lanes/prompts/lane-5.md)
1. Check that `git rev-parse --show-toplevel` contains `.claude/worktrees/` (if not, stop and tell the founder). Run `git fetch origin`.
2. The handoff lives only on an unmerged branch. Run `git switch lane-5/notice-snapshots` (if git says it is already checked out in another worktree, use `git switch --detach origin/lane-5/notice-snapshots` and make your own branch for any commit), then read in full: docs/lanes/status/lane-5-handoff.md and docs/lanes/status/lane-5.md. They are the source of truth for state, decisions, environment and next steps. Only afterwards, and only as needed: docs/lanes/01-working-agreement.md, docs/lanes/lane-5-presence-reach.md (the WP rows) and docs/lanes/02-contracts.md. Do not re-read the whole briefing pack.
3. Check that reality matches the handoff before you act: `gh pr list --state all --limit 200 --json number,title,state,headRefName,baseRefName --jq '.[] | select(.headRefName|startswith("lane-5/"))'`; `git ls-remote origin 'refs/heads/lane-5/*'`. Expected: #365 and #366 merged (main at or after 169b5d94f); #372 (lane-5/delivery-queue, head 02ca07e16, targets main) and #373 (lane-5/note-mute-read, head c799c9bd0, base lane-5/delivery-queue) open; lane-5/notice-snapshots pushed with no pull request. If anything differs (a pull request merged, a branch moved, a check failed, the founder answered), say so in your first message and adjust.

WHERE THINGS STAND (handoff section 1 has the state and file paths; section 7 the known gaps)
- Merged: #365 (WP 5.1: contract C4, Notes and reactions in the fan's thread) and #366 (WP 5.2a: Note and reaction notices).
- Open: #372 delivery queue and in-session retry (no migration); #373 a member who muted a creator's Notes is not pushed (migration pending_w5_note_mute_read.sql), stacked on #372. CI was still running at handoff.
- Pushed with NO pull request, on purpose: lane-5/notice-snapshots, option A (owner notice records for answers, request status, offers, call reminders, commitments; migration pending_w7_notice_snapshot.sql), stacked on #373. The working agreement allows one migration pull request at a time. Do not open it unless the founder says so (question Q1) or #373 has been registered or merged. Its pull-request text is already drafted in handoff section 9.
- DO NOT REDO: contract C4, thread presence, Note and reaction fan-out with 500-recipient chunks, the delivery queue and retry, the mute function, the owner notice records with export and erasure, the scenario host and its 13 scripts (tests/scenarios/lane-5/). Verified at handoff: whole suite 12 scripts, 69 steps pass, 1 not run (reaction undo does not exist); existing backend suites 157 of 157.
- Founder decisions already made, do not reopen (handoff section 1): option A; the small mute migration; Notes rendered at read time; a new member sees earlier Notes; no reaction undo in the pilot; an edit tells no one again and followers or group Notes tell no one yet.
- Open questions Q1 to Q5 with defaults are in handoff section 2. Founder's answers since the handoff: [PASTE THEM HERE, or write "none yet"].

HARD RULES (the founder's; they do not bend)
1. Work alone. No subagents (no Agent tool, workflows, background agents or other sessions). Background shell commands for servers and builds are fine.
2. Write no new unit tests. Prove every change end to end on a real server and a real PostgreSQL through the workflows a person would follow, normal path and edge cases (wrong person, wrong state, repeat, race, boundary, failure, restart). Fakes only at the outer edge (payment processor, model, push gateway, clock, development identity); say which. Check the state behind the screen. Say "not run" for anything you did not run. Compiling is not working.
3. Never merge, push to main, force-push, rewrite history or enable auto-merge. The founder's one-time permission to merge covered only #365 and #366, and both are merged; every other merge is not yours. Your pushed branches (delivery-queue, note-mute-read, notice-snapshots) are shared history: never rebase them; bring a base branch's new commits forward with `git merge`. One concern per pull request, on a branch lane-5/<topic>, titled "[lane 5] <WP>: <what>".
4. Stay in your lane: modules/{growth,content}, features/{growth,content}, the listed web routes (home, discover, creators, invite, share, verify, notifications, unsubscribe, sitemap), tests/scenarios/lane-5/, docs/lanes/status/lane-5*.md, copy keys in config/copy.json, and your own domain's schema file in packages/api/src (then regenerate). Anything else is a ticket (owner lane, file, change, why). Never edit infra/migrations.json, generated files by hand, server.ts, integration.ts or other docs. Migrations: write the SQL next to its module as pending_*.sql, apply it by hand to your own disposable database, describe it in the pull request, and let the integrator register it; one migration pull request at a time.
5. Stop and ask the founder (propose a default, keep working on something unblocked) if an invariant (INV-01 to INV-25) would bend; money semantics, the safety posture, an engine revision or user-facing copy would change; you need a secret, an account or a download; a contract is wrong; another lane needs your file; or you are about to spend about a day on something unplanned. Never read or print credentials or .env files.
6. Be honest. Report failures with the output.

YOUR NEXT WORK (handoff section 3 has the detail)
0. Housekeeping, a few minutes: `gh pr checks 372` and `gh pr checks 373` once. Fix any failure with a new commit on that branch, then `git merge` it forward into lane-5/notice-snapshots. If #372 has merged, run `gh pr edit 373 --base main`. Do not poll CI repeatedly.
1. WP 5.6, cut from the latest origin/main (`git switch -c lane-5/<topic> origin/main`), not from the open stack: none of the next work packages depends on #372, #373 or the notice-snapshots branch. The public creator page (contract C8, star row E5.5), the parts that are not gated: cache and rate-limit the public read path (today every page view takes a row lock twice and a page of posts again), write the C8 contract note, designed empty states and plain-text rendering in the web page, and scenario e5-5-public-page.mjs. The author of biography, category and photo caption is the founder's question Q2; if there is no answer, take the default in the handoff and say so.
2. Then 5.7, 5.8, 5.4, 5.5, 5.9, 5.10 and 5.3 on the fake gateway, in that order unless the founder reorders.
3. Open a pull request per concern, each with a results table (ID, steps, expected, observed, pass / fail / not run, evidence), the fakes named, the defects you found in your own work, what was not checked, and decisions you need. Star rows E5.1, E5.2, E5.3, E5.5 and E5.7 must pass before the integrator merges.

ENVIRONMENT (handoff section 4)
- node and pnpm exist only in the Codex runtime; put /Users/yingpengwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin and .../dependencies/bin/fallback on PATH in EVERY command that runs them, and export npm_config_manage_package_manager_versions=false.
- All my containers and hosts were removed. Recreate only when you need to run scenarios: `sh tests/scenarios/lane-5/setup.sh`, then `sh tests/scenarios/lane-5/run-all.sh` (about 14 minutes). Ports 56450 to 56459, containers qelvora-lane5-*. Remove your containers when you finish.
- The Mac is shared by seven lanes: check `uptime`; above about 15, timing-sensitive tests (T-11, the scale latency, the self-retry scenario) can fail for load, not for a bug. Say the load in any pull request.
- The shell is zsh: an unquoted $VAR is not split into words (use arrays or xargs); foreground sleep is blocked (run long jobs in the background and wait for the notification). Other gotchas: handoff section 5.

WHEN YOU STOP
Write to the founder in under 600 words in plain words: pull requests opened, what each does, scenarios run with results, what was not run, defects found, decisions you need, tickets, the commands to re-run. Then end with three lines:
Working on: what is in progress (branch or pull request)
Waiting on: what you need and from whom, or "nothing"
Next: the next two or three things, in order
Before a long stop, update docs/lanes/status/lane-5.md and lane-5-handoff.md, commit, push, and shut down everything you started.
```

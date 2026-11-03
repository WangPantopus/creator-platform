# Lane 2: next-session kickoff prompt

Copy the text below into the next lane 2 session. The status file is the source of truth;
this prompt explains how to find it and continue without repeating completed work.

```text
You are resuming Qelvora lane 2, "Platform and hosting", from the 2026-10-09 handoff.
You are the same lane, not a new assignment. Work alone and write to the founder in plain words.
Continue authorized lane work until it is complete or requires a real founder/owner dependency.

READ FIRST
In your supplied isolated worktree, use an explicit cd for every shell command. Run git fetch
origin, then read git show origin/lane-2/load-soak:docs/lanes/status/lane-2.md, especially
"Resume here" and "Final handoff verification". Main may not have this handoff yet. Do not
switch a branch attached to another worktree or alter that worktree; read through git show.

Then read:
1. docs/lanes/status/lane-2-load-soak.md from the same branch: actual results, exact commands,
   failures, limits and owner tickets.
2. The earlier audit from origin/lane-2/resume-status-20261009:docs/lanes/status/lane-2.md.
   It contains the original reviewed heads and immutable links to session 1's evidence.
3. The production-root, catalogue-pins and hosting-options notes linked there. If not on main,
   use git show 69ca75941dcaad02dda700d548971006a5bbd9a9:docs/lanes/status/<filename>.
   Read the local stack README too. Reuse the work; do not redo the hosting research.
4. Current origin/main versions of docs/lanes/prompts/lane-2.md,
   docs/lanes/lane-2-platform-hosting.md, docs/lanes/00-charter.md,
   docs/lanes/01-working-agreement.md, docs/lanes/02-contracts.md,
   docs/lanes/03-coverage.md, docs/operations/CURRENT.md and infra/local/README.md.
   The model gateway instructions changed on main after these load measurements.
5. Available memory entries lane-2-state-2026-10-09, feedback-clean-handoffs and
   local-dev-toolchain-recipe. If unavailable, the handoff and working agreement contain the
   needed state and node/pnpm recipe. Do not search credentials or environment files.

WHAT IS DONE — VERIFY CURRENT STATE
- #367: WP 2.1 local stack is on main; historical E2.1 22/22.
- #370, #377, #378: production host, catalogue tool and hosting options were completed,
  but merged into old lane bases. At final fetch their original reviewed heads still were
  not on main. The integrator must finish landing them; do not merge or retarget for them.
  Historical E2.2 144/144 and E2.9 19/19 have specific limits in their notes; not re-run here.
- #380: open, ready, base main; branch lane-2/resume-status-20261009, pushed head
  1c3b19e176e7854b2204469431b79f21381d1393. It records the audit and founder approvals.
- #384: open, ready, base main; branch lane-2/load-soak. It contains three real load scenarios,
  two helpers and evidence/handoff notes. Code commit b69a58ad2, final measurements 30fd0d96b,
  followed by the handoff update. Use the remote tip, not a stale local commit.
- Public ramp: at 16 readers, ten client deadlines and one 503 growth_connection_unavailable;
  recovery 200. Fresh worker run: one reply failed, one delivered; first output took 42 s.
  Both receipts settled, retries matched and wrong-person refusals passed. Overall E2.8 fails.
- Eight idle sockets passed 1,800 s with two planned session renewals and no unexpected close.
  Heap diagnostic passed; RSS rose about 15.6 MiB. Earlier active-run sockets closed 1013.
  Neither result cancels the other. This does not qualify production capacity or prove no leak.
- Multiple worker processes, sustained streaming, 500 distinct fans and hosted E2.3–E2.7:
  NOT RUN. Typecheck, ESLint, Prettier and diff checks passed. No new unit tests.
- Main reached 21b3d4836340b0ad494dd0faa8adb041d8e244fa with the integrator's model adapter/
  gateway PR #381. Load results used the earlier c0b4ac0 base; no claim about the newer runtime.

FOUNDER DECISIONS — DO NOT ASK AGAIN
The founder authorized continuing lane work, including WP 2.8. Lane 1 may explicitly mark
pilot calls/voice not_offered so those rows do not block readiness; failures of offered
capabilities still block. The integrator may implement scoped fingerprints excluding
relations a role cannot reach. Lane 2 does not own those feature files. Neither approval
was implemented by the load-scenario PR.

STILL NEEDED
Hosting road/provider/region, monthly ceiling, web/API domain and owning account. The saved
default is road 1 (reviewed migration tool unchanged), Fly.io Ashburn plus Crunchy Bridge
in AWS us-east-1, conditional on the scratch-database superuser check. Do not treat it as a
founder decision. No secret, purchase or deployment is authorized by this prompt.

WHERE TO RESUME
Read PR #384/#380 reviews and main once; do not poll CI. Fix own review feedback on its own
branch with new commits. Preserve the latest status if older documentation PRs overlap it.
Check the lane 3/5 tickets: generation scope/recovery, socket authority deadline, supported
worker concurrency and public read saturation. Re-run only affected scenarios after fixes;
do not weaken expected results or edit their feature modules. If hosting is decided, verify
the provider's claimed true superuser on a scratch database before building WP 2.3 staging
as code in a new PR. Nothing deploys without the integrator. WP 2.4–2.7 wait for hosting.
If neither gate has moved, report precisely what is needed rather than repeat unchanged runs.

HARD RULES
No subagents, Agent tools, workflows or background agents. No new unit tests. Operate real
backend/PostgreSQL/browser/device paths as appropriate; inspect durable state. Fakes only at
the outer edge, named in the report. These measurements used development identity and model.
The new shared model gateway is founder-run. Load loops must use the fake. Never read its
key, start/stop it, or use a paid model in a load loop. Follow current working agreement 3.6.

Own only the charter's operations/production composition/infra/deployment files, excluding
the migration registry and reviewed generated pins; tests/scenarios/lane-2/; lane-2 status
notes; permitted copy keys and own schema. Feature modules, server.ts, integration.ts,
config.ts, app.ts, features.ts, scripts/*, root package.json and other docs need owner tickets.

Never merge, push main, force-push, rewrite history or enable auto-merge. Branch lane-2/<topic>,
one concern per PR, title "[lane 2] <work package>: <what>". PR sections: What this does / Why /
Scenarios run (results table) / Not checked / Risk and rollback. End the body with
🤖 Generated with [Claude Code](https://claude.com/claude-code)
End commits with Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>.

Ask the founder, propose a default and continue unblocked work when invariants, money,
safety, engine revisions or user-facing copy would change; a contract is wrong; a secret,
account or download is needed; another lane needs your file; or unplanned work takes a day.
Use only ports 56420–56429 and qelvora-lane2-* containers. Never touch preserved/other-lane
databases, containers or devices. No credential/env-file reads, pkill -f, stash, reset --hard,
clean -fdx, worktree remove or docker system prune. No foreground sleep or timeout command.
Report failures with their output and say "not run" when appropriate. Compiling is not working.

MACHINE AND CLEANUP
The lane 2 stack was torn down; no owned containers, volumes, listeners or state directory
remained. Scenario processes exited and scratch logs were removed after recording evidence.
The working tree was clean and branches pushed. Recheck this, do not assume it. Cached
dependencies/image are reusable; downloads need approval. Use the documented toolchain.
At most five data requests per fan/hour; delete locks that fan out of a creator; a catalogue
mismatch can latch a backend until restart. Failed generation can require rebuilding only
your disposable stack. Never manually settle costs to make a test pass.

Before stopping: update lane-2.md and the affected note, commit/push every changed branch,
open/update its PR, run node infra/local/stack.mjs down --lane 2 for anything you started,
remove your scratch files and verify cleanup. Keep final reports under about 600 words.
End EVERY message to the founder with:
Working on:
Waiting on:
Next:
```

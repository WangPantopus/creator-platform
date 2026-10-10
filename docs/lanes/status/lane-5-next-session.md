# Lane 5 kickoff prompt

Copy the text below into the next session. Add any new founder/integrator answers
at the end. The handoff, not old branch-local status snapshots, is authoritative.

```text
You are lane 5 of Qelvora, “Presence and reach”, resuming after the 2026-10-09
handoff. This is not a fresh start. Work alone; no subagents or other sessions.
The founder reads your reports: use plain words and keep working on unblocked
work. Do not redo completed packages or reopen approved decisions.

READ FIRST, IN ORDER
1. Check git rev-parse --show-toplevel and git status. The previous session was
   explicitly allowed to use the isolated Codex worktree at
   /Users/yingpengwang/.codex/worktrees/bf8e/creator-platform after the original
   .claude/worktrees path guard stopped it. Do not work in the primary checkout.
   If the worktree is neither that authorized location nor a .claude/worktrees
   checkout, stop and explain the path mismatch. Never discard local changes.
2. Run git fetch origin. The current handoff lives on the UNMERGED branch
   origin/lane-5/reaction-withdrawal (PR #400), not necessarily main. Read in full:
   git show origin/lane-5/reaction-withdrawal:docs/lanes/status/lane-5-handoff.md
   git show origin/lane-5/reaction-withdrawal:docs/lanes/status/lane-5.md
   Then read only the relevant concern note, working agreement, WP rows and
   contracts needed for the next action. The charter and coverage were already
   read; check changes rather than restarting the whole briefing pack.
3. Reconcile reality before acting:
   gh pr list --state all --limit 200 --json number,title,state,headRefName,baseRefName,isDraft --jq '.[] | select(.headRefName|startswith("lane-5/"))'
   git ls-remote origin 'refs/heads/lane-5/*'
   Report changed branches, merges, failed checks or new founder answers in the
   first update. Check a relevant PR's CI once when needed; never repeatedly poll.

EXPECTED STATE
- Main was 21b3d4836 (integrator's Anthropic adapter merge).
- #365/#366/#372 are on main. #373 merged into the delivery branch AFTER #372
  closed, so main lacks its mute fix. #385 carries BOTH pending_w5_note_mute_read.sql
  and pending_w7_notice_snapshot.sql. Never assume #373 reached main.
- Open: #385 owner notices/mute; drafts #388 public withdrawal, #389 public page
  (base #388), #392 human-only share cards, #393 launch kit, #394 Android retention,
  #395 digest owner handoff, #396 C9 metrics evidence.
- The founder's final handoff request authorized opening the previously held
  branches as drafts: #397 invite note/form, #398 profile fields, #399 creator
  web push, #400 reaction withdrawal. All work was pushed. #385 remains first
  for migration registration; review/registration stays serial. Draft publication
  is not permission to register SQL, bypass review, merge or ship blocked work.
- #397/#398/#399 received a normal merge from main for publication. Their earlier
  workflow results were NOT rerun for that merge. #400 has post-merge proof:
  six new cases + restart, backend 157/157, typecheck 7/7 and changed-source lint.
- All lane 5 servers, containers and temporary development keys were removed.
  No lane 5 ports were listening. Recreate only for a concrete scenario.

WHERE TO RESUME
1. Reconcile #385 registration/merge and owner tickets with current main. Fix any
   relevant lane 5 CI failure in a new commit; merge base fixes forward normally.
2. If the integrator has admitted GET /launch in the web BFF, finish #393 browser
   sharing/retry proof. If migrations are registered, finish the corresponding
   stock-host scenarios, starting with the now-unblocked concern. Do not recreate
   already-built invite, push, profile or reaction implementations.
3. Follow the handoff's ticket list: real share source/grant/hash/revocation owners
   for E5.7; profile form and capacity for E5.5; Studio browser worker/account
   lifecycle; digest publication/outcome connections; metrics context and durable
   replay contract; useful-answer outcome and first-answer recovery. Finish each
   newly connected end-to-end path before calling that work package complete.
4. If no dependency changed, inspect the actual owner gap and update its precise
   ticket/evidence. Do not invent a private owner callback, custody, cohort, zero
   metric or successful workflow to create progress. Keep working on independent
   work when a decision is pending.

DECISIONS ALREADY MADE — DO NOT ASK AGAIN
- Option A owner notice records; limited mute reader; Notes rendered at read
  time; new members see earlier Notes; no reaction undo in pilot; edits notify
  nobody again; no follower/group fan-out yet.
- Q2 default: growth owns biography/category/photo-caption storage and endpoint;
  lane 6 owns the form.
- Invite label “Your invitation note (optional)” and hint “This note is public
  to anyone with the link. Up to 600 characters.” approved and implemented.
- Share cards are human replies only; AI and approved drafts are refused.
- web-push package download approved and completed. No new download needed.
- Hold iOS retention until lane 7 supplies safe background presentation.
- Limited boolean reaction reader approved; integrator privacy review required.
- Opening #397–#400 as drafts for this handoff is authorized. Their registration
  and merge gates remain; no general permission to change safety or money rules.

STILL OPEN
- Biography/date copy; use existing copy until answered.
- Real domain/HTTPS origin and Apple/Android association identifiers (Q4).
- Ten-fan aggregate privacy review (Q5); keep current thresholds.
- Who assigns expert/companion cohorts, and what genuine authority permits
  durable metric replay? Do not guess or save/mint an Actor.
Known failures remain in the notes: missing arrival/follow metric rows, launch
share BFF 404, profile catalogue refusal, first-answer terminal recovery loop,
and two unexplained invite 503s at the limit under higher load. E5.5/E5.7 and
real devices/digests/metrics are not all green. Read the results, not just titles.

HARD RULES
- No new unit tests. Prove behavior through real HTTP/browser/device workflows
  and PostgreSQL: normal, wrong person/state, repeat, race, boundary, failure,
  restart. Name edge fakes and fixture limitations. Inspect stored state. Say
  “not run” when appropriate; compiling is not evidence of working behavior.
- Never merge PRs, push main, force-push, rebase shared history, amend old commits,
  enable auto-merge or use the shared stash. One concern per lane-5/<topic> branch,
  PR title “[lane 5] WP …: …”. Bring shared bases forward with git merge.
- Own modules/{growth,content}, features/{growth,content}, listed public web
  routes (home, discover, creators, invite, share, verify, notifications,
  unsubscribe, sitemap), tests/scenarios/lane-5/, docs/lanes/status/lane-5*.md,
  approved copy keys and own API schema with regeneration. Everything else is
  a ticket naming owner, file, change and why. Never hand-edit generated files,
  infra/migrations.json, server.ts, integration.ts or other docs.
- Pending SQL stays beside its module and is applied only to this lane's
  disposable DB. Integrator registers/reviews. Never alter a custody checksum
  or guard to get around a startup refusal.
- Ask the founder before changing an invariant, money semantics, safety posture,
  engine revision, user-facing copy or a wrong contract; before a new secret,
  account/download; if another lane needs your file; or before about a day of
  unplanned work. Carry existing approvals forward. Never read/print credentials
  or .env files. Never message other sessions without explicit human authorization.

ENVIRONMENT
In EVERY shell command that runs Node/pnpm:
export PATH="/Users/yingpengwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/yingpengwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback:$PATH"
export npm_config_manage_package_manager_versions=false
gh is /Users/yingpengwang/.local/bin/gh. Check uptime; above ~15 can affect timing,
but report the failure rather than assuming load caused it. Ports 56450–56459,
containers qelvora-lane5-* only. Scenario setup/run/reset and manual pending SQL
commands are in each concern note. Stock: node infra/local/stack.mjs up --lane 5
--growth --no-smoke; cleanup: down --lane 5. Both DB hosts use 56450, so do not run
them together. The model default is now the Anthropic-shaped fake, no key needed.
Use installed Chrome. Do not download browsers. zsh does not split unquoted $VAR.

BEFORE A LONG STOP
Update lane-5.md and lane-5-handoff.md on the current source-of-truth branch,
commit and push, attach any created PR, stop/remove only resources you started,
verify cleanup. Report in under 600 words: PRs, behavior, results, failures,
not-run work, decisions/tickets and rerun commands. End with:
Working on: …
Waiting on: …
Next: …

Founder/integrator answers since this handoff: none supplied here; replace this
line with any new answers before starting.
```

# Lane 6: finishing the Studio split (handoff and recipe)

Written 2026-10-09 by the first lane 6 session, for the session that continues round 1. The integrator
moves this to its permanent place. Round 1 is WP 6.1 only: split `Studio.tsx` with no behavior
change, one pull request per area, then stop and report. Do not start WP 6.2 or anything else until
the founder sends "Next for lane 6".

## 1. Where things stand

Nothing is merged. Five pull requests are open, with #376 (the handoff) on top. Each branch is
cut from the one before because every area needs the shared layer, so they merge **bottom up**.

| Pull request | Branch (base)                              | What it holds                                                                                                                                                                           |
| ------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #368         | `lane-6/studio-split-harness` (`main`)     | The E6.1 proof: `tests/scenarios/lane-6/` (stand-in backend, capture, compare, move check, runner), the runbook and the status file. No product source change. Harness tip `45fcee40f`. |
| #371         | `lane-6/studio-split-shared` (harness)     | `shared/`: `types.ts`, `format.ts`, `action.tsx` (`useAction`, `Feedback`), `Modal.tsx`                                                                                                 |
| #374         | `lane-6/studio-split-thanks-more` (shared) | `thanks/ThanksFeed.tsx`, `more/More.tsx`                                                                                                                                                |
| #375         | `lane-6/studio-split-team` (thanks-more)   | `team/Team.tsx`                                                                                                                                                                         |
| #376         | `lane-6/studio-split-handoff` (team)       | This recipe, the extraction tool and its plan, the description generator, a move check that ignores formatting. No product source change.                                               |

Still to do, none started (their branches do not exist yet), each cut from the one before:
`lane-6/studio-split-notes`, `-library`, `-requests`, `-threads`, `-shell`, in that order. The
numbers #369, #370, #372 and #373 belong to other lanes.

`Studio.tsx` was 4,795 lines. On the handoff tip it is 3,747 and still holds `words`,
`navigationTree`, `studioSidebar`, `useRequestsCount`, `Studio`, `Notes`, `emptyBody`,
`scheduleInput`, `Compose`, `Requests`, `PacketDetail`, `Library`, `Threads` and `CorrectionForm`.
After the last pull request it is 408 lines: its imports and the `Studio` shell function.

Evidence so far: every area pull request compared 82 shots (41 screens and dialogs, Light and Night,
390 px) with today's code, all 636 `/api` calls and 1,090 Tab stops. The Team build was identical in
all 82 shots, pixel for pixel. #371 was compared with an earlier harness commit (its description
says so); the Team build contains #371's code and passed the final harness, so it is covered again.

`origin/main` has moved since the stack was cut (it was `b6e0f426a`; lane 5 merged #365 and #366, 8
commits). Nothing it changed touches Studio, the identity layer, `ui-web`, copy or lane 6's files; the
one dependency of the harness that changed is `packages/api/src/content.ts`, which gained 74 lines (the
stand-in checks its answers against those schemas). The stack is deliberately **not** merged up to
`main` yet: do that once, at the end (section 6), with a fresh golden.

Decisions the founder has not yet confirmed (none blocks the work): areas become folders
(`notes/`, `team/`, ...) with `shared/` for what several share, although other `features/*` folders
are flat; the stacked branches deviate from "cut from the latest `origin/main`", so the integrator
must merge bottom up; the proof runs against a stand-in for the backend, not a real stack.

## 2. Resume

The stack is unmerged, so start from its tip, not from `origin/main`. First check whether anything
has merged: `gh pr list --state all --limit 200 --json number,title,state,headRefName --jq '.[] | select(.headRefName|startswith("lane-6/"))'`.
If #368, #371, #374, #375 and #376 are all still open, start here. If some have
merged, branch from `origin/main` plus whatever is still open, and say so in your first message.

```
git rev-parse --show-toplevel          # must contain .claude/worktrees/ (otherwise stop and tell the founder)
git fetch origin
git switch --detach origin/lane-6/studio-split-handoff
NB="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
export PATH=$NB/node/bin:$NB/bin/fallback:$PATH npm_config_manage_package_manager_versions=false
pnpm install --frozen-lockfile --offline
```

The shell forgets `PATH` between commands in this environment: repeat the `export` line in every
command that runs `node` or `pnpm`.

**Make the golden once** (about ten minutes). The golden is a run of today's code, which is the
harness tip, so that every area is compared with the original behavior:

```
git switch --detach 45fcee40f
node tests/scenarios/lane-6/e6-1-run.mjs --out "$SCRATCH/golden"   # SCRATCH: any directory outside the repo
node tests/scenarios/lane-6/e6-1-run.mjs --out "$SCRATCH/golden2"  # optional A/A: the same code twice
node tests/scenarios/lane-6/e6-1-compare.mjs "$SCRATCH/golden" "$SCRATCH/golden2"   # must print PASS
```

Expect 82 shots, 636 calls, 1,090 Tab stops, and at most two shots "within rendering tolerance".
If the A/A fails, the Mac is busy (seven sessions share it): wait and run it again; do not loosen
anything. Keep `golden` for the whole round; it is outside git and must be rebuilt in a new session. If
`45fcee40f` is no longer reachable, any tree that already passed is equivalent (for example the tip of
the previous branch).

**Then, for each area in this order: notes, library, requests, threads, shell.**

1. `git switch -c lane-6/studio-split-<area> <the previous branch>`, then `git branch --unset-upstream`.
   Push only by explicit name. The chain of previous branches is: `lane-6/studio-split-handoff` →
   `-notes` → `-library` → `-requests` → `-threads` → `-shell` (each area is cut from the one to its left).
2. `node tests/scenarios/lane-6/e6-1-extract.mjs <area>`. It copies the declarations byte for byte,
   writes the new modules with their imports, imports them in `Studio.tsx`, removes the imports
   `Studio.tsx` no longer uses, runs Prettier, and must end with `eslint: clean`. The numbers in the
   next section are what it printed when this recipe was written; a difference means something has
   changed under you: stop and look.
3. `(cd apps/web && pnpm exec tsc --noEmit)`, `pnpm exec prettier --check apps/web/features/studio`,
   `pnpm exec eslint apps/web/features/studio`, then
   `node tests/scenarios/lane-6/e6-1-move-check.mjs b6e0f426a > "$SCRATCH/move-<area>.txt"` (must print PASS).
4. The evidence run, in the background, because it takes about ten minutes. **Edit nothing under
   `apps/web` and do not switch branches while it runs** (hot reload would corrupt it):
   `nohup sh -c "node tests/scenarios/lane-6/e6-1-run.mjs --out $SCRATCH/after-<area> > $SCRATCH/after-<area>.log 2>&1; echo done > $SCRATCH/after-<area>.done" > /dev/null 2>&1 &`
   then `pgrep -fl e6-1-run.mjs` to confirm it started, and wait for the `.done` file. Then
   `node tests/scenarios/lane-6/e6-1-compare.mjs "$SCRATCH/golden" "$SCRATCH/after-<area>" > "$SCRATCH/cmp-<area>.txt"`
   must end in `PASS`. Shots listed as "equal within rendering tolerance" are allowed (at most 64
   pixels, at most 8/255; the usual ones are `light/publish/search` and the Requests filter, at
   1/255). Any `DIFF` line is a failure: re-run just that step twice with `--only <step>` and
   `--subset` to see whether it is noise; if it repeats it is a real difference, so find the cause.
   Never change an expectation to fit what happened.
5. Gates: `pnpm exec turbo run typecheck --force` (7 of 7, nothing cached) and
   `CREATOR_NEXT_OUTPUT=.next-lane6-build NEXT_TELEMETRY_DISABLED=1 pnpm --filter @qelvora/web exec next build` (exit 0).
6. `git restore apps/web/next-env.d.ts` (`next dev` and `next build` rewrite this tracked file), tick
   the area's box in `docs/lanes/status/lane-6.md`, commit with explicit paths (message ends with
   `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`), `git push -u origin <branch>`.
7. Open the pull request against the previous branch, with a description built from the real output:
   write a config (template below), `node tests/scenarios/lane-6/e6-1-pr-body.mjs cfg.json body.md`
   (it refuses if the compare or the move check failed), then
   `gh pr create --base <previous branch> --head <branch> --title "[lane 6] 6.1: move <area title> out of Studio.tsx" --body-file body.md`.
   The title for the notes pull request is "move Notes and Compose out of Studio.tsx", and so on.

Config template (`before_label` is always "today's code (the tip of the harness branch)"):

```json
{
  "prev_pr": 376,
  "prev_branch": "lane-6/studio-split-handoff",
  "what": "Moves ... out of `apps/web/features/studio/Studio.tsx`, unchanged. `Studio.tsx` goes from N to M lines and imports them.",
  "why": "Fifth area in the stack. ...",
  "before_label": "today's code (the tip of the harness branch)",
  "compare": "/path/cmp-notes.txt",
  "move": "/path/move-notes.txt",
  "gates_what": "`pnpm exec turbo run typecheck --force`; eslint and prettier on `features/studio`; `next build`",
  "gates_observed": "7 of 7; clean; builds"
}
```

For the notes pull request, `prev_pr` is 376 and `prev_branch` is `lane-6/studio-split-handoff`; each
later area uses the previous area's pull request number and branch.

## 3. The five areas (from the plan in `tests/scenarios/lane-6/e6-1-split-plan.mjs`)

| Area     | New files                                            | Declarations moved                                             | `Studio.tsx` lines after | Imports the tool removes from `Studio.tsx`                                                                                                                                                                                                                        |
| -------- | ---------------------------------------------------- | -------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| notes    | `notes/Notes.tsx`, `notes/Compose.tsx`               | `Notes`; `emptyBody`, `scheduleInput`, `Compose`               | 2,372                    | `formatCopy`, `Note`, `ReactionChip`, `ContentBody`, `PrivateNoteReply`, `ContentReplyList`, `CreatorVoiceRecording`, `PhotoAttachment`, `PostVoiceAttachment`                                                                                                    |
| library  | `library/Library.tsx`                                | `Library` (imports `Compose` from `../notes/Compose`)          | 2,102                    | `ContentView`, `Page`, `contentStateLabel`                                                                                                                                                                                                                        |
| requests | `requests/Requests.tsx`, `requests/PacketDetail.tsx` | `Requests`; `PacketDetail`                                     | 1,407                    | `CapacityHeader`, `QueueCard`, `SignedActCommand`, `VoicePlayer`, `ConversationMessageSchema`, `ConversationMessage`, `Packet`, `money`, `packetStateLabel`, `paymentStateLabel`                                                                                  |
| threads  | `threads/CorrectionForm.tsx`, `threads/Threads.tsx`  | `CorrectionForm`; `Threads`                                    | 547                      | `copy`, `AuthorLabel`, `AuditBanner`, `LabelPreview`, `Message`, `MessageSchema`, `SignedActReview`, `ConversationVoiceReply`, `ApprovedReply`, `CorrectionReply`, `ConversationCorrectionMessageSchema`, `key`, `speakerLabel`, `Feedback`, `useAction`, `Modal` |
| shell    | `shell/navigation.tsx`, `shell/useRequestsCount.ts`  | `words`, `navigationTree`, `studioSidebar`; `useRequestsCount` | 408                      | `Children`, `cloneElement`, `isValidElement`, `ReactNode`, `ReactElement`, `AnchorHTMLAttributes`, `Sidebar`, `Queue`                                                                                                                                             |

This whole sequence was dry-run on the Team tip and the tool's output was identical, byte for byte,
to a hand-made version that passed typecheck, ESLint, Prettier, the move check and a production
build. Only the browser runs (step 4) are still to do for these five. `PacketDetail` and `Threads`
gain an `export` that makes their signatures wrap under Prettier; the move check normalizes
formatting for that reason and still fails on any changed token, string or comment.

## 4. Facts and traps

- **Ports and processes.** The runner uses 56462 (web, `next dev`, build directory `.next-lane6`) and
  56463 (the stand-in API) and stops both. It refuses to start if they are busy. Check
  `lsof -nP -iTCP:56462 -iTCP:56463 -sTCP:LISTEN` before and after. No containers are used.
- **zsh traps.** An unmatched glob aborts the whole command line: an `rm -rf dir/trial-*` that
  matched nothing silently skipped a whole launch. Do not use globs in `rm`, and confirm every
  background job started with `pgrep -fl`. A variable holding a command with spaces is not split;
  use a function. To stop several processes, loop over the PIDs one at a time.
- **Pushing.** A branch created from a remote-tracking branch inherits it as its upstream; always
  `git branch --unset-upstream` and push by explicit name. Never rebase, amend or force-push a pushed
  branch. #371's history has a commit starting "WIP:"; it stays.
- **Generated file.** `apps/web/next-env.d.ts` is rewritten by `next dev` and `next build`;
  restore it before every commit, and commit by explicit path, never `git add -A`.
- **The harness is the contract.** It runs the real app in the installed Chrome against a stand-in
  backend whose answers are checked against the real zod schemas. It uses Playwright's fake clock
  (paused after the first view loads, advanced by hand where a step needs a timer), software
  rendering, one fresh browser context per step, and warms every route before measuring. Reads in a
  step's first shot compare as a set; writes compare in order. `docs/lanes/status/lane-6-e6-1-runbook.md`
  explains all of it. Do not change the harness casually: a harness change goes into
  `lane-6/studio-split-harness` (#368), must be merged forward into every branch above it, and needs a
  new golden and a new A/A.
- **Do not poll CI, do not enable auto-merge, do not bind more pull requests** to your session.
  #368 is bound to the first session's monitor with auto-fix and auto-merge off. The macOS jobs take
  over an hour; the integrator merges in batches.
- **Findings, not to be fixed in 6.1** (they are existing behavior; details and file and line are in
  `lane-6.md`): a tap can be dropped while a 4-second refresh runs; an open Notes screen makes about 75
  requests a minute; Team scrolls the page after a refresh when focus is on the page body; a request
  card is a button inside a button. They belong to WP 6.4, 6.5, 6.6, 6.9 and 6.13.

## 5. Not done, and not to be redone

Not started: the five pull requests in section 2, and every other work package. Done and verified, do
not redo: the harness, the shared layer, Thanks and More, Team, and the tooling in #376. Not done by
anyone: a run against a real backend. Lane 2's one-command stack (`infra/local/stack.mjs`, its pull
request #367) was still open when this was written; once it is on `main`, repeating the star scenarios
on it is a follow-up for WP 6.2 onward, not a round 1 requirement (the capture takes `--web` and
`--api`).

## 6. Ending round 1

When the shell pull request is open, do these in order:

1. **Bring the stack up to date with `main`, once.** `git fetch origin`; then for each branch from
   the bottom to the top (`harness`, `shared`, `thanks-more`, `team`, `handoff`, `notes`, `library`,
   `requests`, `threads`, `shell`): `git switch <branch>`, `git merge --no-edit <the branch below it>`
   (for `harness` merge `origin/main`), `git push origin <branch>`. Never rebase. If the lockfile changed,
   run `pnpm install --frozen-lockfile --offline` before the next gate. Conflicts are not
   expected (each branch changes only its own files and `Studio.tsx`); if the stand-in API refuses to
   start because `packages/api` changed under it, fix the fixtures in the harness branch and merge forward.
2. **Re-prove the whole stack on that base.** Make a new golden from the merged harness tip
   (`git switch --detach origin/lane-6/studio-split-harness`, `e6-1-run.mjs --out "$SCRATCH/golden-merged"`),
   then run the harness on the top branch (`shell`) and compare: it must print `PASS`. Run the
   typecheck and production build gates on the top branch too. Say in the report that this covers every
   area at once, and update the golden instructions in section 2 only if you changed the harness.
3. Update `docs/lanes/status/lane-6.md` (tick the boxes, name the pull request numbers).
4. Post the final report in the working agreement's format (under 600 words: pull requests opened and
   what each does, scenarios run with results, what was not run, defects found with `file:line`,
   decisions needed, tickets, and the exact commands to re-run), and end with the three lines
   `Working on:`, `Waiting on:`, `Next:`. Then stop.
5. Clean up: stop your servers, delete `.next-lane6` and `.next-lane6-build` under `apps/web`, delete your
   scratch outputs, and make sure every branch is pushed and the tree is clean.

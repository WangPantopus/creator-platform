# Lane 6: Creator Studio (web) status

Updated: 2026-10-09, by the continuing lane 6 session.

Working on: WP 6.1 complete. The split preserves behavior; one pull request per area.
Round 1 is finished; no later work package has started.
`Studio.tsx` is now 408 lines after Prettier (originally 4,795).
The extraction tool's printed count is its buffer before the final formatting pass; the counts
in this status and the pull requests are measured from saved files.

Resume correction: GitHub marks #368, #371, #374, #375 and #376 merged, but only #368
reached `main`. The later pull requests merged into already-closed parent branches. The founder
approved the recovery PR #382 (`lane-6/studio-split-recovery`) against `main`, with
the five remaining area pull requests stacked above it. The recovery branch includes
`origin/main` at `c0b4ac0f0`. The founder also approved this Codex worktree location.
No other worktree was changed. CI is not polled and auto-merge is not enabled.

The integrator must ensure each area's commits actually reach `main`: merging a child into
an already-closed parent pull request does not do that. Retarget each child to `main` before
merging it after its parent. No pull request was merged by this session.

Done before handoff:

- [x] #368: E6.1 harness and runbook (in `main`)
- [x] #371: shared types, helpers, action hook and modal (recovered)
- [x] #374: Thanks and More (recovered)
- [x] #375: Team (recovered)
- [x] #376: extraction recipe and tooling (recovered)

This session:

- [x] #383 `lane-6/studio-split-notes`: Notes and Compose
- [x] #386 `lane-6/studio-split-library`: Publish (the library)
- [x] #387 `lane-6/studio-split-requests`: Requests and PacketDetail
- [x] #390 `lane-6/studio-split-threads`: Threads and CorrectionForm
- [x] #391 `lane-6/studio-split-shell`: navigation helpers and the requests count

Done: Notes and Compose; Publish (the library); Requests and PacketDetail; Threads and CorrectionForm; navigation helpers and the requests count. Static checks, the declaration move
check, the full browser comparison, all 7 workspace typechecks (zero cached tasks), and the
production build passed for each checked area above.

Next: integrator review and merge the recovery PR, then retarget and merge each child in order.
Wait for the founder’s "Next for lane 6" before starting another package.
Do not begin WP 6.2 or any other package until the founder sends "Next for lane 6".

Blocked on: nothing for round 1. Later packages retain their existing contract dependencies.

Scenarios:

- Golden at `45fcee40f`: 82 shots, 636 API calls, 1,090 Tab stops; Chrome 154.0.8037.98.
  Real web app and Chrome at 390 px, Light and Night. Fakes: schema-checked HTTP backend and
  browser clock. This compares HTTP writes and reads; no database state was checked.
- Notes and Compose: 82 shots, 81 identical in pixels, calls, console and Tab order; 636 /api calls and 1090 Tab stops compared; chrome 154.0.8037.98 1 shot(s) equal within rendering tolerance (at most 64 pixels, at most 8/255): night/requests-empty/empty: 12 pixels differ, by at most 1/255 PASS: identical
- Publish (the library): 82 shots, 81 identical in pixels, calls, console and Tab order; 636 /api calls and 1090 Tab stops compared; chrome 154.0.8037.98 1 shot(s) equal within rendering tolerance (at most 64 pixels, at most 8/255): night/requests-empty/empty: 12 pixels differ, by at most 1/255 PASS: identical
- Requests and PacketDetail: 82 shots, 81 identical in pixels, calls, console and Tab order; 636 /api calls and 1090 Tab stops compared; chrome 154.0.8037.98 1 shot(s) equal within rendering tolerance (at most 64 pixels, at most 8/255): night/requests-empty/empty: 12 pixels differ, by at most 1/255 PASS: identical
- Threads and CorrectionForm: 82 shots, 81 identical in pixels, calls, console and Tab order; 636 /api calls and 1090 Tab stops compared; chrome 154.0.8037.98 1 shot(s) equal within rendering tolerance (at most 64 pixels, at most 8/255): night/requests-empty/empty: 12 pixels differ, by at most 1/255 PASS: identical
- navigation helpers and the requests count: 82 shots, 79 identical in pixels, calls, console and Tab order; 636 /api calls and 1090 Tab stops compared; chrome 154.0.8037.98 3 shot(s) equal within rendering tolerance (at most 64 pixels, at most 8/255): light/publish/search: 11 pixels differ, by at most 1/255 night/requests/filter-due: 18 pixels differ, by at most 1/255 night/requests-empty/empty: 12 pixels differ, by at most 1/255 PASS: identical
- First Notes attempt failed in `tests/scenarios/lane-6/e6-1-page.mjs:11`:
  `clock.pauseAt: Error: Cannot fast-forward to the past` on Light empty Notes.
  The complete rerun used unchanged source and harness and passed. No tolerance was changed.
- Shell had three full-run shots within tolerance (11–18 pixels at 1/255). Two focused repeats including the workspace startup step passed. An initial focused attempt without Workspace failed console comparison because the existing first-page 404 moved from Workspace to Requests. No messages were filtered and no source or tolerance changed.

- E6.2–E6.13, real backend/PostgreSQL, actual passkey signatures, voice/photo recording,
  production-browser capture, `tests/visual`, and the optional second baseline: not run.
  The real backend remains deferred by the WP 6.1 recipe even though lane 2's stack is on main.
- Re-run commands and limitations: `docs/lanes/status/lane-6-e6-1-runbook.md`.

Final whole-stack proof: after the one-time fetch, main remained at `c0b4ac0f0`. The
recovery branch and all five area branches were already up to date and explicitly pushed.
The closed historical branches were left alone. A fresh baseline from that main commit
was compared with the complete split at `de2699865`:

```text
82 shots, 81 identical in pixels, calls, console and Tab order; 636 /api calls and 1090 Tab stops compared; chrome 154.0.8037.98
1 shot(s) equal within rendering tolerance (at most 64 pixels, at most 8/255):
  light/requests-empty/empty: 11 pixels differ, by at most 1/255
PASS: identical
```

All 35 declarations remained present once and unchanged (34 moved). The final forced
workspace typecheck passed 7/7 with zero cached tasks; ESLint and Prettier passed; the
production build exited 0. This covers every recovered and newly extracted area together.
Only documentation changed after that proof. The [round 1 report](lane-6-round-1-report.md)
contains the PR links and exact rerun commands. No PR was merged, no main branch was pushed,
and no unit test or harness expectation was added or changed.

Ports and containers: 56462 (web, `next dev`), 56463 (stand-in API). No containers.

Findings, all existing behavior that a no-behavior-change split must not touch (line numbers are
in `Studio.tsx` at the base, `b6e0f426a`). Each is for my own backlog:

1. **A tap can be silently dropped while a refresh runs** (WP 6.5, 6.6, 6.9). `useAction.run`
   returns at once if another action is pending (line 717), and Notes, Threads and others refresh
   through the same gate every 4 seconds (Threads line 3963 and 3965). "Review signed reply" is not
   disabled while the gate is busy (line 4369), so a tap during a refresh does nothing and shows
   nothing. Seen with a refresh held open for 1.5 s: the tap opened nothing; the identical tap with
   no refresh in flight opened the dialog. With real latency the window is a few hundred
   milliseconds in every 4 seconds.
2. **An open Notes screen makes about 75 requests a minute** (WP 6.9). Measured exactly over 20
   seconds of page time: five calls each to the role check, the identity check, Notes, replies and
   the requests badge. The badge is meant to refresh every 15 seconds (line 307) but its effect
   depends on `creator.roles`, a new array on every role check (lines 321 and 412), so it refreshes
   every 4 seconds and resets to blank each time.
3. **Team scrolls the page and moves focus on its own** (WP 6.9, 6.13). The focus-restoration effect
   (lines 3276 to 3300) runs after every 4-second refresh and, whenever focus is on the page body,
   re-focuses the last control. Seen: tab to the last link, click empty space, scroll to the top,
   wait one refresh: the page jumped 698 px and focus moved.
4. **A request card is a button inside a button** (WP 6.4, 6.13). `Requests` wraps `QueueCard` in a
   `<button>` (lines 2362 to 2383) and `QueueCard` renders its own buttons
   (`packages/ui-web/src/components.ts` 1744 onward). React logs "button cannot be a descendant of
   button" and a hydration error on every visit to Requests.

Current locations of the unchanged product findings above: dropped taps at
`apps/web/features/studio/shared/action.tsx:10`; badge polling reset at
`apps/web/features/studio/shell/useRequestsCount.ts:67`; Team focus restoration at
`apps/web/features/studio/team/Team.tsx:162`; nested request buttons at
`apps/web/features/studio/requests/Requests.tsx:185`. The pre-format line-count print is at
`tests/scenarios/lane-6/e6-1-extract.mjs:134`; it was documented, not changed.

Tickets to other lanes: none. (Finding 4 touches `packages/ui-web`, which lane 6 uses; the fix is
in `Requests`, so no ticket.)

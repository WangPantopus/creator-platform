# Lane 6: Creator Studio (web) status

Updated: 2026-10-09, by the first lane 6 session, handed off in the middle of round 1

**To continue, read `docs/lanes/status/lane-6-split-recipe.md` first.** It has the exact state, the
commands, the traps and what not to redo. Round 1 is WP 6.1 only; do not start another work package
until the founder sends "Next for lane 6".

Working on: WP 6.1, splitting `apps/web/features/studio/Studio.tsx` (4,795 lines) into feature
modules with no behavior change. One pull request per area, each branch cut from the one before
because every area needs the shared layer first, so merge them bottom up. Nothing is merged; CI is
pending (not polled).

- [x] #368 `lane-6/studio-split-harness`: the proof (E6.1 harness and runbook), no source change
- [x] #371 `lane-6/studio-split-shared`: types, formatting helpers, `useAction` and `Feedback`, `Modal`
- [x] #374 `lane-6/studio-split-thanks-more`: Thanks and More
- [x] #375 `lane-6/studio-split-team`: Team
- [x] `lane-6/studio-split-handoff`: the recipe, the extraction tool and plan, the description generator, a move check that ignores formatting; no source change
- [ ] `lane-6/studio-split-notes`: Notes and Compose
- [ ] `lane-6/studio-split-library`: Publish (the library)
- [ ] `lane-6/studio-split-requests`: Requests and PacketDetail
- [ ] `lane-6/studio-split-threads`: Threads and CorrectionForm
- [ ] `lane-6/studio-split-shell`: navigation helpers and the requests count; `Studio.tsx` is the shell

Done: the first five rows above. `Studio.tsx` is 3,747 lines on the handoff tip (408 after the last
area). The five remaining areas were dry-run on the Team tip: the extraction tool's output was
identical to a hand-made version that passes typecheck, ESLint, Prettier, the move check and a
production build. Only their browser runs remain.

Next: the five unchecked rows, in order, then the round 1 report, then stop. After that the founder
starts the next package with "Next for lane 6". Candidates, in the brief's order: WP 6.2 (Today and
the Note composer), 6.9 (replace the 4-second polling), 6.3 (reactions), 6.4 (queue), 6.5 (accept and
send, needs contract C3 from lane 4).

Blocked on: nothing for round 1. WP 6.5 waits for contract C3 (lane 4), WP 6.8 for lane 5's web
push, WP 6.10 and 6.11 for lanes 1 and 3.

Scenarios:

- E6.1 (star row), against the stand-in backend, golden = today's code: #371 pass (earlier harness
  commit, covered again by the Team run), #374 pass (81 of 82 identical, one within tolerance),
  #375 pass (82 of 82 identical). The extraction tool replay: pass. The move check controls (an edited
  token, string and comment, a deleted declaration; a re-wrapped signature must not fail): pass. The
  notes, library, requests, threads and shell runs: not run.
  Re-run: `docs/lanes/status/lane-6-e6-1-runbook.md`.
- E6.2 to E6.13: not run (outside round 1).
- Not run anywhere: a real backend on PostgreSQL (lane 2's stack is not on `main`), `tests/visual`
  (needs a Chromium download; it does not render Studio), the harness against a production build.

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

Tickets to other lanes: none. (Finding 4 touches `packages/ui-web`, which lane 6 uses; the fix is
in `Requests`, so no ticket.)

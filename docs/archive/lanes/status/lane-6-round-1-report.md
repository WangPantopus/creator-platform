# Lane 6: round 1 final report

WP 6.1 is complete. `Studio.tsx` went from 4,795 to 408 lines. All 35 original declarations
remain present once and unchanged; 34 live in feature modules. No later package started.

Pull requests opened, in integration order:

- [#382](https://github.com/WangPantopus/creator-platform/pull/382): recover the earlier reviewed shared, Thanks, More, Team and tooling changes onto main. Their earlier PRs merged into closed parents.
- [#383](https://github.com/WangPantopus/creator-platform/pull/383): Notes and Compose.
- [#386](https://github.com/WangPantopus/creator-platform/pull/386): Publish/library.
- [#387](https://github.com/WangPantopus/creator-platform/pull/387): Requests and PacketDetail.
- [#390](https://github.com/WangPantopus/creator-platform/pull/390): Threads and CorrectionForm.
- [#391](https://github.com/WangPantopus/creator-platform/pull/391): navigation helpers and requests-count hook.

Each extraction passed E6.1: 82 captures at 390 px in Light/Night; 636 API calls; 1,090 Tab
stops; matching console output and polling. Scenarios included owner/member/denied access,
empty states, Arabic/emoji drafts, saving, filters, pagination, review dialogs, and outage/recovery.
Notes, library, requests and threads each had 81 pixel-identical captures; shell had 79,
with all remaining differences within unchanged tolerance. Two focused shell repeats passed.

After the one-time main refresh, a fresh baseline at `c0b4ac0f0` and the complete split at
`de2699865` passed: 81 pixel-identical captures, one differing by 11 pixels at 1/255;
636 calls and 1,090 Tab stops matched. This covers every area together. Each extraction
and the final stack passed forced typechecks (7/7, zero cached), ESLint, Prettier, move checks,
and production builds. Only documentation changed afterward.

Failed attempts, preserved: Notes initially stopped at `tests/scenarios/lane-6/e6-1-page.mjs:11`
with `clock.pauseAt: Error: Cannot fast-forward to the past`; an unchanged full rerun passed.
A shortened shell run failed with an extra first-page `404 (Not Found)` console message.
Including the original workspace startup step restored the original console placement; both
repeats passed. No harness or tolerance changed.

Fakes: schema-checked backend HTTP API and browser clock. Not run: real backend/PostgreSQL
state, actual passkey signatures, voice/photo recording, production-browser capture,
`tests/visual`, optional A/A baseline, unit suites, and E6.2–E6.13. CI was not polled.

Unchanged defects, relative to `apps/web/features/studio/`: dropped taps (`shared/action.tsx:10`),
polling resets (`shell/useRequestsCount.ts:67`), focus jumps (`team/Team.tsx:162`), nested buttons
(`requests/Requests.tsx:185`). Details remain in the status file. The extraction tool prints
pre-format counts (`tests/scenarios/lane-6/e6-1-extract.mjs:134`); PR counts use saved files.

Decisions: worktree location and recovery PR approved. No further decision or cross-lane code
ticket. Integrator: merge #382, then retarget each child to main before merging it. No PR was
merged or main pushed by this session.

Re-run from a clean checkout after the working agreement's section 3.7 toolchain setup:

```sh
EVIDENCE=$(mktemp -d /tmp/qelvora-lane6-rerun.XXXXXX)
git switch --detach c0b4ac0f0
node tests/scenarios/lane-6/e6-1-run.mjs --out "$EVIDENCE/before"
git restore apps/web/next-env.d.ts
git switch --detach origin/lane-6/studio-split-shell
node tests/scenarios/lane-6/e6-1-run.mjs --out "$EVIDENCE/after"
node tests/scenarios/lane-6/e6-1-compare.mjs "$EVIDENCE/before" "$EVIDENCE/after"
node tests/scenarios/lane-6/e6-1-move-check.mjs b6e0f426a
pnpm exec turbo run typecheck --force
CREATOR_NEXT_OUTPUT=.next-lane6-build NEXT_TELEMETRY_DISABLED=1 pnpm --filter @qelvora/web exec next build
git restore apps/web/next-env.d.ts
```

Working on: nothing; WP 6.1 complete on #391.
Waiting on: integrator review and the founder's "Next for lane 6".
Next: integrate the stack; begin another package only after that instruction.

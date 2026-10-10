# Lane 7 handoff — 2026-10-09

This is a continuation, not a new start. The founder requested a clean handoff.
Read this alongside `lane-7.md`, `lane-7-keyboard-drafts.md` and the harness runbook.

Open PRs: [379](https://github.com/WangPantopus/creator-platform/pull/379) (ready, navigation) and [401](https://github.com/WangPantopus/creator-platform/pull/401) (draft, keyboard/drafts; stacked on 379).
Final implementation/evidence commit: `0b0ae6984`; the later handoff commit changes
only documentation. All local gates passed. CI reader still requires GitHub connection.

## What is finished

- WP 7.1: PR 369 merged. Do not repeat its harness/sign-in/state proof.
- WP 7.2: PR 379 is open and ready on `lane-7/navigation`, final commit
  `7e1d68aee`. All remaining iOS navigation flows, the full Android matrix,
  post-main-merge gates, release hook scans and focused real-stack navigation pass.
  No review comments at the handoff check. The full result is in
  `lane-7-navigation.md`; E7.2 draft restoration is now proved by WP 7.3.
- WP 7.3: `lane-7/keyboard-drafts` includes encrypted account/thread drafts,
  fresh-read restoration, pending-send recovery, keyboard/rotation/largest-text
  layout, Android split screen and session-check-safe deletion confirmation.
  Fake-API D1–D8 (including D4R/D7U and Android D3I/D3S) pass as recorded in
  `lane-7-keyboard-drafts.md`. Both apps also pass D6 against the real local
  API/PostgreSQL: restart/send once, cancel, accepted thread deletion, ciphertext
  purge, exact database scope, then denial after Back and restart.
- Real D6 uses synthetic identity/model edges. The wider matrix fakes our API;
  the native app, keyboard, lifecycle, HTTP, encryption and storage are real.
  No new unit or snapshot tests were added. The founder approved XCUITest
  operation in place of the unavailable manual iOS simulator tool.

## Required decision and limits

The compact persistent author header is **not approved**. Charter 4.2 says the
identity strip never scrolls away. Current constrained layouts keep author words
and glyph fixed, with the full sentence in the message scroller. Recommended:
accept that compact presentation. Keep the WP 7.3 PR draft until answered.
If rejected, keep the full strip fixed on both platforms and repeat D1/D3 plus
Android D3I/D3S after the layout change; do not weaken the target-size checks.

Backend erasure is **not complete**: the accepted deletion jobs have blocked or
retrying domain tasks. The exact errors and ticket to lane 1/domain owners are in
`lane-7-keyboard-drafts.md`. Immediate denial and local draft removal passed.
Forced interruption during the atomic write, cancellation at deletion ack,
account/creator-wide deletion, physical devices and store installs are not run.
Distribution/store work remains WP 7.9. CI has not been inspected because the
app's PR check reader requires a GitHub connection; never substitute CLI polling.

The four WP 7.2 founder flags still use their recorded defaults. If rejected,
revert only that piece and rerun its flow (see `lane-7-navigation.md`). Persisting
navigation trails across restarts would need lane 1 storage/security approval.

## Resume without overlap

1. Use the existing warm lane 7 worktree authorized by the founder; its repository
   root must contain `.claude/worktrees/`. Fetch and check clean status, branch,
   PR metadata/comments/reviews and the app's PR status tool. Do not check out one
   branch in another worktree. This handoff and WP 7.3 notes are only on
   `lane-7/keyboard-drafts` until merged; read from that branch if necessary.
2. Resolve the compact-header decision if answered. Otherwise leave its PR draft
   and continue independent WP 7.4 work. Do not rerun completed matrices without
   a source change, merge, review finding or new failure. Existing gates/results
   are in `artifacts/lane-7/7-3-gates.txt`.
3. Before starting WP 7.4, check whether PRs 379 and the draft PR have merged.
   Update by merging `origin/main`, never rebase. Keep one concern per PR; explain
   any stack and which parent commit reviewers should exclude.
4. WP 7.4 begins with a shared behavior spec and C4 harness update. Read
   `lane-5-c4-note-reaction-delivery.md` and `packages/api/src/content.ts`.
   Fetch `/v1/content/{creatorId}/presence`, follow every cursor including empty
   pages, preserve server author/audience labels, and merge by occurrence time.
   These items have no thread sequence/control epoch. Never include fan reply
   text in a reaction or send Note replies through the thread composer.
   The brief also covers composer states, seal, citations, reminders, consent,
   named pickers, packet terms, notification rows and share sheet. Flag removal
   of the comparison placeholder as a copy change. No WP 7.4 implementation done.
5. Then WP 7.10, 7.11, 7.8 and 7.12. WP 7.5/7.6/7.7/7.9 stay waiting on C1,
   domain, credentials, accounts and icon art. Keep working when independently
   unblocked; no agents, other chats or workflows.

## Devices, caches and traps

Use only `qelvora-lane7-ios` / `62DDB9C8-4B10-48CB-94ED-1746980B54EA`,
`qelvora-lane7-android` / `emulator-5574`, ports 56470–56479 and containers
`qelvora-lane7-*`. The fake is 56473; the iOS link/storage driver is 56475.
Do not run the fake and real stack together: the real model edge uses 56473.
The harness runbook has the PATH/build/start commands; the handoff memory records
this machine's cache location. Use the heavy-build lock for native jobs, serially.

- Final regression builds have an empty API origin. Rebuild debug for the fake
  before ordinary operated flows; explicit debug origin overrides also exist.
- Android instrumentation removes the app. Reinstall its debug APK before use.
- Ad-hoc sign iOS or Keychain fails. Run `git checkout -- apps/ios/Package.resolved`
  before **every** commit. Do not commit its build-generated changes.
- iOS privacy's native popover may omit Keep data; tap outside to cancel, then
  check access/ciphertext. The real UI runner now covers that presentation.
- Repeated real D6 sends use a fresh marker. Once a thread is deleted, recreate
  the disposable real stack/fixture; do not retry against its tombstoned scope.
- Use editable/clickable parent bounds on Android; wait for IME visibility and
  dismissal. Numeric XML entities need one decoding pass. D7 uses native text
  input because adb burst typing dropped characters; no new unit tests.
- Rebuild after source changes, restart the fake after harness changes, stop the
  other app before a shared-fixture reset. Never kill another session's process.

## Shutdown at handoff

Owned fake API, iOS link driver, emulator, simulator, Gradle and Kotlin daemons
are stopped. The owned real-stack container and data volume are removed. Keep the
AVD, simulator and reusable build caches; restart/rebuild through the runbook.
Temporary recordings, scratch fixtures and intermediate failed-run files are
removed after the compact evidence is committed. The memory pointer names the
remaining cache and concise review evidence outside Git.

## Stop correctly

Commit with the founder's Claude identity and coauthor footer; push, open/attach
PRs, keep the working tree clean, and never merge/force-push/rewrite history.
Keep evidence below 300 KB per file and 1 MB per PR, with manifest hashes.
Update status and this handoff, then stop owned services/devices and delete only
owned disposable data. Preserve shared tooling/images and reusable native caches.
End every report with Working on / Waiting on / Next.

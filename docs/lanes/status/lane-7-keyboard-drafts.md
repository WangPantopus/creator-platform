# Lane 7: keyboard, insets, rotation and drafts (WP 7.3)

## State

Work continues on `lane-7/keyboard-drafts`. The branch includes main through `21b3d4836`. PR 379 remains open and ready for WP 7.2.
WP 7.3 is being published as a draft pending the header decision. Operated
recovery, real thread deletion, layout and final local gates all pass as recorded.

The compact persistent author header awaits the founder's decision below. Storage
and recovery work continue independently. No new unit or snapshot tests.

## Shared behavior spec

The founder authorized this default: a draft stays on the device only, encrypted,
bound to the account and thread, cleared on accepted send, sign-out, data deletion
or when the conversation goes away. Unsent input never leaves the device. State
this default in the PR.

- Each account/thread has independent input. Rotation, backgrounding and process
  death preserve it. A fresh authorized thread read precedes restoration. A denied
  or offline launch does not reveal a saved draft. A recreated conversation cannot
  inherit input from the previous physical thread at the same creator/fan route.
- Drafts are separate from credentials, navigation history, replay cursors and
  offline reading leases. iOS uses AES-GCM with a device-only Keychain key and
  protected files excluded from backup. Android uses AES-GCM with Android Keystore
  and atomic files in `no_backup`.
- An unconfirmed send retains its original key, body, sequence and destination.
  Restart checks acceptance without automatically sending. Explicit Retry uses
  that original key. Acceptance clears matching input; newer edits remain.
- Sign-out/account change purges drafts. Accepted deletion clears its matching
  scope. A fresh 401/403/404 or changed physical thread ID discards that thread's
  draft. Generation, ownership and revision checks reject stale writes.
- Composer and Send remain above the software keyboard. Rotation preserves focus
  and input. Largest text remains readable in Light/Night. Android handles window
  resizing in place; process restoration remains a separate encrypted-storage path.

## Operated scenarios

The fake API supplies synthetic identities/data and controllable faults. The apps,
keyboard, lifecycle, cryptography, files and HTTP are real. D6 uses the real
local API/PostgreSQL, with synthetic development identity and model edges.

| ID  | Steps and expected outcome                                                                                                                | iOS                                                               | Android                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| D1  | Type, rotate, background, kill/relaunch and refocus: input preserved, keyboard clear, no message POST                                     | pass: bounded editor, both orientations and restored focus        | pass: IME stays open on rotation; 308-byte encrypted file, no plaintext marker/POST |
| D2  | Different input in two threads; navigate away and restart: independent drafts                                                             | pass with current editor; separate thread drafts survive restart  | pass before final header layout; independent files and no POST                      |
| D3  | Largest text in Light/Night portrait and landscape: readable fixed author label/glyph and full composer/Send                              | pass, screenshots reviewed; header approval pending               | pass, screenshots reviewed; targets at least 48dp; header approval pending          |
| D3I | Android three-button navigation at largest text in both orientations                                                                      | not applicable                                                    | pass; navigation mode/font/rotation restored afterward                              |
| D3S | Split screen where supported: input preserved and keyboard clear                                                                          | not supported on the owned iPhone simulator                       | pass: both orientations at normal/largest text; return to full screen, no POST      |
| D4  | Accepted send clears; rejection survives restart; pre-acceptance drop retries same key; accepted/lost response restarts without duplicate | pass with rejection-handling correction                           | pass: acceptance, rejection, both loss paths and original key                       |
| D4R | Tap Retry directly on a rejected message: accepted once with the original key                                                             | pass: rejection fix; two POSTs, one key, one acceptance           | pass: same-key Retry accepts once and clears ciphertext                             |
| D5  | Sign out, same/wrong account, fresh 401/403/404 and recreated physical thread: old input absent                                           | pass: all cases, including recreated physical thread              | pass: sign-out, account switch, fresh denials and physical replacement              |
| D6  | Real API restart/send accepted once; accepted thread deletion removes ciphertext; Back/restart cannot resurrect it                        | pass: cancellation, send once, exact database scope, purge/denial | pass: cancellation, send once, exact database scope, purge/denial                   |
| D7  | Existing 2000-character boundary; ciphertext lacks marker; restart restores; no backup/upload                                             | pass                                                              | pass: 2004 native input clips to 2000; encrypted restart, no POST                   |
| D7U | Emoji and RTL input survives process restart without premature upload                                                                     | pass: emoji, Hebrew and Arabic restored; no POST                  | pass: emoji/RTL input, encrypted restart and no POST                                |
| D8  | Edit newer text while an older send is pending: old send accepted once, newer draft survives                                              | pass with bounded editor, one message POST                        | pass: older send accepted once; newer input survives restart                        |

All failures remain recorded below. “Pass” applies to the observed cases, not
founder approval of the header. Final Android unit/snapshot/Lint/instrumentation,
iOS Swift/UI suites, both release builds/hook scans, root checks and 51/51 contract
checks pass: see `artifacts/lane-7/7-3-gates.txt` for exact counts and expected skips.
Physical-device/store installation remains WP 7.9. Forced interruption during the
filesystem write, cancellation at deletion acknowledgement, account/creator-wide
deletion and complete domain erasure are not run/proved.

## Findings and evidence so far

Compact receipts, reviewed screenshots and manifest hashes are in `artifacts/lane-7/7-3-*`.
The clean handoff preserves concise review evidence and build caches outside Git.

- Initial iOS landscape overlapped the keyboard; largest text also truncated the
  header. Widening the frame and using an intrinsic-height TextField caused runtime
  layout stalls. Those attempts were discarded. The bounded scrolling TextEditor
  passed D1/D3 together in `ios-navigation-1791599747113.xcresult` (2 passed, no skips).
  Full-screen Light/Night captures confirm readable author words/glyph and controls
  above the live keyboard. The width remains 390.
- Android rotation originally closed the IME. Keeping one composer composition and
  resizing the activity in place fixed that. Largest landscape then squeezed the
  controls into a clipped strip. The compact row now puts author and composer side
  by side in short windows. Visual review caught that defect despite a bounds-only
  pass; the checker now measures the clickable/editable parent and enforces 48dp.
  D1/D3/D3I pass in `draft-android-row-v2.log`; screenshots were reviewed.
- iOS D4 passed in `ios-navigation-1791600152174.xcresult`: accepted send clears;
  rejected input survives restart/Keep editing; dropped requests retry the same
  hashed key; accepted response loss produces exactly one message POST. The D5
  runner then used an incomplete synthetic actor label and was corrected.
- In `ios-navigation-1791600580433.xcresult`, D7 and D8 pass with the bounded editor.
  D4R failed: a 422 response closed the live transport, making Retry ineffective.
  Both apps now preserve the existing live connection for definite input rejections.
  Denials 401/403/404, conflicts 409 and network/server failures retain their existing
  conceal/recovery handling. The corrected D4R and full D4 pass in `ios-navigation-1791601214001.xcresult`.
  That bundle has five passes, no skips/failures: D2, D4R, D4, D5 and D7U.
  Its Unicode capture was visually reviewed.
- The same bundle's D5 sign-out, wrong-account and denial checks clear ciphertext.
  Recreation returned 409 because the fake retained subscriptions after process
  termination. A real HTTP/WS probe reproduced both causes: repeated subscribe had
  2 listeners and left 1 after close; a process-like disconnect also left 1.
  The fake now replaces the previous listener and handles TCP end. All three probe
  cases (normal close, repeat subscribe, process stop) now have 1 live listener and
  0 after exit: `harness-connections-before.log` / `harness-connections-after.log`.
- Android D4's recovery gesture started in composer padding, so it could not reach
  Keep editing. The runner now swipes inside the actual scrollable node. The failed
  runs remain `draft-android-recovery.log` / `draft-android-recovery-v2.log`.
- Android D4 and D4R pass in `draft-android-recovery-v3.log`. D5 then exposed
  a checker bug: adb returned a missing-directory diagnostic in stdout, which the
  checker counted as seven filenames. The directory was correctly removed. The
  checker now explicitly distinguishes a removed draft directory from unreadable
  app storage; later runs below finish the remaining flows.
- Android D5 passes in `draft-android-recovery-v4.log`. Its subsequent D7 failed:
  adb burst input delivered only 59 of 2004 characters. Native text-input operation
  in `draft-android-recovery-v5.log` passes the boundary and external restore/file/API
  checks. D7U then exposed a checker bug: UiAutomator encodes emoji as numeric XML
  entities. The restored screen was correct and visually reviewed; the decoder
  now handles numeric entities and decodes exactly once. D7U/D8 pass in `draft-android-recovery-v6.log`; the newer draft remains
  encrypted after the older message is accepted exactly once.
- Android largest landscape split screen exposed a wrapping development banner
  that clipped composer text. The banner now stays one line and scrolls horizontally.
  `draft-android-split-v3.log` passes all four split/text combinations and return to
  full screen: composer/Send targets are 126px (48dp), above the live IME. Input
  survives resizing; one 299-byte ciphertext record and no message POST. The
  largest landscape screenshot was visually reviewed. The prior v2 run passed
  split checks but measured the keyboard too soon on return; the checker now waits
  for a visible IME before measuring. Full-screen D3 also passes after this change in the same v3 run (Light/Night, both orientations).
- iOS backup exclusion is `com.apple.metadata:com_apple_backup_excludeItem` on this
  simulator. The driver checks that attribute and reads only this feature's
  ciphertext directory, never Keychain or credential files.

## Real API deletion findings

The disposable lane 7 stack used real API/PostgreSQL and synthetic identity/model
edges. Both apps pass D6. Earlier Android failures:

- v1 selected the Creator ID caption instead of its editable field; the subsequent
  Back left privacy. The runner now targets the editable accessibility description,
  waits for a real keyboard, and checks the entered value.
- v2 requested takeover of an already human-active conversation and received 403.
  Preparation now reads current control and only requests takeover when needed.
- v3 filled the fields but could not keep the deletion confirmation on screen.
  Direct operation proved it appears, then the ordinary session-readiness heartbeat
  dismisses it. Both apps now preserve only the generic confirmation during a
  same-session check. Actions still disable during verification and use the original
  capture/fresh authority checks. Errors, route/owner changes and disappearance
  continue to clear confirmation and private results. The new D6 flow waits across
  the heartbeat, chooses Keep data, checks retained access/ciphertext, then confirms.

D6 now checks the exact account/thread in PostgreSQL: one deletion job, one tombstone
and eight domain tasks. This proves accepted scope and immediate denial, not that
all domain erasure has completed. Android D6 passes in `draft-real-android-v5.log`: explicit send once, confirmation
survives readiness checks, Keep data preserves access/ciphertext, confirmed deletion
removes the file, exact database job/tombstone/tasks exist, and Back/restart both
show Conversation unavailable with no old input. v4 stopped before deletion because
a field tap used bounds during a keyboard transition; the runner now waits for
keyboard dismissal and refocuses from current bounds. iOS D6 passes in `ios-navigation-1791605313318.xcresult` (1 pass, 0 failures/skips),
with its exact database scope independently verified by `stack-drafts.mjs verify-ios`.
Its cancellation uses the native popover background when iOS omits the cancel
button. The confirmation survived the six-second wait; cancellation preserved
access/ciphertext, deletion removed it, and Back/restart showed the denied screen.
Both final captures were visually reviewed. Earlier iOS v1/v3 runs had unreachable
field/button gestures; v2 reused a sent fixture marker; v4 expected a cancel button
in a popover that remained open. The runner now uses visible scroll bounds, Return,
a unique per-run marker and native popover cancellation. No product change was
needed for the v4 locator failure.

### Backend observation for lane 1

Owner: lane 1 (trust integration), with the domain owners. Files to inspect:
`apps/backend/src/modules/trust/domain-adapters.ts` and the host wiring in
`apps/backend/src/integration.ts`. Confirm/configure the disposable local stack's
privacy adapters; no backend files changed in this lane. Android's accepted thread
job is blocked after immediate denial and local draft removal. Observed task codes:
`accounting_boundary_pending`, `commerce_retention_unconfigured`,
`content_retention_unconfigured`, `conversation_recordings_unavailable`,
`domain_hook_error` (growth), `identity_retention_unconfigured`,
`media_retention_unconfigured`, `comparison_artifact_purge_pending`.
This does not invalidate the app's accepted-scope cleanup proof; complete backend
erasure is not proved and must not be reported as complete.

## Founder flag: compact persistent authorship

[Charter 4.2](../00-charter.md) says, “The identity strip at the top of a thread never
scrolls away.” The verified constrained layout keeps the existing author label and
glyph fixed and puts the full identity sentence in the message scroller. The
recommended default is this compact fixed author label. Approval is pending before
accepting that presentation; no wording changes are proposed.

## Run it

Use the harness runbook, owned devices and serial heavy-build lock. Stop the other
platform's app before resetting the shared fake API. Rebuild after source changes.

- Android: `LANE7_OUT=<scratch> node scripts/with-heavy-build-lock.mjs --owner LANE-7 -- node tests/scenarios/lane-7/e7-3-drafts.mjs D1 D2 D3 D3I D4 D4R D5 D7 D7U D8`.
  D7 and D7U also need the debug Android test APK installed. Its opt-in instrumentation
  uses the real text-input action because adb hardware-key mapping cannot type RTL
  and emoji; the external journey then kills/relaunches and checks files/API state.
- iOS: build-for-testing, start `ios-link-driver.mjs`, then
  `LANE7_OUT=<scratch> node tests/scenarios/lane-7/ios-navigation.mjs <built.xctestrun> --drafts`.
  The runner requires every selected flow to pass with zero skips.
- With both apps stopped: `node tests/scenarios/lane-7/harness-connections.mjs`.
  This resets the fake and checks actual HTTP/WS subscription cleanup.
- Real stack: `stack-drafts.mjs android`, or
  `stack-drafts.mjs prepare-ios <scratch/fixture.json>` followed by the iOS runner's
  `--draft-stack` with `LANE7_STACK_FIXTURE=<scratch/fixture.json>`. The fixture
  contains synthetic object IDs only. Tokens remain in memory and are never logged.

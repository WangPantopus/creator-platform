# Lane 7: keyboard, insets, rotation and drafts (WP 7.3)

## State

Implementation in progress on `lane-7/keyboard-drafts`, following navigation PR 379
(`7e1d68aee`). Debug builds pass on both platforms. iOS D1, D2 and D8 have passed individually. Larger text and Android rotation exposed further layout defects; fixes are still being operated. No new unit or snapshot tests.

## Shared behavior spec

The founder authorized this default: a draft stays on the device only, encrypted,
bound to the account and thread, cleared on send, sign-out, data deletion or when the
conversation goes away. It never leaves the device. The PR must state this default.

- Each account/thread has independent input. Rotation, backgrounding and process death
  preserve it. A fresh authorized thread read must precede restoration; an offline or
  denied launch does not reveal a saved draft. A recreated conversation cannot inherit
  the former conversation's input even if its creator/fan route is the same.
- Draft storage is separate from credentials, navigation history, replay cursors and
  the short offline reading lease. Encryption keys remain device-bound; draft files
  are excluded from backup. No server endpoint receives input before explicit Send.
- A pending send retains its original idempotency key, body, sequence and destination.
  A restart checks the existing acceptance endpoint. It never automatically sends.
  An unconfirmed send offers the existing Retry action with the same key. An accepted
  send clears that pending item and matching draft; text edited after Send remains.
- Sign-out/account change purges drafts. Accepted data deletion clears the matching
  scope. A fresh 401/403/404 or a changed physical thread ID discards that thread's
  draft. Storage generations and writer ownership reject late writes after a purge.
- The software keyboard leaves the composer and Send reachable. Rotation does not
  lose focus/input or invent a navigation step. Gesture and three-button system
  insets are respected. Largest text remains readable; authorship stays available
  as words and a glyph. Light and Night use the same layout behavior.

## Operated scenarios

The fake API provides synthetic identities/data and controllable faults. Screens,
keyboard, lifecycle, encryption and HTTP are real. Repeat the affected normal and
restart/send paths on the disposable real API/PostgreSQL stack (identity/model edges
remain synthetic). Check server state and absence of premature/duplicate sends.

| ID  | Steps and expected result                                                                                                                       | iOS                                                                                                                         | Android                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Type, show keyboard, rotate both ways, background, kill and relaunch: same input/thread; composer and Send above keyboard; no message POST      | pass after hiding secondary step-in while focused; rotation/background/process restart and no POST                          | pass after in-place activity resize: keyboard stays open in both orientations, background/process restart preserves input, encrypted file and no POST checked |
| D2  | Type different input in two threads, navigate away and reopen each: independent drafts                                                          | pass: independent input, process restart, no message POST                                                                   | not run                                                                                                                                                       |
| D3  | Largest type in Light/Night; gesture/three-button insets on Android; split screen where supported: readable authorship and reachable composer   | fail: largest landscape overlaps keyboard; compact header correction pending                                                | not run                                                                                                                                                       |
| D4  | Send accepted clears input; rejected/network failure keeps it; acceptance with lost response and restart checks status without a duplicate POST | partial: accepted clears ciphertext; rejected text survives restart, recovery control needs scroll; remaining cases not run | not run                                                                                                                                                       |
| D5  | Sign-out, same-account sign-in, wrong account, 401/403/404 and recreated conversation: no old draft restored                                    | not run                                                                                                                     | not run                                                                                                                                                       |
| D6  | Accepted data deletion clears matching scope; late writes cannot resurrect it                                                                   | not run                                                                                                                     | not run                                                                                                                                                       |
| D7  | Existing 2000-character boundary; ciphertext lacks the synthetic input marker; no backup/upload                                                 | not run                                                                                                                     | not run                                                                                                                                                       |
| D8  | Edit new text while an older send is unconfirmed; acceptance clears only the old pending item                                                   | pass: one accepted old message, no POST for new text, new encrypted draft survives restart                                  | not run                                                                                                                                                       |

## Not checked

The table records partial runs; D5–D7 and all WP 7.3 regression gates are not run yet. Physical devices and store
build installation remain WP 7.9. Navigation history remains process-only (WP 7.2).

## First operated finding

The iOS D1 screenshot/accessibility tree shows the landscape composer ending at y=249.7
while the keyboard begins at y=238; Send also extends into it. Portrait passed. The
input subsequently survived backgrounding and process stop/relaunch, and no message
POST occurred, but D1 remains failed until the layout is fixed. D2 passed separately.
Evidence remains outside Git: `ios-navigation-1791596615711.xcresult`.

The normal-size layout fix hides secondary step-in/privacy controls while editing,
keeping the composer in its existing view. A wider iOS frame was discarded after a runtime stall.
For constrained layouts, the current fix keeps a compact author label/glyph fixed and
puts the longer identity strip in the message scroller. No wording is added.
The same behavior is being applied on Android; no wording is changed. Verification pending.

The first layout attempt (wider flexible frame plus hiding step-in while focused)
stalled during typing. The owned app used about 96% CPU; a process sample showed
SwiftUI/TextKit layout work on the main thread, not encryption. That run was stopped
after its explicit main-run-loop timeout. The width was reverted to 390; D1 then passed (`ios-navigation-1791597584037.xcresult`).
Raw log: `draft-ios-layout-check.log`; sample: `draft-typing-stall.sample.txt` (outside Git).

## Subsequent operated findings

- Android portrait D1 has an encrypted 308-byte file in `no_backup` with no synthetic
  plaintext marker. Rotation restores the input but closes the IME. Keeping the
  composer outside the list alone did not fix activity recreation; orientation/window
  resize handling is now being verified. No Android D1 pass is claimed.
- iOS largest-text screenshot confirms truncated header/identity text, and landscape
  input ends at y=316 versus keyboard y=238. The compact layout is not verified yet.
- iOS D4 accepted send removed the draft file. Rejected text survived restart; the
  recovery control was below the lazy viewport. The updated runner scrolls to it.
  Inspection also found the message component's Retry callback was unwired on both
  apps; both callbacks now use the existing same-key retry, pending operation proof.
- iOS D8 passed in `ios-navigation-1791597927831.xcresult`: the older send appears once
  in API state, the newer input does not, there is one message POST, and the newer input
  survives process restart in a 296-byte ciphertext file. The overall bundle has
  two failures (D3 and D4), one pass (D8), zero skips.
- iOS backup exclusion exists as `com.apple.metadata:com_apple_backup_excludeItem`
  with value `com.apple.MobileBackup` on this simulator. The checker was corrected
  to use this attribute; it had incorrectly reported the obsolete attribute absent.

- The next iOS run passed D1 again with the compact header. D3 Light reached both
  orientations, but focusing the restored draft in Night at the largest size stalled
  the app at ~99% CPU. The owned run was interrupted; D4/D5/D7 did not run. The
  sample again shows layout work. A bounded scrolling TextEditor now replaces the
  intrinsic-height TextField; it is not built or operated yet. Bundle:
  `ios-navigation-1791598464014.xcresult`; sample: `draft-compact-stall.sample.txt`.
- Android now handles orientation/window-size changes in place through the activity
  configuration declaration. Draft restoration after a process kill remains a separate
  encrypted-storage path. This latest build is being operated; no pass claimed yet.

- Android D1 passed with in-place resize (`draft-android-resize.log`): IME top1517
  portrait /394 landscape, input and Send fully above it, rotation/background/process
  restart preserved input, one encrypted308-byte no-backup file, no plaintext marker
  and no message POST. D2/D3 are still running.

- Visual review overruled the Android D3 bounds-only pass: largest landscape
  squeezed input and Send to a clipped strip. The checker now rejects targets shorter
  than48dp. A stable three-child layout places author and composer side by side in
  short windows; its first operated run is pending. No final D3 pass is claimed.
- The bounded iOS editor no longer stalls in the first run. The runner chose the old
  TextField locator before the restored TextView appeared (D1), and a stale off-screen
  keyboard frame in Night (D3). Those runs remain failed. The locator now waits for
  TextView; Night explicitly edits the restored text to bring up the software keyboard.
  Bundle `ios-navigation-1791599044007.xcresult`; full captures are outside Git.

- Bounded iOS TextEditor D1/D3 passed together in `ios-navigation-1791599747113.xcresult`: 2 passed, 0 skipped, 0 failed. Full-screen captures visually confirm readable author words/glyph and input/Send above the live keyboard in both Light/Night largest-text orientations. Restored input was focused and edited again after process restart without a stall.
- The first Android 48dp assertion measured label children instead of their clickable/editable parents. It now measures the actual parent targets and checks draft text specifically in the editable field. Visual review also caught overlapping normal header children inside a Box; they now stack in a Column. The corrected run is in progress.

- Android corrected D1/D3/D3I passed together (`draft-android-row-v2.log`). All measured input/Send targets are at least48dp, remain above the IME, and screenshots show readable contents in largest-text landscape. Gesture and three-button modes both pass; three-button landscape IME top520px. The previous system navigation mode/font/orientation were restored. Split screen remains not run.

## Founder flag: compact persistent authorship

The verified compact layout keeps the existing author label and glyph fixed and puts the longer identity strip in the scroller. Charter4.2 says the identity strip never scrolls away. Approval requested before accepting that presentation; recommended default is the compact fixed author label. No wording changes. Storage/recovery work continues independently.

- iOS D4 passed in `ios-navigation-1791600152174.xcresult`: accepted send clears ciphertext; rejected input survives restart/Keep editing; pre-acceptance drop retries the original hashed key; accepted response loss restarts and checks status with exactly one message POST. D5 confirmed sign-out removal, then failed on a runner locator (`Devon` versus `Harness: Devon, ...`). The run was interrupted; D7/D8 were not run in that bundle. The selector now matches the observed prefix and throws on failure.

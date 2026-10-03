# W6 iOS private preview crash cleanup — October 3, 2026 UTC

Personally implemented on `codex/w6-ios-preview-cleanup-20261003` from current main `41471fd24fe43dd41d6114e67ba00ba1a6a0783b`. Source `48df31a3ffe7d0683648a83c7dcc01fd74ee907c` adds cold-process cleanup for the existing recorder's exact `voice-{UUID}.m4a` temporary files. The shipping W6 registration runs it before exposing its screens. Only direct regular files qualify; symlinks, directories, nested files, other names and extensions are excluded. Later files in the same process are preserved. A failed sweep remains retryable and refuses recording before microphone permission or new bytes; canonical copy explains the failure.

Android's existing recorder cleanup from merged241 and the fan-download cleanup from merged273 are reused. No alternative app root, authority, retention policy, held purpose or backend write is introduced. Qelvora remains configured through `config/brand.json`.

## Personally verified installed result

The current canonical XcodeGen composition was dumped and compared with the private shipping project after resolving only source/build paths. The normal signed iOS shipping build and strict deep codesign verification pass. Built and installed executable/dylib hashes match:

| File                   | SHA256                                                             |
| ---------------------- | ------------------------------------------------------------------ |
| QelvoraApp             | `e7e4335d59f5b6faf8966849ab75afe8923a20930715170d017ec992a2e7994c` |
| QelvoraApp.debug.dylib | `13a18b9f77affb234750faac45b1fab67077d23b78dc80cb2f84b3e782851c6b` |

Actual cold launch removed two exact uppercase/lowercase UUID regular files and preserved a matching symlink/control, matching directory/nested file and unmatched name. Diagnostic bytes SHA256 `d9ae7f445fa655fcade78a0e917119004fda005148025ae204365cd8c4341a1f` are explicitly labelled text, not audio or human publication. A fresh matching file remained across actual Requests→Voice deep-link dispatch in the same process59445. No Requests access is inferred while offline.

An owned diagnostic file with the real filesystem immutable flag prevented deletion. The actual Night screen displayed the cleanup notice. Record retried and remained blocked with zero duration. A failed sweep can leave additional old files; it is not credited as successful cleanup. After clearing only that owned flag, Record in the same process81025 removed the file and returned the actual microphone-denied notice. No recording controls/new audio appeared. Same-process navigation preserved another fresh file; terminate and cold relaunch90073 removed it after the real Voice screen became ready. Control bytes, nested file and symlink target were checked again. Light/Night screens were personally viewed.

An initial physical probe was made before the second cold screen initialized and failed; the final repeat waits for the actual accessible Voice/Record controls before checking files. The first denial setup revoked microphone access and the OS terminated the app, so that attempt is not same-process recovery. The separate81025 repeat supplies that proof. Routine original failures/JSON/screenshots remain private. No new unit test, coverage/snapshot/reference or framework change was made. Canonical12-resource/115-operation generation, scoped format, current web typecheck and the shipping build pass.

This increment accepts the installed local-file cleanup/refusal/retry path only. Actual human mic/passkey/C2PA/publish/play/seek, physical audio, production identity and complete privacy/accessibility remain open. API/web/database stayed stopped. Last canonical61 selected-row qualification remains07:42:54Z from the held call-offer increment; no new database state or publication acceptance is inferred.

## Resource closure and review custody

Actual budgets were re-inventoried: two peer simulators were booted, no emulator, and no occupied heavy lease. Only the uniquely matched owned Qelvora W6 Media Successor/55E27B56-428E-4DB4-AE26-011939EFA632 was booted, keeping at most three simulators. The one guarded native build released normally. Its companion53830 used only port59106; no global GUI controls were used.

All diagnostic entries were removed using their exact device/nonce/dev/inode/mode/hash or symlink target. The app/companion stopped, own simulator shut down, port59106 closed and exact slot lease released at08:22:16Z: nonce141ec700-1ed2-4bc1-a41b-3fd7926d0bfb/dev16777232/inode243993304. Original container e1d9f59f5ceaad36ee1b821a2860e23a92dd1928d70dfddd36027b5b2a33a5a7 remains exited; volume/backups/secrets/tools and peer resources are preserved.

Private shipping build log SHA256 `16610edba685bc15294bb40e328877fa7956ac587e30ca48153bbc5c7d638d2c`; same-process recovery UI `fe3f17dd2b70049b4149ecff984844b3b7a3c213a64346b0bdf7135984e5c9bf`; final cold UI `380a3173643ef96f33ba557884417a5fde99e2998c91593402a1cce19dd2aa25`; closure receipt `f5ea31a94311d094963fac79801a549c31662882b4dd404cdcfbcdba62cb5428`.

The requested oldest-first ownership/reuse review is [published on the preserved call-offer branch atcf281262](https://github.com/WangPantopus/creator-platform/blob/cf281262f5f0a0bdf1612db70391579cbf9afe90/docs/workstreams/coordination/W6-pr-review-2026-10-03.md). W6 personally read all seven owner dispositions, including [W7's complete published disposition](https://github.com/WangPantopus/creator-platform/blob/dcb9a39f133ee4ad365e44dd86a00324b3ac3a12/docs/workstreams/coordination/W7-pr-review-20261003.md). Original46 assigned; twelve W3 closures plus W4's source-preserving206 closure are unmerged. New W5 documentation283 follows that capture. Current hosted checks/owner combined reviews and genuine relevant acceptance remain required; no audit merge or whole package is checked off. Held282 and every peer/protected historical branch remain preserved. W6 continues personally.

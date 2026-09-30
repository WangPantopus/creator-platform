# W6 authorized CI repair — 2026-09-30

The founder explicitly authorized continuing until completion and correcting code or CI checks where appropriate. This supersedes the pending shared-file lease in the earlier [CI triage](../../resume/2026-09-30/ci-triage.md). Implemented personally in worktree 970d, based on W6 head `598ee825a67b9baf5c39aeda313a08721b246eb5`; main remains `2e337a1`. No agents or paid AI calls were used.

## Repairs

- Applied the nine-file proposal: five shared formatting repairs, Android setup requesting supported `platform-tools`, and iOS-only text/keyboard modifiers guarded on macOS.
- Removed the duplicate auth `alert`; the existing error Notice retains the accessible alert.
- Updated existing auth assertions to canonical `/home`, `invalid_return`, and registered UUID context. An unconfigured sign-in still fails closed; unsafe redirects still fail. No fictitious default creator or arbitrary query permission was restored.
- The existing Welcome/Main visual comparisons now explicitly use the approved reference compositions. Actual auth assertions remain against the functional auth route. The Android arrival-removal case likewise mounts the existing Welcome composition; it cannot imply authenticated root acceptance without public creator metadata.
- The existing PostgreSQL suite now applies production migrations 0001 and 0002, because current authority checks lock identity profiles under the latter's actual RLS/grants. No broad test-only grant was added.
- Foundation screenshots preserve unfocused input caret styles, avoiding Playwright's mutation of server markup before Next hydration. The affected Night Handle comparison passes with exact equality.

No test files, cases, suites or harnesses were added. Existing reference files, golden images, assertion tolerances, random-pair count and time limits are unchanged. Generated Next declarations and automatic Swift transitive lockfile rewrites were restored.

## Local checks and limits

- Full `pnpm check` passed after the shared repairs and canonical auth contract correction: generated resources, TypeScript, ESLint, formatting, existing checks and production builds. That run had no PostgreSQL URL, so its integration cases were skipped; it does not prove the database path.
- Genuine disposable PostgreSQL 17/pgvector run: 17 of 18 existing cases passed after the migration correction. The 10,000-pair non-owner isolation case timed out at its unchanged 120-second limit on this busy Mac through Docker networking. It is still an unresolved check; await the Linux CI run before attributing it to application performance or changing implementation.
- Existing web visual run: 10/13 cases passed. Two failures compare the independently rendered reference against committed Light goldens on a different OS/Chromium environment. The remaining Night Handle failure was traced to screenshot caret mutation and its targeted rerun passed after the fix. Catalog's existing rounding bounds remain unchanged; these reference checks do not prove W6 functional media/calls.
- Swift package compiles on macOS after the platform guards. Fifteen non-snapshot cases pass; three snapshot cases report 110 individual differences. Goldens are macOS/Xcode 27 images with an LG HDR 4K profile; this host is macOS 26.7/Xcode 26.5 and emits sRGB. SnapshotTesting requires the same OS for matching. Golden images remain intact pending the configured Xcode 27 CI run. This is no physical-device or calling proof.
- No local Android SDK/JDK or native UI control is available. Current CI must verify the setup and existing runtime composition changes.

## Resources and publication

Reserved only owned container `creator-platform-w6-ci-20260930`, disposable database `creator_w6_foundation_test`, loopback port 55436, Swift scratch `/tmp/qelvora-w6-ci-repair-swift-20260930`, and Next visual output `.next-w6-ci-visual`. Peer containers/devices/processes remain untouched. Playwright-owned 3000/3101 servers have exited. No credential contents or private fan data are in this record.

PR #4 remains the integration vehicle. The GitHub connector authenticates as `wypgitt`; PR metadata writes return HTTP403. Reconnecting an authorized account/app or providing an authorized local GitHub CLI session is needed for PR metadata/merge actions. Git push works. Live PR title/body have not been replaced by the [prepared description](../../../../../docs/workstreams/handoffs/W6-pr-description.md).

W6 remains incomplete: real storage/scanner/C2PA and audience authority, canonical runtime/availability allocation, approved policies, genuine call provider/client SDKs and media producers, physical hardware and full functional acceptance are still required. CI success alone will not close those gates.

## W4 retained authority integration

Fetched current W4 branch `ada430cf8ff5ddfc98a6b60bcecff2f69620ec24`. Its producer commit `81d92355dadcb808e5332fd409398c3647824b3f` adds `CommerceScheduling.retained`; W6 now consumes the exact current producer file without reimplementing its policy. The 49-line addition binds creator/fan/thread/account and a historical capture, permits the producer's retained states, and leaves `current()` as the sole scheduling/join authority. W6 invokes `retained` only for an ended/cancelled, non-revoked call. This supersedes the earlier missing-retained-adapter source gate; genuine post-settlement receipt/consented-summary acceptance remains unverified. Backend production build, source ESLint and formatting pass.

## Published CI outcomes and access follow-up

Published repairs in `d9a17501b586b1b0f35246313348a60844a4c02d` and retained-authority integration in `7d4f86117e1453cbea37ec1c96eb0586a69fb527` to existing draft PR #4. Main remains `2e337a1`; the worktree is clean.

- [Repair run 36753823133](https://github.com/WangPantopus/creator-platform/actions/runs/36753823133): web/backend passes all 18 existing cases, including the 10,000-pair real non-owner PostgreSQL case in 97,708 ms, plus generation/type/lint/format/production builds. Android emulator job passes. Android SDK setup and APK compilation pass; foundation unit stage has 15/19 passing cases, with components Light/Night and thread states Light/Night raising assertions. The latter failures need their detailed report; do not update goldens or relax checks without diagnosis.
- [Integrated-head run 36754102532](https://github.com/WangPantopus/creator-platform/actions/runs/36754102532): web/backend and Android emulator jobs pass. At the recorded observation, Android foundation, web visual and iOS foundation await runners. Earlier Xcode 27 logs verify the runner is actually macOS 27/ARM64, matching the golden OS generation; this Mac remains a different rendering environment.
- The Android report ZIP was obtained as a connector file reference, but its file-download endpoint returned HTTP403 (1010) on two attempts. No report contents were available locally. A properly authorized GitHub CLI can retrieve the original GitHub artifact directly.
- Installed official GitHub CLI 2.102.0 for amd64 at `/Users/yingpengwang/.local/bin/gh`, verified against its GitHub release SHA256 digest. No preexisting binary was overwritten. It initially has no authenticated account. Browser device login is pending user completion; one-time login codes and tokens are excluded from evidence. Existing working git credentials were not replaced.
- Owned PostgreSQL container is stopped cleanly and remains recoverable for follow-up; no peer resource was stopped. Source/lock/generated files remain preserved.

PR metadata/merge remains unavailable through the connector authenticated as `wypgitt`; the author/repository owner is `WangPantopus`. Repository write authority and GitHub App PR write permission are separate requirements. The local CLI browser login is an authorized alternative; changing Codex tool approval preferences alone cannot fix the upstream HTTP403. Actual app/provider/hardware/policy gates remain open and no merge readiness is claimed.

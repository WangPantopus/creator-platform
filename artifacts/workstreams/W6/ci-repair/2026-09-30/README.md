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

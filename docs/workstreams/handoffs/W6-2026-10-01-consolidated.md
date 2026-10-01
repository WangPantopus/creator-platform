# W6 consolidated handoff — October 1, 2026

> Worktree cleanup follow-up: the user authorized removal of W6 checkouts after complete remote preservation. Treat970d/6438/89d9 paths below as historical after cleanup; create/reuse a fresh worktree from `origin/codex/w6-completion-20261001` and inspect `origin/codex/w6-isolated-recovery-20261001`. The previously uncommitted iOS lockfile is now preserved verbatim as recovery evidence, not adopted code, under `artifacts/workstreams/W6/cleanup/2026-10-01-worktrees/`. Both implementations retain their existing PRs.

This is the current handoff for **Calls, voice, and media**, combining the two open W6 follow-ups and the latest direct user instruction. It supersedes older execution-policy and readiness summaries where they conflict. It does not claim W6 is complete.

The [copy-paste successor prompt](../prompts/W6-resume-20261001.md) contains the assignment and complete remaining work. Historical documents remain useful evidence at their recorded source revisions.

## Latest direct user direction

The user asks the successor to pursue the whole workstream ambitiously, without additional blanket restrictions or artificial holds. **Do not write new unit tests.** Coverage may be scoped; coverage percentages are not a deliverable. Earlier blanket prohibitions on all test code or routine integration work must not become a reason to stop.

Actual end-to-end verification is required: launch and operate the web app, Android app in an emulator, and iOS app in a simulator; fix observed problems and verify relevant recovery paths against the actual backend. Builds, catalogs, fixtures and unit checks do not substitute for these journeys.

Commit and push coherent increments, create/update PRs when reviewable, move ready work out of draft and **merge when ready**. Routine permission for those actions is already given. Do not wait for unrelated future features before merging an independently working increment. Record incomplete feature behavior accurately.

The earlier Mac cleanup pause was real. No runtime was restarted to write this handoff. Pasting the successor prompt explicitly resumes necessary implementation/build/app sessions; provision minimally and stop owned resources afterward. Real data, authority, consent, credentials and provider truth are product requirements, not arbitrary procedural holds.

## Repository and branch state verified for this handoff

| Item | Exact state |
| --- | --- |
| Primary checkout | `/Users/yingpengwang/.codex/worktrees/970d/creator-platform` |
| Primary branch | `codex/w6-completion-20261001` |
| PR #20 implementation source | `7a4ed10d3dea335d3a375a0269dbe3a9dec56b80` |
| PR #20 | [Bound media ingestion and verify external C2PA credentials](https://github.com/WangPantopus/creator-platform/pull/20), open draft when checked |
| Second checkout | `/Users/yingpengwang/.codex/worktrees/6438/creator-platform` |
| Second branch | `codex/w6-isolated-recovery-20261001` |
| PR #19 published head | `2831c07faeb1b868d43e56e078e3785093f9034c` |
| PR #19 application source | `3867b74ff3d80d041dd0552ae5c33422a17c09ea` |
| PR #19 | [Guard native call cleanup and account-bound media uploads](https://github.com/WangPantopus/creator-platform/pull/19), open draft when checked |
| Latest fetched main | `c1c615e6ece53bff4bc6a47d7f4d332757df1295` |
| Earlier PR #4 | Merged as `f6802e1f691aeef14052055a41b4d2bfff54c831` |

This documentation increment advances the primary branch beyond the implementation source above. Inspect actual HEAD rather than resetting to that source. Fetch current main before integration; it continues changing.

970d has a pre-existing uncommitted tracked `apps/ios/Package.resolved` modification: `swift-issue-reporting 2.1.1` is replaced by `xctest-dynamic-overlay 1.13.1`. Earlier parallel build ownership is recorded; this handoff does not alter or commit it. 6438 was clean at its published head in the latest inventory. Inspect current ownership/activity before mutating another checkout.

Preserve both descendants and the full prerequisite history. Review their overlapping backend worker/session/native/shared-check changes, reconcile with current main, and choose a coherent integration sequence for the existing PRs. Do not duplicate PR scope or silently discard one branch. The shared original checkout is `/Users/yingpengwang/creator-platform`.

GitHub CLI: `/Users/yingpengwang/.local/bin/gh`. Owner access was working for read/write/push/normal merges.

## What each checkpoint supplies

**PR #20:** bounded no-follow descriptor reads; declared/actual byte and duration validation; restricted demuxers/protocols/resources; process-group cancellation; PostgreSQL bigint normalization; expired-lease fencing; retryable revoked deletion; concrete `C2PAToolCredentialSigner`. The adapter requires a genuine external signer and pinned trust anchors, independently verifies the assertion/signature/trust/file binding, and preserves the immutable processed tuple separately from final served bytes. It is implemented, unconfigured, and has no positive trusted-signing acceptance.

Read [completion evidence](../../../artifacts/workstreams/W6/completion/2026-10-01/README.md), [source manifest](../../../artifacts/workstreams/W6/completion/2026-10-01/source-manifest.json) and [runtime contract](../W6-c2pa-runtime.md). Synthetic tone/image, real FFmpeg/ClamAV component checks, EICAR detection and untrusted/failing-signer denial were diagnostics. Final full-pipeline negative runs hit scanner deadlines; neither those failures nor component passes establish human media delivery.

**PR #19:** native asynchronous answer/end/reset cancellation, post-connect authority checks and previous transport drain; closed/recording-off/zero-participant cleanup; account-bound upload hashing/resume/chunks/finish; ticket/asset checks; strict Swift comparison and Playwright URL repairs. Its [handoff](https://github.com/WangPantopus/creator-platform/blob/2831c07faeb1b868d43e56e078e3785093f9034c/docs/workstreams/handoffs/W6-2026-10-01.md) and [evidence](https://github.com/WangPantopus/creator-platform/tree/2831c07faeb1b868d43e56e078e3785093f9034c/artifacts/workstreams/W6/resume/2026-10-01) live on the separate descendant; they are not assumed present in970d.

**Already on main:** resumable quarantine/processing/tickets, exact signed recording association, separate final served-file proof, creator-owned object media, browser/Swift/Kotlin consumers, availability/session/outcome/effect seams, independent consent, W4 retained receipt/summary authority and W5 content/publication authority. Do not reopen obsolete requests for producers already implemented.

## Current CI and actual-app evidence

Status was re-read from GitHub for this handoff; older statements that these jobs remain queued are stale.

| Application source/run | Backend/web | Android foundation/runtime | Web visual | iOS foundation |
| --- | --- | --- | --- | --- |
| PR #20 `7a4ed10`, [PR run36847960034](https://github.com/WangPantopus/creator-platform/actions/runs/36847960034) | Pass | Both pass | **Fail**, Run pnpm test:visual | **Fail**, Verify native Swift package |
| PR #20 `7a4ed10`, [push run36847886709](https://github.com/WangPantopus/creator-platform/actions/runs/36847886709) | Pass | Both pass | **Fail** | **Fail** |
| PR #19 app source `3867b74`, [run36846723576](https://github.com/WangPantopus/creator-platform/actions/runs/36846723576) | Pass | Both pass | **Fail**, Run pnpm test:visual | **Fail**, Verify native Swift package |

PR #19 documentation head2831c07 has no check rollup. This is not a successful exact-head application run. Inspect genuine failed logs/artifacts and the current reconciled candidate; do not guess that all failures share the earlier cause.

PR #20 hosted full backend18 checks passed; T11 completed around45.7s. Local full/isolated T11 hit the unchanged300s limit. Both facts remain recorded. The user does not require unit coverage work.

PR #19's actual browser390×844 Light/Night request/cancel restores Record focus/0:00. No successful capture/upload/sign/play is proved. PR #20 observed launched HTTP services, all capabilitiesfalse, and tool diagnostics; interactive browser control was unavailable in that continuation. Earlier PR #4 sign-in/catalog/native launch and permission-denial evidence belongs to its older revisions. Simulator/emulator signing checks and component fixtures are not recording/calling acceptance.

## Canonical W3 producer and runtime boundaries

Rechecked at main3de0f14 and unchanged through fetched mainc1c615 for media/session/API/registry paths:

- `MediaService.signingCommandInTransaction`, `publishedRecording` and `publishedRecordingRead` bind the exact processed asset ID/version/hash/bytes/MIME/duration, original occurrence and signed act. W3 uses its held client, locks Thread before media, and never consumes the act a second time. Reply subject is the actual Thread ID; creator signing/delivery requires current creator and human_active authority.
- Fan reads require `MediaAuthority.currentRecordingPublication(scope, recording, heldClient)` under real fan scope/non-owner RLS. The required interface/denial exists; no configured implementation was found. No creator impersonation, second transaction or recursive media-read substitute.
- `PlaybackFile` binds separately served variant/hash/bytes. Storage verifies the exact held descriptor; tickets and active streams recheck current scope/version/proof. Credential decoration must not rewrite the creator-signed processed tuple.
- Calls enqueue an idempotent handback after complete provider-backed C07 outcome. `CallEffects.handback(scope, sessionId, key)` remains unconfigured; missing adapter leaves a retryable effect. No activated call takeover/timeout/exit bridge exists. Use W3's canonical epoch/sequence control protocol and actual authority.
- `server.ts` mounts `mediaFeature({})`; W6 development runtime also leaves media/provider integrations unavailable. Only `UnavailableCallProvider` is implemented. A supported genuine provider still needs replay denial, complete historical account intervals, current revocation, closure and retained recording deletion.
- `infra/migrations.json` still lists0046 availability,0047 creator media,0059 recording association and0060 composed signed message as `reserved_unapplied`. This is an exact registry observation, not a new approval prerequisite; resolve composition/custody and migrate an appropriately owned environment without rewriting applied history.

LiveKit Cloud **evaluation** is approved; no account purchase or provider credentials were supplied. The C2PA adapter needs absolute tool/signer/trust-file paths, exact trust-file hash, private work directory and approved byte ceiling. Actual signer/provider/authority/retention configuration, creator/fan sessions and physical devices remain missing inputs to obtain.

## Remaining scope and order

Finish human media/sign/publication/playback first while integrating scheduling/calls in coherent increments. The successor prompt spells out all eight packages: media and every purpose; C06 scheduling/DST/recovery; real transport/provider admission/history; C07 clocks/outcomes and W3/W7 effects; separate consent/archive/retention/deletion; native/physical call behavior; licensed marked AI audio; full design/accessibility/coverage/opportunities/latency/cost.

Do not reduce scope to a scaffold or one compiling adapter. Resolve open positive grace, both-absent, cancellation/rescheduling, initial captured scheduling and retention questions with concrete proposals; do not fabricate financial policy. The approved180-second reconnect budget is not late-arrival grace. W4 owns settlement; W2 owns voice licensing. Current unknowns block their dependent path only.

Original assigned artboards:4E-01/02/03/04 and4F-03. Track contributing T-09/12/16/18/25/28/29, A4/A9/A10, O07/O08/O15/O19/O20 and missing composition/accessibility cases. Preserve the fixed stack, shared designs/copy/tokens, opaque identity and brand rename.

## Reference provenance

Historical550d3b4 changed110 iOS reference PNGs using ColorSync conversion (94 decoded RGBA changes) and re-rendered four Android Composer images after its source correction. All were already present at takeovera124ad0; zero-refresh counters in that continuation were not whole-PR byte-preservation claims. PR #4's live description was corrected. No separate explicit reference-conversion approval was found. Later main restored original Swift reference bytes.

Android ended Composer's rounded panel, AccessLines/Join and StepIn below are explicitly preserved by the human handoff and match web/Swift. Do not revert app behavior merely to match older images. Diagnose actual visual defects; do not hide them by swapping references or claiming skipped checks passed.

## Resource cleanup and safe restart

The latest local inspection found no listeners on W6 ports3006/4106/5046/55436/55446/55456. Earlier inspection found no W6 processes/emulator/simulator. W5 is cleaning project-owned resources across the machine; all old tool paths/device IDs/fixtures must be rediscovered before reuse.

The last remaining isolated fixture was stopped container `c8c4ace141a0d95e8517d83aa187445f260a325bf9ea8c8b685e7f78e90bf70c`, name/volume `creator-platform-w6-isolated-20261001`; verification databases were disposable. `/tmp/qelvora-w6-resume-20261001` was regenerable tooling/output. Both may now be removed. PR #20's completion fixture/tools were already removed, as its [release record](../../../artifacts/workstreams/W6/completion/2026-10-01/resource-release.json) documents. No temporary source-only data required preservation.

Keep tracked source, Git history, committed evidence and the outstanding lockfile change. Reinstall only necessary dependencies/tools when the successor begins. Reserve isolated runtime/DB/build/device resources and verify ownership. Avoid simultaneous heavy native/visual/database workloads on this Mac. Stop owned runtime resources after verification.

A supplied OpenAI secret path exists in historical instructions but is not needed for handoff or ordinary W6 work; never print/commit secrets or treat it as a provider/signing/voice license. Determine genuinely required access before using external services.

## First actions for the successor

1. Verify both W6 branch heads, worktree changes, current main and PR state. Read this handoff and actual source.
2. Reconcile the two descendants, preserving recovery and processing fixes; inspect latest failed visual/Swift artifacts and fix real causes.
3. Restore only the needed environment and complete the first genuine end-to-end human-media journey with concrete configuration dependencies.
4. Verify affected web/iOS/Android paths, record source-bound evidence, make the increment ready and merge it. Continue subsequent increments until W6 is finished.

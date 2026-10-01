# W8 preserved handoff — 2026-09-30

This is the authoritative current continuation checkpoint. The user requested a handoff at a stable stopping point, with work committed/pushed and a comprehensive next-agent prompt. No product source was changed during this handoff. All original W8 packages remain assigned; **W8 is not release-complete and PR7 must stay draft**.

Start with the [paste-ready assignment](../../../../../docs/workstreams/handoffs/W8-resume-prompt.md), [full handoff/file map](../../../../../docs/workstreams/handoffs/W8.md), [current acceptance status](../../../../../docs/workstreams/status/W8.md), [contract/lease register](../../../../../docs/workstreams/coordination/W8-contracts.md), and [remaining inputs](../../../../../docs/operations/W8-required-inputs.md). The [Sep30 implementation evidence](../../resume/20260930-local/README.md) contains the actual journeys/screenshots/builds/producer integration. Sep29 cleanup and former case/device IDs are historical; do not apply those cleanup instructions to current resources.

## Git, ownership and PR disposition

- Checkout: `/Users/yingpengwang/.codex/worktrees/28ed/creator-platform`; branch `codex/w8-trust-handoff`.
- Source checkpoint: `bf92a8b13bc371b2bd87eea826a55d16c10f641c`, clean and pushed before handoff documentation. Main observed `2e337a1afdf6d8bba3974427588e0b34b6d42d36`;39 commits ahead/0 behind. Fetch and inspect actual tips before continuing. The handoff documentation commit is the subsequent branch tip.
- Latest product change: `4fab21cf44b7b921924eae5037734b7a9bfa2281`, phone case metadata spacing. Verified backend/image: `da03bb764cd05d0f6ac7e19fcd012611226465c5`; whole native build: `8636dd7c6302dd1667cf78364e85d14555bac9f7`. Backend/infra and native source remain exactly unchanged from those build revisions. [Source tree receipt](source.json) pins actual Git trees; no new runtime image is claimed for a doc commit.
- Published W1–W7 provenance is in [integrated-producers.json](../../resume/20260930-local/integrated-producers.json), including canonical40-entry migration registry through0043. All existing SQL/checksums, tests and goldens are preserved. Dependency capture is not W8 authorship or acceptance of all changed files.
- Existing [draft PR7](https://github.com/WangPantopus/creator-platform/pull/7) is open/unmerged. At read, Git conflict mergeable=true. This does not establish CI or release readiness. [PR receipt](pr7.json) records observed revisions.
- SSH push is working. Last PR metadata write returned403 `Resource not accessible by integration`; its current body still describes historical resources. Apply [prepared description](../../resume/20260930-local/pr7-proposed-description.md) plus this checkpoint when legitimate write access permits. Do not create a duplicate or bypass credentials.
- User already authorized commit/push and PR/merge when ready. Continue under existing narrow isolated seam/integration authority in the register; no peer changes or messages. Personally do W8 work; no delegated implementation agents.

## Live W8 resources: deliberately retained

Observed2026-09-30 around21:04UTC/14:04PDT. These are local synthetic resources, not staging/production approval. Verify availability and ownership again; exec handles may not transfer between chats.

| Resource            | Current observation / lease                                                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web                 | `http://localhost:3008`, support route200; own `.next-w8-resume`, Next dev webpack. Existing exec session22579 is an observation, not a future handle guarantee.                                                             |
| API                 | `http://127.0.0.1:4108`, live200, ready503; release labelda03bb7. Existing exec session93216; private JSONL log `/private/tmp/creator-w8-api-da03bb7.jsonl` mode0600. Backend source is unchanged through source checkpoint. |
| PostgreSQL          | Docker `creator-platform-w8-resume-20260930`, running PG17/pgvector; loopback55438→5432; database `creator_w8`.                                                                                                              |
| W8 volume           | `2301545bd4de85bf917b17249c6a1b5b3b9b9a6fab9531f6dfe02a459e1027c2`; preserve data, no prune/delete.                                                                                                                          |
| Local private env   | `/private/tmp/creator-w8-resume-runtime.env`, mode0600, generated local keys/non-owner pools; contents never printed or committed. This contains no OpenAI key.                                                              |
| Pools               | Trust runtime creator_trust_runtime(max8), Trust worker creator_trust_worker(max2), canonical conversation creator_runtime(max4); optional growth_runtime(max1)/growth_worker(max2). No runtime owner/bypass.                |
| Closed restores     | `creator_w8_integrated_restore`, `creator_w8_resume_restore`, `creator_w8_resume_restore_legacy`; earlier fresh integration DB `creator_w8_integrated_fresh`. No traffic reopen.                                             |
| iOS own outputs     | `/private/tmp/creator-w8-integrated-ios-derived`; ignored `apps/ios/QelvoraApp.xcodeproj`. No newly reserved device.                                                                                                         |
| Android own outputs | `/private/tmp/creator-w8-integrated-android/{gradle,project-cache,build}`; no newly reserved emulator/device.                                                                                                                |

Node PATH prefix: `/Users/yingpengwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin`. Docker CLI: `/Applications/Docker.app/Contents/Resources/bin/docker`. Read-only existing tools: JDK `/private/tmp/creator-w7-resume-tools/jdk/jdk-21.0.12.1+1/Contents/Home`, Android SDK `/private/tmp/creator-w7-resume-tools/android/sdk`, XcodeGen `/private/tmp/creator-w7-resume-tools/xcodegen-bundle/bin/xcodegen`. These paths do not authorize altering another owner's files. Inspect current tool/device leases before use; normal Simulator ad-hoc signing supports Keychain, unsigned build storage previously failed.

Private env names only: `W8_CONVERSATION_DATABASE_URL`, `W8_DATABASE_URL`, `W8_WORKER_DATABASE_URL`, `W8_GROWTH_WORKER_DATABASE_URL`, `W8_LOCAL_DEVELOPMENT`, `NODE_ENV`, `PORT`, `WEB_ORIGIN`, `W8_LOCAL_SESSION_KEY`, `W8_GROWTH_ENCRYPTION_KEY`, `COMMERCE_CURRENCY`. If own API is absent and a restart is warranted, load these through a private Python environment mapping, prepend the Node PATH and exec `node --import tsx apps/backend/src/operations/local-server.ts` from this checkout. Label `RELEASE_REVISION` with the verified exact backend build/source, not an unbuilt revision. Do not print the env or run two servers on the same port. Do not restart unrelated processes.

Own web launch, only if absent, from `apps/web` with the Node PATH prefix and:

```sh
W8_LOCAL_DEVELOPMENT=true W8_API_URL=http://127.0.0.1:4108 QELVORA_API_URL=http://127.0.0.1:4108 QELVORA_PUBLIC_ORIGIN=http://localhost:3008 CREATOR_NEXT_OUTPUT=.next-w8-resume pnpm exec next dev --webpack -p 3008 -H 127.0.0.1
```

Reacquire normal labeled synthetic actors through the actual UI. Do not inject tokens/cookies or reuse stale controller tab/exec IDs. Available native computer APIs are disabled; SDK compilation/launch is not tap-through acceptance. Browser completion previously hit a Runtime/focus timeout; do not assume a cookie defect. Last observed viewport reset1280×720 succeeded; reacquire current surface state before interacting. Keep current runtime resources for the next owner, not the former Sep29 cleanup policy.

## Current durable data: do not reseed/reset

[Current sanitized state](current-state.json) is a read-only synthetic metadata observation; it includes no raw message, export, token or secret.

| Record                                                 | Current state                                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| CASE-001 `a19ec4ae-aae4-41cf-bae0-a4625aa64e70`        | resolved/version4; earlier actual appeal/independent decision history            |
| CASE-002 `27fbf5f9-7e9e-456e-8594-153a3ebcabfd`        | open/version1; block scenario                                                    |
| CASE-003 `030868cc-e778-4fca-8731-02a4c817fcfa`        | resolved/version2; current exact AI report→lease→closure→own inbox phone journey |
| Original export `758588f9-de97-4eef-b820-5c6720fcb6a7` | blocked;7 complete/content blocked                                               |
| Deletion `d1a6d350-2033-4a05-8968-dbfa53e81135`        | blocked; trust complete/7 domains blocked;1 tombstone                            |
| Newer export `c263cf80-f80f-4bfd-8e07-4b4c13019869`    | blocked;5 complete/media-growth-content blocked                                  |
| Denials and migration history                          | 1 block/0 separate restrictions/1 tombstone;40 migrations with40 checksums       |

Synthetic accounts: fan1 `10000000-0000-4000-8000-000000000001`, fan2 `...002`, Maya creator actor `...003`, supervisor `...004`, independent reviewer `...005`, verifier `...006`, deleted recovery creator actor `...007`. Creator profiles `20000000-0000-4000-8000-000000000001`/`...002`; fans `30000000-0000-4000-8000-000000000001`/`...002`; threads `40000000-0000-4000-8000-000000000001` blockedfan1, `...002` permittedfan2, `...003` deleted-recovery; existing static messages `50000000-0000-4000-8000-000000000001`/`...002`. Ellipses are documentation abbreviations; use actual complete UUIDs from verified data. These are synthetic fixtures, not successful AI generation. Never clear their denial to make a happy path pass.

## Private recovery: paths and hashes only

[Recovery receipt](recovery-files.json) records the current private files, size/mode/SHA256 and precise limitation:

- Current logical snapshot `/private/tmp/creator-w8-handoff-20260930-2104.dump`,548072 bytes, mode0600. `pg_dump -Fc` exit0, `pg_restore --list` exit0/1277 entries. **This new snapshot has not been restored.** Operator backup uses owner only inside own container; runtime never uses that credential.
- Newer external journal `/private/tmp/creator-w8-handoff-20260930-2104-journal.json`,453 bytes, mode0600, schema2/1 tombstone. Existing `tombstone-journal.ts export` used existing non-owner W8 worker through private `DATABASE_RECOVERY_URL`; journal includes verified pre-purge ownership. Never put it in Git/output.
- Earlier retained private files: `/private/tmp/creator-w8-resume-before-peer-integration.dump`, `/private/tmp/creator-w8-resume-20260930-before-deletion.dump`, `/private/tmp/creator-w8-integrated-tombstone-journal.json`, each observed0600. Keep them for the already recorded older-backup/newer-journal rehearsal.

The previous [integrated recovery](../../resume/20260930-local/integrated-recovery.json) measured14,713ms for full migration/old-backup/newer-journal replay with1 tombstone/8 pending tasks. Restored traffic remains closed. Neither that measurement nor these local `/private/tmp` copies establish durable off-host/WAL backups, completed purges, approved retention, RPO/RTO or traffic reopen. If moving hosts, arrange approved private transfer/storage; Git alone cannot recover the current database/private env. Preserve until the next owner verifies continuity.

## Checks and exact remaining acceptance

[Readiness](readiness.json): required database available/non-owner RLS verified; synthetic identity development; model/payments/calls/voice/push and all privacy completion probes unavailable. Seven export registrations do not establish retention/erasure readiness; content is owner_hook_unconfigured. HTTP503 is expected and not a false release pass.

[CI bf92](ci-bf92a8b.json): Trust compile passed. Foundation web/backend and Android runtime failed; iOS/Android Foundation/web visual queued at observation. Actual logs confirm8 contract passes/1 obsolete positive context failure, and PostgreSQL0001-only setup42501 before9 cases. Android runtime3pass/1fail reports touch injection, not a definitive missing-element cause. Historical visuals/snapshots remain open and unchanged. The [narrow existing-fixture proposal](../../../../../docs/operations/W8-ci-fixture-proposal.md) is pending a specific human exception to “no new tests or test code”; no test/golden/check edit was made. Queued jobs are unknown, not accepted or waived. Recheck eventual handoff tip checks separately.

Backend/web builds, lint/format/generated checks passed at da03; phone CSS4fab production web build/scoped format passed. Whole current iOSSimulatorSDK26.5 and Androiddebug compile at863. See [builds](../../resume/20260930-local/builds-da03bb7.json), [phone spacing](../../resume/20260930-local/phone-case-spacing.json), [current image](../../resume/20260930-local/image-da03bb7.json). Trust-only image is non-root/minimal digest-pinned; canonical API/web/owner services require same reviewed approved deployment. No remote deploy/signature/SBOM or native/hardware proof inferred.

Current canonical HTTP session/support/history succeeds after undefined-pass→explicit-null correction; another fan is denied. Actual browser completion hit controller timeout; **conversation Report-link click remains unverified**, as do native auth/system sheets/accessibility. Current phone CASE-003 exact evidence/lease/close/inbox and Ops keyboard/partial Light/Night geometry are verified separately. See [canonical HTTP](../../resume/20260930-local/canonical-web-handoff-da03bb7.json), [phone report](../../resume/20260930-local/scoped-report-journey-da03bb7.json), and screenshots in that index.

Next owner should first recover state and normal browser control, then complete actual conversation Report entry/canonical session/native UI acceptance and investigate existing CI without weakening C11/RLS. Finish independent source/design/state work while awaiting the specific CI exception and approved external inputs. The full **R1–R10 disposition table** is in [status](../../../../../docs/workstreams/status/W8.md), and the [comprehensive prompt](../../../../../docs/workstreams/handoffs/W8-resume-prompt.md) spells out every remaining package.

External gates remain exact: reviewed Q05/Q16 content/retention/license and real identity-erasure lifecycle; genuine effects/notices and representative binaries/large exports; real processor/provider sandbox budgets; staffed regional support/legal; approved hosting/HTTPS/RP/projects/secrets/WAL/security; supported native control/signing/hardware; consented Q12 pilot and G0–G5. [Inputs](../../../../../docs/operations/W8-required-inputs.md) gives location/authority/action/acceptance, rather than a vague request for staging credentials. The provided OpenAI key file was never opened or used; zero paid calls/cost. No new tests, immutable SQL edits, grant/RLS widening, peer checkout writes, production deployment or merge occurred at this checkpoint.

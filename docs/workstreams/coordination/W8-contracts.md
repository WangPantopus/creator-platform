# W8 contract, migration and runtime register

Current checkpoint:2026-09-29 PDT / 2026-09-30 UTC. W8 personally implemented and verified its work; research help is read-only. This does not grant an edit lease over another owner's files.

## Leases and baseline

| Resource       | W8 reservation                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Web/API        | 3008/4108; shared3000 and peers preserved                                                                                              |
| Database       | creator-platform-w8-local on loopback55438; creator_w8/integration/restore/schema_reference; no peer DB migrated                       |
| Queue/provider | DB trust queue, w8-local namespace; no live provider records                                                                           |
| Web build      | /private/tmp/creator-w8-web, --webpack; shared .next preserved                                                                         |
| iOS            | DBA500E9-A3E5-4424-83D6-ED4178991663, Creator Platform W8/iPhone17/iOS27; creator-w8-ios and creator-w8-ios-derived under /private/tmp |
| Android        | CreatorPlatform_W8/5568/API34; source/build/cache creator-w8-android\* under /private/tmp                                              |

Only W8's own sessions/emulator were stopped/restarted. Pantopus/peer devices, data, processes and outputs remained untouched. Peer reservations remain W1 3001/4101, W2 3002/4102/55442, W4 3004/4104/55444, W5 3005/4105/55435, W6 3006/4106/55436, W7 3007/4107. W1 AVD5560 and W7 simulator3F2AAE9E-57DF-4977-8166-732B95D52A47 remain theirs.

HEAD ba2ee4f omits shared uncommitted foundation. Baseline recovery archive/inventory was saved before changes. No reset/stash/branch switch; reviewed common commit still required.

## Executable contracts

| Boundary | Current implementation                                                                                                                                          | Required integration                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| C09      | Durable notice with stable case/version/recipient; own in-app inbox                                                                                             | W7 authored/scoped transport; fetch current state; no private reason in unrestricted push/email                                  |
| C10      | PrivacyHook in trust/contracts, verified immutable scope/owned-creator snapshot, immediate tombstone,8 domains, jobId:domain, data/retained/receipt             | All owner hooks; bounded/streamed durable exports; incomplete dependencies block, never truncate success                         |
| C12      | UUID correlation/request, fixed redacted route/status/error/failure taxonomy, histograms/worker gauges/counters, supervisor metrics                             | W2 visible/control/cost; W3 socket/frames; W4 money/refund; W6 outcomes; W7 delivery; WAL collectors                             |
| Evidence | Exact owner scope/proof/packet; delivered message joined to signed act, no broad thread search                                                                  | W1 revalidation repair; W4 immutable checkout AI/human wording                                                                   |
| Action   | Immutable durable intent, decision actor/version/proof authorizer, pending until receipt; retry preserves ID/authority/payload                                  | W1.reviewProof adapter; W2.pauseNotice + W4 settlement adapter; identity suspension/refund receipts still required               |
| Denial   | createTrustRuntime returns assertActorAllowed(actor), assertScopeAllowed(actor,creatorId,threadId), both with restoration gate; local constructors consume them | W1 source now consumes hooks in HTTP/access/database/realtime reauth, but configured callers omit W8 callbacks; install/prove≤5s |

W1 cookie contract is confirmed qelvora_session; BFF keeps canonical/local tokens HttpOnly/SameSite Strict, never browser storage. W8 native registration is now in both shipping roots, using W1 secure storage; W8 made no shared-root edit. Report arrival is /support?creatorId=<UUID>&messageId=<UUID> on all three clients; W8 validates/prefills, W3 must wire every AI message. Native private state resets with account; web cases clear on actor switch and refresh at lease expiry.

createTrustRouter mounts /v1/trust/\* and /health/{live,ready}. Deployed runtime needs exact HTTPS origin, immutable revision, non-owner pools, identity/model/payments/calls/voice/push probes, real restoration authority and8 privacy hooks. Omitted providers/domains remain unavailable; registration is not completion proof.

GET operations/audits exposes latest100 own current-queue metadata. GET operations/metrics requires supervisor. POST cases/:id/effects/retry needs current lease/supervisor/version/reason/key,30s cooldown and current action_pending; only blocked/retry/DLQ effects requeue. Original actor/input/version cannot change or be marked complete by API recovery.

## Migration authority

infra/migrations.json is canonical; immutable SQL/checksums and producer aliases are atomic. Fresh isolated integration DB applied through0031. Old root-only creator_w8 uses W8_LEGACY_ROOT_MIGRATIONS=true solely for local maintenance; not full integration proof.

| IDs            | Producer                                                      |
| -------------- | ------------------------------------------------------------- |
| 0001/0002      | W1 foundation/identity                                        |
| 0003           | W2 agent; W3 must not reuse                                   |
| 0004           | W4 commerce/schema.sql                                        |
| 0005 reserved  | W5 producer absent                                            |
| 0006/0007/0008 | W6 media/W7 growth/W8 trust                                   |
| 0009 reserved  | W3 producer pending                                           |
| 0010/0011/0012 | W8 guardrails/W7 retention/W8 referral FORCE RLS              |
| 0013           | Applied W2 extensions; producer alias0003_w2_agent_extensions |
| 0015/0016      | W4 reliability/disclosure                                     |
| 0017/0018      | W7 delivery/activation, producer filenames0014/0015           |
| 0019/0020      | Applied W2 shadow/purge, producer aliases0013/0015            |
| 0021/0022/0023 | W4 lifecycle/lineage; W8 action recovery                      |
| 0024/0025/0026 | W7 insight versions/closed windows/worker backfill            |
| 0027           | W8 immutable pre-purge account ownership                      |
| 0028–0031      | W4 membership history/recovery fencing/spending/purchase      |

W2 renamed proposals after this integration ledger applied their old bytes. W8 preserved exact applied SQL under infra/migrations/history; hashes match the ledger. Pending proposals must not reapply duplicate DDL or replace history; true changes require new allocated IDs.

| Historical file              | SHA256                                                           |
| ---------------------------- | ---------------------------------------------------------------- |
| 0013_w2_agent_extensions.sql | 7fc5995956d2e407475f815a2a707737c225cce0346643b8fd6b345d972fe59c |
| 0019_w2_shadow_jobs.sql      | 1f8e6e5ef1aa11859e3d972fb87273bec9fe233b4b406f51bc02df922d75158b |
| 0020_w2_purge_tombstone.sql  | 419dd13b87d853363cfa3fee934f1916d78423dd0a6bdd88abcf4f1853d540ca |

Runner rejects missing/changed applied SQL, duplicate IDs, untrusted null checksums and out-of-order insertion. Previous growth missing-ledger adoption required independent fresh-schema comparison; evidence retained. Runtime never uses migration owner credentials.

## Current producer requests

- W1: repair current Database.withThread row-lock revalidation denial (actual AccessService succeeded, Database denied), preserving least privilege; install canonical denial callbacks, fresh privacy reauth and reviewed suspension. Full backend/native checks passed after latest peer fixes.
- W2: install bounded source/vector/cache/license/export hooks and actual-referral callback; canonical action types agent.pause/agent.revoke_license; approved owner scope + W4 settlement before completion. Model/classifier/license providers remain absent.
- W3: per-AI report entry, conversation/memory/event privacy receipts, actual realtime cancellation≤5s, privacy composition and collectors.
- W4: immutable checkout authorship wording; exact scoped refund/settlement evidence and receipts; ledger retention/store sandbox recovery. Stripe raw signed inbox now precedes JSON in W4 local host; canonical configured host still needs reviewed mount.
- W5: content implementation/schema/privacy/Studio safety consumers absent in inspected source.
- W6: durable media/licensed-provider storage erase, complete binary export and call drain; physical/provider proof. Earlier iOS duplicate/shadowed-error defects are fixed and full builds passed.
- W7: W8 now supplies privacyOwnershipScope(workerPool), compatible with callable GrowthPrivacyScope. Configure dependencies.privacyOwnership(actor) from verified W1 profiles before creating account jobs, then bind the resolver to the Growth hook. Actual creator/fan snapshots and wrong-account/legacy refusal verified. All hooks/notice transport still need installation; creator/thread scopes still503.

D-08 account retention versus Architecture's30-day delay remains Q16. Immediate denial does not wait for purge. Twelve-month packet/delivery retention uses original expiry; ledger policy is supplied by W4/counsel. Ops sidebar220 follows4H-01; Studio248 remains distinct. Missing phone support/privacy/audit/metrics compositions use existing controls and need visual review. Final prices/domains/legal contacts/resources/human responders are unresolved external decisions.

## C11 arrival and native launch finding

Current config/navigation.json permits /support, /support/privacy and /trust, but rejects /trust/crisis, /support/access, /support/feedback and creatorId/messageId query parameters on /support. W8 validates/prefills the consumer references; producer route registration is still required. W1 exact request: add crisis under trust, access/feedback under support, creatorId UUID scope on /support and messageId UUID scope on /support; preserve strict duplicate/unknown/query/redirect rejection and regenerate all clients. No generated output was edited by W8. Actual SDK launch with /trust/crisis fell back to welcome (Android reported unavailable link); both rebuilt apps visibly loaded the configured public-help response through permitted /trust. Public GET requests now skip secure storage. The final iOS simulator build uses normal ad-hoc signing, removing its unsigned-build storage warning. Restarting only the leased Android emulator cleared its earlier system-process ANR. Authenticated navigation/system sheets and visual/accessibility acceptance remain unverified because interactive control is unavailable.

The W1 RLS diagnostic is now actual: identical non-owner authority query returned plainRows=1, threadLockRows=1, threadAndProfileLockRows=0. No message content was read.

## Latest additive allocation and ownership proof

W7 source0016/0017/0018 map in dependency order to0024_growth_insight_versions/0025_growth_closed_windows/0026_growth_window_backfill, with producer aliases.0027_w8_privacy_ownership stores nullable owned_creator_ids/ownership_ref at fresh account-job creation and limits progress UPDATE grants; old jobs stay missing proof.0028/0029/0030/0031 map to W4 membership-history/recovery-fencing/spending-notices/purchase-history in the producer-requested order. All eight applied to creator_w8_integration and checksum replay passed. W8 root-only maintenance applied root additions through0027. No peer database was modified.

W4 changed comments in applied0015/0016/0022. Exact applied bytes recovered from the preserved W1 preview copy, matched against live ledger hashes, and registered under history; executable SQL was unchanged. W4 source statements that all IDs remain unassigned are superseded by this register.

C10 dependencies.privacyOwnership(actor) returns verified creatorIds (at most100 UUIDs) and bounded provenance reference. Capture precedes identity purge; client IDs are excluded. createTrustRuntime returns the resolver and requires privacy_authority readiness. Wrong job/account and legacy snapshot return null; known empty ownership returns[]. Creator/fan exports remain blocked for missing domains. Never backfill empty ownership from post-deletion profile absence.

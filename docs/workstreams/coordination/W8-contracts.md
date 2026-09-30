# W8 contract, migration and runtime register

## 2026-09-30 resumed lease and additive seam

The human user authorized a narrow temporary W8-branch edit lease for `apps/backend/src/integration.ts`, `app.ts`, `db/database.ts` and `modules/access/scope.ts`. No peer worktree was edited. Current W8 resources: web3008/API4108, Docker `creator-platform-w8-resume-20260930`/loopback55438, synthetic `creator_w8`; separate `creator_w8_foundation_test` for the unchanged existing suite; Next `.next-w8-resume`/`.next-w8-build`. Historical resources below are not active reservations. No native device is newly reserved.

`ScopeRestriction` now receives a fourth, W1-verified participant argument `{fanAccountId,creatorAccountId}`. `ThreadScope` carries the fan account, and Database obtains its current value from its authority query on every operation. W8's coordinator restriction checks deny metadata for both participants, including fan blocks and immutable deleted-creator ownership. Existing three-argument callbacks remain callable implementations but should adopt the participant-aware W8 seam.

`createConfiguredBackend({trust})` accepts reviewed trust options or an async factory receiving the canonical pool/database/access/conversation/identity runtime. It supplies canonical actor resolution and exact origin, mounts the trust router, composes both existing/W8 denial callbacks, starts/drains the worker and exposes `trust` to the host. Non-development identity requires composed trust or both explicit denial callbacks; development identity cannot be used for the deployed trust runtime. Trust paths preserve authenticated support/appeal/privacy progress, with operation-specific denial for case reviewers. Supplied trust pools remain host-owned and must be closed by the host after backend drain.

Current acceptance and known existing-suite incompatibilities: [resumed evidence](../../../artifacts/workstreams/W8/resume/20260930-local/README.md). No private-domain RLS/grant or immutable migration was changed. This additive register announces the seam locally; no peer chat was messaged.

**Post-handoff resource release:** [PR #7](https://github.com/WangPantopus/creator-platform/pull/7) targets main. At the user's request, W8 servers/devices/builds/private caches/temp credentials are released; the former leases below are historical. Read the [resource-release record](../../../artifacts/workstreams/W8/handoff/20260929/resource-release.md) and receipt before recreating isolated resources. Docker cleanup remains blocked by Docker Desktop503; current DB state/volumes were not deleted. The complete resume prompt and all original remaining work still apply.

Continuation authority: [full W8 handoff](../handoffs/W8.md) and [next-agent prompt](../handoffs/W8-resume-prompt.md). Prepared 2026-09-29 PDT; original assignment and all remaining packages still apply. Historical run evidence is not current release acceptance.

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

HEAD ba2ee4f omits shared uncommitted foundation. Baseline recovery archive/inventory was saved before changes. No reset/stash/branch switch; the W8 feature branch captures dependency provenance separately from owned work. Reviewed common release integration is still required.

## Executable contracts

| Boundary | Current implementation                                                                                                                                          | Required integration                                                                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| C09      | Durable notice with stable case/version/recipient; own in-app inbox                                                                                             | W7 authored/scoped transport; fetch current state; no private reason in unrestricted push/email                                  |
| C10      | PrivacyHook in trust/contracts, verified immutable scope/owned-creator snapshot, immediate tombstone,8 domains, jobId:domain, data/retained/receipt             | All owner hooks; bounded/streamed durable exports; incomplete dependencies block, never truncate success                         |
| C12      | UUID correlation/request, fixed redacted route/status/error/failure taxonomy, histograms/worker gauges/counters, supervisor metrics                             | W2 visible/control/cost; W3 socket/frames; W4 money/refund; W6 outcomes; W7 delivery; WAL collectors                             |
| Evidence | Exact owner scope/proof/packet; delivered message joined to signed act, no broad thread search                                                                  | W8 retest of late W1 revalidation repair; W4 immutable checkout AI/human wording                                                 |
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

Historical capture: the earlier navigation configuration rejected crisis/access/feedback and support creatorId/messageId arrivals; SDK crisis launch fell back to welcome (Android reported unavailable link). Both rebuilt apps visibly loaded actual public help at permitted /trust. Public GETs now skip secure storage; final iOS Simulator build uses normal ad-hoc signing for Keychain, and restarting only the leased Android emulator cleared its system ANR. W1 subsequently registered /trust/crisis, /support/access, /support/feedback and bounded UUID report references in config/navigation.json and reported regenerated consumers and successful producer arrival checks. That source fix is included in the handoff checkpoint. W8 has not personally rebuilt/retested its isolated clients against the late fix; this and authenticated/system-sheet/visual/accessibility acceptance remain required. No generated output was hand-edited by W8.

Historical W8 non-owner diagnostic: plainRows=1, threadLockRows=1, threadAndProfileLockRows=0; no message content was read. W1 later changed Database.withThread to FOR SHARE OF t, preserving owned fan/current creator checks, and reported its own rollback checks. The current source includes the repair; W8 personal runtime/client acceptance is still pending.

## Latest additive allocation and ownership proof

W7 source0016/0017/0018 map in dependency order to0024_growth_insight_versions/0025_growth_closed_windows/0026_growth_window_backfill, with producer aliases.0027_w8_privacy_ownership stores nullable owned_creator_ids/ownership_ref at fresh account-job creation and limits progress UPDATE grants; old jobs stay missing proof.0028/0029/0030/0031 map to W4 membership-history/recovery-fencing/spending-notices/purchase-history in the producer-requested order. All eight applied to creator_w8_integration and checksum replay passed. W8 root-only maintenance applied root additions through0027. No peer database was modified.

W4 changed comments in applied0015/0016/0022. Exact applied bytes recovered from the preserved W1 preview copy, matched against live ledger hashes, and registered under history; executable SQL was unchanged. W4 source statements that all IDs remain unassigned are superseded by this register.

C10 dependencies.privacyOwnership(actor) returns verified creatorIds (at most100 UUIDs) and bounded provenance reference. Capture precedes identity purge; client IDs are excluded. createTrustRuntime returns the resolver and requires privacy_authority readiness. Wrong job/account and legacy snapshot return null; known empty ownership returns[]. Creator/fan exports remain blocked for missing domains. Never backfill empty ownership from post-deletion profile absence.

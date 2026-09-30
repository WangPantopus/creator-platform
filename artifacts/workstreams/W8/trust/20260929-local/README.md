# W8 actual local run and handoff

Primary W8 owner personally implemented, debugged, migrated, built, launched and checked these paths on 2026-09-29 PDT / 2026-09-30 UTC. Research assistance was read-only. No new test code or suites were written. Existing peer changes and tests were preserved.

This is implemented local scope with partial owner integration. It is **not a release-ready product or a staging deployment**. Synthetic accounts/content and unavailable providers are explicitly identified below.

## Sources and launch

Coverage: OpsQueue4H-01 and OpsCase4H-02; F15/INV-19/T-19 scoped operations; F11/T-39 immediate negative authority; F12/INV-15/D-08 privacy; C09 notices, C10 privacy and C12 telemetry; O02/O03/O04/O07/O13/O15/O21 support, history, recovery and consented feedback. Full status matrix and next actions are in [W8 status](../../../../../docs/workstreams/status/W8.md); contracts in [W8 register](../../../../../docs/workstreams/coordination/W8-contracts.md).

[Runbook](../../../../../docs/operations/W8-runbook.md) has exact commands. Functional web: http://localhost:3008/ops and /support/privacy; API4108; isolated Docker PostgreSQL55438. Native full shipping apps use the same API with DEBUG-only loopback overrides. Select synthetic actors through the labeled development entry; a server restart invalidates local sessions. Do not inject credentials into native storage or use a component catalog as acceptance.

HEAD ba2ee4f omits the shared uncommitted foundation. The preserved recovery archive is /private/tmp/creator-platform-w8-foundation-20260929.tgz. Source/build hashes identify this local checkpoint; they are not an immutable release commit. No reset, stash, branch switch or peer database/device mutation occurred.

## Environment and proof limits

| Resource      | Actual configuration                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend       | Node24.13.0, TypeScript5.9.3, pnpm12.5.1; tsx development host, deploy bundle70.8KiB                                                          |
| Web           | Next16.3.7/React19.3.0, isolated /private/tmp/creator-w8-web; --webpack, port3008                                                             |
| Database      | pgvector/pgvector PostgreSQL17 image sha256:cf134a767f474095eeba57e0117be8e568e011a63f33fbf252f14c9b760f8e6f; W8-only loopback container      |
| Data          | creator_w8 synthetic runtime; creator_w8_integration separate integration schema; creator_w8_restore old backup/newer journal, traffic closed |
| Runtime roles | creator_runtime, creator_trust_runtime, creator_trust_worker; non-owner, no superuser/bypass; sensitive FORCE RLS                             |
| iOS           | iPhone17 Simulator/iOS27.0; UUID DBA500E9-A3E5-4424-83D6-ED4178991663; Xcode27.0 build27A266a; final normal ad-hoc signed Debug build         |
| Android       | CreatorPlatform_W8/emulator-5568; Android14/API34 google_apis arm64; Gradle8.9; full Debug APK                                                |
| Providers     | Synthetic local identity; model/payments/calls/voice/push unconfigured; only trust privacy hook installed                                     |
| Network/load  | Host loopback, shared/contended macOS host; native emulator-to-host mapping; no physical network or production capacity claim                 |

Runtime readiness remains503: database available, identity development-only, required providers/domain hooks unavailable. Liveness200 means the process is responsive. [Readiness](readiness.json), [metrics](metrics.json), [liveness](liveness.json), [capabilities](capabilities.json).

## Personally exercised workflows

1. Earlier actual in-app browser: report a seeded AI message without a grant; metadata-only Ops queue; purpose-scoped15-minute evidence lease; reasoned close; fan-only notice; appeal. [Queue screenshot](ops-queue-light.png) and [resolved case](case-resolved-light.png) are1280×900 Light captures from that earlier source checkpoint. They precede latest shared ModeList, audits/metrics, actor clearing and lease-expiry fixes and do not certify final pixels.
2. Current actual API/non-owner DB: original reviewer denied independent appeal resolution403; a different reviewer resolved case1 to version4. Same-key replay preserved version; changed input409. Wrong role received case404/queue403. Deletion-scoped report/export denied. Origin mismatch403. Recipient notices and immutable decision events were inspected durably.
3. Supervisor paused the synthetic Maya creator via a scope-only case; immediate trust restriction committed, case2 remained action_pending/version2. The missing owner hook left one effect blocked. Recovery/replay preserved its original ID, actor, payload and decision version, with one action_retried event. Fan recovery/audit requests were denied. No external pause, settlement or refund receipt is claimed.
4. Fan blocked a separate synthetic recovery creator through the actual blocks endpoint. Same-key replay after denial returned the same minimal acknowledgment; changed payload409. One block/case remained. No private evidence or fake provider success was returned.
5. Freshly confirmed synthetic deletion of the other fan's thread committed a tombstone immediately; trust task completed and seven unavailable domains remained blocked. Restart/outage preserved denial. An older logical backup restored to creator_w8_restore, then a newer external tombstone journal replay restored one deny record and requeued eight purges; traffic stayed closed.
6. New account exports through actual API captured verified pre-purge ownership: creator snapshot contains one synthetic creator, fan-only snapshot is explicitly empty. Trusted worker resolver matched both job/account; mismatched account and the legacy job returned no proof. Runtime mutation of ownership columns was denied42501. API restart/replay returned the same job IDs; an account request carrying narrower scope references returned400. All seven non-trust domains remain blocked. [Ownership evidence](privacy-ownership.json), [final API checks](final-api-checks.json).
7. Final full iOS and Android apps compiled, installed and visibly launched against API4108. Public /trust loaded the actual help response on both: reviewed resource list is explicitly unconfigured. Public GETs skip credential storage; private requests still require canonical credentials. Normal Simulator signing removed the unsigned iOS Keychain warning. Restarting only W8's Android emulator cleared its system-process ANR. [iOS public help](ios-public-help.png), [Android public help](android-public-help.png).

The final native captures are **launch/public-read evidence**, not authenticated report/appeal/privacy/export/system-sheet or accessibility acceptance. Direct /trust/crisis launch earlier fell back to welcome because canonical C11 rejects it. The allowed /trust entry works. Native support/access/feedback/report-query arrivals still require W1 config regeneration.

## Recovery, migration and measured results

Final integration registry contains28 applied entries through0031. Latest replay reported every entry already applied, with matching checksums. Root-only development maintenance applied its root subset through0027; it is not a full integrated schema. [Ledger](migration-ledger.csv), [migration output](migration-integration.txt), [root maintenance](migration-local.txt).

The initial integration application stopped on producer-renamed W2 SQL and resumed after exact bytes were preserved. A later run stopped on changed W4 comments; exact copies matched the live applied ledger and were preserved under infra/migrations/history. No applied SQL or live checksum was rewritten. W7 versions/window/backfill are0024–0026; W8 ownership0027; W4 remaining follow-ups0028–0031. No peer database was migrated.

Actual database interruption: stopped only the W8 container, observed liveness200/readiness503 with DB unavailable, restarted it and recovered non-owner DB readiness. Whole readiness stayed503 for absent providers. Case1/version4, deletion tombstone and incomplete receipts persisted. Observation timestamps00:53:11–00:54:19UTC reflect operator cadence, not complete RTO. Idle pool errors were handled without process death.

Newer deletion journal replay measured298ms for one record and eight requeued purges. This excludes backup/restore/migration/probe time. Logical dump and mode0600 live journal remain under /private/tmp, outside Git. [Restore receipt](restore-receipt.json) contains only synthetic metadata/hash. Five-minute RPO/one-hour RTO are unproved; production needs WAL/archive/encryption/lag alarms and a fully timed exercise.

Existing ApacheBench tool:100 capabilities GETs, concurrency4,1.443s, zero failures,69.28req/s, p95 178ms/p99 785ms/max785ms. [Raw tool output](capability-load.txt), [distribution](capability-latency.csv). This endpoint performs no DB/auth/model/payment/call work. It does not establish generation warm/cold latency, accepted-message latency, provider cost, socket capacity or availability SLO. No new load-test project was created.

## Compilation and security checks

Full backend tsc, isolated W8 web tsc, owned ESLint and Prettier passed. Existing generated-resource check passed (12 shared resources and31 API operations); no generated output was hand edited. Deploy host bundle built; Compose definition validation passed. Docker image build, remote CI and immutable staging deployment remain unrun. Final normal signed iOS build and full Android assembleDebug succeeded; distribution signing/store delivery remain gated. [Build/check record](build-checks.json), [source/build hashes](source-build-hashes.json).

Production dependency audit returned zero advisories among182 dependencies; [audit](dependency-audit.json). This is one registry audit, not full supply-chain assurance. The full [security review](../../../../../docs/operations/W8-security.md) lists source controls and owner/provider gaps.

An actual failure can be located with correlation ID6808b26c-9b3a-4f7d-a1a2-42a180bdf001: independent-reviewer rejection403. [Trace lookup](trace-failure.json), [log schema](log-schema.json). Structured logs use only fixed route/status/error/timing/environment/release/correlation fields; no request body/query/token/message/memory is captured. Synthetic case/job IDs are metadata; raw exports, tokens and live deletion journals are excluded.

## Remaining gates and next actions

- W1 Database.withThread still uses FOR SHARE OF t,c,f. Actual authority query returned plainRows1, threadLockRows1, threadAndProfileLockRows0 after successful AccessService.openThread. Repair least-privilege profile locking, install W8 actor/scope denial callbacks and fresh reauth/ownership capture, then rerun message evidence and≤5-second revocation. [Diagnostic](rls-diagnostic.json).
- W1 C11 must allow /trust/crisis, /support/access, /support/feedback and UUID creatorId/messageId on /support, preserving strict duplicate/unknown/redirect rejection and regenerating consumers. W3 then wires every AI-message report entry.
- Interactive control remains unavailable: latest IAB binding timed out in Emulation.setFocusEmulationEnabled; Device Hub returned timeoutReached. Restore that resource, then personally rerun final Light/Night/390/1280, keyboard/200%/reduced-motion/offline/lease and authenticated native/system-sheet/VoiceOver/TalkBack paths. SDK captures do not replace them.
- Install and measure all eight domain privacy hooks, W7 notice transport, W4 immutable disclosure/refund/settlement/ledger retention, W2 license/model effects and W6 media/voice erase. Capture is ready; domain completion is unproved. Existing source adapters are not installed receipts.
- Provision immutable staging, reviewed identity/model/payment/call/voice/push projects, secret manager/private storage/TLS/WAL, alerts with named humans, real-provider workload/cost and external-success recovery. Complete hardware passkey/call/push/purchase/store flows and G1–G5 before changing release gates.
- Founder/counsel decisions remain for identity/provider choice, prices/capacities, license/departure, final domains/projects/signing, retention/staffing/contact/legal/resource approval. No publication, fees, credentials or approval decision was invented.

[Release gates](../../../../../docs/operations/W8-release.md), [pilot materials](../../../../../docs/operations/W8-pilot.md), [runbook](../../../../../docs/operations/W8-runbook.md). External paid scope and restored traffic remain closed.

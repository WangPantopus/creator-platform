# W4 continuation handoff — October 1, 2026 (evening, Mac Studio)

Prepared by the W4 primary (Claude Code session) at about 21:10 UTC. It supersedes the operational state in [W4-resume-handoff-2026-10-01.md](W4-resume-handoff-2026-10-01.md). That file's mandate, scope and invariants still apply. Refresh GitHub, Git, peer and runtime state before acting: the machine is shared and moves quickly.

**Nothing in W4 is release-ready.** This session did the following:

- reproduced and fixed the iOS CI snapshot failure;
- found and fixed an ownership defect in two reserved W4 migrations;
- reconciled PR41 with main;
- provisioned fresh owned resources and started real-app verification.

A host-wide overload and the founder's wrap-up request ended the run before positive journeys were exercised.

## The mandate (founder, latest; supersedes older process rules)

Finish the entire W4 workstream: commerce, access and request lifecycle, R01–R15 plus the nine original packages. Do not reduce it to a scaffold, MVP or plan.

- **Standing authorization.** You may implement, refactor, fix integration problems, install dev tooling, commit, push, create/update PRs and merge ready PRs. Do not ask again for approval to continue or to merge ready work.
- **No new unit tests**, and no effort spent on coverage. Test coverage may be scoped or reduced transparently through the normal PR process when obsolete gates obstruct work. Do not change an expected result to hide a real defect.
- **Operate the real apps yourself:** the Next.js web app, the Android app in an emulator and the iOS app in a simulator. Do real taps/typing/system sheets/reloads, inspect persisted results, fix defects and repeat. Builds, unit tests, galleries or a live PID do not count as completion.
- **Never fabricate** receipts, consent, identities or successful transactions. Clearly labeled development data is fine. Keep secrets and database contents out of chat, Git and screenshots.
- **Missing external inputs block only dependent actions.** Do not repeat broad credential questions. Stripe sandbox and a genuine verified creator/passkey were confirmed unavailable.
- **Subagents may research or check information read-only.** You implement and verify personally (original W4 prompt rule).
- Read [the original prompt](../prompts/W4-commerce-requests.md), [the brief](../W4-commerce-requests.md), [the resume prompt](../prompts/W4-resume-to-completion.md) and [the R01–R15 handoff](W4-commerce-handoff.md).
- The latest consolidated checklist is on PR47: `git show 87ec1b192cac82ea4823703c0fcab38e6babdb19:docs/workstreams/implementation/W4-completion-2026-10-01.md`.

## Git and PR state at handoff

GitHub `main` = `19a3d297`, the merge of PR40: W2's idle-connection 57P01 recovery, relevant to R08. Main is **not branch-protected** and has no rulesets. CI ("Foundation checks", `.github/workflows/ci.yml`) has five jobs. macOS runner queues are long, often more than an hour.

| PR | Branch @ head | State | What it is / what is left |
| --- | --- | --- | --- |
| [53](https://github.com/WangPantopus/creator-platform/pull/53) | `codex/w4-native-capture-scale-20261001` @ `d207f504` | mergeable; hosted CI pending | **iOS CI root cause found and fixed** (details below). **W1 asked that it not merge until W1 confirms the hosted xcode-27 run.** W1 owns NativeSnapshotTests and may fold it in. |
| [61](https://github.com/WangPantopus/creator-platform/pull/61) | `codex/w4-reserved-schema-ownership-20261001` @ `662f542e` | mergeable; new | Adds `SET LOCAL ROLE creator_owner` to reserved 0049/0054. Merge once CI is acceptable; W8 needs these final bytes for the registry wave. |
| [41](https://github.com/WangPantopus/creator-platform/pull/41) | `codex/w4-call-refund-custody-20261001` @ `9bdce706` | **now mergeable** (main merged in) | Atomic call outcome + original refund obligation. Code reviewed (below); backend typecheck passes. Runtime call/refund acceptance is blocked: W6 has no real call provider. |
| [47](https://github.com/WangPantopus/creator-platform/pull/47) | `codex/w4-signed-voice-fulfillment-20261001` @ `87ec1b19` | mergeable | Signed voice fulfillment. **Gated on W8's 0058/0059/0060 resolution.** W8 says 0060 is not final; W3 is asked for 0058/0059 bytes that preserve 0044's personal-Approval branch. Conflicts with #46 in `runtime.ts`. W5 is avoiding its Studio hunks until it merges. |
| [46](https://github.com/WangPantopus/creator-platform/pull/46) | `codex/w4-qualified-read-custody-20261001` @ `b6c70ec1` | **conflicting** (docs only vs main; `runtime.ts` vs #47) | Held canonical qualified-read receipt before credit issuance. Needs a W7 `QualifiedReadAuthority` producer; none exists. |
| [44](https://github.com/WangPantopus/creator-platform/pull/44) | `codex/w4-store-management-recovery-20261001` @ `5c262f91` | **conflicting** (docs only) | Keeps App Store/Play management reachable when verification is offline. Small and reviewed; needs native operation (below). |

All W4 PRs are bound to the old session's PR bar. Bind them in your session.

**Docs conflict pattern.** #41, #44 and #46 conflict only in `docs/workstreams/{status,coordination}/W4.md` and `docs/workstreams/implementation/W4-completion-2026-10-01.md`: both sides append a dated section. Resolve by keeping both sections, main's first. A merge of main into #41 already does this.

PR47 restructures `W4-completion-2026-10-01.md`, moving history into `W4-completion-history-2026-10-01.md`. Plan the docs order when merging #47 alongside the others.

## What this session established (verified facts)

### 1. iOS `ios-foundation` failure: root cause and fix (PR53)

- On main, the hosted xcode-27 runner reports **106/110 snapshot failures with blurred text**. The cause is the runner's **1x display**.
- On this 2x Mac Studio (Xcode 27.0, macOS 27), **unmodified main passes `swift test --package-path apps/ios` 18/18**, so the references are valid.
- Reproduction used a scratch, uncommitted variant whose capture window reported `backingScaleFactor = 1`. Main's helper then failed exactly 106, and its `Button-light` failure image was **pixel-identical (0 differing pixels)** to CI artifact run `36881231276`. AppKit/SwiftUI rasterize hosted text from the window's *reported* scale, not the screen's.
- The previously unfinished point-mapping edit (`875f5d9`, SHA-256 `6613dc00…` as recorded) **alone still failed 104** under reported-1x.
- Fix `d207f504`: `private final class ReferenceScaleWindow: NSWindow { override var backingScaleFactor: CGFloat { 2 } }`, used for capture. With it, 18/18 pass locally. References, thresholds and assertions are unchanged, and the log prints `display=` and `reported=` scales.
- Remaining: hosted-run confirmation. After `swift test`, the job runs the real `xcodebuild test` app flow on an iPhone simulator for the first time in a while, so that step may expose new failures. Read them; don't assume.

### 2. `web-visual` failure is not W4's

Main's `playwright.config.ts` references an undefined `visualWebURL`, a bad merge in `9f805888`. Peers opened fixes: **PR59 (W1)** and **PR60 (W3)**. Don't open a third. The visual cases themselves have not run since; once a fix merges, check whether they pass.

### 3. Reserved W4 migrations: dry-run results and the ownership defect (PR61)

- A fresh `creator_w4` took **40 canonical migrations through 0043** via `migrate-trust.ts`, all with checksums.
- A disposable clone applied, in ascending order, 0044 approval → 0048 W2 usage lineage → 0049 cost settlement → 0054 pass purchase → 0055 pass pool → payout custody. All applied cleanly.
- Defect: 0049 and 0054 lacked `SET LOCAL ROLE creator_owner`. They left 4 pass tables and 2 trigger functions owned by the migrating role. PR61 fixes it, and after the fix there are 0 non-owner objects.
- `creator_runtime` reads the new forced-RLS tables (0 rows unscoped).
- **Final sources:**
  - 0044 `4480936ea99adbc954f1e3444673772922c49e6dab8b9cce9351cf6d61c493fb`
  - 0049 `00f4c2cc2962a0e9f14b0ba0ad57f23823fcc811042e8d6b8b9c6dc5394daffc` (post-PR61)
  - 0054 `d6ead22cd6115df960dbe612b1de4a9473d2717a040cb66c6ba473da580827ca` (post-PR61)
  - 0055 `26be8430c4301b7eda9060c94e9034b7afa5fd57a9ad5bec128f26ac2aefa4ca`
  - payout custody `a2453c00868cd7a6fcaf30a1121884a73daa4942a2ac8b7214504d19285c1efd` (W8 plans **0061**)

**Registry custody (agreed with W8):** W8 opens the ONE registry PR in ascending waves and renumbers not-ready reservations upward. Reason: `migrate-trust.ts` refuses any version below an applied one, and it ignores `reserved` entries. **Do not edit `infra/migrations.json` yourself.**

- W4 supplies verification. When W8 sends its registry branch, run on your DB: a fresh canonical install, a preserved-data upgrade (40 → new on a DB holding W4 journey data), and a schema/grant/RLS/ownership diff between the two. Report back to W8.
- The historical 28-entry `creator_w4_archive` and the private backup exist only on the **iMac** (`~/.config/creator-platform/…`), not on this Mac Studio. Run that upgrade there or report it as not runnable here.
- 0048 is W2's. W2 confirmed it final (sha `16dddc80…`) and **wants notice before it registers**; it may land in a later wave because it needs W8's C10/accounting registration.
- 0050 bytes now come from W3. W8 is implementing 0053; 0052 is W8's.

### 4. PR review notes (code read in full this session)

- **PR41.** Refund obligation and session outcome now commit in one transaction. `queueRefundInTransaction` takes thread → packet → commitment, then the key-scoped command advisory lock.
  - Nested `command()` is safe: it is a key-scoped advisory lock plus an idempotency row in the same transaction.
  - No lock-order cycle with delivery (packet → commitment; no thread lock) or with the Ops refund (`operations.ts:78`, which runs in its own transaction).
  - Unverified at runtime: RLS visibility of the initial binding `SELECT … FROM commerce_packet` for each caller (W6 worker actor, Ops actor), and the `authorKind` change from `human_creator` to `human_call`/`system`. Check consumers of `evidence.authorKind` before merging.
- **PR47.** The written-delivery query now requires `sa.content_hash = m.signed_content_hash`; that column exists from 0001, so it is safe on canonical. The voice path mounts only when `0060_w8_composed_signed_message` is applied with checksum `43067f9a…`, which W8 says will change. Merging #47 now is harmless because voice stays unavailable, but final voice acceptance needs W8/W3's composition.
- **PR46.** Credits now require a host `QualifiedReadAuthority`. No W7 producer exists, so credits stay unavailable. That is honest; integration is the remaining work.
- **PR44.** It is small and correct by review. It shows the management button whenever a store-provider membership exists, even when `storePurchasesAvailable` is false. To operate it you need a fan with an `apple`/`google` membership row. Such a row only comes from verified store transactions. Do not insert one by SQL.

### 5. Local stack facts (verified this session)

- The **canonical server installs commerce** when `COMMERCE_CURRENCY` is set (`apps/backend/src/server.ts`). Health on 4104 reported `registeredFeatures: conversation, creator-ai, media, commerce, content, studio` with `identityMode: development`.
- `apps/backend/scripts/migrate.ts` (`db:migrate`) applies **only 0001/0002**. The full registry runner is `node --import tsx apps/backend/scripts/migrate-trust.ts` with `DATABASE_MIGRATION_URL` set to a superuser.
- Migrations create the roles without passwords. Give `creator_runtime` a login password afterwards.
- Development sign-in: `/auth/continue?returnTo=…` → **Continue with Pantopus** → the `/auth/development` chooser offers "Development actor one" (`…0001`) and "Development actor two" (`…0002`), clearly labeled as synthetic. First sign-in goes to `/onboarding/handle`. This session used actor two as the fan.
- **The interrupted handle save persisted nothing.** Next's on-demand compile of `/api/platform/[...path]` never finished under a host load above 800, so there are 0 fan profiles in the DB.
- Browse at **`http://localhost:3004`, never 127.0.0.1**: the commerce BFF's Origin check fails with 127.0.0.1.

### 6. A verified creator does not exist locally, and no SQL bypass is allowed

The product path is: W1 `submitProof` → trust report (`kind=verification`) → Ops verification case → `verify_creator` → worker `verificationEffects` (`apps/backend/src/modules/trust/domain-adapters.ts:232`) → `IdentityProfiles.reviewProof`. No local host wires this today: the canonical server refuses trust with dev identity, and the W8 harness passes `[]` effect hooks and is guarded to `creator_w8`.

**W8 is building a canonical development-host trust composition for `server.ts`** (loopback-only dev mode, scoped trust evidence, verification and agent-pause effects, Ops routes, dev Ops actors, denial callbacks). W8 will send env/role setup. **Do not modify `local-server.ts` or its guard.** Until it lands, every creator-side W4 journey dead-ends at "Only the verified creator can change these offers.": Offers, tiers, Studio decisions, signed acceptance, Earnings, voice.

## Shared-machine rules (W1, binding until further notice)

The Mac Studio hit about 40 GB of swap and load around 1000 with many peers' simulators and emulators. Apps ANR'd.

1. **Heavy native builds one at a time machine-wide** (xcodebuild, Gradle assemble/test, `swift test`). Acquire with `mkdir /private/tmp/creator-platform-heavy-build.lock`, then write `"W4 <what> <ISO start>"` into `…/owner`. `rm -rf` the lock when done. Retry if `mkdir` fails.
2. **At most two creator-platform Android emulators.** Slots are `/private/tmp/creator-platform-emulator-slot-{1,2}` (mkdir + owner file; remove on shutdown). Use 2 cores, ≤2048 MB, `-no-snapshot-save`, and `adb -s <serial> emu kill` when idle.
3. **At most three booted creator-platform iOS simulators.** Slots are `/private/tmp/creator-platform-simulator-slot-{1,2,3}`. `xcrun simctl shutdown <UDID>` when idle for more than 10 minutes.
4. Use explicit UDID/serial only. Never touch another stream's devices, containers or ports.

## W4-owned resources (all released at handoff; restart only within the rules above)

| Resource | Value |
| --- | --- |
| Postgres | Docker `creator-platform-w4-20261001` (pgvector/pgvector:pg17, `--cpus 1 --memory 768m`, `127.0.0.1:55444`). **Stopped, data kept.** DB `creator_w4` = fresh canonical 40, 0 profiles/packets. Restart with `docker start creator-platform-w4-20261001`. |
| DB credentials | Generated privately in the old session's scratchpad: `…/scratchpad/w4-private/postgres.env` (mode 0600, under `/private/tmp/claude-501/…/ecd61249-…/`). If unavailable, recover with `docker exec -u postgres creator-platform-w4-20261001 psql -d creator_w4 -c "ALTER ROLE creator_runtime PASSWORD '<new>'"`. In-container socket auth needs no password. Never print or commit passwords. |
| API | `127.0.0.1:4104`, canonical `apps/backend/src/server.ts` (stopped) |
| Web | `localhost:3004`, `next dev --webpack -p 3004` (stopped) |
| iOS | Simulator **"Creator Platform W4"** `BC8F4A5B-6F9E-4A89-813B-FF4DD8572271` (iPhone 17e, iOS 27, 390-pt class), shut down |
| Android | AVD **`CreatorPlatform_W4`** (pixel_5 profile, 393 dp; `system-images;android-34;google_apis;arm64-v8a`), serial `emulator-5564`, stopped |
| Peers' ports to avoid | W2 55442/4102/3002 (plus check DB 55449); W3 55443/4103/3003; W5 55435/4105/3005; W6 55446; W8 55438; W1 55441. Re-inventory first. |

Exact launch, using env file values. The API env needs:

- `NODE_ENV=development`, `IDENTITY_ADAPTER=development`, `CREATOR_FEATURE_ENABLED=true`, `PORT=4104`
- `WEB_ORIGIN=http://localhost:3004`, `PASSKEY_RP_ID=localhost`
- `IDENTITY_SESSION_KEY` = base64 of 32 bytes; keep it stable or sessions die
- `DATABASE_URL` = creator_runtime @ 55444/creator_w4
- `COMMERCE_CURRENCY=USD` (a local display setting only, not an approved currency)

```sh
node --env-file=<private api.env> --import tsx apps/backend/src/server.ts
QELVORA_API_URL=http://127.0.0.1:4104 QELVORA_PUBLIC_ORIGIN=http://localhost:3004 W3_WEBSOCKET_URL=ws://127.0.0.1:4104/v1/realtime pnpm --filter @qelvora/web exec next dev --webpack -p 3004
```

Native, holding the heavy-build lock and a device slot:

- **iOS.** Run `xcodegen generate --spec apps/ios/project.yml`. Build `QelvoraApp` for the W4 UDID with a private `-derivedDataPath`, using normal simulator signing; `CODE_SIGNING_ALLOWED=NO` breaks Keychain sessions. Then `simctl install` and `simctl launch … com.pantopus.qelvora --api-url http://127.0.0.1:4104 --return-to /commerce/spending --appearance light`.
- **Android.** From `apps/android`, with `JAVA_HOME` (JDK 17/21) and `ANDROID_HOME=~/Library/Android/sdk`, run `./gradlew :app:assembleDebug -PcreatorBuildDir=<private dir>`. Then `adb -s emulator-5564 install -r …` and `am start -n com.pantopus.qelvora/.MainActivity --es api_url http://10.0.2.2:4104 --es return_to /commerce/spending --es appearance light`. DEBUG builds have a dev actor chooser.

## Peer coordination state (live sessions on this Mac Studio)

| Peer | State |
| --- | --- |
| **W8** | Owns the registry wave PR and the dev trust composition, and will message W4 with branch names. W4 owes W8 the verification protocol above. |
| **W2** | Consumes `createCommerceAudience(...).currentInTransaction` and the allowance via `AccessService` on W3's held client. Its journal contract: `PreparedGenerationJournal.prepare(pool, {migration, retentionPolicyVersion, assertPrivacyRegistered})`; settlement must treat missing/open custody as unknown. Wants notice before 0048 registers. |
| **W3** | Composing canonical fan generation in `server.ts`. W4 agreed to a **development-only** cost rule `{version:"w3-dev-2026-10-01", microsPerUnit:1000, ceilingUnits:60, rounding:"ceil"}` and `trialAllowance:1500`, kept in a private config file. This is not Q08 approval. W3 passes `attributedGenerationCostPolicy` → `createCommerceRuntime`, consumes `generationCostReconciliation` and `service` as `firstConversation`, and waits for 0049 activation. |
| **W5** | Answered: `commerceContentAudience` (content-audience.ts:27) is the paid-audience producer under the same-client contract. There is no audienceCount reader. **W4 owes a `currentTenure` reader** derived from paid membership coverage, excluding refunds and never using spend. Approvals (`createCommerceApprovals`, approval-registration.ts:16) are unmounted until 0044 activates. W5 avoids PR47's Studio hunks. |
| **W1** | Device/build budget above. Owns NativeSnapshotTests and PR53 reconciliation. |

## Ordered next actions

1. **Re-inventory** (GitHub PRs/CI, `git worktree list`, Docker, simulators, emulators, slot locks, ports). Bind PRs 41/44/46/47/53/61 to your session.
2. **CI baseline.** Watch PR53's hosted ios-foundation result and coordinate with W1. Watch PR59/PR60 for web-visual. Then inspect each W4 PR's fresh CI. Android-runtime failures on #44/#46 were "mixed"; read their logs.
3. **Merge PR61** when CI is acceptable and tell W8. Then **merge PR41** after one more pass: check `authorKind` consumers, and confirm the binding SELECT is RLS-visible for the W6 worker and Ops actors. Read the code paths, or operate them if W6 or W8 gives you an actor path.
4. **Resolve #44/#46/#47 docs conflicts** (keep both sections). Resolve #46 against #47 in `runtime.ts`: keep both runtime inputs, `voiceRecordings` and `qualifiedReads`. Typecheck, push and merge each when CI is acceptable; each delivers honest gated behavior. Update each PR description with the final code and the actual verification and limitations.
5. **Restart owned resources within the budget** and finish the interrupted **real fan web journey**: sign-in → handle → `/commerce/spending`. Cover set cap, explicit none, immediate lower, 24-hour delayed raise, offline/reconnect and reload, in Light/Night at 390. Then Access/Requests/Pass/Membership unavailable states at 390 and 1280. Save sanitized evidence under `artifacts/workstreams/W4/runtime/2026-10-0X/<increment>/`.
6. **Native.** Build and operate iOS and Android against 4104: commerce destinations, spending interactions, unavailable store states and PR44's management affordance. Positive store cases need verified store memberships; consider **StoreKit Testing in Xcode** (a `.storekit` configuration and the Xcode-environment JWS verified against Xcode's local test certificate). It must be a dev-only, explicitly configured server verifier that production rejects; do not use it to fake App Store sandbox acceptance.
7. **When W8's dev trust composition lands,** run the real creator path for actor one: `/studio/setup` → proof → Ops approval → verified. Then exercise Offers/tiers editing, the Studio queue and the decision states that need no payment. Add the W4 `currentTenure` reader and mount approvals after 0044 activates.
8. **Payments remain externally blocked.** The smallest exact input is a Stripe **test-mode** account: `STRIPE_SECRET_KEY` (`sk_test_…`), `STRIPE_PUBLISHABLE_KEY` (`pk_test_…`), `STRIPE_WEBHOOK_SECRET`, `STRIPE_API_VERSION=2026-08-26.dahlia` (must equal the installed SDK) and `STRIPE_COLLECTION_ACCOUNT` (`platform` or `acct_…`), plus a test product/price catalog JSON (`COMMERCE_STRIPE_PRODUCTS_PATH`). With it, R03/R05/R06/R08/R09/R11 sandbox journeys become runnable.
9. **Other external inputs:**
   - Apple/Google store projects and keys (Q10).
   - A call provider for W6 two-party evidence (R07/PR41 acceptance). Only `UnavailableCallProvider` exists; W6 owns the adapter.
   - A W7 qualified-read producer (R12/PR46).
   - Q03/Q04/Q08/Q16 business decisions, unchanged from the earlier handoff.
10. Keep the source-mapped checklist current: update `docs/workstreams/status/W4.md`, the completion checklist and evidence manifests after each increment. Separate implemented, runnable, integrated, verified and release-ready. Never claim completion from builds or gated screens.

## Gotchas learned

- `next dev` rewrites `apps/web/next-env.d.ts` (`.next/types` → `.next/dev/types`). Discard it before committing.
- Under extreme host load, Next's on-demand route compiles can stall for many minutes. Check `uptime` and swap before diagnosing an app bug, and hold the build lock.
- `migrate-trust.ts` sorts by version, requires unique 4-digit IDs and refuses out-of-order rollout. Reserved IDs left below activated ones become unappliable, which is why W8 renumbers upward.
- The Postgres pool once crashed on 57P01 when the database restarted. PR40 (merged) addresses idle-client errors; re-verify restart behavior during the R08 work.
- Several docs still say the canonical server lacks commerce (`W4-commerce-handoff.md:45`, `W1-identity-authority.md:57`). That is now false; correct them in your next docs update.

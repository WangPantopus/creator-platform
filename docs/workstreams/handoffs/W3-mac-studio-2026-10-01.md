# W3 handoff — Mac Studio continuation, October 1, 2026

This supersedes the iMac/Codex handoffs ([W3-resume-2026-10-01.md](W3-resume-2026-10-01.md) and its prompt) for **where and how** to continue. Their scope, standards and historical evidence still apply. W3 is **not complete**.

## 1. What changed

- **Machine.** All eight workstreams now run as Claude Code desktop sessions on **Yingpeng's Mac Studio** (Mac14,13, macOS 27.0, Xcode 27.0, 32 GB RAM). The Codex worktrees on the iMac were retired (`b475d32b`).
- **Private files are not on this machine.** No `~/.config/creator-platform/secrets/openai.env`, no W3 SQL archive (fictional Maya source), no `w3-resume-20261001/runtime.env`. They exist only on the iMac. The human was asked to copy `openai.env` here.
- **W3 checkout on this Mac:** worktree `/Users/yingpengwang/estimate-rescue/creator-platform/w3-fan-conversations-chat-55cfcc` (the Claude app's worktree; run commands from it, never `cd` to the shared repo root `/Users/yingpengwang/creator-platform`). Local branches there: `codex/w3-privacy-revalidation` (PR36, at `b475d32b`) and `codex/w3-generation-host` (this increment).

## 2. Git and PR state

| Item | State |
| --- | --- |
| main | `19a3d297` when this branch was cut (moves often; refresh) |
| [PR24](https://github.com/WangPantopus/creator-platform/pull/24) `codex/w3-conversations` `a164fe8` | Open, ready. Account refresh + Android launcher return. Fails only the shared web-visual config load and iOS snapshot jobs (main fails the same two) |
| [PR45](https://github.com/WangPantopus/creator-platform/pull/45) `codex/w3-emulator-sdk-recovery` `a4917db6` | Open, ready. Bounded Android SDK archive retry. Same shared failures only |
| [PR36](https://github.com/WangPantopus/creator-platform/pull/36) `codex/w3-privacy-revalidation` `b475d32b` | Draft. Contains PR24 + PR45. Privacy revalidation (web/iOS/Android), native per-creator privacy routes, Android retained-session recovery. Backend identical to main |
| PR60 | Closed by W3 as a duplicate of W1's [PR59](https://github.com/WangPantopus/creator-platform/pull/59) (`visualWebURL` fix). W1 owns the shared Playwright fix and the iOS snapshot fix (W4's PR53 is the candidate) |
| **This PR** `codex/w3-generation-host` | Fan-generation host composition (see §4) |

**Merge plan.** When W1's PR59 and the iOS snapshot fix land on main: merge main into PR45 → merge; then PR24 → merge; then PR36 (mark ready) → merge; then this branch. Each is a normal merge after reading that head's actual CI logs. Don't claim a pass from a queued or older-head run.

## 3. Restored runtime (owned by W3)

All values live in `~/.config/creator-platform/w3-mac-studio-20261001/` (mode 0700). Never print or commit them.

| File | Purpose |
| --- | --- |
| `db.env` | `W3_DB_ADMIN_PASSWORD`, `W3_DB_RUNTIME_PASSWORD` |
| `backend.env` | `NODE_ENV=development`, `IDENTITY_ADAPTER=development`, `IDENTITY_SESSION_KEY`, `CREATOR_FEATURE_ENABLED=true`, `DATABASE_URL` (creator_runtime), `PORT=4103`, `WEB_ORIGIN=http://localhost:3003`, `COMMERCE_CURRENCY=USD`, `W3_PROVIDER_POLICY_FILE`, `W3_DEVELOPMENT_ECONOMICS_FILE`, `W3_FAN_GENERATION=development`, `W3_DEVELOPMENT_INGESTION` (Maya and Devon creator:account pairs) |
| `web.env` | `QELVORA_API_URL=http://127.0.0.1:4103`, `W3_WEBSOCKET_URL=ws://127.0.0.1:4103/v1/realtime`, `WEB_ORIGIN`/`QELVORA_PUBLIC_ORIGIN=http://localhost:3003` |
| `devices.env` | `W3_IOS_UDID=E375E748-AE89-4701-AB12-44EA240D61A8`, `W3_ANDROID_SERIAL=emulator-5584` |
| `provider-policy.development.json` | `{"version":"development-unreviewed-openai-20261001","providers":[{"name":"OpenAI","termsUrl":"https://openai.com/policies/services-agreement/","noTraining":true,"noRetention":false}],"verified":true}` |
| `economics.development.json` | W4-approved development values: `{"label":"development","costRule":{"version":"w3-dev-2026-10-01","microsPerUnit":1000,"ceilingUnits":60,"rounding":"ceil"},"priorCostRules":[],"trialAllowance":1500}`. Never drop a rule version once a reservation used it |

**Database.** Docker `creator-platform-w3-20261001` (pgvector/pgvector:pg17) at `127.0.0.1:55443/creator_w3`, volume of the same name. Fresh install of all 40 registered migrations via `apps/backend/scripts/migrate-trust.ts` (run with `DATABASE_MIGRATION_URL` built from `db.env`, admin role). `infra/local/seed-w3.sql` adds fictional verified creators Maya (`20000000-0000-4000-8000-000000000001`, account `…0003`) and Devon (`…0002`, account `…0005`) and Priya (`…0004`) on Maya's team. Fan `kilnfire` (account `…0001`) was onboarded through the web UI. Reserved migrations 0044–0060 are not applied; W8 owns the activation plan — do not hand-apply them to this DB (it breaks `migrate-trust.ts`).

**Start/stop.**

```bash
docker start creator-platform-w3-20261001
```

```bash
cd apps/backend && set -a && . ~/.config/creator-platform/w3-mac-studio-20261001/backend.env && set +a && pnpm exec tsx src/server.ts
```

```bash
cd apps/web && set -a && . ~/.config/creator-platform/w3-mac-studio-20261001/web.env && set +a && pnpm exec next dev -p 3003
```

iOS: `xcodegen generate --spec apps/ios/project.yml`; build with `xcodebuild -project apps/ios/QelvoraApp.xcodeproj -scheme QelvoraApp -configuration Debug -destination id=$W3_IOS_UDID -derivedDataPath ~/Library/Caches/creator-platform-w3/ios-derived -clonedSourcePackagesDirPath ~/Library/Caches/creator-platform-w3/ios-packages -onlyUsePackageVersionsFromResolvedFile build CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- ONLY_ACTIVE_ARCH=YES` (ad-hoc signing is required for Keychain); `xcrun simctl install`, then `xcrun simctl launch --terminate-running-process $W3_IOS_UDID com.pantopus.qelvora --api-url http://127.0.0.1:4103 --return-to /you --appearance light`. Use the iOS Simulator control tool to tap/type/screenshot.

Android: `JAVA_HOME=/opt/homebrew/Cellar/openjdk@21/21.0.10/libexec/openjdk.jdk/Contents/Home ./gradlew :app:assembleDebug --no-daemon --max-workers=3 -Pandroid.sdkDownload=false -PcreatorBuildDir=$HOME/Library/Caches/creator-platform-w3/android-build` from `apps/android`. Boot `emulator -avd Qelvora_W3_API34 -port 5584 -no-window -no-audio -no-boot-anim -no-snapshot-save -cores 2 -memory 2048 -gpu swiftshader_indirect`; install; `adb -s emulator-5584 shell "am start -W -n com.pantopus.qelvora/.MainActivity --es api_url http://10.0.2.2:4103 --es return_to /you --es appearance light"`. Operate with `adb input tap/text`, `exec-out screencap -p` and `uiautomator dump` (Maestro is not installed on this Mac).

**Shared machine budget (W1, binding until changed).** One heavy native build machine-wide: `mkdir /private/tmp/creator-platform-heavy-build.lock` + `owner` file, `rm -rf` when done. At most two creator-platform Android emulators (`/private/tmp/creator-platform-emulator-slot-{1,2}`) with `-no-snapshot-save`, 2 cores, ≤2048 MB, `adb -s <serial> emu kill` when idle. At most three iOS simulators (`/private/tmp/creator-platform-simulator-slot-{1,2,3}`), shut down after 10 idle minutes. Never touch another stream's device, container or port. At handoff W3's emulator and simulator are **shut down**.

**Peer resources (avoid):** W1 DB 55441/API 4111/web 3011; W2 55442/4102/3002; W4 55444/4104/3004; W5 55435/4105/3005; W6 55446; W8 55438/4108/3008.

## 4. This increment: canonical fan-generation host composition

`apps/backend/src/modules/conversation/host.ts` → `composeConversationHost(runtime, config, producers)` is now called from `server.ts` `registerFeatures`. Without `W3_FAN_GENERATION=development` the conversation/commerce/agent graph behaves as before. With it (development identity, loopback origin, `COMMERCE_CURRENCY` required), it composes one agent domain (Studio + fan generation share the model, license verifier and journal), W4 commerce with `attributedGenerationCostPolicy` + trial, W3 conversation runtime via `generatorFactory(memory)` (shares the runtime's exact `MemoryService`), lineage (0056/0057), corrections (0058), recordings (0059 + W6 media, binding W6's publication port), and a development ingestion loop for the listed fictional creators. Fan generation turns on only when **every** genuine producer exists; startup prints exactly what is missing. Current output:

`Fan generation: unavailable; missing provider model and credentials, license verifier (W2), in-transaction denial (W8), registered 0048_w2_usage_lineage, registered 0049_w4_generation_cost_settlement.`

`ConversationRecordings.currentPublication(scope, recording, heldClient)` was added for W6's `MediaAuthority.currentRecordingPublication`: exactly one delivered `human_creator` message in the scope's family with the same processed evidence tuple and canonical signed command.

### Producer checklist (owner → what → status)

| Owner | Input | Status at handoff |
| --- | --- | --- |
| Human | OpenAI key on this Mac (copy iMac `~/.config/creator-platform/secrets/openai.env`, or add `OPENAI_API_KEY` to `backend.env`) | **Requested, not supplied.** Blocks generation and source embedding |
| W2 | `W2_SMALL_MODEL=gpt-4.1-mini-2025-04-14`, `W2_LARGE_MODEL=gpt-4.1-2025-04-14`, `W2_EMBEDDING_MODEL=text-embedding-3-small`, `W2_PROVIDER_POLICY_REFERENCE=synthetic-review-only-unapproved-processor-20261001`, and `W2_MODEL_RATES_JSON` exactly as in `artifacts/workstreams/W2/resume/20260930/cache-accounting-provider.json` (cacheWrite = input rate, otherwise costs go NULL and trip `creator_cost_cap`) | Values agreed; add to `backend.env` with the key |
| W2 | `apps/backend/src/modules/agent/development-license.ts` (synthetic development `LicenseVerifier`, guarded by `W2_DEVELOPMENT_SYNTHETIC_LICENSING=true`), development-scope license/publish only with that verifier, and `developmentSyntheticJournalPolicy()` | W2 implementing; will ping the branch. Then pass `{ licenseVerifier, journalPolicy }` as `composeConversationHost`'s third argument in `server.ts` |
| W8 | One registry activation plan for 0044–0060 (promotes 0048, 0049, 0050 = existing `pending_w3_account_index.sql` sha256 189e19e0…e86e1, 0056–0058; 0059 waits for W6 0047) | W8 writing; **don't open a registry PR yourself**. After it merges, run `migrate-trust.ts` against `creator_w3` |
| W8 | 0053 `runtime_denial_projection` + `trustScopeRestrictionInTransaction()` + development-host trust composition lines for `server.ts` (`assertScopeAllowedInTransaction`) | W8 implementing; W8 asked that nothing permissive (no no-op, not `trustScopeRestriction`) be wired meanwhile |
| W4 | Development cost rule and trial | **Done** (values in §3). Semantics: reserve `ceilingUnits` up front, settle `ceil(costMicros/microsPerUnit)` from W2's sealed receipt |
| W6 | `composeMediaHost` in `apps/backend/src/modules/media/host.ts` (branch `codex/w6-media-runtime-20261001`); pass `{ media, bindRecordingPublication }` into `composeConversationHost`; W6 adds `/recordings` to the conversations BFF allowlist and the Studio voice-reply composer | W6 implementing |
| W1 | Development actors three–six (adult) and seven (not adult) — [PR62](https://github.com/WangPantopus/creator-platform/pull/62); shared Playwright fix PR59; iOS snapshot fix | W1 merging/owning |
| W5 | `appendSystemLink` producer for public/group answers. Initial W5 proposal: `{kind:"public_answer"|"group_answer", contentId, contentVersion, title ≤120, route:"/content/{creatorId}/{contentId}"}`; eligibility = only the asker's thread (public answer from a packet) or fans whose accepted group packet/commitment it fulfils, each with a current-read check; idempotent per thread+contentId+version; withdrawn content keeps the line but resolves to the honest unavailable state; no follower-wide fan-out | **Wait for the W5 successor to confirm** before building |

Once all producers land: restart the API, confirm `Fan generation: available`, then as Maya (actor three, after PR62) author fictional sources in Studio → rights confirmation → ingestion → ≥6-case evaluation → development license → publish; then run package A as `kilnfire` on web, iOS and Android.

## 5. Observations to act on

1. **Android ANR under host overload** (not an app deadlock): load avg 533/1002, swap 42.5/44 GB, four emulators at once; YouTube ANR'd too. Repeat the Android sign-in journey under the budget; if SwiftShader frames stay slow, try `-gpu host` with a window.
2. **Browser pane visibility.** A hidden built-in browser pane reports `document.visibilityState === "hidden"`; AccountScreen and other revalidating screens then deliberately defer loading. Ask the human to show the pane (Cmd+Shift+B) before web journeys; don't patch visibility.
3. **iOS You layout** diverges from `design/phase4b-fan-account/You.dc.html` (centered text buttons vs list rows). Package F fidelity fix.
4. **Consent truthfulness.** The development OpenAI policy has `noRetention:false` (API abuse-monitoring retention). Verify the consent screen never shows "They don't keep or train on your messages" unless both flags are true; otherwise adjust the copy rendering truthfully.
5. **Realtime scalability.** `apps/backend/src/realtime/gateway.ts` re-authenticates and replays from Postgres every 100 ms per socket. Plan: `pg_notify` on `appendFrame` commit + one `LISTEN` connection per process to wake subscriptions, with authority revalidation on a bounded cadence that still meets revocation ≤5 s.
6. **W7 growth** is not enabled on the W3 host (`/home` shows unavailable). Enable it (`GROWTH_ENABLED`, worker URL, 64-hex key) when exercising notifications/entry.
7. **Offline content (H).** The previous owner waited for a W1/W8 "offline authority" that was never produced. Recommended decision: W3 issues a server-side offline lease only from a current W1 thread scope (account, family, message ids/versions, issued/expiry, policy version), clients encrypt at rest with account-bound keys, conceal on expiry/clock rollback, purge on sign-out/account change/revocation, never send offline. Announce to W1/W8, then build.
8. **Autonomous worker recovery (B).** Generation recovery is still page-triggered (`afterAcceptance` on thread GET). Needs a purpose-issued worker scope; coordinate the issuer with W1.
9. `apps/web/next-env.d.ts` is rewritten by `next dev`; keep it out of commits.

## 6. Remaining original scope (A–I), next actions

- **A** First conversation on all three apps: blocked only on §4 producers + key. Then measure acknowledgement p95 ≤300 ms and first approved sentence p95 ≤2.5 s warm / 4 s cold with many requests, not one.
- **B** Two-device reconnect/reorder, last-unit concurrency + idempotency, worker/process restart, autonomous recovery (item 8), LISTEN/NOTIFY (item 5).
- **C** Thread UI vs Consent/Thread/ThreadLive/Ended/NoteThread/States artboards, all nine authorships, citations/memory chips, attachments/audio (W6), long messages, composer/keyboard, Light/Night, VoiceOver/TalkBack, 200% text, reduced motion.
- **D** Takeover/handback/timeout/pause/revocation under one epoch authority; takeover p95 ≤500 ms; signed corrections (0058) and recordings (0059/W6).
- **E** Populated memory edit/delete, sensitive ask-once, stale extraction vs deletion, semantic exclusions, off-the-record without writes, return visit.
- **F** You/Privacy fidelity (item 3), provider consents, audits, W8 export/delete jobs, W7 notification links, W4 spend/time, report/block/crisis independent of payment.
- **G** Creator/triage audited reads vs packet-only, Notes replies (W5), search/export/notification labels.
- **H** Offline content (item 7), 3-hour/90-minute reminders, trial natural pause, exclusion tombstones, retention.
- **I** Fan-language AI, labeled optional human translation with one-tap original, immutable signed original.

Founder rules still bind: personally implement and operate (subagents only for read-only research), no new test code, follow `design/` exactly, never fabricate signatures/authority/receipts/policy acceptance, label development configuration as development.

# W3 increment 27 — Mac Studio runtime restore and fan-generation host composition

Date: 2026-10-01 (America/Los_Angeles). Operator: W3 primary owner (Claude Code session on Yingpeng's Mac Studio, Mac14,13, macOS 27.0, Xcode 27.0, 32 GB RAM).
Branch: `codex/w3-generation-host`, based on main `19a3d297d3fb7e050452b5ea1d97e813af8cfd84`.

## Machine and custody change

W3 now runs on the Mac Studio, not the iMac where the Codex sessions ran. The iMac-only private files named by the earlier handoff do not exist here: no `~/.config/creator-platform/secrets/openai.env`, no `cleanup-20261001/` W3 archive (Maya source), no `w3-resume-20261001/runtime.env`. The Codex worktrees were retired on the iMac (`b475d32b`). The iMac's unstaged `apps/ios/Package.resolved` stays preserved on the iMac; this Mac builds the committed graph (swift-issue-reporting 2.1.1) without changes.

## Restored owned runtime (all loopback, synthetic identity)

| Resource | Value |
| --- | --- |
| Postgres | Docker `creator-platform-w3-20261001` (pgvector/pgvector:pg17, PostgreSQL 17.11), `127.0.0.1:55443/creator_w3`, volume `creator-platform-w3-20261001`, 2 CPU / 1 GiB |
| Schema | Fresh. Canonical `apps/backend/scripts/migrate-trust.ts` applied all 40 registered migrations 0001→0043. 100 `creator` tables, 94 with enabled+forced RLS. `creator_runtime`: LOGIN, NOSUPERUSER, NOBYPASSRLS, NOINHERIT |
| Seed | `infra/local/seed-w3.sql` (admin role): fictional verified creators Maya (`20000000-…0001`, account `…0003`, handle `maya`) and Devon (`…0002`, account `…0005`, `devon`); Priya (`…0004`) on Maya's team. Synthetic prerequisite only; no AI version, license, source, consent, grant or message |
| API | `apps/backend/src/server.ts` on 127.0.0.1:4103, development identity |
| Web | `next dev -p 3003`, origin `http://localhost:3003` |
| iOS | Simulator "Qelvora W3 iPhone 17e" `E375E748-AE89-4701-AB12-44EA240D61A8` (390×844 pt, iOS 27.0) |
| Android | AVD `Qelvora_W3_API34` (API 34 google_apis arm64, 1170×2532 @480 dpi = 390×844 dp), console port 5584 |
| Private config | `~/.config/creator-platform/w3-mac-studio-20261001/` (0700): `db.env`, `backend.env`, `web.env`, `devices.env`, `provider-policy.development.json`, `economics.development.json`. Values are never printed or committed |

## Personally operated observations

1. Web (built-in browser, 390×844): `/auth/continue` → development chooser → actor one → handle onboarding (`kilnfire`, fictional intro) succeeded; `/home` shows the honest "Temporarily unavailable" because W7 growth is not enabled on this host. `/you` stayed on "Loading your account…" only because the browser pane was hidden: `document.visibilityState === "hidden"`, and AccountScreen deliberately conceals/defers until visible (privacy revalidation). Not a product defect; web journeys need the pane shown.
2. iOS: Debug build 37 s, ad-hoc signed (`Signature=adhoc`). `--api-url http://127.0.0.1:4103 --return-to /you --appearance light`. Welcome → chooser → actor one → You shows `@kilnfire` and the intro created on web ([capture](ios-you-restored-kilnfire-light.png)). Cross-client account continuity on one backend confirmed. Design gap noted: iOS You renders centered text buttons where the design and web use list rows (4B-05).
3. Android: `:app:assembleDebug` 7 m 19 s under memory pressure; installed, `api_url=http://10.0.2.2:4103`. Welcome renders ([capture](android-welcome-light.png)). Tapping Continue showed the chooser, then an ANR ([capture](android-actor-chooser-anr-under-host-overload.png)): input dispatch timed out on a focus event. Root cause is host overload, not an app deadlock: load average 533/1002, swap 42.5/44 GB, four emulators + two Gradle JVMs + several simulators across sessions; YouTube ANR'd simultaneously; app spent 15% kernel time with 13k page faults and 3.7 s Compose frames under SwiftShader. W3 devices were shut down and W1 issued a machine-wide device/build budget (below). The Android sign-in journey must be repeated under normal load.
4. Reserved W3 migrations 0056 → 0057 → 0058 applied cleanly in one transaction on the fresh 40-migration schema, then rolled back; bytes match the registry reservations (1044700d…, 08cb6f37…, 89895cd1…). Confirmed final to W8.
5. Host composition (`W3_FAN_GENERATION=development`) starts and fails closed ([log](api-host-startup.log)): `Fan generation: unavailable; missing provider model and credentials, license verifier (W2), in-transaction denial (W8), registered 0048_w2_usage_lineage, registered 0049_w4_generation_cost_settlement.` Capabilities: provider policy listed, `consentAvailable` true, `generationAvailable`/`firstConversationAvailable` false.

Backend `tsc --noEmit`, prettier and eslint pass on the changed files. No new tests.

## Not verified / still open

No thread can exist yet: `begin()` refuses without generation. Packages A–I acceptance, two-device/restart/latency measurements, populated memory/OTR, audits/Notes/signing/media, offline content and language remain open. See the [handoff](../../../../../docs/workstreams/handoffs/W3-mac-studio-2026-10-01.md).

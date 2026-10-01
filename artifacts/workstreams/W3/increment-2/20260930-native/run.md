# W3 increment 2 observations — 2026-09-30

Source base: `0d8183c` plus increment-2 working changes; final compile after provenance changes. Host launches preceded the final provenance additions. Local development, synthetic W1 identity capability, no model generation or verified processor policy. No production fixture success and no new test code.

Owned API127.0.0.1:4103, weblocalhost:3003, PostgreSQL creator_w3/55443, non-owner RLS runtime. API capability: HTTP200, providersnull, consentAvailablefalse, generationAvailablefalse. One loopback capability request took2.064ms; acknowledgement/first sentence/takeover p95 and costs were not measured.

- Backend/web TypeScript, scoped ESLint and optimized Next.js build (including new chat/original-reader routes): pass.
- Kotlin compileDebugKotlin: pass. Android assembleDebug: pass,3m35s; isolated host build: pass,3m. Baseline daemon warning only.
- Swift iOS simulator library target: pass, initial57.22s; subsequent affected compile22.24s and final compile pass. Xcode26.5 (17F42), Swift6.3.2, x86_64 iOS26.5 simulator SDK, targetiOS17.0. Initial macOS-target build failed on existing iOS-only foundation keyboard modifiers; target was corrected without modifying peer components.
- Isolated iOS launch host build: BUILD SUCCEEDED. Installed on W3-only simulator80BBDCB3-C80B-4D63-BEA9-4C3AE12690BC; `com.pantopus.qelvora.w3.development` launched PID39920, API127.0.0.1:4103, destination/you, appearanceLight. Shut down owned simulator after process observation. No native UI operation/capture supported by current tools.
- Owned AndroidAPI35 x86_64 emulator5572/Creator_W3_Conversations boot completed; APK installSuccess, MainActivity start returnedIntent with API10.0.2.2:4103, destination/you, appearanceLight. Headless launch; no visible/native interactive claim. AVD tool reported missing devices.xml but created configuration and emulator boot succeeded. Own copied SDK/cache/output only.
- Codex browser opened You, used Continue with Pantopus and recovery. Actual callback renders Sign-in unavailable. HTTP cookie client previously reached the development actor chooser; authenticated browser conversation remains blocked. Screenshot `browser-sign-in-blocker.jpg` is1280×720. Attempted390×844 override returned the desktop-sized image; override reset. This is failure-state evidence, not an artboard match.
- OpenAI authentication was HTTP200 on /v1/models (increment1); no generation request made. Credentials remain outside Git and all evidence.

Pending runtime scenarios: real consent→approved cited response→return memory on all clients; two actors/devices and altered scopes; delayed/reordered takeover; worker restart; last allowance race; delete/rephrase/old extraction; audited triage reads and revoked team; offline recovery; all reference states; accessibility/theme/keyboard and measured latency/cost. Required producer adapters/leases are enumerated in docs/workstreams/coordination/W3.md.

Final cursor/audit/retry/export changes: Kotlin compile passed (6s); Swift iOS-target compile passed (86.31s). An intervening incorrectly selected macOS C sysroot was rejected, the owned build was stopped and rerun with explicit iOS Simulator `--sdk`; no peer process/cache was stopped. Cursor persistence and purge behavior compile but have not been operated in native UI.

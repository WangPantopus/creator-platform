# W7 continuation — 2026-09-30

Incremental evidence, not complete W7 acceptance. Primary personally implemented, built and operated this continuation. No new test code, outreach, provider messages or paid AI calls. The provided OpenAI secret file was not opened.

## Reconciled source

Starting remote W7 `50c0fe0`; main `2e337a1`. W7 was not a standalone build. Merge commits `ab16128` and `d309cdd` incorporate main and **committed** foundation `22aa088` from `codex/foundation-integrations-checkpoint`. No peer uncommitted files were staged. Eight documentation add/add conflicts retained the newer checkpoint. Existing [draft PR #2](https://github.com/WangPantopus/creator-platform/pull/2) is the continuation PR.

## Fresh isolated resources

| Resource         | Reservation                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Checkout         | `/Users/yingpengwang/.codex/worktrees/0546/creator-platform`, `codex/w7-handoff`                                           |
| Web/API          | 3007 / 4107                                                                                                                |
| PostgreSQL       | `creator-platform-w7-resume-20260930`, loopback55447, DB `creator_w7_resume`, PostgreSQL17/pgvector                        |
| API role         | Non-owner `w7_api` inherits `creator_runtime` + `growth_runtime`; no superuser/bypass/ETL membership                       |
| Worker           | Distinct non-owner `growth_worker`, FORCE RLS ETL policies                                                                 |
| iOS              | Fresh iPhone17 `90934313-E0DD-445C-B8AF-AA8188BD2AC0`, iOS26.5, Xcode26.5                                                  |
| Android          | Pixel7/API35 x86_64, `CreatorPlatform_W7_Resume_20260930`, emulator5570, isolated ADB5047; official SDK and Temurin21.0.12 |
| Temporary output | `/private/tmp/creator-w7-resume-*`; fresh DB keys in mode0600, never logged/committed                                      |

Docker responds now. No global restart, old encrypted DB reuse, peer migrations or peer process/device changes occurred. Historical evidence retains its status. Android SDK/JDK/AVDs were absent initially; the second checkpoint provisioned fresh isolated official tools.

## Initial continuation checkpoint

- Canonical development host mounts Growth behind `GROWTH_ENABLED=true`; private reads use canonical sessions, public reads skip credentials. Missing Home owners return503.
- Additive registry0032 creates immutable leased producer relay, W3 cursors, post-value prompt choices, voluntary source attribution and reviewed experiment metadata. Fresh canonical migration through0032 and earlier checksum replay passed. Applied SQL stays immutable.
- Relay commits before producer ack, rejects changed event IDs, fences leases, distinguishes invalid/blocked/retry outcomes and exposes host recovery. Missing notification owners fail before durable consumption or provider suppression. No HTTP ingestion endpoint.
- W3 builders read actual delivery/events under issued thread scopes, recheck W1's current exact signature and advance W7 cursors. W6 retry keys choose one event under a lock; current call state suppresses ended reminders. W2 publication bridge resolves immutable UUID/hash to actual numeric version/time. Host scope enumeration/binding still required.
- Post-value choices require an owner-recorded useful answer, approved install URLs and shared seven-day/max-three cap; accepted/declined choices persist. Voluntary referral links validate current public creator/post and serialize account-wide active cap20. Explicit-consent attribution stores only bounded categories/opaque object IDs; no fingerprint/text/reward.
- Reviewed experiment callback checks exact draft criteria/time window; default gate off. Saving drafts never activates traffic.
- Privacy includes new account rows and removes owned-creator relay/cursor metadata. Missing callable W8 job/account proof fails503. Creator/thread mapping and >10,000-row streaming remain dependencies.
- Backend/web typechecks and targeted lint passed. Full shipping iOS app built with normal ad-hoc signing and launched against API4107. Initial XcodeGen failed without bundled presets; complete tool bundle fixed generation and the subsequent build passed. No replacement app host.
- Actual 390-wide web and signed iOS Discover show the genuine empty public directory. Anonymous preferences401; invalid infinite offset400. Canonical HTTP continuation/completion established HttpOnly session; quiet hours1320→420 in `America/Los_Angeles` saved and reloaded. No useful-answer outcome exists: install claim returns `eligible:false`. Missing Home returns503.
- In-app browser redirected development provider failed continuation-cookie check; the same canonical HTTP cookie flow succeeds. Browser-authenticated settings acceptance remains open. Auth was not weakened.

## Second continuation checkpoint

The current [acceptance matrix](acceptance.md) separates exact observations from missing acceptance. This section supersedes the initial browser/tool limitations above while retaining those failed attempts.

- Additive0033 binds retried prompt claims and decisions to one UUID; a stale UI cannot overwrite a newer choice. Web and both native Home surfaces mount optional controls only after the canonical owner response and an available useful-answer outcome. No useful outcome or store URL was fabricated. New public web optional source/referral controls and reviewed default-off variants reuse existing components; creator proposal list/stop does not activate traffic.
- Additive0034 retains only worker-visible HMAC subject fences. Sorted scope locks serialize purge with account controls, relay/notification/provider submission, public projections, verified email binding, signals, window closure and retention persistence. A synthetic delayed notification created0 after purge, relay retry queuedfalse, late binding410 and0 raw recipient records. This is not genuine W8 deletion acceptance. The callable W8 scope denies absent job/account ownership503; unsupported narrow scopes and large exports stay explicit dependencies.
- Exact configured app origin fixes Next loopback normalization without accepting unrelated origins. Public development capabilities omit stale credentials. Actual browser canonical development identity → onboarding → settings → saved/reloaded preferences was operated; after15-minute expiry recovery succeeds. Optional notification score4 feedback saved via the UI; PostgreSQL has one matching row. Screenshots in `web/` show actual app controls. Pantopus production identity remains unconfigured.
- Visible email unsubscribe GET is scanner-safe and performs no mutation; RFC8058 unauthenticated POST persists optional-email opt-out. A synthetic example.invalid binding demonstrated GET200/subscribed=true followed by POST200/stopped=true. No email transport or provider delivery was attempted.
- Full shipping signed iOS and Android builds pass with final prompt UUID changes. Official isolated tools: Temurin21.0.12.1+1 (vendor SHA25644db0f08196daf19a47f90d13388b0c943b67663cb537f998fe29e836fa842ce), Google command-line tools22.0 mac_x86_64-15859902 (SHA256c5a6378ab5cf7e0d5701921405115befff13e9ff7417fb588389338f8bd050f3). AVD booted using isolated SDK/user/AVD/cache/ADB paths. No peer environment was reset. Old System UI ANR remains historical; no ANR event observed here, native tap-through still unverified.
- Actual empty native Discover was inspected in Light/Night. iOS Night search prompt now uses generated palette; Android system status/navigation icons follow Night. Reload during migration initially showed useful unavailable states; subsequent stable API launch showed the actual empty directory. Only empty/recovery contrast is verified, not the populated13-artboard matrix.
- Workspace typecheck passes7 tasks; scoped/source lint and generated checks pass. Backend production bundle and Next production build pass. An earlier build inherited NODE_ENV=development and failed prerender; rerunning with NODE_ENV=production passed. Plain root lint initially scanned this isolated `.next-w7-resume-build` output; the source-only run excludes that temporary output and passes. No repo lint policy, test file or generated resource was hand-edited.
- Broad branch diff includes main merges and committed foundation22aa088, with no peer uncommitted source staged. Existing draftPR#2 automatically tracks pushes. Connector metadata update returned403; in-app GitHub browser is signed out. [Prepared PR description](pr-description.md) is reviewable, but metadata edit was not falsely reported as applied. Merge remains pending actual owner/release acceptance.

Final logs/captures/source hashes are included beside this manifest. Initial source-checkpoint hashes are preserved; use `source-final.sha256` for the follow-up. Xcode's automatically resolved dependency graph is archived in `ios/xcode-resolved.json`; tool changes to the tracked shared package lock and Next generated declaration paths are excluded from the patch. Native binaries and compiled bundles remain temporary and uncommitted. The OpenAI secret file was never opened and no paid AI call was made.

## Current remaining gates

W5 content/Studio APIs are absent from this foundation. W3 Home/categorical useful-answer/scope enumeration, W4 ShareGrant/notices, W2 actual72h outcomes, W6 host effects, W8 privacy registration/streaming and synchronized restrictions remain unconnected. APNs/FCM/email credentials, approved public/store origins, RP association and physical/background device proof are missing. Instagram/experiments/locales/rewards remain gated. All19 actual producer/provider paths, populated13-artboard Light/Night comparisons, authenticated tap-through, accessibility and meaningful latency cohorts remain unaccepted. Empty screens/diagnostics do not prove these paths.

Additional source/build manifests and captures follow as continuation proceeds. Keys, cookies, auth headers and private payloads are excluded from evidence/Git.

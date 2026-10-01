Take over Workstream 6 — Calls, voice, and media — as its primary implementation owner and finish the remaining work in creator-platform.

We are aiming to build the greatest app in the world. Be ambitious, take ownership, solve problems, and carry the work through implementation, integration, actual app verification and delivery. Do not stop at plans, scaffolds, status reports or draft PRs.

LATEST USER DIRECTION (overrides conflicting older handoff process limits)

- The only explicit development restriction is: do not write new unit tests. Test coverage may be scoped; do not chase coverage percentages.
- Actual launched application journeys are mandatory: build, install, launch and operate the real web app in a browser, the Android app in an emulator and the iOS app in a simulator. Verify affected happy paths and meaningful failure/recovery cases against actual backend state.
- A build, HTTP 200, component catalog, mock success or unit-test result is not end-to-end acceptance. Fix observed problems and repeat the affected journey. Use end-to-end tooling (Playwright, CDP virtual authenticator, adb, simctl) when useful.
- Commit and push coherent increments. Create PRs when reviewable, update existing PRs for their existing scope, move ready work out of draft, and merge when ready. These actions are already authorized.
- An independently working increment can merge without waiting for unrelated features. Keep unfinished functionality truthfully unavailable.
- Real credentials, provider contracts, consent, financial rules and hardware must stay real. Missing inputs are concrete dependencies to resolve while you continue independent work. Never invent successful verification.
- Provision only what you need, avoid simultaneous heavyweight builds, and stop owned resources afterward.
- Stack: TypeScript/Node backend, Next.js web, Swift/SwiftUI iOS, Kotlin/Compose Android. Keep Qelvora replaceable through config/brand.json. Personally implement; use subagents only for read-only research.

READ FIRST

1. docs/workstreams/handoffs/W6-2026-10-01-runtime.md: current branches, CI, peer agreements, resources and findings. It supersedes conflicting state in older handoffs.
2. docs/workstreams/handoffs/W6-2026-10-01-consolidated.md and docs/workstreams/prompts/W6-resume-20261001.md: full remaining scope and its history.
3. docs/workstreams/W6-calls-media.md, docs/workstreams/status/W6.md, docs/workstreams/coordination/W6.md, docs/workstreams/W6-c2pa-runtime.md, docs/implementation/W6-creator-media.md, docs/implementation/W6-livekit-evaluation.md.
4. docs/workstreams/README.md, STANDARDS.md, CONTRACTS.md, DECISIONS.md, COVERAGE.md, OPPORTUNITIES.md, VERIFICATION.md; docs/BRIEF.md; the four documents in docs/source/; the design artboards 4E-01/02/03/04 and 4F-03 under design/phase4e-4i/; AGENTS.md and apps/web/AGENTS.md. Read the installed Next.js and Turborepo docs before framework changes.

REPOSITORY STATE AT HANDOFF

- Worktree: /Users/yingpengwang/estimate-rescue/creator-platform/workstream-6-calls-voice-media-175fcc. The old .codex/worktrees/970d and 6438 checkouts no longer exist. Reuse this worktree or create a fresh one from origin. Never reset, stash or clean the shared /Users/yingpengwang/creator-platform checkout or peers' worktrees.
- GitHub CLI: /Users/yingpengwang/.local/bin/gh (owner access for WangPantopus/creator-platform works). Fetch first; main moves constantly. At handoff it was 19a3d297 (W2 PR #40), with no W6 paths changed since d6ea70e4.
- PR #19 (draft) https://github.com/WangPantopus/creator-platform/pull/19, branch codex/w6-isolated-recovery-20261001, head 7552396b. Main is merged in, and main's W1-owned Swift snapshot comparison is restored. W1 PR #59 lands the same Playwright visualWebURL fix; when you merge main again, keep main's playwright.config.ts.
- PR #20 (draft) https://github.com/WangPantopus/creator-platform/pull/20, branch codex/w6-completion-20261001, head 6705b7a8. Main is merged in.
- New draft PR stacked on PR #20, branch codex/w6-media-runtime-20261001: composeMediaHost, media env config, ClamdMalwareScanner, transactional pg_notify job wakeups and the worker:ingestion media runtime. It is typechecked and linted, but NOT yet wired into server.ts and NOT exercised. Read the PR body.
- The 970d-era iOS Package.resolved rewrite (swift-issue-reporting 2.1.1 → xctest-dynamic-overlay 1.13.1) is preserved only as evidence under artifacts/workstreams/W6/cleanup/2026-10-01-worktrees/. It is not adopted. Reconcile it only deliberately, after reviewing the Swift dependency graph.
- CI on the reconciled heads: backend/web (18 real PostgreSQL contract checks + builds) and android-runtime pass on both. PR #20's web-visual fails because it lacks the Playwright fix. Native jobs were queued. Main's own web-visual and ios-foundation failures are shared foundation issues (W1 PR #59 and W4 PR #53). Re-read current results; queued or skipped is never a pass.

PEER OWNERS ARE LIVE ON THIS MAC — COORDINATE, DON'T COLLIDE

Use ListAgents and SendMessage (deferred tools; load them with ToolSearch "select:ListAgents,SendMessage"). Agreements made today:

- W8 (session "Refresh W8 handoff…") owns the ONE registry activation PR for reserved migrations 0044–0060. Do not edit infra/migrations.json.
  - W6 confirmed 0046 (call availability) and 0047 (creator media) as final.
  - When W8 sends its branch, run the backend PG contract checks plus your launched journeys on your owned DB and report exact results.
  - Pending W8 answers: the real held-denial hooks for media (thread, creator, and audience assertAudienceAllowed), with export names and ETA; whether the ingestion worker may open thread scopes with access.openThread({accountId: asset.owner_account_id, adultEligible: true}, …, false); and an ID for a proposed creator_media_worker discovery-role migration (column-limited, role-targeted SELECT like growth_worker/creator_trust_worker).
- W3 (session "W3: guarded conversation integration…", which is also handing off) composes ConversationLineage, ConversationCorrections and ConversationRecordings in apps/backend/src/modules/conversation/host.ts: composeConversationHost(runtime, config, { media, bindRecordingPublication }), branch codex/w3-generation-host at e70f8d52, draft PR https://github.com/WangPantopus/creator-platform/pull/63. ConversationRecordings.currentPublication(scope, recording, client) is pushed there; it binds W6's port after ConversationRecordings.prepare succeeds.
  - It consumes W6's { media, bindRecordingPublication }, and W3 owns ConversationRecordings.currentPublication.
  - Do NOT pass a no-op assertScopeAllowedInTransaction; W8 is delivering 0053 + trustScopeRestrictionInTransaction() + dev-host trust lines. Voice personal replies stay off until then.
  - You may add /recordings to apps/web/app/api/conversations/[...path]/route.ts and build the creator voice-reply composer; tag W3.
- W5 (session "W5 Creator Studio completion handoff"): pass mediaHost.contentPublication as dependencies.mediaPublication into createContentStudio/createCommerceStudio, then call mediaHost.bindContent(result.content).
  - Never construct an owner Actor to call runScheduled. W5 owns the non-impersonating media-ready publication path; until then a signed voice Note honestly stays media_pending.
  - W5 accepts a development-mode no-op assertAudienceAllowed. Confirm with W8 first.
- W4 (session "Commit original call refunds…") owns money and C07 settlement. W6 emits evidence only.
- W1 machine budget (until further notice):
  - One heavy native build machine-wide (mkdir /private/tmp/creator-platform-heavy-build.lock + owner file; rm when done).
  - ≤2 creator-platform Android emulators (/private/tmp/creator-platform-emulator-slot-{1,2}, 2 cores, ≤2048 MB, -no-snapshot-save).
  - ≤3 iOS simulators (/private/tmp/creator-platform-simulator-slot-{1,2,3}; shut down when idle >10 min).
  - Never touch other streams' devices, containers or ports.

OWNED RESOURCES YOU CAN REUSE

- Docker container creator-platform-w6-20261001 (pgvector/pgvector:pg17, 127.0.0.1:55446, admin postgres / w6-local-only, local disposable): stopped; `docker start` it. Database creator_w6 has registry 0001–0043 plus the produced reserved block applied locally only. Recreate it from W8's real registry when that lands.
- /tmp/qelvora-w6-runtime-20261001/ (mode 0700):
  - clamav/: clamd.conf and freshclam.conf, socket clamav/clamd.sock, current signature DB. Start with: /opt/homebrew/sbin/clamd --config-file=/tmp/qelvora-w6-runtime-20261001/clamav/clamd.conf
  - tools/c2patool-0.28.1/c2patool/c2patool: official, sha256 337a0d23f82b505bb0eef1cdff58d08dfcf1d1ec755869a1a2c93f596f206d26.
  - secrets/: local-only runtime-db-password (already set on creator_runtime), identity-session-key and media-ticket-secret.
  - All of it is regenerable.
- FFmpeg/ffprobe: /opt/homebrew/bin. ClamAV 1.5.4 via Homebrew. Xcode 27, JDK 21, Android SDK at ~/Library/Android/sdk (android-34 google_apis arm64 image, build-tools 34/35), xcodegen, Docker Desktop.
- W6 ports: API 4106, web 3006, DB 55446 (55436 and 55456 are also W6 reservations).

FIRST INCREMENT: FINISH HUMAN MEDIA (voice Note first; voice reply once W3 and W8 land)

1. Wire apps/backend/src/server.ts inside registerFeatures:
   - `const mediaEnvironment = readMediaEnvironment()` at module level.
   - `const mediaHost = mediaEnvironment && denials ? composeMediaHost({ runtime, environment: mediaEnvironment, denials, development: true }) : undefined`.
   - Pass `...(mediaHost ? { mediaPublication: mediaHost.contentPublication } : {})` into the studio dependencies, then `mediaHost?.bindContent(content.content)`.
   - Give W3's host `{ media: mediaHost.media, bindRecordingPublication: mediaHost.bindRecordingPublication }`.
   - Replace `mediaFeature({})` with `mediaHost?.feature() ?? mediaFeature({})`.
   - Pass assertAudienceAllowed to createConfiguredBackend so runtime.audienceIdentity exists. Use W8's hook if delivered, otherwise the approach agreed with W8.
   - Denials must come from W8's held hooks. If they are absent, keep media unmounted (fail closed) rather than wiring a permissive substitute without W8's agreement.
2. Add committed development tooling for content credentials, e.g. infra/local/w6/:
   - It generates a clearly labeled W6 development root CA (EC P-256, CA:TRUE) and a signing certificate (CA:FALSE, digitalSignature, EKU c2pa-kp-claimSigning 1.3.6.1.4.1.62558.2.1 and/or documentSigning/emailProtection, SKI/AKI) into the private runtime directory.
   - It writes a single-path executable signer. On `--signer-info` it prints {"alg":"es256","sign_cert":"<end-entity PEM chain without root>"}. Otherwise it signs stdin with ECDSA-SHA256 and writes raw IEEE-P1363 r‖s (Node crypto.sign with dsaEncoding 'ieee-p1363').
   - Set MEDIA_C2PA_TRUST_ANCHORS to the root PEM and its sha256.
   - Prove that C2PAToolCredentialSigner's independent readback requires signingCredential.trusted, claimSignature.validated/insideValidity, assertion.hashedURI.match and assertion.bmffHash.match.
   - Document that this is development trust only. A production KMS/HSM signer with a C2PA-trust-list certificate remains a real dependency; never use c2patool's bundled sample keys.
3. Commit a policy file example and the run instructions:
   - Policy: thread.human_reply, plus creator.human_note ≤60 s, post_audio and post_photo. retentionSeconds is an open W8 decision; propose 12 months to match D-08 and record it as a proposal.
   - API: NODE_ENV=development IDENTITY_ADAPTER=development CREATOR_FEATURE_ENABLED=true PORT=4106 WEB_ORIGIN=http://localhost:3006 IDENTITY_SESSION_KEY=… DATABASE_URL=postgresql://creator_runtime:…@127.0.0.1:55446/creator_w6 plus the MEDIA_* variables; run `node --import tsx apps/backend/src/server.ts`.
   - Worker: same DATABASE_URL and MEDIA_* variables plus MEDIA_CLAMD_SOCKET, MEDIA_FFMPEG, MEDIA_FFPROBE and MEDIA_C2PA_*; run `node --import tsx apps/backend/src/workers/start.ts ingestion`.
   - Web: QELVORA_API_URL=http://127.0.0.1:4106 WEB_ORIGIN=http://localhost:3006 pnpm --filter @qelvora/web exec next dev --webpack --port 3006.
   - Do not use `pnpm dev`; Turbo filters the environment.
4. Seed development data with labeled SQL as the admin role, never in product code:
   - Creator account …0001 with creator_profile verification='verified' and an approved creator_proof.
   - Fan account …0002 with a fan_profile.
   - A thread row for voice replies.
   - Sign in as the creator at http://localhost:3006 (the RP ID is localhost). Enroll a passkey within 5 minutes of sign-in using a CDP virtual authenticator.
5. Operate end to end, and inspect actual bytes, DB rows, the c2patool report and the served file hash:
   - Studio Note composer: "Voice · up to 60 s" → record (fake media device or real mic) → preview → upload → worker scan/transcode → passkey-sign the Note → credentials → publish → fan web playback with range/seek.
   - Then fan playback on the iOS Simulator (`--api-url http://127.0.0.1:4106`) and the Android Emulator (`adb reverse tcp:4106 tcp:4106` + `--es api_url http://127.0.0.1:4106`).
   - Failure cases: cancel, re-record, interruption, offline/resume, corrupt and oversize input, EICAR, stale publication, expiry, revocation, account switch.
   - This exercises PR #19's account-bound upload validation and PR #20's bounded processor/C2PA adapter. If they work, mark #19 and #20 ready, update their descriptions, and merge #19 then #20 (keep both W6 doc sections on conflict). Then retarget the media-runtime PR to main, finish it and merge.
6. Voice personal replies once W3's host and W8's denials land:
   - Creator voice-reply composer in the Studio thread/packet view: upload human_reply → W1 signed-acts/begin with the conversation.recording subject → passkey → POST …/media/:id/sign → credentials → W3 POST /v1/conversations/:c/:f/recordings → fan plays it in the thread on web/iOS/Android.

THEN FINISH THE REST OF W6 (scope unchanged; details in the consolidated handoff and successor prompt)

- C06 scheduling:
  - Availability (0046) with signed offers, explicit offsets/IANA zones/DST, concurrent/stale/expired slots, selected-session recovery, reminders and cancellation/rescheduling.
  - Compose createCommerceCallServices (W4 CommerceScheduling/CommerceFulfillment) and run SessionWorker.tick with properly issued scopes.
  - Prepare concrete proposals for positive arrival grace, both-absent and cancel/reschedule policies. Today determineOutcome returns null for both-absent, so the session loops in ending/blocked. The 180 s reconnect allowance is not arrival grace. Do not invent money.
- Real calls:
  - LiveKit Cloud evaluation is authorized, but no account or credentials exist. Ask the user for a project, or use a self-hosted `livekit-server --dev` locally for transport development, labeled as such.
  - Add SDKs: livekit-client 2.22.3, Swift 2.17.0, Android 2.29.0 (re-check current releases).
  - Implement the CallProvider; redeem the admission nonce; webhook ingestion stored idempotently, never treated as complete history; RemoveParticipant with revoke_token_ts; DeleteRoom plus revocation for closure; egress deletion receipts.
  - Resolve supportsSingleUseAdmission honestly: a provider mechanism or an explicitly approved contract change. A short JWT is not single use, and polling is not history.
- C07 clocks/outcomes:
  - Two-party calls with fixed duration, no overtime, connected-time accounting and the 180 s cumulative reconnect budget.
  - Every outcome path, plus missing/reordered callbacks and worker crashes, before immutable C07. W4 settles.
  - Handback adapter: hand back only if human_active, with creator authority, through W3's changeControl/epoch protocol.
  - Fix the W7 notify adapter defects: the non-existent `joining` state, and the one-ID link where W6 clients require /calls/{creatorId}/{fanId}/{sessionId}. Add timed reminders.
- Consent/privacy: recording off by default and requires both parties; summary, reuse and AI-source are independent; without recording consent, the summary uses only the packet plus a creator-typed note. Real revocation, recording/derivative deletion, protected archive, account-family enumeration and approved retention with W8.
- Native calling:
  - CallKit/audio session, PushKit and background modes on iOS.
  - Android: declare the ConnectionService and add BIND_TELECOM_CONNECTION_SERVICE, MANAGE_OWN_CALLS, CAMERA and foreground-service permissions.
  - Incoming/deep-link recovery, permissions and interruptions.
  - Operate in the Simulator and Emulator. Record physical-device gaps separately.
- Licensed AI audio (W2-owned licensing): spoken/visual labels, watermark/C2PA, downloads/shares/transforms, current-license revocation. Paid calls stay human.
- Design/accessibility/reliability: 4E-01/02/03/04, 4F-03, DG-W6-01/02/03, DI-14, T-09/12/16/18/25/28/29, A4/A9/A10, O07/O08/O15/O19/O20. Light/Night at 390 and Studio 1280/sidebar 248. Keyboard/focus, safe areas, 200 % text, VoiceOver/TalkBack, reduced motion, identity labels. Measured latency and cost under named conditions.

For each increment: implement → launch and operate the affected web/iOS/Android journeys → fix → record source/build/device/backend/provider evidence under artifacts/workstreams/W6/<increment>/ → commit/push → create or update a ready PR → inspect current CI → merge when ready. Keep docs/workstreams/status/W6.md, coordination/W6.md and the handoff current. Stop owned resources when finished. Report what works, what you personally verified, what merged, and the exact remaining dependencies. Continue until W6 is actually finished.

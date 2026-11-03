# W6 — Calls, voice, and media

## Agent assignment

**Execution rule:** You personally do all coding, migrations, configuration, documentation, debugging/fixes, integration, app launching and end-to-end verification. Subagents may only research or check information read-only; never delegate implementation or acceptance, including asking for patches to apply yourself. Do not write new test code. Use your [complete execution prompt](prompts/W6-calls-media.md) when assigning this stream.

Own human media and call delivery across Node.js, web, Swift, and Kotlin. Follow [the plan](README.md), [standards](STANDARDS.md), [contracts](CONTRACTS.md), [runtime verification](VERIFICATION.md), Domain D-03/D-16/D-18/D-25 and Architecture §8. Use managed real-time media behind the provider interface; the build prompt names LiveKit, while commercial/configuration readiness still needs confirmation. Do not write new test suites. Use real calls and sandbox sessions with actual clients.

## Work packages

1. **Media pipeline.** Scoped signed upload/download URLs, declared type/size/duration checks, progress/cancel/retry, resumable handling where needed, quarantining/scanning and safe parsing, thumbnails/waveforms/captions or transcripts where consent permits, transcoding, object ownership/retention, cache/CDN controls and deletion. Bound processing away from the interactive Node pool. Cover fan attachments, source/interview audio, posts/photos, human Notes/replies and call assets.
2. **Human voice first.** Browser/native recording permissions, recording/preview/discard/re-record, interruptions and audio route, duration limits per content type, M4A output and provenance manifest, signed exact-media act through W1, secure playback/seeking/accessibility and no autoplay. W5 owns content/fulfillment; W4 decides whether the delivery satisfies a commitment.
3. **Availability and scheduling.** Creator windows, time zones/daylight-saving transitions, offer times, fan selection, overlap locks, expired offers, reschedule/cancel behavior and reminders with W7. W4 owns acceptance/capture/capacity/commitment; agree atomic offer-accept semantics so offering times never incorrectly says payment waits until the call.
4. **Session lifecycle and rooms.** Scheduled/waiting/connecting/connected/reconnecting/ended lifecycle, creator's own verified account and correct fan participant, authorized short-lived tokens, private room capabilities, human identity chip, packet-only pre-call brief, microphone/camera/network state and waiting room. AI/team participants cannot satisfy a personal human call.
5. **Server clocks and outcomes.** Durable scheduled clock, connected-time accounting and reconnect allowance, server-enforced end with no overtime, default three-minute reconnect budget per D-16, disconnect/background/restart handling. Completed threshold, fan early end choice, creator early end partial refund, creator no-show, fan no-show and technical failure use precise documented outcomes. Fetch provider truth and reconcile missing/reordered callbacks before final settlement. Emit evidence to W4; do not independently calculate or issue refunds in client code.
6. **Separate consent.** Recording is off by default and needs both parties; summary separately needs both; reuse/content and AI-source use are separate. Without recording consent, a consented summary uses only the packet plus a creator-typed note, never an undisclosed transcript. Record actor, purpose, object, time and revocation. Stop/refuse only the unconsented action; joining a call does not expand permission. Show recording/summary state truthfully and delete media/derived assets according to W8 lifecycle jobs.
7. **Native calling.** Swift CallKit/audio session/background interruptions, Android supported Telecom/ConnectionService integration and foreground-service declarations, permissions, incoming-call delivery with W7, lock-screen presentation, Bluetooth/wired/speaker switching, interrupted cellular calls, camera rotation/foreground/background, killed-app recovery and denial states. Follow current OS/provider guidance; a ringing UI alone is not a connected call.
8. **AI audio after pilot.** W2 owns licensed generation/voice-provider policy. W6 handles consented assets, machine-readable provenance, robust watermark, spoken AI label, distinct player/visual label, revocation and cache lifecycle. Validate downloaded/shared/transcoded behavior; do not claim watermark or provenance survives a transform without checking it. Never introduce AI live calls/video into paid human sessions.

## Surfaces and boundaries

Own call preflight/waiting/live/reconnect/post-call, creator call/OfferTimes and AI/human audio compositions listed in the [inventory](research/design-inventory.md), plus reusable native media adapters. Required parties are the fan on web/iOS/Android and creator on responsive web Studio; a creator web client can pair with a native fan. Native creator calling/Studio is the separately tracked O19 extension. W5 composes recording into Studio; W3 composes playback into chat; W4 displays the final receipt; W7 delivers reminders and link destinations.

Implement session/media modules, worker jobs, web media features and isolated Swift/Kotlin media/call modules. Native manifest/entitlement/project edits and root deep links use W1; deployment/storage/job capacity uses W8. Agree C07 outcome evidence and C06 scheduling acceptance before provider code.

## First deliveries and dependencies

Deliver human record → upload/process → sign → play first, because Notes and personal voice replies need it in the membership pilot. Build scheduling/provider room integration concurrently with W4 commitment states. Then prove two-party calling and every outcome, followed by device/background behavior and marked AI audio.

## Required runtime demonstrations

- Record, interrupt, resume/re-record, cancel, upload and play real human audio in browser, iOS Simulator and Android Emulator. Demonstrate microphone denial, route change, corrupt upload and access expiry.
- Two actors on distinct clients join one scheduled call; show correct identity, packet-only brief, time zones, connection progress and server ending at the purchased duration.
- Background/foreground, disconnect/reconnect within and beyond allowance, crash/restart backend worker, omit/reorder provider end events; all clients converge on one evidenced outcome.
- Exercise completed, creator no-show, fan no-show, fan early end, creator partial, technical failure and insufficient connected time. W4 receipt/settlement matches D-16; neither waiting nor reconnect time is billed as connected delivery.
- Attempt unauthorized participant/team join, reused token, call after authorization revocation, concurrent booking and expired offer. Deny without duplicate obligation/capture.
- Toggle recording, summary and reuse independently as each participant; the absent permission blocks its own action, and UI/retained files match actual consent.
- Run actual iPhone and Android hardware calls for Bluetooth, cellular interruption, background/terminated incoming delivery, battery/network behavior and camera/audio reliability. Emulators/simulators cannot close this release gate; log unavailable hardware as a blocker.
- Verify AI audio spoken/visual labels, manifest/watermark and licensed revocation in app/download/share transformations before enabling the feature.

## Delivery standard

Supply the session transition/outcome table, server clock evidence, provider reconciliation traces, media/consent lifecycle, real-device matrix and precise unsupported/unverified behaviors. The timer, settled amount and delivery status must agree on all participants' devices and in the creator/fan receipt. No fake room or local countdown qualifies as completed calling.

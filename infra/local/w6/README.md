# W6 local human media runtime

This tooling is for isolated development. The generated CA is not public C2PA
trust and is never installed in system trust. Its signing key stays outside Git.
Production requires an approved KMS/HSM signer, a C2PA trust-list certificate,
reviewed retention and W8 storage/denial custody.

Generate credentials in a new private directory without spaces:

```sh
NODE_ENV=development node infra/local/w6/provision-dev-c2pa.mjs \
  --directory /tmp/qelvora-w6-runtime-20261001/c2pa-dev
```

The root is P-256, CA:TRUE, with certificate-signing usage and a 30-day term.
The P-256 leaf is CA:FALSE with digitalSignature, claimSigning
`1.3.6.1.4.1.62558.2.1`, emailProtection, SKI/AKI and a seven-day term.
The single executable answers `--signer-info` with ES256 and the end-entity
chain; signing reads bounded stdin and writes IEEE-P1363 r‖s. It refuses to run
outside explicit development mode. `configuration.json` records the actual
root PEM digest and paths; no bundled c2patool sample keys are used.

Use `media-policy.development.json` only for this disposable environment:
human replies and post audio up to ten minutes, Notes up to 60 seconds, photos,
and no transcripts. Its 12-month retention is an **unapproved local proposal**.
D-08 covers dispute evidence rather than ordinary Note/post retention; it does
not authorize this production default or any call-recording term. W8 and the
founder must resolve ordinary-media retention before production enablement.
Source/interview uploads, fan attachments and licensed AI audio need their own
owner authority and consent before configuration enables them.

W8 activates 0046/0047/0051 and the canonical denial/recording prerequisites.
0062 adds a dedicated non-owner `creator_media_worker` login and bounded job
discovery. Provision its local password administratively outside Git. The
worker must not use the interactive login or manufacture request scopes.
`seed-development.sql` is an explicit admin seed for a disposable W6 database;
it fabricates no product verification endpoint and grants no paid entitlement.

Launch the API directly from the repository root with these environment values:

```text
NODE_ENV=development
IDENTITY_ADAPTER=development
CREATOR_FEATURE_ENABLED=true
PORT=4106
WEB_ORIGIN=http://localhost:3006
IDENTITY_SESSION_KEY=<local base64 secret>
DATABASE_URL=postgresql://creator_runtime:<local password>@127.0.0.1:55446/creator_w6
MEDIA_STORAGE_ROOT=/tmp/qelvora-w6-runtime-20261001/storage
MEDIA_TICKET_SECRET=<local base64 secret>
MEDIA_TICKET_ORIGIN=http://127.0.0.1:4106
MEDIA_POLICY_FILE=<absolute repo path>/infra/local/w6/media-policy.development.json
TRUST_LOCAL_DEVELOPMENT=true
TRUST_API_DATABASE_URL=postgresql://creator_trust_runtime:<local password>@127.0.0.1:55446/creator_w6
TRUST_WORKER_DATABASE_URL=postgresql://creator_trust_worker:<local password>@127.0.0.1:55446/creator_w6
RELEASE_REVISION=<full immutable Git revision>
```

Then run `node --import tsx apps/backend/src/server.ts`. The storage directory
must exist with mode 0700. Missing real denial/owner bindings keep media closed.

The ingestion process uses the same media configuration and these additions:

```text
MEDIA_WORKER_DATABASE_URL=postgresql://creator_media_worker:<local password>@127.0.0.1:55446/creator_w6
MEDIA_CLAMD_SOCKET=/tmp/qelvora-w6-runtime-20261001/clamav/clamd.sock
MEDIA_FFMPEG=/opt/homebrew/bin/ffmpeg
MEDIA_FFPROBE=/opt/homebrew/bin/ffprobe
MEDIA_C2PA_TOOL=/tmp/qelvora-w6-runtime-20261001/tools/c2patool-0.28.1/c2patool/c2patool
W6_DEV_C2PA_DIRECTORY=/tmp/qelvora-w6-runtime-20261001/c2pa-dev
MEDIA_C2PA_SIGNER=<configuration.json value>
MEDIA_C2PA_TRUST_ANCHORS=<configuration.json value>
MEDIA_C2PA_TRUST_ANCHORS_SHA256=<configuration.json value>
MEDIA_C2PA_WORKDIR=<configuration.json value>
```

Start clamd with its owned local configuration, then run
`node --import tsx apps/backend/src/workers/start.ts ingestion`. Durable discovery
recovers work after restart independently of PostgreSQL notifications or polls.
The current W8 worker denial callback is required for live processing; revoked
assets remain eligible for actual deletion.

Launch web without Turbo environment filtering:

```sh
QELVORA_API_URL=http://127.0.0.1:4106 WEB_ORIGIN=http://localhost:3006 \
  pnpm --filter @qelvora/web exec next dev --webpack --port 3006
```

Open `http://localhost:3006` (WebAuthn RP ID `localhost`), choose the labeled
development creator and enroll a passkey within five minutes of sign-in.
Virtual authenticators exercise real WebAuthn verification but do not prove
physical passkey hardware. Use separate creator/fan browser sessions.

The acceptance journey is actual Studio recording, preview, upload, scan,
transcode, passkey signing, credential readback, publication and fan play/seek.
Inspect the processed versus served hashes, credential report and durable rows.
Repeat after cancel/re-record, interruption/offline, corrupt/oversize/malware,
expiry, stale publication, revocation and account switch. A synthetic tool
diagnostic is not this journey.

iOS DEBUG launch: `--api-url http://127.0.0.1:4106`. Android DEBUG launch:
`adb -s <owned serial> reverse tcp:4106 tcp:4106`, then activity extra
`--es api_url http://127.0.0.1:4106`. Respect shared native build/device leases.
Stop only the processes, container and devices owned by this run afterward.

For opt-in local iOS UI operation, adapt the canonical application spec into a
new private directory. The driver taps real sign-in controls against API4106
and checks the seeded fan shown by the shipping app. It supplies no session or
network substitute and is outside the canonical test target.

```sh
node infra/local/w6/provision-ios-journey.mjs /tmp/w6-ios-journey
xcodegen generate --spec /tmp/w6-ios-journey/project.json --project /tmp/w6-ios-journey
node scripts/with-heavy-build-lock.mjs --owner W6 -- xcodebuild \
  -project /tmp/w6-ios-journey/W6RuntimeJourney.xcodeproj -scheme QelvoraApp \
  -destination 'platform=iOS Simulator,id=<owned leased simulator UUID>' \
  -derivedDataPath /tmp/w6-ios-journey/DerivedData -jobs 2 \
  -parallel-testing-enabled NO \
  -only-testing:QelvoraUITests/W6RuntimeJourney/testActualFanSignIn test
```

Use normal simulator signing; disabling signing prevents Keychain acceptance.
Acquire an actual owned simulator slot before launch, and stop/release it after
operation. The helper refuses a busy machine-wide build slot without touching
its owner or starting a child. A native sign-in case does not accept media,
calling or physical-device behavior.

Publication is a separate noninteractive worker:

```sh
node --import tsx apps/backend/src/workers/start.ts publication
```

It needs `PUBLICATION_WORKER_DATABASE_URL` for the dedicated non-owner
`creator_publication_worker` login and the same private `MEDIA_STORAGE_ROOT`.
It uses W8's actual held loopback restoration check for both discovery and
issuance, then W8's purpose denial projection before W1 issues the sealed scope.
W5 consumes that original scope and stored act; W6 checks immutable processed
and credential-file hashes. It never borrows an owner Actor or signs again.
Production hosts must inject their genuine restoration authority into
`startPublicationWorker`; this executable's development helper rejects production.

W8 must first activate and verify the exact0071/0073/0074/0075/0076 custody and
purpose grants. The first57-entry wave does not contain them: actual startup on
that database refuses `publication_schema_unconfigured`, and no publication is
accepted. Quote, public/group packet fulfillment, live and displayed audience
count purpose projections require their own genuine adapters and remain unavailable.

For explicitly labelled self-hosted transport development, generate fresh keys
and configuration in a new private directory:

```sh
NODE_ENV=development node infra/local/w6/provision-dev-livekit.mjs \
  /tmp/qelvora-w6-livekit-development
```

Use its exact pinned official image/configuration. Publish only host loopback
ports7886(TCP signaling),7887(TCP RTC),7888(UDP RTC), limit the container to
one CPU/512MiB, and do not attach recording/egress or an agent. The configuration
sends genuinely signed callbacks to the separate developer operator3106 via
Docker's host address. Keys and SQLite remain outside Git with private modes.

```sh
NODE_ENV=development node --import tsx infra/local/w6/livekit-operator.mts \
  /tmp/qelvora-w6-livekit-development
```

Open `http://localhost:3106`; its explicit buttons operate actual SDK room/token
creation, transport connection, microphone capture, disconnect, replay and
DeleteRoom. No canonical call, Actor, entitlement, settlement or full history is
created. Browser transport-only operation is labelled and does not substitute
for human voice or the real app journey. A short JWT and DeleteRoom do not
provide single-use/revocation; actual replay was observed. Stop the exact owned
operator/container afterward and preserve only redacted evidence.

The web/Swift/Kotlin SDK adapters are not registered automatically. The backend
provider advertises `supportsSingleUseAdmission=false`, leaving paid joins
unavailable. Future0092 callback SQL is unregistered/unapplied and must be
reviewed/activated by W8 with approved retention and actual CallCustody/C10
adapters. Missing current schema or custody fails closed. The first57 wave and
0082 availability/publication gates are independent of SDK installation.

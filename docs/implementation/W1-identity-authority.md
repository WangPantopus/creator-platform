# W1 identity and authority integration

Current October1 source and resource facts: [W1 continuation](../workstreams/status/W1-resume.md). Main `ef3619b` is integrated through the eight owned W1 branches. Canonical shared/native API source checks pass for 12 resources and 98 operations. The new native public-verification source is uncompiled and unoperated; earlier build receipts retain their exact revision. Heavy local builds/runtimes remain off until explicit resumption under the coordinated cleanup restriction. The former W1 database container/volume, dependency tree, build products and repo-specific native toolchain are removed. Private configuration, keys, source and evidence remain; no database backup or restored profiles are inferred. Older leased commands below are historical templates and must not be run during this restriction.

This is implementation/configuration documentation, not release sign-off. W1 personally authored the code, built and launched the clients. No new test code was added. See [current status](../workstreams/status/W1.md), [producer record](../workstreams/coordination/W1.md) and [verification rules](../workstreams/VERIFICATION.md).

## Identity boundary

```mermaid
flowchart TD
    P[Existing Pantopus account host] -->|Opaque account UUID + verified adult eligibility| A[W1 adapter]
    A -->|Fresh authorization time, callback state and PKCE| S[Durable app session]
    S --> W[Web HttpOnly cookie]
    S --> I[iOS Keychain]
    S --> K[Android Keystore encrypted credential]
    W --> R[Current server actor]
    I --> R
    K --> R
    R --> C[Owned creator or scoped team authority]
    C --> V[Approved external proof]
    V --> U[Owned passkey with user verification]
    U --> H[Exact canonical command hash]
    H --> D[Owner transaction consumes signature once]
    D --> M[Public metadata; content only by owner visibility policy]
```

Only accountId/adultEligible cross the profile boundary. Provider authenticatedAt is separate authorization metadata. Neighborhood, legal name, city and private parent profile are rejected by the strict envelope. Development actors are two explicit opaque UUIDs, selected only under NODE_ENV=development with a loopback web origin; no production password/account system exists here.

Continuation expires after five minutes and is consumed once. Production completion binds state and derived server-only PKCE verifier to the saved continuation and requires provider-confirmed authorization within five minutes. Pantopus must enforce reauthentication, exact registered callback and PKCE. The production adapter itself is an external dependency. Local tokens are random; only SHA-256 token hashes and encrypted upstream tokens persist. Active access lasts15minutes with a7day refresh boundary; refresh rotates the token with compare-and-swap. Every resolution rechecks upstream eligibility/account. Invalid resolution revokes the local credential and returns401. Refresh does not create a fresh authentication time for passkey enrollment.

Identity and thread transactions recheck the session row; logout/revocation serialize against those rows. Thread revalidation locks the scoped thread plus the requesting fan profile or current verified creator profile. PostgreSQL FOR SHARE applies UPDATE RLS; locking both public profiles in a joined query incorrectly hid authorized rows. Creator/triage revalidation now uses a single explicit owner-scoped read-only creator lock, restores the request account, then checks triage membership and restrictions before domain work. Grants, policies and applied SQL are unchanged. The rollback-only non-owner SQL diagnostic passed; complete real-client denial/race acceptance remains open. Issued thread scopes recheck current creator verification, undeleted thread and triage membership before work. Server permissions do not trust client-selected roles. Native and web identity surfaces poll session state every4seconds, but observed ≤5second cross-client cache purge is **not yet demonstrated**. Host services must bound upstream calls and domain transactions; do not interpret a4second timer as a latency result.

## Contract examples

Examples contain placeholders, not working credentials. Generated Swift/Kotlin API clients supply the credential from secure storage; web uses the origin-checked HttpOnly-cookie bridge.

```json
{ "returnTo": "/identity/account" }
```

POST /v1/identity/continue returns redirectUrl and continuationId. A registered relative C11 destination is required; encoded separators, arbitrary URLs, controls, empty/duplicate query fields and unknown query keys are denied. Query scopes come from config/navigation.json and are generated to both native clients. Support crisis/access/feedback and Studio activation routes are registered; only exact /support accepts creatorId/messageId UUID query fields. Existing context/commerce IDs require canonical UUIDs; the exact offer=1 value is allowed only on a three-ID call path and chooses the offer composition. It supplies no participant, booking, payment or grant authority. Validation identifies destinations; each domain still checks object access after sign-in.

```json
{
  "continuationId": "00000000-0000-4000-8000-000000000001",
  "code": "<provider one-use code>",
  "state": "<returned saved state>"
}
```

POST /v1/identity/complete returns an app token, canonical returnTo and server-derived Session. Session contains fan/creator profiles and distinct creatorId-scoped triage/drafter/publisher/scheduler roles. Fan handles are normalized ASCII3–30characters; chosen intro is≤240characters and is not AI-use consent. D-07 team invitation/accept/removal is creator/account-scoped. W5 owns the settings compositions.

External proof supports Instagram/YouTube public HTTPS account/post URLs, a24hour random challenge, pending/manual review and approved/rejected/revoked states. IdentityProfiles.reviewProof requires a trusted purpose authorizer; no public self-approval endpoint exists. W8 verificationEffects consumes this hook. Payout KYC stays separate. Pending identity does not activate public AI.

Passkey enrollment requires fresh identity, approved creator proof and user verification. Recovery revokes keys/challenges, marks identity pending and requires external proof submitted after recovery start plus parent authorization after that start. Changing credentials does not silently turn a team member into a creator.

C02 consumers supply a SignedSubjectPolicy that reads the exact current subject/version and returns its canonical SignedActCommand. The service rejects a different hash, wrong owner, absent proof/key, expired challenge, replay or revoked key. The current development server installs W4 commerceSignedSubjects, then the actual W3 conversation and W5 content policies before feature registration completes. Policy registration supplies no creator proof, fresh authentication, key, license, consent, domain approval or migration activation. W2's LicenseVerifier port exists; a genuine verifier and reviewed legal subject are still required, and the default Agent composition supplies neither a licensed model nor that verifier. Native PasskeyCeremony adapters return credential JSON to the same verifier. Domain publication must consume the returned signature in its own transaction; a verified assertion alone is not delivery. SignedActReview accepts the owner's exact review projection; the owner must derive visible text/rows from that same canonical command and reconcile an unknown publication response.

Public /verify/{signedActId} reads sanitized metadata and current valid/key_revoked/creator_revoked/withdrawn status. Private command bytes are not returned without a registered owner visibility policy and sharing consent. Historical approval proves key authorization for that exact act; it does not establish every factual statement's truth. UI Signed links consume server IDs or owner destinations; no target means no interactive verification link. Both shipping native feature lists now register this public destination and consume the existing unauthenticated publicSignature operation without session credentials. Their new source checks the returned act ID, conceals private/withdrawn text and background snapshots, preserves approved AI authorship, and rereads on foreground or explicit refresh. Its compilation, actual native operation and revocation timing remain unverified; see the [source-qualified draft](../../artifacts/workstreams/W1/resume/2026-10-01-native-verification/run.md).

## Client and feature configuration

Web: QELVORA_API_URL is a server-only URL. /api/auth/complete binds the continuation cookie, exchanges the code, sets qelvora_session (HttpOnly, SameSite=Lax, Secure in production), then redirects to the saved app object. For parallel loopback development, explicitly set WEB_ORIGIN (or QELVORA_PUBLIC_ORIGIN) to this app origin; session, continuation and return cookies are suffixed with its port (for example qelvora_session_3001). Production retains the standard cookie names. Sensitive OAuth query logging is disabled. /api/platform/identity forwards only allowed paths, rejects cross-origin writes, rotates/deletes cookies on session actions, and never puts tokens in browser storage.

Backend host: createConfiguredBackend accepts an explicit PantopusIdentityAdapter, guardrail adapter, signedSubjectPolicies and registerFeatures(runtime). registerDomainFeatures is a composition seam for the existing Agent/Commerce/Media/Growth/Trust factories. The actual development server registers W3 conversations, W2 Agent, W5 content/Studio and W6 Media; commerce and Growth additionally require their explicit environment. W7's canonical Home reader consumes the real W3 directory, current AccessService/Database and signing service when Growth is configured. The default Agent has model=null; Media receives no provider services. Factory/route registration is distinct from persistent service availability and acceptance. W8 trust mounts at root because its router owns /v1/trust and /health/ready. Account restrictions use assertActorAllowed; creator/thread restrictions use assertScopeAllowed. Configured identity additionally requires canonical session custody and caller-held transaction denials. Dedicated W8/W7 worker/runtime pools must retain their exact non-owner role contracts. Genuine identity, reviewed licensed generation, payout/provider authority, call/media providers, delivery channels and trust/release configuration remain explicit dependencies; /health foundationReady is not readiness sign-off.

Swift root: FanAppShell with Keychain, deep links, account/profile/credentials and public verification, W5 Content, W3 conversation, Commerce, Trust, Growth and W6 Media/call registrations. Growth navigation uses the shipping session's validated open method. Already explicitly public features can open while signed out or before Handle setup; this supplies no protected read or role. Debug launch accepts an explicit loopback --api-url and validated --return-to; Release reads HTTPS CreatorAPIURL from Info.plist. HTTPS universal links require CreatorLinkHost plus signed associated-domain configuration. qelvora://app is a local development entry, subject to C11 validation; it is not a final app/store identity. W6's current native call route parsers accept three IDs and consume secure account tokens. Source review reconfirms that the one-ID call destination still needs a canonical authorized object-to-family lookup; no creator/fan IDs may be inferred from the caller.

Android root: FanAppShell with Keystore, same registrations, validated return intents and account-scoped view reset. Debug launch extras api_url=http://10.0.2.2:4101 and return_to=/identity/account connect to the host. Release requires an HTTPS creatorApiUrl build property. Cleartext exceptions are debug-only localhost/127.0.0.1/10.0.2.2. Native production authorization/callback composition still needs the Pantopus host contract; its absence is explicit.

## Device support and release gates

| Surface                                 | Implemented adapter                                                     | Current evidence limit                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Secure web on supported passkey browser | navigator.credentials create/get; UV, abort, base64url                  | Genuine RP/device enrollment and exact named-act publication remain unverified           |
| iOS17+                                  | AuthenticationServices platform register/assert; cancellation; Keychain | Final RP/domain, associated domains, physical-device proof and actual sheets absent      |
| Android API28+                          | Credential Manager1.6 create/get; cancellation; encrypted Keystore      | Provider/Digital Asset Links/signing-certificate origin and physical-device proof absent |
| Android API26–27                        | Fan shell; explicit unsupported signing                                 | No weaker credential/signature fallback                                                  |

Use generated tokens/copy/fonts/glyphs in Light/Night. All53 component registry entries exist across the three clients; independent reference comparisons, keyboard/focus,200% text, VoiceOver/TalkBack and reduced-motion acceptance remain open. Structural repairs are not acceptance evidence. Missing whole-screen compositions DG-W1-01..05 and DI09 optional-intro timing remain in the coordination record. Final naming/domain/RP/bundle/store identities are undecided; see [naming](../NAMING.md). The disposable rename preview is recorded with run evidence.

## Leased local launch

**Historical launch templates:** The former W1 local runtime was released after [PR #6](https://github.com/WangPantopus/creator-platform/pull/6); see its dated [resource-release record](../workstreams/handoffs/W1-resource-release.json). The October1 cleanup restriction at the top of this document controls now. The following commands contain historical paths, ports, devices and private configuration and are not current runnable instructions. After explicit resource resumption, verify surviving private inputs and any actual backup, allocate only minimal isolated owned resources, and record their new leases before substituting values. Preserve shared Docker storage, peer servers and checkouts.

Former W1 lease values: API4101/web3001/.next-w1, creator_w1 on port55431, Docker creator-platform-w1-local, simulator B622C222-8292-46EF-A2B2-A9DA67763DE6, emulator-5560/CreatorPlatform_W1 and artifacts/workstreams/W1/build. Never use global booted/unspecified adb or another workstream's data. The former isolated W1 ADB server used port5041. Former private configuration path was /private/tmp/creator-w1-runtime.env; do not copy its contents into logs.

```sh
# In creator-platform, load the private development configuration without printing it.
set -a
source /private/tmp/creator-w1-runtime.env
set +a
NODE_ENV=development IDENTITY_ADAPTER=development CREATOR_FEATURE_ENABLED=true PORT=4101 WEB_ORIGIN=http://localhost:3001 DATABASE_URL="postgresql://creator_runtime:${POSTGRES_PASSWORD}@127.0.0.1:55431/creator_w1" node --import tsx apps/backend/src/server.ts
```

In a separate terminal:

```sh
QELVORA_API_URL=http://127.0.0.1:4101 CREATOR_NEXT_OUTPUT=.next-w1 pnpm --filter @qelvora/web exec next dev --port 3001
```

In a subsequently authorized isolated runtime, /auth/continue?returnTo=%2Fidentity%2Faccount uses the development chooser to persist a local session/profile. /studio/setup handles proof and enrollment; /verify/{id} is public metadata; /design/studies/comprehension is the functional REF practice flow, not participant T21 evidence. Current owner registrations exist as described above; their configured persistent operation and integrated acceptance remain required.

Regenerate with node --import tsx packages/api/scripts/generate-openapi.ts, node scripts/generate-shared.mjs and node scripts/generate-native-api.mjs; repeat with --check. Build/typecheck/lint are useful consistency checks and never substitute for real app/provider operation. Core migrations0001/0002 are immutable; canonical infra/migrations.json belongs to W8. Fresh core application records checksums under the same advisory lock. Existing unchecksummed local DBs require W8 reconciliation before full-registry adoption.

Native build/install commands (run from the indicated directory, after the leased device has booted):

```sh
# apps/ios; preserve normal simulator signing for Keychain access.
xcodebuild -project QelvoraApp.xcodeproj -scheme QelvoraApp -configuration Debug -destination id=B622C222-8292-46EF-A2B2-A9DA67763DE6 -derivedDataPath /Users/yingpengwang/creator-platform/artifacts/workstreams/W1/build/ios build
xcrun simctl install B622C222-8292-46EF-A2B2-A9DA67763DE6 /Users/yingpengwang/creator-platform/artifacts/workstreams/W1/build/ios/Build/Products/Debug-iphonesimulator/QelvoraApp.app
xcrun simctl launch --terminate-running-process B622C222-8292-46EF-A2B2-A9DA67763DE6 com.pantopus.qelvora --api-url http://127.0.0.1:4101 --return-to /identity/account --appearance light
```

```sh
# apps/android; app/cache output remains isolated from peer builds.
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' ANDROID_HOME=/Users/yingpengwang/Library/Android/sdk GRADLE_USER_HOME=/private/tmp/creator-w1-gradle-isolated ./gradlew :app:assembleDebug --offline --no-daemon --max-workers=2 --project-cache-dir /private/tmp/creator-w1-gradle-project -PcreatorBuildDir=/Users/yingpengwang/creator-platform/artifacts/workstreams/W1/build/android
/Users/yingpengwang/Library/Android/sdk/platform-tools/adb -P 5041 -s emulator-5560 install -r /Users/yingpengwang/creator-platform/artifacts/workstreams/W1/build/android/outputs/apk/debug/app-debug.apk
/Users/yingpengwang/Library/Android/sdk/platform-tools/adb -P 5041 -s emulator-5560 shell am start -W -n com.pantopus.qelvora/.MainActivity --es api_url http://10.0.2.2:4101 --es return_to /identity/account --es appearance light
```

Historically, the appearance argument selected night for the app's debug theme, and Android required process relaunch to apply changed theme/API arguments. Former AVD/recovery paths above are historical and must not be treated as retained devices. No native device was allocated in this October1 W1 run. Supported native UI control remains unavailable; CLI install/launch or a compiler result is not interactive acceptance, and disabled controls must not be circumvented.

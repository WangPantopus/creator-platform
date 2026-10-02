# W1 identity and authority integration

Current October1 source and resource facts: [W1 continuation](../workstreams/status/W1-resume.md). Main `c1c615e6` is integrated through the eight owned W1 branches. Canonical shared/native API source checks pass for 12 resources and 98 operations on application `4fda909e`. The new backend/web/native public-verification source is uncompiled and unoperated; earlier build receipts retain their exact revision. Heavy local builds/runtimes remain off until explicit resumption under the coordinated cleanup restriction. The former W1 database container/volume, dependency tree, build products and repo-specific native toolchain are removed. Private configuration, keys, source and evidence remain; no database backup or restored profiles are inferred. Older leased commands below are historical templates and must not be run during this restriction.

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

The subsequent public reader checks an available disclosed command against its recorded act type and existing canonical SHA-256 before returning it, with unavailable response on inconsistency. It uses the same public metadata query and leaves visibility/grants/rows unchanged. All clients additionally reject a blank author or malformed hash, bind the response to the requested act, and display only the permitted public projection. Web has explicit fresh-read recovery and exact supplied version/status rows; corrections use the current correction label/voice-md. This is source consistency checking, not independent client cryptographic proof or current app acceptance. [Exact source and qualifications](../../artifacts/workstreams/W1/resume/2026-10-01-public-verification-web/run.md).

## Client and feature configuration

Web: QELVORA_API_URL is a server-only URL. /api/auth/complete binds the continuation cookie, exchanges the code, sets qelvora_session (HttpOnly, SameSite=Lax, Secure in production), then redirects to the saved app object. For parallel loopback development, explicitly set WEB_ORIGIN (or QELVORA_PUBLIC_ORIGIN) to this app origin; session, continuation and return cookies are suffixed with its port (for example qelvora_session_3001). Production retains the standard cookie names. Sensitive OAuth query logging is disabled. /api/platform/identity forwards only allowed paths, rejects cross-origin writes, rotates/deletes cookies on session actions, and never puts tokens in browser storage.

Backend host: createConfiguredBackend accepts an explicit PantopusIdentityAdapter, guardrail adapter, signedSubjectPolicies and registerFeatures(runtime). registerDomainFeatures is a composition seam for the existing Agent/Commerce/Media/Growth/Trust factories. The actual development server registers W3 conversations, W2 Agent, W5 content/Studio and W6 Media; commerce and Growth additionally require their explicit environment. W7's canonical Home reader consumes the real W3 directory, current AccessService/Database and signing service when Growth is configured. The default Agent has model=null; Media receives no provider services. Factory/route registration is distinct from persistent service availability and acceptance. W8 trust mounts at root because its router owns /v1/trust and /health/ready. Account restrictions use assertActorAllowed; creator/thread restrictions use assertScopeAllowed. Configured identity additionally requires canonical session custody and caller-held transaction denials. Dedicated W8/W7 worker/runtime pools must retain their exact non-owner role contracts. Genuine identity, reviewed licensed generation, payout/provider authority, call/media providers, delivery channels and trust/release configuration remain explicit dependencies; /health foundationReady is not readiness sign-off.

Swift root: FanAppShell with Keychain, deep links, account/profile/credentials and public verification, W5 Content, W3 conversation, Commerce, Trust, Growth and W6 Media/call registrations. Growth navigation uses the shipping session's validated open method. Already explicitly public features can open while signed out or before Handle setup; this supplies no protected read or role. Debug launch accepts an explicit loopback --api-url and validated --return-to; Release reads HTTPS CreatorAPIURL from Info.plist. HTTPS universal links require CreatorLinkHost plus signed associated-domain configuration. qelvora://app is a local development entry, subject to C11 validation; it is not a final app/store identity. W6's current native call route parsers accept three IDs and consume secure account tokens. Source review reconfirms that the one-ID call destination still needs a canonical authorized object-to-family lookup; no creator/fan IDs may be inferred from the caller.

Android root: FanAppShell with Keystore, same registrations, validated return intents and account-scoped view reset. Debug launch extras api_url=http://10.0.2.2:4101 and return_to=/identity/account connect to the host. Release requires an HTTPS creatorApiUrl build property. Cleartext exceptions are debug-only localhost/127.0.0.1/10.0.2.2. Native production authorization/callback composition still needs the Pantopus host contract; its absence is explicit.

## Device support and release gates

Current native entry-point source requires complete release HTTPS/debug loopback API origins, rejecting user information, query, fragment, path prefix and invalid port. Custom app links reject ports; the already configured Swift HTTPS link path accepts only default443. Canonical iOS project source binds empty-default `CREATOR_API_URL`/`CREATOR_LINK_HOST` to the consumed plist keys, but generated plist/configured build and genuine associations remain unverified under cleanup. [Exact URI/configuration source](../../artifacts/workstreams/W1/resume/2026-10-01-native-uri/run.md). This does not establish persisted-credential issuer/origin isolation, which remains a separate review across clients/stores.

Current native storage follow-up checks credential and W3 cursor deletion, updates existing Keychain credentials without deleting first, and shares a process credential-read fence across feature clients. Both shells attempt cleanup independently, retain failed-clear messages with Retry, and gate another account until cleanup succeeds. Swift rotation also requires the same prior stored credential; Android cleanup survives cancellation. This is uncompiled source with actual OS failure/restart/revocation/device acceptance outstanding; process fencing is not persistent deletion proof. [Exact source qualification](../../artifacts/workstreams/W1/resume/2026-10-01-native-storage/run.md).

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

Replace only the appearance argument with night for the app's debug theme. Android requires process relaunch to apply changed theme/API arguments. W1's original AVD data is retained at /private/tmp/creator-w1-avd; the current same-serial recovery uses /private/tmp/creator-w1-android-recovery with host GPU,2cores,2048MB and no snapshots. See the run manifest for the actual launch/capture outcome; CLI launch is not interactive acceptance.

## Publication worker issuer proposal — October 2, 2026

`modules/identity/publication-scope.ts` exports `PublicationIdentityAuthority`, `PublicationTask`, `PublicationTaskScope` and `PublicationRestriction`. `withPublication(task, work(client, scope))` owns a READ COMMITTED transaction; `authorizeInTransaction(scope, client)` joins only that exact live issued transaction. `pendingTasks(1..20)` discovers metadata, then rechecks each family in its own transaction before returning a task. Interactive request authority, a retained/serialized scope, another client, a core/owner/inherited role and missing current trust ports fail closed. Discovery separately requires the host's genuine restoration check. There is no synthetic account/session, generation scope, recipient scope or signing credential.

The unregistered SQL proposal `modules/identity/schema-publication-scope.sql` has reserved W8 ID0071. It requires W8's separate negative-only0073 publication projection, and cannot issue a scope until that function exists. Canonical activation belongs to W8; neither proposal is applied by W1. Separate login `creator_publication_worker` has no role memberships; non-login `creator_publication_authority` owns fixed-path bounded projection/issuance functions. The worker cannot access signing tables or create the scope ledger. A random ledger nonce is sealed to the actual login, backend PID, full transaction ID and exact creator/content/version/publisher/act/hash; ordinary app.* settings cannot impersonate it.

Issuance checks the current saved publication and revision, verified/recovered creator, current signing credential, genuine consumed/unwithdrawn act and complete stored command/hash. Unsigned authority is limited to a current Team publisher's Post without media or quote. W8 holds sorted negative-authority locks first, then the issuer holds creator/credential/membership locks before W5's object locks. The SHA-256 of the supplied canonical command text must match the task and genuine signing hash; its parsed JSON must equal the command rebuilt from actual stored revision/evidence. RLS limits callback reads/updates/effects to that sealed tuple; W5 still owns current revision, quote, packet, media readiness and idempotent publication checks. W6 must consume the branded scope on the same client and supply its separately reviewed asset projection.

This is implemented/typechecked proposal source, not activated, integrated into the running host, or personally verified publication. It does not approve external proof or create a signed act. Review and activation must preserve existing interactive policies for their actual roles, verify all grants on clean/upgraded databases, and keep traffic closed until0071+0073 and domain producers are installed. Positive/negative/race acceptance and measured performance remain open.


## Public AI metadata purpose proposal — October 2, 2026

W8 reserves0085 for `modules/identity/public-ai-scope.ts` and `schema-public-ai-scope.sql`. `PublicAIIdentityAuthority.create` requires exact activated version/checksum, safe direct core login, fixed-path NOLOGIN metadata functions, FORCE RLS and the genuine0086 negative export/grant. `withPublicAI(creatorId, work(client, scope, facts))` owns one READ COMMITTED transaction. Actual visitor ALS account/session is validated and held; absent HTTP authority uses explicitly empty account/session settings. No owner GUC, Actor, CreatorScope or ThreadScope is manufactured. The mandatory real held-restoration/negative port runs before NOWAIT positive metadata leases. Only a recorded denial returns null; unconfigured/currentness/contended metadata is unavailable.

`PublicAIReadScope` contains kind public-ai, actual creatorId/creatorAccountId and nullable current versionId. `PublicAIReadFacts` contains bounded server-only workspace state, stored License evidence, exact version mode/cap/hashes/sourceSet and source metadata. Nested facts are recursively frozen and deeply readonly. `authorizeInTransaction(scope, client, facts)` accepts only the exact scope/facts object and client, captured nonce/full transaction ID/PID/login/visitor and current metadata hash. A retained/lookalike/new-transaction scope or changed current version fails. W2 must authorize before/after its actual license and approved public-processor purpose check, preserving guarded synthetic versus real verifier provenance. It may return only its explicit public projection, never these private proof references/IDs.

Generated stored version columns derive only mode/cap from canonical W2 configuration; the NOLOGIN role cannot SELECT full configuration, compiled prefix, workspace interview/configuration, source bodies/rights evidence, provider usage or session credentials. Source metadata is bounded to1000 entries; oversized/malformed metadata returns unavailable, never a successful empty public version. Public titles alone are trimmed to80 characters. Scope metadata has a30-second transaction bound and a deferred mandatory cleanup constraint: commit with the nonce retained fails. No ledger row may persist past its issuing transaction.

This is compiled proposal source and a closed empty57-schema rehearsal, not canonical activation, a minted creator purpose, configured W2 licensing/public AI or release acceptance. The real retained40 app refuses construction with503 before invoking denial. W8 supplies0086 negative/restoration and W2 supplies the positive same-client verifier/purpose consumer. Exact hashes/failure/constraints: [review](../../artifacts/workstreams/W1/resume/2026-10-01-codex-completion/public-ai-purpose-review.json).

Publication0071 now enforces deferred transaction-only cleanup of its exact stored command; normal TypeScript already called end before commit, and direct SQL commit without cleanup is also rejected. Unactivated0071/0081 role guards reject replication and role configuration. The late0081 signature account lease now uses a nonblocking shared try lock; contention is retryable503. Authorized command/business writes may precede the LAST final source check and all must roll back on denial/unavailability; only metadata return/commit follows it. Genuine concurrent signed mutation/withdrawal acceptance remains open. Audience identity now holds current negative keys before positive profile leases, matching Database/Access. Original immutable0053 remains unchanged.

# Actual SDK and provider development — October 2

PR19 merged normally at9dd89e46 and PR20 at52a45d31. PR67 is now based on
main; it remains guarded and incomplete. No new unit tests were written.
The local UI driver operates the shipping application against the actual API.

LiveKit is pinned to JS2.22.3, Swift2.17.0, Android2.29.0 and server SDK2.19.1.
The disposable server was the official1.13.7 image with digest
6fd3b7088874c4d119160dd688798dfec852bc014786d392caad15f6f63912a3.
Fresh private credentials were generated outside Git. No sample signing keys,
provider account, paid entitlement, participant Actor or money was fabricated.

## Personally operated transport

The actual browser connected to the real self-hosted server, and its SDK room
and participant projections showed connected transport and recording off.
Actual signed room_started, participant_joined and participant_left callbacks
passed the SDK body-integrity verifier and were stored in private developer
SQLite. The current one-use proof repeat accepted these events and rejected
unsigned ingress401. This SQLite operator is explicitly separate from the
canonical application and future0092; it does not establish complete history.
See transport-receipt.json and callback-proof-receipt.json.

Actual device enumeration had no microphone/camera input. The real microphone
adapter produced NotFoundError and disconnected its participant. No tone, fake
capture flag, substituted response or synthetic voice was treated as human
media. The transport-only participant was then explicitly disconnected.

Within the real30-second token lifetime, the same JWT rejoined after leaving.
DeleteRoom made the provider room absent, but replaying that same JWT recreated
the room under a new provider SID. The original durable mapping was not changed,
and callbacks for the recreated unbound SID were refused. The final room had
zero participants. DeleteRoom did not establish credential revocation.
**supportsSingleUseAdmission remains false.** Paid calling stays unavailable.
Cloud revocation, reconnect revocation, complete authoritative history and
actual egress deletion are unaccepted dependencies, not passes from this test.

## Personally operated iOS application

Normal signed simulator packaging with the actual Swift SDK passed. The real
fan-account journey passed in12.720seconds. With current W1 Navigation0186 and
SDK source, real fan sign-in → unavailable Studio availability → product
sign-out → creator sign-in → unavailable Studio availability passed in
39.457seconds. Both cases hid private fields and disabled Save. Screenshots
were exported from the successful actual UI run, and personally inspected.
Night mode used accessibility-extra-large (AX3); this is not an exact200%
claim or VoiceOver acceptance. The four fan navigation labels now fit in two
columns. A full navigation tap journey still needs its own operation.

The first gate run failed because its driver expected a creator handle from an
older shell that renders only the fan handle. Its result finalization then hung;
only the verified owned xcodebuild was stopped. The next attempted build was
refused by the still-held heavy guard and launched no child. The corrected
actual actor driver repeated successfully. Failed attempts remain qualified in
sdk-receipt.json and private original logs/result bundles. The older
`ios-sdk-media-unavailable.png` documents the first attempt, before the owner
navigation reflow; the `*-gate-current.png` images are the accepted repeat.

Android normal packaging with the actual SDK passed in54seconds. The required
JitPack source is constrained exclusively to its audioswitch transitive module.
The latest SDK APK has not yet been installed/operated because W8 and W3 hold
both emulator leases. Current Navigation0186 packaging repeated successfully in36seconds; actual installation and operation remain pending.
Previous actual Android availability/recovery journeys are separate evidence,
not acceptance of this new SDK APK. No native calling acceptance is claimed.

## Future callback custody proposal

`livekit-schema.sql` is future0092 source only, reserved for W8 review. It is
neither registered nor applied. It stores only immutable room/project/actual
admission mappings and minimal signed callback hashes/types/times. The worker
has no direct table grants. A private NOLOGIN authority seals a fresh claim to
PID, transaction, session login and actual room family for30seconds. Append is
idempotent for the same provider/project/event/hash; conflicting bodies refuse.
A deferred COMMIT-only fence rechecks the original binding and actual wall
clock, refuses early SET CONSTRAINTS, and deletes the transient scope.

Cryptographic verification occurs in the real SDK ingress, before a frozen
unforgeable in-process proof is minted. That proof may be consumed once. The
purpose login is trusted to execute this custody boundary; SQL does not itself
pretend to verify a JWT or recover a raw callback. Current readiness audits
actual role attributes, pinned definer ownership/search paths, PUBLIC execution
and absence of direct table privileges. No canonical positive transaction or
SQL execution is accepted yet. W8 review and real role/COMMIT/expiry probes are
required before activation.

No ordinary retention term is hardcoded. A reviewed policy reference and expiry
are required. Actual room/token closure custody, C10 export/deletion/expiry and
protected archive need the genuine W8 PrivacyJob plus0087 fence. That privacy
job authority is not reused for callback ingestion. No mapping may change on
cached-token room recreation. Callback delivery and polling cannot set
history_complete true, finish C07, hand back control or settle W4 money.

The actual fresh57 database still has no0092 table, no0082 interactive denial,
zero canonical calls and availability version4. API4106/web3006 therefore keep
all media/calls unavailable. No ingestion/publication worker is running.
The owned developer operator/server and simulator were stopped, and the exact
simulator/heavy leases released. Existing API/web/ClamAV remain owned by W6.
All secrets, raw JWTs, SQLite state and result bundles stay outside Git.

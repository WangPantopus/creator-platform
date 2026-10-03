# Purpose-bound media publication — October 2, 2026

W1's actual fc588654 issuer is consumed as ccb21555. W6's
createPublicationMedia({identity,storage}) implements evidence(client,scope,
attachment) and ready(client,scope,evidence), using the real branded
PublicationTaskScope and the same issuer's held-client assertion. W5 owns
background publication; this module creates no Actor, interactive scope,
signed act, asset mutation or publisher command.

W8 allocated0075 for media/publication-scope.sql, with actual0071+0073 and0062
prerequisites. The caller gets only EXECUTE on the exact sealed snapshot
projection. The non-login publication authority share-locks the actual ready
asset through commit, checks original/current publication associations and
exposes the processed tuple plus original credential evidence. PUBLIC media
policies narrow to creator_runtime; named ingestion/discovery policies remain.
PostgreSQL's required non-login UPDATE(id) privilege exists only for row locking;
its scoped UPDATE policy has WITH CHECK(false), denying every write. The login
has no raw asset/publication read or mutation grant or role membership.

W6 verifies attachment kind/version/hash, family/owner, expiry/purpose/state,
original signing occurrence and current sealed act/hash association. Readiness
requires the entire original provenance tuple/schema/kind/transform, not only
c2paVerified, then hashes the actual immutable processed and credentialed files.
No signer or credential repair runs during publication.

The unregistered0071 and0075 DDL were applied only to the owned experimental
clone creator_w6_human_media_20261001. An initial0075 missing END LOOP failed and
rolled back; the corrected DDL installed. This is not canonical activation.
Real purpose-login probes deny unissued and forged-GUC/nonce snapshots, raw
SELECT, mutation, SET ROLE creator_runtime and serialized scope lookalikes.
negative-role-receipt.json contains only sanitized checks. No permissive denial
callback was used to issue a positive scope. Missing0073 leaves the positive
path closed, and no publication or fan playback acceptance is claimed.

Backend type/lint/build and exact-source application checks are recorded with
the committing increment. Next: W8 scope/lock/grant review and0073 source,
W5 genuine consumer/worker composition, actual positive publication, stale/
revoked/racing/expired readiness, then web/iOS/Android fan playback. W1's wall
clock lifetime follow-up must be consumed before positive scope acceptance.

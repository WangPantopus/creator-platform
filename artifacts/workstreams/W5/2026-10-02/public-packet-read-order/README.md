# Current packet viewer preparation

Application sources: `33947f427f584ae6f54e4ee0bfceb4e9bfc483f8` (early preparation/order), `266668d2` (public proof count suppression).

W4's metadata-only `preparePublicPacketRead(client, actualActor, {creatorId, contentId})` now runs before W5 content locks for get, reply, content Thanks and public proof. The bounded fan list prepares every candidate family before its first content lock, then reads each current row under the existing shared object lock. W4's final reader must validate its own opaque same-client/transaction/actor/current-tuple binding. The preparation grants no read or payment authority. Current audience authorization precedes the final packet reader.

Public fan/proof view enrichment does not invoke creator-authoring audience counts. The composition's count adapter returns null for an actual fan or Team account before invoking an owner-only count producer. No creator impersonation or new identity row lock is added after a final packet source gate. W4/W6/W8 have exact contracts and still own their actual source/identity/migration review.

Implemented: W5 preparation and ordering. Runnable: backend types, scoped lint and format pass for the preparation source; the additional proof call uses its existing typed fourth argument and formatting passes. Integrated: local API4105 runs `33947f42`, with no W4 packet producer mounted. Verified on that actual host using existing normal browser sessions: creator library200 retained unpublished revision3; fan current read remained403; fan list200 returned zero published items. This verifies neither paid/group access nor the unavailable packet producer.

Release-ready: no. W4's 0070 and W8/W1 actual held negative/source authority are not activated; packet proof, consent/refund/recovery races and media read lock order remain unverified. The creator is DEVELOPMENT-ONLY SEEDED VERIFIED with no proof/passkey. No new tests, payment, signature, approval or delivery record was created.

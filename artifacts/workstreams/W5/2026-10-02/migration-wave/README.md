# W5 personal migration custody — 2026-10-02

Source: W5 `716c8cb8`, consuming W8 PR95 exact `58b59fa0e5b8937af7cd0cb7272ae5b5662d7ee7`. All 40 baseline SQL hashes and all 17 wave SQL hashes were independently checked against the published packet. No source bytes or existing applied migration history were repaired.

Personally stopped only the owned W5 API, made a real 0600 custom-format pg_dump outside Git, and restored it independently into two owned databases in `creator-platform-w5-local` (PostgreSQL17). Ledger/catalog/data digests matched the original: 40 migrations, 145 original tables, 33 original business rows. Restored traffic-closed target upgraded atomically to57 using the exact W8 command. Original-column data, every old ledger checksum/timestamp, and old role attributes/memberships were preserved.

A separate empty database installed all57 through the canonical `migrate-trust.ts` registry runner. Its catalog hash exactly matched the restored upgrade: `cfbc894fd59dc3981ab4fa31d2ff7154e2865b452a71b79afd483abe94557ea3`. The first temporary fresh installer retained legacy labels embedded in baseline SQL; activation correctly rejected that43-row ledger. That discarded rehearsal database remains closed, is excluded from acceptance, and no historical alias was repaired. The successful fresh installation used a different, initially empty database.

After the matching rehearsal, personally fenced the original owned `creator_w5` database with CONNECTION LIMIT0 and the W8 closed marker, then ran the reviewed wave against it using the actual backup and independently restored digests. Its exact receipt records40→57, all33 original rows/145 tables preserved, old roles preserved, and traffic still closed. The backup, manifests and private snapshots remain outside Git.

## Qualification

Implemented: exact W8 source custody includes W5 0045 reply review and0051 media publication under W8's published IDs. Runnable: both fresh57 and preserved40→57 installs completed. Integrated: the owned W5 database now has57 canonical migrations; application owner ports and current runtime sources need their own operation evidence. Verified: the three safe receipts cover the actual database rehearsal/activation only. Release-ready: **no**. Future0069 durable review and0071/0073/0074/0075/0076 purpose authorities are not activated by this wave. No signed content, payment, delivery, proof, biometric verification or privacy receipt was created.

This is the machine's fresh W5 database, not an archived recovery. The creator's verification is **DEVELOPMENT-ONLY SEEDED VERIFIED**, without proof or a passkey, and is not signing acceptance. No peer database, container or device was used.

## Updated W8 role guard

After W8 published guard a71994f5, personally consumed its exact code/pin packet in93f5c9eb, stopped the owned API and fenced the host again. Metadata-only `assertWaveRoleSafety(client,{trust:true,media:true})` inside BEGIN passed on the original host, restored upgrade and clean install:3roles,7exact definer source/ACL pins,82direct capabilities. No migration SQL or old ledger was replayed. The original host briefly reopened between the first preservation check and this newly published guard; that interval is development runtime only, not release acceptance. The owned host is explicitly reopening as local development after this check. Closed rehearsal targets remain closed. Normal runtime login was denied with53300 while CONNECTION LIMIT0 was held; after development reopening its composite creator/Growth role was non-owner/NOBYPASS/noGrowthworker and an empty-request0053 projection returned unavailable.

W5 corrected the consumed guard's TypeScript optional Boolean assignment with an explicit Boolean wrapper. Backend types and formatting passed; actual metadata-only checks on all three57 targets repeated successfully with identical3/7/82 results. This changes no SQL, grant, missing-capability denial or initial-wave source checksum.

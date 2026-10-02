# W5 personal migration custody — 2026-10-02

Source: W5 `716c8cb8`, consuming W8 PR95 exact `58b59fa0e5b8937af7cd0cb7272ae5b5662d7ee7`. All 40 baseline SQL hashes and all 17 wave SQL hashes were independently checked against the published packet. No source bytes or existing applied migration history were repaired.

Personally stopped only the owned W5 API, made a real 0600 custom-format pg_dump outside Git, and restored it independently into two owned databases in `creator-platform-w5-local` (PostgreSQL17). Ledger/catalog/data digests matched the original: 40 migrations, 145 original tables, 33 original business rows. Restored traffic-closed target upgraded atomically to57 using the exact W8 command. Original-column data, every old ledger checksum/timestamp, and old role attributes/memberships were preserved.

A separate empty database installed all57 through the canonical `migrate-trust.ts` registry runner. Its catalog hash exactly matched the restored upgrade: `cfbc894fd59dc3981ab4fa31d2ff7154e2865b452a71b79afd483abe94557ea3`. The first temporary fresh installer retained legacy labels embedded in baseline SQL; activation correctly rejected that43-row ledger. That discarded rehearsal database remains closed, is excluded from acceptance, and no historical alias was repaired. The successful fresh installation used a different, initially empty database.

After the matching rehearsal, personally fenced the original owned `creator_w5` database with CONNECTION LIMIT0 and the W8 closed marker, then ran the reviewed wave against it using the actual backup and independently restored digests. Its exact receipt records40→57, all33 original rows/145 tables preserved, old roles preserved, and traffic still closed. The backup, manifests and private snapshots remain outside Git.

## Qualification

Implemented: exact W8 source custody includes W5 0045 reply review and0051 media publication under W8's published IDs. Runnable: both fresh57 and preserved40→57 installs completed. Integrated: the owned W5 database now has57 canonical migrations; application owner ports and current runtime sources need their own operation evidence. Verified: the three safe receipts cover the actual database rehearsal/activation only. Release-ready: **no**. Future0069 durable review and0071/0073/0074/0075/0076 purpose authorities are not activated by this wave. No signed content, payment, delivery, proof, biometric verification or privacy receipt was created.

This is the machine's fresh W5 database, not an archived recovery. The creator's verification is **DEVELOPMENT-ONLY SEEDED VERIFIED**, without proof or a passkey, and is not signing acceptance. No peer database, container or device was used.

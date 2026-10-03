# W3 increment 30 — preserve personal Approval at every migration step

Personally implemented and reviewed on `codex/w3-signature-migration-preservation`, based on `1a7d2a8b0f3918c8bc89536626045f946466480b`, following W8's direct activation review on October 2, 2026.

The unapplied W3 proposals reserved as 0058 and 0059 previously replaced `require_signed_message` with the foundation's text-only approved-draft branch. That could drop 0044's exact-version personal Approval predicate until 0060 was separately committed. A migration advisory lock does not make those per-file commits atomic.

Both proposals now retain the exact 0044 Approval lookup, current draft/version/text, creator/key epoch, invalidation, delivered-message identity and signed-command hash checks. This matches the dedicated approved-draft branch already published in W8's 0060 composition. 0058 rejects correction attachments without referring to 0059's not-yet-existing recording columns; 0059 also rejects recording attachments. AI originals, corrections and recordings retain `approval_id` as part of their immutable identity. Existing correction/recording and other named-act predicates remain.

Final proposal hashes:

| Proposal | SHA256 |
| --- | --- |
| pending_w3_correction_signature.sql | `5c94b94a7287a5c4a149da454117c30be40367034b9930ac11e168e5b6a4b3e0` |
| pending_w3_recording_association.sql | `b61d50d7f85c0ef468e00a8d2d6b737b4d405a9349810c552f7d9df7f527c42e` |

Personally compared the complete final diffs against W4's `schema-approval.sql` and W8's `0060_w8_composed_signed_message.sql`; whitespace checks pass. No new tests, migration registry changes, grants, applied-history edits, manual SQL application, fabricated signature or Approval were made. W8 retains registration/activation ownership. Actual PostgreSQL activation and signed producer/client journeys remain pending that canonical rollout; source review alone does not establish their acceptance.

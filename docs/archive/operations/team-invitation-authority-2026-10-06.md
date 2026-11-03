# Current Team invitation authority — October 6, 2026

The fresh open-PR inventory was checked before implementation. This change reuses #74's acceptInvite/removeMember implementations and active-member invitation refusal, plus its host wiring to the existing Audience restriction. Main's newer #312 concurrent invitation convergence remains. This is a two-production-file extraction, not a merge of #74's broad native/worker/publication graph.

## Reproduced and fixed

Against actual source `b81d6de4`, two canonical development sessions demonstrated that an active triage member could receive and accept a publisher invitation, overwriting roles through the invitation route. An invitation could also be accepted after the creator's verification changed back to pending. Both operations returned200 on the previous code.

The reused implementation `fbbe65a6` holds original current-session authority, checks original creator/recipient negatives on the same connection, requires current verified/recovered creator and actual fan rows, serializes the original invitation, and compares current membership on retries. Removal checks original creator/session authority and revokes pending invitations with the membership. Already-active members use the existing version-aware role editor.

Actual operation found an unrelated account's removal was safely refused but returned503 from the creator-only negative check. Final implementation `35815033` first performs a read-only ownership refusal, then repeats ownership under the original row lock after negative checks. This restores a clear creator_required403 without granting authority from the preliminary lookup.

## Actual HTTP and PostgreSQL qualification

All commands used genuine API-issued local development sessions and the existing non-owner core runtime against PostgreSQL17 with the61 canonical migrations. A clearly labeled synthetic creator verification fixture was temporarily enabled, and restored to pending/version9. No production proof, consent, licence, provider or migration was created.

- Concurrent identical invitations converge to one original ID; concurrent accepts both return200 for one membership.
- Wrong recipient, creator no longer verified, and expired invitation return403 without membership issuance.
- Inviting an active member returns team_member_exists403. The existing role editor changes drafter/triage to scheduler; retrying the old acceptance returns team_acceptance_changed403 and preserves scheduler.
- Creator self-removal returns403. Unrelated removal is confirmed403 on final source; the earlier503 observation remains in the record.
- Removal and its exact retry return200; accepting afterward returns403. A new invitation after removal succeeds; expiry then prevents acceptance, and removal revokes it.
- Final database: creator pending/version9, zero active Team memberships, zero unrevoked invitations. Historical revoked invitations remain as review evidence. Browser account intro was restored blank during the prerequisite foundation operation.

Backend types, scoped ESLint/Prettier/diff and production build pass. [Exact source/overlap inventory and before/after receipts](../../artifacts/pr-review/2026-10-06/team-invitation-authority/). No test suites were added. No web/native/design inputs changed. Production identity and full native Team acceptance remain separate work.

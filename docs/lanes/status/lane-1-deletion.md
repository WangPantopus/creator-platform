# Lane 1 · WP 1.7 · Why account deletion does not finish, and what fixes it

Written 2026-10-15 by lane 1, from runs on lane 1's own one-command stack (`--growth`, the fake
model, the development identity). It answers lane 7's ticket ("accepted deletion jobs have
blocked or retrying domain tasks") and records what lane 1 changed, what other lanes own, and
what only the founder can decide.

## 1. In one paragraph

Lane 7 was right, and it is wider than deletion: **an export does not finish either.** A privacy
job has one task per domain (identity, conversation, agent, commerce, content, media, growth,
trust), and the job completes only when all eight do. Before this change only growth finished a
fan's account deletion. The biggest single blocker is in conversation: it refuses to run without a
recordings adapter that only exists when the frozen media module is composed, and agent and trust
wait on conversation, so one gap holds three domains, for export and delete. Commerce and content
have no deletion at all yet (commerce waits on the founder's Q16). Lane 1's two domains, identity
and media, now finish for fans; creator accounts stay refused until the founder decides how a
deleted creator's signatures are kept.

## 2. What each domain does with a fan's request (observed)

Fan account, after this pull request. "Waits" means it retries on its own and finishes once the
domain it waits for does.

| Domain       | Export   | Delete                                       | Code                                  | Cause                                                                                                                                                                                                                                                      | Owner                                                 | Smallest fix                                                                                                                                                                                                                                                                    |
| ------------ | -------- | -------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| conversation | blocked  | blocked                                      | `conversation_recordings_unavailable` | `modules/conversation/privacy.ts:213-220` requires a recordings adapter whenever `creator.message.recording_asset_id` exists; the adapter is prepared only when media producers are composed (`modules/conversation/host.ts:404-413`), and media is frozen | lane 3 (and the integrator if the fix is composition) | When no recordings adapter is composed, prove inside the held transaction that no message in the job's families carries a recording, then proceed; refuse if one does. The next gate after it, `conversation_retention_unavailable` (`privacy.ts:230-235`), is not yet observed |
| agent        | waits    | waits                                        | `accounting_boundary_pending`         | Waits for conversation's task (`modules/trust/accounting-boundary.ts:215-233`)                                                                                                                                                                             | follows conversation                                  | none                                                                                                                                                                                                                                                                            |
| trust        | complete | waits                                        | `comparison_artifact_purge_pending`   | The comparison purge waits for agent and conversation (`creator_trust.begin_comparison_artifact_privacy_delete`)                                                                                                                                           | follows conversation                                  | none                                                                                                                                                                                                                                                                            |
| commerce     | complete | blocked                                      | `commerce_retention_unconfigured`     | Deletion not implemented: "Q16 must explicitly resolve retention/refund consequences" (`modules/commerce/operations.ts:118-123`)                                                                                                                           | lane 4, after the founder's Q16                       | Erase or redact per Q16; keep what D-08 retains                                                                                                                                                                                                                                 |
| content      | complete | blocked                                      | `content_retention_unconfigured`      | Deletion not implemented (`modules/content/privacy.ts:28-33`). A fan's Note replies (`content_reply`) and thanks (`content_thanks`) live here, and E1.8 requires them gone                                                                                 | lane 5                                                | Fan deletion of replies and thanks                                                                                                                                                                                                                                              |
| growth       | complete | complete (account); fails (one conversation) | `growth_scope_adapter_required`       | No adapter for a conversation-scope or creator-scope request (`modules/growth/lifecycle.ts:48`)                                                                                                                                                            | lane 5                                                | Relationship-scope deletion; until then the job now shows this code as blocked instead of an opaque `domain_hook_error` that dead-letters                                                                                                                                       |
| identity     | complete | **waits, then erases** (this PR)             | `identity_erasure_waiting`            | Erases last, by design (section 3)                                                                                                                                                                                                                         | lane 1                                                | done for fans; creators wait for decision D1                                                                                                                                                                                                                                    |
| media        | complete | **complete** (this PR)                       |                                       | Completes only after proving the fan holds no media                                                                                                                                                                                                        | lane 1                                                | done for fans; held media and creators stay refused                                                                                                                                                                                                                             |

Lane 7 also saw `domain_hook_error` from growth. On my stack, with growth composed, an account
deletion completes in growth and a conversation deletion fails with `growth_scope_adapter_required`
(row above). I did not run a stack without `--growth`.

## 3. What this pull request changes (lane 1 files only)

- **Identity erasure for fans** (`modules/trust/identity-privacy-hook.ts`). For an account
  deletion, identity runs **last**: it waits until every other domain of the job has completed,
  retrying every 60 seconds without ever dead-lettering. Then, in one held transaction, it
  redacts the fan profile (the handle becomes `deleted-<16 hex>`, which no person can choose, and
  the intro is emptied), revokes every session and drops its encrypted upstream token, and revokes
  team memberships and pending invitations. The profile row stays because retained payment and
  request records (D-08) reference its id. Why last: other domains find a person's data through
  identity, and the web's privacy page keeps showing the deletion's progress through `/trust`
  (the tombstone already refuses everything else at once), so sessions end when the job does,
  not halfway. A one-conversation deletion finishes at once and touches nothing in identity.
  A creator account is refused at once with `identity_retention_unconfigured` (decision D1).
- **Media erasure when nothing is held** (`modules/trust/media-privacy-hook.ts`). Media is frozen,
  so a fan normally holds none. The task completes only after checking every pair of a creator
  and this fan, in every media and call table, read directly (not through conversation
  relationships, which another task may already have removed). Anything held, or a creator
  account, stays refused with `media_retention_unconfigured`.
- **The trust worker** (`modules/trust/worker.ts`) knows `identity_erasure_waiting` (retry every
  60 seconds, no dead letter) and classifies `growth_scope_adapter_required` as blocked with its
  own code.

## 4. Decisions for the founder (each with a proposed default)

| #   | Question                                                                                                                                                                     | Proposed default                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | When a creator deletes their account, what happens to their signed Notes, replies and reactions, and to the public verification pages that prove them (INV-22, share cards)? | Revoke every passkey; keep each public verification record's act type, content hash and time with the status "withdrawn"; drop the content and the creator's name; redact the creator profile like a fan's. Fans' threads with that creator follow lanes 3 and 4. Counsel to confirm |
| D2  | Can a deleted account sign in again?                                                                                                                                         | Today it never can (the tombstone refuses it), and it can follow its deletion's progress only with sessions it already holds, for up to 7 days. With option D (decision pack, #406) a later sign-in creates a new, empty account, as E1.8 expects. Confirm that                      |
| D3  | How long is the redacted fan record kept?                                                                                                                                    | Until the last retained record that references it expires (12 months for packets, longer for ledger entries where the law requires), then purged by a later job. Counsel to confirm                                                                                                  |
| D4  | Q16: commerce retention and refunds on deletion                                                                                                                              | Already open; it blocks commerce deletion (lane 4)                                                                                                                                                                                                                                   |

The `retained` reasons each domain reports (for example identity's "A fan record without its
handle or intro stays only as the anchor for payment and request records that must be kept") can
reach the person through the privacy page. They are written in backend code like the existing
ones and have not been through copy review.

## 5. Tickets

| Lane       | File                                                          | Change                                                                                    | Why                                                         |
| ---------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 3          | `modules/conversation/privacy.ts` (and `host.ts` composition) | Run without a recordings adapter when the held transaction proves there are no recordings | Blocks conversation, agent and trust, for export and delete |
| 4          | `modules/commerce/operations.ts`, `privacy-purpose.ts`        | Deletion per Q16                                                                          | Blocks every account deletion                               |
| 5          | `modules/content/privacy.ts`                                  | Fan deletion of Note replies and thanks                                                   | Blocks every account deletion; E1.8 requires replies gone   |
| 5          | `modules/growth/lifecycle.ts`                                 | Conversation-scope and creator-scope deletion                                             | Blocks "delete this conversation"                           |
| integrator | `server.ts`                                                   | Whatever composition lane 3's fix needs                                                   |                                                             |

## 6. Known gaps in lane 1's own code

- A deleted account that tries to sign in gets `403 scope_revoked`, but `POST /v1/identity/complete`
  writes a session row (then revokes it) before the trust check refuses. With the development
  identity the stored upstream token is only `development:<id>`; WP 1.2 (option D) moves the check
  before the session is written.
- Identity's redaction and session revocation ran and were checked once (run 1 below). After I
  moved identity to run last, that path cannot run again until conversation, agent, commerce,
  content and trust finish. In the final code it is **not run**.

## 7. Runs

All on a fresh stack (`node infra/local/stack.mjs reset --lane 1 --provider anthropic --env
W2_SMALL_MODEL=claude-sonnet-5-5 --growth --no-web --ack-only`). Fakes: the model, the development
identity. Run them in this order: E1.8 uses fan 6, and the edges use fans 2 and 1.

- `node tests/scenarios/lane-1/e1-8-delete.mjs 6 --wait 120`: 14 pass, 3 fail, 2 not run.
  Fails: the export job, the delete job and "the conversation is gone", all from the rows above
  owned by lanes 3, 4 and 5. Not run: identity's redaction and session checks (identity waits).
- `node tests/scenarios/lane-1/e1-8-edges.mjs`: 16 pass (one conversation, held media, creator).
- Restart: with two fan deletions waiting in identity and one creator deletion blocked, I stopped
  and restarted the stack. Within 95 seconds both waiting tasks had resumed on their own
  (attempts 2 to 3 and 1 to 3, still `identity_erasure_waiting`, no dead letter) and the
  creator task stayed blocked.
- Run 1 (before identity ran last): identity completed with `revokedSessions: 3, redactedProfiles:
1`, the handle became `deleted-f1f8a290a56a87a2`, the intro was empty, and all 3 sessions were
  revoked with their upstream tokens dropped.

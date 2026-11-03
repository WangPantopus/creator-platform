# Contract C3: accept and send (draft)

Provider: lane 4. Consumers: lane 6 (the Studio's two-tap flow), lane 7, lane 3 (one hook, below).
Status: **draft**, published early so lane 6 can build on it. Everything marked _today_ runs on the
lane 4 stack now (scenario E4.1); everything marked _new_ is WP 4.4 and not built yet.

## The two taps

A creator answers a paid written request with two taps, each one passkey ceremony:

1. **Accept.** Signing the exact acceptance captures the hold.
2. **Send.** Signing the exact reply text sends it, and the reply delivers the commitment.

Taking over the conversation is a call, not a tap. The Studio makes it when the reply composer opens
for an accepted request. Nothing else asks the creator for anything.

## Tap 1: accept (today)

| Step | Call                                             | Body                                                                                                                                                                       | Answer                                                                                                                                                                                                                                                                                           |
| ---- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `GET /v1/commerce/packets/:packetId`             |                                                                                                                                                                            | `{ packet, commitment, ledger, share }`; `packet` is the request row: `id`, `thread_id`, `version`, `state`, `payment_state`, `snapshot` (`amount` in minor units, `currency`, `mode`, `decisionHours`, `deliveryHours`, `title`, `modeVersion`), `decision_at`, `hold_expires_at`, `disclosure` |
| 2    | `POST /v1/identity/:creatorId/signed-acts/begin` | `{ command: { actType: "accept", subjectId: packet.thread_id, content: { packetId, packetVersion: packet.version, snapshot: packet.snapshot, action: "reply_myself" } } }` | `{ challengeId, publicKey }` (WebAuthn request options)                                                                                                                                                                                                                                          |
| 3    | `navigator.credentials.get({ publicKey })`       |                                                                                                                                                                            | the assertion (the passkey prompt: this is the tap)                                                                                                                                                                                                                                              |
| 4    | `POST /v1/identity/signed-acts/verify`           | `{ challengeId, assertion }`                                                                                                                                               | `{ signedActId }`                                                                                                                                                                                                                                                                                |
| 5    | `POST /v1/commerce/packets/:packetId/decide`     | `{ action: "reply_myself", version: packet.version, signedActId, idempotencyKey }`                                                                                         | the request view as in step 1: normally `accepted` / `captured` with a `commitment` (`state: "due"`, `due_at`)                                                                                                                                                                                   |

- The content in step 2 must be exactly the request as read in step 1. The server rebuilds it and
  refuses any difference (a changed price, version or action).
- The signature is good for 5 minutes and for one use.
- Step 5 runs the capture before it answers. If the processor's answer is lost, it answers
  `accepting` / `unknown`. Show "Confirming payment" and read the request again: the scheduler
  finishes it (WP 4.2).
- To decline, send `{ action: "decline", version, idempotencyKey }` (no signature). "Let AI
  answer" is `ai_answer`. Both release the hold and are allowed even after the decision deadline.

## Tap 2: send, and the reply delivers (new, with a fallback that works today)

| Step | Call                                                                                                                        | Body                                                                                       | Answer                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 0    | `POST /v1/conversations/:creatorId/:fanId/takeover`                                                                         | `{ idempotencyKey }`                                                                       | the control frame; `403 control_unchanged` means Maya already speaks, which is fine |
| 1    | `POST /v1/identity/:creatorId/signed-acts/begin`                                                                            | `{ fanId, command: { actType: "reply", subjectId: packet.thread_id, content: { text } } }` | `{ challengeId, publicKey }`                                                        |
| 2    | passkey, then `POST /v1/identity/signed-acts/verify`                                                                        | `{ challengeId, assertion }`                                                               | `{ signedActId }`                                                                   |
| 3    | `POST /v1/conversations/:creatorId/:fanId/human-replies`                                                                    | `{ text, signedActId, idempotencyKey }`                                                    | the message (`authorKind: "human_creator"`)                                         |
| 4    | _today, and whenever more than one written commitment is open in the thread:_ `POST /v1/commerce/packets/:packetId/deliver` | `{ version: commitment.version, messageId, idempotencyKey }`                               | `{ commitmentId }`; then read the request: `commitment.state: "delivered"`          |

_New (WP 4.4):_ when the thread has **exactly one** open written commitment, step 3 delivers it in the
same database transaction that stores the reply, so step 4 is not needed and a reply can never be
stored without its delivery. With two or more open commitments, step 3 only sends, and the Studio
asks which request the reply answers (step 4 with that request's id).

## States the screens show

| Request `state` / `payment_state`                                   | Meaning for the creator                                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `submitted` / `requires_capture`                                    | Waiting for a decision. Show the price, the decision deadline `decision_at` and the summary. |
| `more_info`                                                         | Waiting for the fan's answer.                                                                |
| `accepting` / `capturing` or `unknown`                              | Accepted, payment being confirmed. No action.                                                |
| `accepted` / `captured`                                             | Accepted. Commitment `due` until `due_at`.                                                   |
| `accepted` / `refund_pending` or `refunded`                         | The deadline passed without delivery. The fan is refunded; delivery is refused.              |
| `releasing`, then `declined`, `expired` or `withdrawn` / `released` | Ended. Nothing was charged.                                                                  |

| Commitment `state`           | Meaning                                    |
| ---------------------------- | ------------------------------------------ |
| `due`                        | Reply before `due_at`.                     |
| `delivered`                  | Done; `delivered_message_id` is the reply. |
| `refund_pending`, `refunded` | Missed (`outcome: "deadline_missed"`).     |

## Errors and what the screen does

| Code (status)                    | From                           | Meaning                                                                     | Screen                                                |
| -------------------------------- | ------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------- |
| `stale_request` (403)            | decide                         | The request changed since it was read                                       | Read it again; sign again if it is still decidable    |
| `decision_unavailable` (403)     | decide                         | Already decided, expired or released                                        | Show the current state                                |
| `decision_expired` (403)         | decide                         | The decision deadline passed (accept only)                                  | Show "This request expired"; decline is still allowed |
| `authorization_expiring` (403)   | decide                         | Under 6 hours left on the card hold                                         | Show that the fan must re-authorize; no accept        |
| `acceptance_unavailable` (403)   | begin                          | Not decidable now, or not this creator's                                    | Read the request again                                |
| `signed_content_changed` (403)   | begin                          | The content sent differs from the request                                   | Read again, sign the current request                  |
| `signed_act_required` (403)      | decide, human-replies          | The signature does not match this exact act, **or is older than 5 minutes** | Sign again                                            |
| `signed_act_consumed` (403)      | decide, human-replies          | The signature was already used                                              | Read the request; sign again only if still needed     |
| `creator_required` (403)         | decide, deliver, human-replies | A team member or a fan tried a creator act                                  | Not offered to them                                   |
| `takeover_required` (403)        | begin (reply), human-replies   | The creator has not taken over the conversation                             | Take over (step 0), then sign                         |
| `commitment_unavailable` (403)   | deliver                        | Wrong version, already delivered, or refunded                               | Read again                                            |
| `deadline_passed` (403)          | deliver                        | The delivery deadline passed                                                | Show the refund; nothing to deliver                   |
| `signed_delivery_required` (403) | deliver                        | The message is not the creator's own signed reply after the accept          | Send a signed reply                                   |
| `delivery_already_used` (403)    | deliver                        | That reply already fulfilled another request                                | Send a reply for this one                             |
| `request_unavailable` (403)      | all                            | Not visible to this account                                                 | Not offered                                           |

Every write takes an `idempotencyKey` (8 to 128 characters). The same key with the same body
returns the first answer and does nothing twice. The same key with a different body is refused.

## The cases C3 must survive (scenario E4.11)

- The send fails after the accept. The request stays accepted and undelivered. A retry of step 3
  with the same key returns the same message, and the delivery happens once.
- Two open commitments in one thread: the creator chooses (step 4).
- A stale signature (over 5 minutes): `signed_act_required`, sign again.
- A team member's act is never the creator's: `creator_required` or `acceptance_unavailable`.
- A tampered amount in the signed content: `signed_content_changed` at begin, `signed_act_required`
  at decide.

## Not in this draft

- **One signature for accept and send** (a single ceremony) needs the founder's review of INV-22.
  It is not part of C3 until approved.
- Voice notes and calls: out of the pilot.

## What other lanes do

- **Lane 3 (ticket):** in `ConversationService.humanReply`, inside its transaction and after the
  message is stored, call an optional hook that the conversation host injects from commerce:
  `afterHumanReply?(client, scope, message)`. Lane 4 provides the hook. Nothing changes for
  threads without an open written commitment.
- **Lane 6:** build the two taps on the calls above. Until the hook lands, chain step 4 after
  step 3 and retry it with the same key.
- **Lane 1 (optional ticket):** a distinct code for an expired signature
  (`signed_act_expired`) instead of `signed_act_required`, so the screen can say "Sign again"
  without guessing.

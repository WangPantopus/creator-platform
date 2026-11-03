# Lane 4: decisions for the founder

On 2026-10-16 the founder told lane 4 to stop waiting on yes/no decisions and to take the proposed
default for each one. Each such decision below says "taken as the proposed default". It is built in
its own pull request, so you can still veto it there before it merges: reply with the number and
your choice.

## Open

### Q16. A fan's money records and open requests when the fan deletes their account

**Today:** commerce refuses a deletion (`commerce_retention_unconfigured`,
`modules/commerce/operations.ts`), so every account deletion is blocked (lane 1's #409). The part
of Q16 that W8 approved (a 30-day ordinary purge; detached AI costs after 12 months) does not cover
how long commerce keeps payment and request records. That retention period is a legal question,
for counsel, so lane 4 has not taken a default for it.

**Proposed default for the product part** (not built; it needs the retention period above and
lane 1's deletion flow):

- requests not yet accepted are withdrawn at once, and their holds released (nothing charged);
- accepted requests keep their deadline, and are refunded if it passes, as in P1;
- the ledger, receipts and the request rows are kept for the legal period, with the fan's summary,
  disclosure and messages redacted;
- the spend limit and its notices are deleted.

### Stripe test keys (WP 4.7, E4.13)

Lane 4 needs a Stripe test-mode secret and publishable key, supplied through the approved secret
channel, to run the scripted Stripe test. It cannot proceed without them.

## Taken as the proposed default (2026-10-16)

### 1. A refunded payment gives its room under the monthly limit back (WP 4.3, E4.8): #485

A payment counts in the month it was captured, less whatever of it has been refunded
successfully. A refund still in flight counts until it succeeds. A refund in a later month gives
back only that earlier month's room, never extra room in the new month. Example: a fan with a $60
limit pays $50, Maya misses her deadline, and the $50 is refunded; the fan can spend $60 again.

Built for paid requests. Memberships and the pass still count in full until their refunds can be
exercised end to end (Stripe test keys, or a Billing fake); their ledger rows can be matched
exactly.

_The alternative was to keep the old rule: simpler, and it stops quick re-spending of returned
money._

### 2. A refunded commitment frees its weekly slot (E4.9): #486

When an accepted request is refunded in full because it was not delivered, its slot in that
week's window is freed, as the lane brief's E4.9 says. Capacity shown then equals open plus
accepted-and-unrefunded requests.

_The alternative was to keep the slot used for that week._

### 3. One signature for accept and send? (WP 4.4, INV-22): no change

Two signatures for the pilot, as contract C3 has it. Each passkey ceremony binds exactly what the
creator sees: the acceptance of a price, then the reply text. Nothing to build.

### 4. Never place a hold for a request that is already ending (E4.9): #484

If a request is being released or has ended, and the processor has no hold for it, the retry
places no new hold. It records that nothing was held, and the release finishes. It concludes
"nothing held" only once no earlier try can still reach the processor: on the first try, or five
minutes after the release began. Until then the request waits, with its slot kept. This places
fewer holds and never changes a charge.

### 5. Expired requests count toward "usually decides in" (WP 4.9, C8): #487

An expiry counts at its deadline. The range ("Maya usually decides in 1 to 2 days") is the middle
half (25th to 75th percentile) of the outcomes in the last 90 days. It is shown only once there
are at least five, and rounded to hours or days. Withdrawals do not count. It needs the decision
record's migration, which the integrator must register (catalogue pins regenerated).

_The alternative was to count only accepts and declines._

### #467: the `text` fallback for "Ask for more information": no change

`decide` keeps reading `text` alone as the question for older clients until lane 6's WP 6.6 sends
`question`. This is already built in #467.

### #453: when the commitment reminder fires: no change

The reminder fires when the smaller of 24 hours and a quarter of the delivery window is left.
This is already built in #453.

## Decided

### 6. What the fan reads when Maya lets her AI answer (WP 4.12): approved 2026-10-16

The founder approved the proposed default. When Maya chooses "Let AI answer" (`reason='ai_answer'`,
end state `declined`), the fan's request status and request list read:

- `declinedForAi`: "{name} suggests asking {name}'s AI · nothing charged"
- `askAiInstead`: "Ask {name}'s AI", a button that opens the fan's conversation with her.

While a question waits for the fan, the step that showed "Decision due" reads `moreInfoAnswerBy`:
"Answer by". Its date is when the request lapses unless the fan answers.

### 7. The refund rule on the Offers page (WP 4.12): approved 2026-10-16

The founder approved the proposed default. The creator's Offers table has one "Delivery" column
(`offerDeliveryHeading`), and each row reads `offerDeliveryRule`: "Within {deadline} of accepting,
or a full refund" ({deadline} reads "72 hours" or "3 days"). The "Refund if late" column goes away.

### P1. A paused creator's open paid requests (lane 1's G1, #463): confirmed 2026-10-15

The founder confirmed lane 1's proposed default, as built in #463. When ops pauses a creator or
revokes her license:

- **Requests she has not accepted** are released at once, and nothing is charged. They end with
  the existing "expired" outcome, and the fan sees "Maya's queue didn't get to this · nothing
  charged". It neither blames the creator nor reveals the ops action. There is no new copy and no
  new end state.
- **Accepted requests** keep their deadline, and refund if it passes. They are not refunded at
  once, in case the pause is lifted (P2) and she delivers.

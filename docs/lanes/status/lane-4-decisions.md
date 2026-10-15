# Lane 4: decisions for the founder

Each question has a proposed default. Lane 4 keeps working on other things meanwhile and changes
nothing below until you answer. Reply with the number and "yes" (take the default), or your choice.

## 1. Does a refunded payment count against the fan's monthly spend limit? (WP 4.3, E4.8)

**Today:** yes. The limit counts every payment captured this calendar month (UTC), plus every open
hold. A refund does not give the room back. The money suite records this as an open product
question (`OBSERVATION (INV-16, D-21)` in `commerce-money-recovery.test.ts`).

**Example:** a fan with a $60 limit pays $50, Maya misses her deadline, and the $50 is refunded.
Today the fan can spend only $10 more this month, although they kept their money.

**Proposed default: a refund gives the room back.** A payment counts in the month it was captured,
minus whatever of it has been refunded successfully. A refund still in flight keeps counting until
it succeeds. A refund in a later month gives back only that earlier month's room, never extra room
in the new month.

Alternative: keep today's rule. It is simpler, and it stops a fan from quickly re-spending money that
was returned.

## 2. Does a refunded commitment free its weekly slot? (E4.9)

**Today:** no. A request Maya accepted and then missed keeps its slot in that week's capacity. The
lane brief's E4.9 expects "expiry, decline and refund each free a slot".

**Proposed default: yes.** When an accepted request is refunded because it was not delivered, its
slot in that week's window is freed, as the brief says. Capacity shown then equals open plus
accepted-and-unrefunded requests. Expiry, decline and withdrawal already free their slots.

Alternative: keep the slot used for that week, on the view that a creator who just missed a
deadline should not take on another request in the same week.

## 3. One signature for accept and send? (WP 4.4, INV-22)

**Today:** accepting and replying are two separate signed acts, so two passkey ceremonies. Contract
C3 (`lane-4-c3-accept-and-send.md`) keeps them separate. That is already two taps once delivery is
automatic.

**Proposed default: keep two signatures for the pilot.** Each ceremony binds exactly what the
creator sees: the acceptance of a price, then the reply text. A single combined act would bind both
in one hash. INV-22 allows that ("bound to a hash of that exact content"), but it changes what one
signature means, so it waits for your review.

## 4. Never place a hold for a request that is already ending (found in E4.9)

**Today:** suppose the processor never answered while a hold was being placed, and the request then
times out and is released. If a retry of that hold later reaches the processor, a new hold is placed
and then immediately cancelled. Nothing is captured and no slot leaks, but the fan's bank may show a
hold appear and vanish.

**Proposed default: fix it.** If the request is being released or has ended, and the processor has
no hold for it, the retry places no new hold. It records that nothing was held, and the release
finishes. This places fewer holds and never changes a charge.

## 5. Do expired requests count toward "usually decides in"? (WP 4.9, C8)

**Today:** no range is shown anywhere. The public summary (#427) leaves `reliability` empty until
the creator's decision record exists. That record needs a migration, proposed in #427.

**Proposed default: count an expiry at its deadline.** The range ("Maya usually decides in 1 to 2
days") is then honest about how long a fan waits, including requests nobody answered. Show it only
once there are at least five outcomes in the last 90 days, as the middle half of them (25th to 75th
percentile), rounded to hours or days.

Alternative: count only accepts and declines. The range is then about Maya's decisions, but a
creator who lets requests expire would look faster than fans experience her.

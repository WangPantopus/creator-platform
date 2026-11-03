# Lane 4: Money

## Mission

Money is correct, safe and boring. A hold is placed at the request, captured only when the
creator accepts, and released or refunded automatically in every other case, without anyone
having to tap. This lane also makes accepting and sending a reply a two-tap job for the
creator.

**What a person should feel.** A fan sees the price, the deadline and "Charged only when Maya
accepts" before they pay, and a gentle, free outcome if she declines. A creator accepts and sends
a signed reply in two taps. Nobody is ever charged for something that did not happen.

## What great looks like

- Charge only on acceptance (INV-16); idempotent at every step (INV-18); capacity shown equals
  capacity enforced (INV-10); only the promised service completes a commitment (INV-09).
- Expiry, late-delivery refund and capacity release happen **without a user action**.
- A scripted Stripe test-mode run passes: hold, accept, decline, 3-D Secure, refund.
- The existing 100 money tests stay green (they are the regression gate); every new behavior is
  proven end to end by the scenarios below, with the invariant sweep run after each.

## Scope

**In:** the remaining defects from the money tests, the scheduler and webhook (the development
host first), refund retry and escalation, accept-and-send (contract C3), the eligibility field,
price and key hygiene, the Stripe test-mode run, the web handoff for paid requests from the
native apps (Q04), the public profile capacity and ETA data, membership billing readiness, and a
minimal earnings view.

**Out:** the pass, pool earnings and payouts, group publication, voice and calls, anything that
changes the payment semantics without the founder.

## You own and do not touch

Own: `modules/{commerce,payments}`, `features/commerce`, the commerce and requests routes, the
money tests and their support files.

Do not touch: `Studio.tsx` (lane 6 builds the screens over your API), `server.ts`, identity,
growth and content modules.

## Read first

1. Launch review section 7 (the failure table, the defect table, Stripe, native money).
2. The merged money tests: `apps/backend/tests/commerce-money-*.test.ts` and `support/`.
3. `modules/commerce/service.ts` (read by range: `decide` about 1520 to 1700, `runEffect` 2430
   to 2700, `reconcileDeadlines` near the end), `modules/payments/{provider,inbox,stripe}.ts`.
4. Domain Model: INV-09, 10, 13, 16, 17, 18, 22 and the T-matrix (T-07, T-10, T-16, T-24, T-29);
   D-14 (distribution matrix).
5. Background: `docs/workstreams/W4-commerce-requests.md`, `docs/implementation/W4-*.md`.

## Work packages

| WP | Work | Size | Gate |
| --- | --- | --- | --- |
| 4.1 | **Database guard for capture**: a capture effect may exist only for an accepted packet (needs a migration through the queue). Run the failing scenario first (E4.12) | S to M | migration queue |
| 4.2 | **Scheduler and webhook on the development host**: implement `CommerceWorkIndex` for the development adapter, start `CommerceRecoveryWorker`, mount the Stripe inbox router with an insert-only pool; tests. The production index follows lane 1's adapter | M | none |
| 4.3 | **Refund failure retry and escalation**; decide how a refunded payment counts against the monthly spend limit | M | the counting rule is the founder's call |
| 4.4 | **Accept-and-send, contract C3**: deliver automatically when the reply is sent against one open written commitment; publish the API and states; optionally one signature for accept and deliver | M to L | the single signature needs the founder's INV-22 review |
| 4.5 | The eligibility field on a mode (T-07), writable, with its form | S | none |
| 4.6 | Stable draft idempotency key in the client (`CommerceScreen.tsx` near 716), a minimum price, and the PaymentIntent recovery scan limit of 1,000 | S each | none |
| 4.7 | **Scripted Stripe test-mode run**, plus the webhook receiving real events | S + M | Stripe test keys |
| 4.8 | **Web handoff for a paid request from the native apps** (Q04): a "continue on the web" link with a sign-in handoff | S to M | lanes 1 and 7 |
| 4.9 | Public profile capacity, ETA and "usually decides in" from the capacity row and the record (C8, with lane 5) | M | none |
| 4.10 | Membership billing readiness: Stripe subscription products file, store notification routers, verification of in-app purchases | M to L | store accounts |
| 4.11 | Minimal earnings view (S-C9) | M | none |
| 4.12 | Fan copy for the "Let AI answer" outcome (a fan sees "passed on this one") and a separate backend field for "ask for more information"; Offers page copy ("Refund if late" is hard-coded) | S | with lane 6 |
| 4.13 | **Packet and checkout as designed**: the ETA range beside the absolute deadline, the in-flow spend limit ("$5 of your $60 limit"), the terms block "Charged only when Maya accepts" | M | none |

## Contracts

Provides **C3** (accept-and-send). Co-provides C8 (capacity). Consumes C1, C4.

## Rules that bite

**Every money change is proven end to end** (the scenarios below and the invariant sweep), and
the 100 existing money tests stay green. Provider calls happen outside database locks. Never change money semantics, a ledger meaning or a refund rule without the
founder. A late decline releases; a late accept is refused. The six-hour margin before a hold
lapses stays. Hold and release are exact; the ledger is append-only.

## Verification: end-to-end scenarios and exit demo

No new unit tests ([working agreement](01-working-agreement.md) section 3). Money is where a
missed edge case costs the most, so **every row below is ★** (required for any pull request that
can affect it) and this lane has the deepest set in the program. Before anything else, build two small things once and use them for every scenario:

1. **A scenario runner**: plain Node (`.mjs`) in `tests/scenarios/lane-4/` that drives the running
   backend over HTTP with the fake processor, one scenario per file, printing one line per step.
2. **An invariant sweep**: a read-only script that checks the database after each scenario: every
   hold ends in exactly one state; the captured total equals the price of the accepted packets;
   nothing is captured without an acceptance (INV-16); refunds never exceed captures; the ledger
   is append-only; held, released and captured amounts reconcile; capacity in use equals open
   plus accepted commitments (INV-10); no packet is terminal with an open hold. **A scenario
   passes only when the screen or API result and the sweep both pass.** Paste the sweep output.

Move deadlines by editing them in your own disposable database, and say so. Run the 100 existing
money tests before every pull request: `(cd apps/backend && pnpm exec vitest run
tests/commerce-money-*.test.ts)`.

| ID | Workflow | Edge cases to run |
| --- | --- | --- |
| E4.1 ★ | Happy path: request, hold ("Charged only when Maya accepts"), accept (signed), capture, reply (signed), delivered, receipt | Exact amounts in minor units; ETA and deadline visible; currency; the receipt matches the ledger |
| E4.2 ★ | Decline | The hold is released and the fan sees the gentle free outcome; a decline after the decision deadline still releases (never refused); "Let AI answer" releases and says so; no capture is ever attempted |
| E4.3 ★ | Expiry with no tap | Left alone, the scheduler expires it at the deadline, releases the hold and the capacity and notifies the fan; the scheduler killed and restarted around the deadline; nobody taps anything |
| E4.4 ★ | Late and boundary | Accept one second before the deadline works and one second after is refused; accept when the authorization's capture window is unusable (the 6-hour margin) releases and does not capture; a decision window of zero; the delivery deadline boundary |
| E4.5 ★ | Overdue commitment | Accepted and not delivered by the deadline: refunded exactly once; delivery after the refund is refused; a reply that is not the promised service does not complete the commitment (INV-09); a refund the processor fails (down, 4xx, 5xx) is retried with backoff, escalated to ops after N tries and never dropped |
| E4.6 ★ | 3-D Secure and webhooks | requires_action then completed; abandoned; the webhook arrives before the client returns; a replayed event; out-of-order events; a bad signature is rejected; an unknown event type is ignored; a duplicate event id is idempotent |
| E4.7 ★ | Repeat and race | Double-tap submit (same key gives one request and one hold); the same key with a different body conflicts; two tabs; double-tap accept gives one capture; accept against expiry at the same instant; decline against accept by two team members; the sweep after each |
| E4.8 ★ | Limits | The monthly limit exactly reached and one cent over; after a refund (counting rule per the founder); no limit set; a limit lowered while a hold is outstanding; the minimum price; the price changed between packet and submit (INV-13: refused, and the fan sees the new price first) |
| E4.9 ★ | Capacity | N fans submit at once with capacity N minus 1: exactly N minus 1 succeed; expiry, decline and refund each free a slot; a crash mid-submit leaks no slot; shown equals enforced (INV-10) |
| E4.10 ★ | Card and processor failures | Declined, insufficient funds, expired card, authentication failed; a timeout after the provider call (unknown outcome reconciled, never a double hold); an outage at hold time; a purchase is never offered as the way out of a failure |
| E4.11 ★ | Accept-and-send (C3) | Accept, reply and deliver in the contract's calls; the send fails after the accept (the state is accepted and undelivered, and a retry works once); two open commitments (the creator must choose); a stale signature (older than 5 minutes) asks to sign again; a team member's act is not the creator's approval (INV-02, INV-22); a tampered amount in the signed content is refused |
| E4.12 ★ | Who may do what | Fan A cannot read, accept, cancel or pay fan B's packet; creator A cannot accept creator B's; anonymous is refused; a signed accept replayed on another packet is refused; the database guard (4.1) rejects a capture row for an unaccepted packet written directly as the runtime role |
| E4.13 ★ | Stripe test mode (needs the keys) | The scripted run: hold, accept and capture; decline and cancel; test cards for 3-D Secure, decline and insufficient funds; a refund; webhooks delivered through the forwarder; confirm that an unknown payment method answers a 4xx |
| E4.14 ★ | Native handoff and earnings | "Continue on the web" signs the fan in once, expires, and cannot be replayed on another device; earnings equal the ledger (refunds included, the empty state, time zone edges) |

**Exit demo with the fake processor:** request, accept, reply, receipt; a request left alone
expires and releases with no tap; an overdue commitment refunds once; the sweep is clean after
each. **With Stripe test keys:** the scripted run passes, including 3-D Secure and a refund.

## Known risks

The "4xx means nothing was held" fix assumes real Stripe answers an unknown payment method with
a 4xx; confirm with test keys. A failed refund is today neither retried nor escalated. The
scheduler's production work index depends on lane 1's adapter.

## Decisions needed

The refund-and-limit counting rule; the single signature for accept and deliver; Stripe account
topology (Q03) and test keys; the Q04 handoff design with counsel.

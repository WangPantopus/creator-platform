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
- The existing 100 money tests stay green; every new behavior adds tests.

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
| 4.1 | **Database guard for capture**: a capture effect may exist only for an accepted packet (needs a migration through the queue). Add the failing test first | S to M | migration queue |
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

**Tests are required** for every money change, using the harness. Provider calls happen outside
database locks. Never change money semantics, a ledger meaning or a refund rule without the
founder. A late decline releases; a late accept is refused. The six-hour margin before a hold
lapses stays. Hold and release are exact; the ledger is append-only.

## Verification and exit demo

Run the money suite and the full backend suite. **Exit demo with the fake processor:** request,
accept, reply, receipt; a request left alone expires and releases with no tap; an overdue
commitment refunds once. **With Stripe test keys:** the scripted run passes, including 3-D
Secure and a refund.

## Known risks

The "4xx means nothing was held" fix assumes real Stripe answers an unknown payment method with
a 4xx; confirm with test keys. A failed refund is today neither retried nor escalated. The
scheduler's production work index depends on lane 1's adapter.

## Decisions needed

The refund-and-limit counting rule; the single signature for accept and deliver; Stripe account
topology (Q03) and test keys; the Q04 handoff design with counsel.

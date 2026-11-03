# W4 — Commerce, access, and request lifecycle

## Agent assignment

**Execution rule:** You personally do all coding, migrations, configuration, documentation, debugging/fixes, integration, app launching and end-to-end verification. Subagents may only research or check information read-only; never delegate implementation or acceptance, including asking for patches to apply yourself. Do not write new test code. Use your [complete execution prompt](prompts/W4-commerce-requests.md) when assigning this stream.

Own every financial obligation, entitlement, capacity reservation, and human-request state. Follow [the plan](README.md), [standards](STANDARDS.md), [contracts](CONTRACTS.md), [runtime verification](VERIFICATION.md), Domain §5/§8, and Architecture §7. Implement Node.js plus the applicable fan web/Swift/Kotlin and creator commerce screens. No new test code: exercise real UI and sandbox provider outcomes, inspect durable records, and retain evidence.

## Work packages

1. **Access and offers.** Human modes, tiers/memberships and audience capabilities, effective grants and non-stacking equivalent access, approximately 24-hour first-conversation trial, cost-weighted AI allowance reservations, mode availability and four access lines. Pass reach never grants tier depth. Use one authoritative grant/capacity read model everywhere; cache invalidation is versioned and prompt.
2. **Membership billing.** Configured catalog/prices/currencies, consolidated web billing, start/renew/cancel/change, grace/payment failure, unused seven-day full refund and subsequent pro-rating per product policy, entitlement reconciliation, receipts and creator allocation. StoreKit 2/Play Billing products, verified server transactions, restore, pending/deferred/failed purchase, renewals/refunds/revocations and account linking. Consolidated web charges do not imply unsupported consolidation of separate store purchases; record provider-specific behavior in the billing contract.
3. **Packet and capacity.** Fan-edited summary, explicit disclosure set and separate access notice, private/public selection, mode/price/SLA/availability snapshot, spend limit before capacity and hold, reservation row lock, idempotency, submit/withdraw/expire, ask for more information, decision window bounded by the provider's real capture expiry with the architecture's six-hour safety margin. More-info pauses the creator's decision SLA, never the bank authorization clock; reauthorization preserves the same packet/payment lineage. Include attachment constraints with W6. Never place a hold when capacity is unavailable.
4. **Decisions and commitments.** Implement all eight F6 choices and the fulfillment matrix, creator authority/signature requirements, exact approved-draft eligibility, capture only on acceptance, due/delivered/refund/resolution transitions, guaranteed-review attestation if offered, and signed proof for actual promised service. A changed mode/group offer requires fan consent; AI or team activity cannot silently fulfill a personal promise. W5 owns the creator decision UI; W6 supplies call evidence.
5. **Payment reliability.** Stripe adapter per build prompt, platform/Connect topology decision, manual authorization/capture/release, authentication-required state, ambiguous external success, replay protection, webhook signature/inbox dedupe/current-state fetch, outbox effects, reconciliation jobs and compensation. Design transaction boundaries so slow provider calls do not hold capacity locks indefinitely; repair crash-after-provider-success without duplicating funds or obligations.
6. **Money ledger and operations.** Append-only cause-linked holds/captures/releases/refunds/adjustments/credits/pool allocations/payout releases; minor units and currency; balance reconciliation, payout account onboarding/KYC status, fees, reserves/disputes/chargebacks, payout failure and creator earnings statements. Apply the specified delivery-plus-seven-day dispute-window payout-release rule and dispute holds. W8 operates cases through commands; it cannot edit ledger history. Tax/reporting and country availability require configured business decisions, not invented rates.
7. **Spending and fairness.** First-paid-action monthly limit, explicit no-limit choice, 50%/100% reminders, delayed 24-hour increases and immediate decreases, monthly summary, unused/pro-rated refunds, refund status/reasons, fan cancellation and subscription-management routes. Confirm race behavior against existing pending holds/obligations in the contract. Keep prices outside AI messages and avoid spend-based ranks.
8. **Pass, full scope.** Membership remains launch lead. Later pass subscription, three-slot/default configured selection, active/draft-next/ended-readable/replaced states, calendar-month transition, incomplete draft carry-forward, first-cycle pro-rating, unavailable creator free replacement, no membership double count, atomic grant changes, slot-day allocation, creator pool and idempotent payouts. Build it before its roster-dependent release gate, without exposing premature pass marketing.
9. **Public answers, sharing and credits.** Lower-price public request, explicit private-to-group offer acceptance, capped noncash asker credits for eligible reads, ledger-backed issuance/redemption/refund interactions, dedupe/anti-farming and creator payout consistency. Own ShareGrant: creator per-mode sharing permission plus fan choice/handle display; either party can revoke and invalidate the card. W7 renders artifacts and emits qualified audience/read evidence; W4 decides credit eligibility and amount from configuration. Amounts/caps remain a decision, never sample magic numbers.

## Owned surfaces and boundaries

Own fan Packet, Limit, Checkout, Status/receipt, Requests, Access, Spending and Pass; creator Offers, Earnings and pool allocation surfaces; native IAP handoff/recovery. [The inventory](research/design-inventory.md) gives exact file ownership. W5 owns Studio queue and packet detail as consumers. W6 owns OfferTimes/session mechanics while W4 owns acceptance/pricing/capacity and the resulting commitment.

Use distinct access/handoff/payments modules and commerce feature directories. Keep allowance operations available inside W3's acceptance transaction, with clear reserve/consume/release semantics. W1 enforces actor/signature identity. W8 registers migrations and operational jobs. Never let UI clients compute their own settlement or release entitlements from a local receipt alone.

## First deliveries and dependencies

Set C03 capabilities and C06 packet/fulfillment contracts early. Start with a sandbox membership and written-request round trip: price snapshot → capacity reservation/hold → creator acceptance/capture → signed delivery/receipt. Add decline/expiry/refund/reconciliation before any external paid use. Progress to store billing, call outcomes, credits and pass in parallel increments without forking the ledger.

Native paid written/voice replies remain subject to the unresolved distribution decision. Finish their shared workflow and web payment; keep native purchase capability explicitly gated until current store rules and the business/counsel decision are resolved. Never route around a store rule by quietly substituting a webview.

## Required runtime demonstrations

- Complete membership purchase/restore/cancel/refund and cross-client entitlement refresh using provider sandboxes. Replay/reorder a notification and reconcile missing delivery from provider truth.
- Two fans race for the last capacity unit; two requests race for one spend/allowance balance. One valid acceptance, no overbooking/negative counters, no failed-path hold.
- Submit, authenticate payment, withdraw, decline, request more info, expire authorization, accept, deliver, miss deadline and refund. Reload each state in fan and Studio; every amount/deadline agrees.
- Double-click and retry submit/accept/refund/delivery; simulate provider success followed by application restart. No duplicate capture, payment, commitment or refund; unresolved money is visibly processing until reconciled.
- Attempt personal fulfillment by AI/team, edited approved draft, wrong media mode, revoked creator and incomplete call. No false delivery; the correct named service succeeds.
- Raise a spend limit and immediately submit; delayed increase remains ineffective. Lower a limit, reconcile pending exposure, and verify exact before/after behavior.
- Run calendar transition with draft/unchanged/replaced/cancelled slots; grants and slot-day payouts reconcile exactly, including pro-rating and failed provider delivery.
- Demonstrate public-answer consent and credit farming limits with repeated/self/ineligible reads; noncash cap and refunds remain correct.

## Delivery standard

Provide the state/transition table, schema/migrations, provider reconciliation and recovery instructions, functioning fan/Studio/native commerce surfaces, sandbox evidence, and an explained ledger for each demonstrated outcome. All known money/authority defects block release. No real charge, payout, public price or store policy decision is inferred from successful sandbox behavior.

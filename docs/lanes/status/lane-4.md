# Lane 4: Money status

Updated: 2026-10-15, by the lane 4 session

Working on: WP 4.6 (stable draft idempotency key, minimum price, the PaymentIntent recovery scan),
then the webhook inbox (the second half of WP 4.2).

Done (open, not merged; merge #408 first, every later scenario uses its runner):

- #408 `lane-4/scenario-runner`: the scenario runner, the fake card processor and the invariant
  sweep.
- #410 `lane-4/capture-guard` (draft): WP 4.1, the database guard for capture. **Needs migration
  registration** (`apps/backend/src/modules/commerce/schema-capture-guard.sql`) and regenerated
  catalogue pins: a development backend refuses to start on a database with the guard until the
  generation safety-terminal pin is regenerated (its `commerce_effect` trigger list changes).
- #416 `lane-4/recovery-scheduler`: WP 4.2, the scheduler on the development host (expiry, overdue
  refunds and crash recovery with no tap). Needs the integrator to compose it in `server.ts`
  (snippet in the PR); proven with a side process meanwhile.
- #418 `lane-4/c3-contract`: contract C3 (accept and send) draft for lanes 6 and 3, and the
  decision pack `lane-4-decisions.md`.
- #421 `lane-4/refund-retry`: WP 4.3, refund failures retried, reported to operations and never
  dropped.

Next: WP 4.6, the webhook inbox (needs a non-owner inbox login), WP 4.5 (eligibility), WP 4.4's
automatic delivery (needs lane 3's hook), 4.12, 4.13.

Blocked on:

- **The founder:** the four decisions in `lane-4-decisions.md` (#418): refunds and the monthly
  limit, refunds and weekly capacity, one signature for accept and send, never placing a hold for a
  request already ending.
- **The integrator:** #410's migration slot and catalogue pins; the `server.ts` wiring for #416.
- **Lane 3:** the `afterHumanReply` hook (C3) for automatic delivery.
- **The founder's Stripe test keys:** WP 4.7.

Scenarios (lane 4 stack with the fake processor; `node tests/scenarios/lane-4/run.mjs` after
`node tests/scenarios/lane-4/stack.mjs up --no-web --ack-only`), all on 2026-10-15:

- E4.1 happy path: pass.
- E4.3 expiry with no tap (with scheduler kill and restart): pass (#416).
- E4.5 overdue commitment: pass (#416); refund failures (down, 4xx, failed, long outage): pass
  (#421).
- E4.7 accept against expiry: pass (#416).
- E4.9 stuck while the hold is placed, no leaked slot: pass (#416).
- E4.10 lost answers and outages reconciled by the scheduler: pass (#416).
- E4.12 who may do what: 12/12 with the guard, 10/12 without it (#410). Capture guard in depth:
  8/8 with it, 4/8 without.
- E4.2, E4.4, E4.6, E4.8, E4.11, E4.13, E4.14: not run yet.

Findings so far:

- Without the guard, an accepted request's capture row rewritten to name another fan's hold (under a
  fresh key) made the executor capture that fan's money, with nothing in the ledger. Closed by #410.
- A refund the processor reported failed was marked failed and never tried again; the fan was owed
  money nobody knew about. Closed by #421.
- The API contract refuses Stripe's own test payment-method names (`pm_card_visa`). The scripted
  Stripe run (WP 4.7) must create real `pm_` ids first.
- The Stripe SDK retries once with the same idempotency key on a connection reset, even with
  `maxNetworkRetries: 0`, so one lost answer usually heals inside the call.
- Team replies are unavailable on the development stack (`503 scope_denial_unconfigured`).

Ports and containers: 56440 to 56444 (the stack, plus the fake processor on 56444). The scheduler
side process (`tests/scenarios/lane-4/scheduler.mjs`). Container `qelvora-lane4-postgres`, volume
`qelvora-lane4-pgdata`.

Tickets to other lanes:

- **Integrator, `server.ts`:** compose `createDevelopmentCommerceRecovery` on the development host
  (#416); register #410's migration and regenerate the catalogue pins.
- **Lane 3, `ConversationService.humanReply`:** an optional `afterHumanReply(client, scope,
message)` hook inside its transaction, so a reply delivers its one open written commitment
  atomically (C3, #418).
- **Lane 1:** an operations case or console list for money escalations (`refund_escalated` events,
  `resolution_required` commitments) (#421). Optional: a distinct `signed_act_expired` code (C3).
- **Lane 2 or the integrator:** a non-owner login that may claim `commerce_provider_inbox` rows,
  for the webhook worker (next PR).
- **Lane 5:** the request-status notices wait on lane 4's owner calls; the scheduler now writes the
  `hold_released`, `refunded` and `commitment_resolution` events they would be made from.

# Lane 4: Money status

Updated: 2026-10-15, by the lane 4 session

Working on: E4.10 card failures and E4.11 (C3) scenarios; then WP 4.5 (eligibility), WP 4.12
(copy) and WP 4.13 (packet and checkout as designed).

Done (open, not merged). **Merge order:** #408 first (every scenario uses its runner and fake
processor), then #416 (the scheduler the later scenarios start); the rest in any order.

| PR   | Branch                         | What                                                                                                       | Needs                                                                                  |
| ---- | ------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| #408 | `lane-4/scenario-runner`       | Scenario runner, fake card processor, invariant sweep; E4.1, E4.12                                         | —                                                                                      |
| #410 | `lane-4/capture-guard` (draft) | WP 4.1: database guard for capture                                                                         | **migration registration** and regenerated catalogue pins (generation safety-terminal) |
| #416 | `lane-4/recovery-scheduler`    | WP 4.2: scheduler and processor notifications on the development host; E4.3, E4.5, E4.6, E4.7, E4.9, E4.10 | integrator: compose in `server.ts`, mount the notification route                       |
| #418 | `lane-4/c3-contract`           | Contract C3 draft (accept and send), founder decision pack                                                 | founder: four decisions                                                                |
| #421 | `lane-4/refund-retry`          | WP 4.3: refund failures retried, reported, never dropped                                                   | —                                                                                      |
| #423 | `lane-4/payment-hygiene`       | WP 4.6: one hold per request on retry (web), minimum price, bounded recovery scan                          | copy review of one message                                                             |
| #424 | `lane-4/scenarios-decide`      | Scenarios E4.2, E4.4, E4.7, E4.9 (no code)                                                                 | —                                                                                      |
| #425 | `lane-4/inbox-login` (draft)   | WP 4.2: non-owner login to claim notifications                                                             | **migration registration**; lane 2: pass its URL                                       |

Next: E4.10 card failures, E4.11 (C3 cases on today's calls), WP 4.5, 4.12, 4.13, then WP 4.4's
automatic delivery once lane 3 adds the hook.

Blocked on:

- **The founder:** the four decisions in `lane-4-decisions.md` (#418): refunds and the monthly
  limit, refunds and weekly capacity, one signature for accept and send, never placing a hold for a
  request already ending.
- **The integrator:** #410 and #425 migration slots; the `server.ts` wiring for #416.
- **Lane 3:** the `afterHumanReply` hook (C3) for automatic delivery.
- **The founder's Stripe test keys:** WP 4.7 (E4.13).
- **Lanes 1 and 7:** WP 4.8 (native handoff, E4.14).

Scenarios, all on the lane 4 stack with the fake processor, 2026-10-15
(`node tests/scenarios/lane-4/run.mjs` after `node tests/scenarios/lane-4/stack.mjs up --no-web
--ack-only`):

- Pass: E4.1, E4.2, E4.3, E4.4, E4.5 (with refund failures), E4.6, E4.7, E4.8 (except the refund
  counting rule), E4.9 (except refunds and slots), E4.10 (lost answers, outages, busy account),
  E4.12 (with the guard).
- Waiting on a decision: E4.8 after a refund (decision 1), E4.9 refund frees a slot (decision 2).
- Not run yet: E4.10 card declines and the "no purchase as the way out" screen check, E4.11, E4.13
  (keys), E4.14 (lanes 1 and 7).

Findings so far (all fixed or reported in the PRs above):

- Without the guard, a rewritten capture row made the executor capture another fan's hold, with
  nothing in the ledger (#410).
- A refund the processor reported failed was never tried again (#421).
- The web checkout made a second request and a second hold when a fan re-entered the card after a
  lost answer; seen in the browser (#423).
- Recovery of a lost hold gave up in an account with more than 1,000 payments (#423).
- The API contract refuses Stripe's own test payment-method names (`pm_card_visa`); the scripted
  Stripe run (WP 4.7) must create real `pm_` ids first.
- The Stripe SDK retries once with the same idempotency key on a connection reset, even with
  `maxNetworkRetries: 0`.
- Team replies are unavailable on the development stack (`503 scope_denial_unconfigured`).
- A new database function is executable by PUBLIC by default, which changes the usage-expiry
  catalogue pin and stops the backend from starting; lane 4's migrations revoke it.

Ports and containers: 56440 to 56445 (the stack; the fake processor on 56444; notifications on
56445). The scheduler side process (`tests/scenarios/lane-4/scheduler.mjs`). Container
`qelvora-lane4-postgres`, volume `qelvora-lane4-pgdata`.

Tickets to other lanes:

- **Integrator, `server.ts`:** compose `createDevelopmentCommerceRecovery` and mount
  `createStripeInboxRouter` before `express.json` (#416); register #410 and #425 and regenerate the
  catalogue pins.
- **Lane 3, `ConversationService.humanReply`:** an optional `afterHumanReply(client, scope,
message)` hook inside its transaction, so a reply delivers its one open written commitment
  atomically (C3, #418).
- **Lane 1:** an operations case or console list for money escalations (`refund_escalated` events,
  `resolution_required` commitments) (#421). Optional: a distinct `signed_act_expired` code (C3).
- **Lane 2:** pass `COMMERCE_INBOX_DATABASE_URL` for #425's login to the scheduler's host.
- **Lane 5:** the request-status notices wait on lane 4's owner calls; the scheduler writes the
  `hold_released`, `refunded` and `commitment_resolution` events they would be made from.

# Lane 4: Money status

Updated: 2026-10-15, by the lane 4 session

Working on: nothing in flight. Every change is in an open pull request below.

Done (open, not merged). **Merge order:** #408 first, because every scenario uses its runner and its fake processor. Then #416, because later scenarios start its scheduler. The rest in any order.

| PR   | Branch                         | What                                                                                                                                                               | Needs                                                                                  |
| ---- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| #408 | `lane-4/scenario-runner`       | Scenario runner, fake card processor, invariant sweep; E4.1, E4.12; this status file                                                                               | —                                                                                      |
| #410 | `lane-4/capture-guard` (draft) | WP 4.1: database guard for capture                                                                                                                                 | **migration registration** and regenerated catalogue pins (generation safety-terminal) |
| #416 | `lane-4/recovery-scheduler`    | WP 4.2: scheduler and processor notifications on the development host (E4.3, E4.5, E4.6, E4.7, E4.10). Third commit: an inbox outage no longer stops or crashes it | integrator: compose in `server.ts`, mount the notification route                       |
| #418 | `lane-4/c3-contract`           | Contract C3 draft (accept and send), founder decision pack                                                                                                         | founder: five decisions                                                                |
| #421 | `lane-4/refund-retry`          | WP 4.3: refund failures retried, reported, never dropped                                                                                                           | —                                                                                      |
| #423 | `lane-4/payment-hygiene`       | WP 4.6: one hold per request on retry (web), minimum price, bounded recovery scan                                                                                  | copy review of one message                                                             |
| #424 | `lane-4/scenarios-decide`      | Scenarios E4.2, E4.4, E4.7, E4.9, E4.10 (card failures), E4.11 (C3 on today's calls); no code                                                                      | —                                                                                      |
| #425 | `lane-4/inbox-login` (draft)   | WP 4.2: non-owner login to claim notifications                                                                                                                     | **migration registration**; lane 2: pass its URL                                       |
| #427 | `lane-4/public-summary`        | WP 4.9: public summary of offers and this week's capacity (C8)                                                                                                     | lane 5 to use it; the decision record needs a migration (decision 5)                   |
| #428 | `lane-4/packet-spend-line`     | WP 4.13: "This month · $5 of your $60 limit" under Send request                                                                                                    | copy review (`spendThisMonth`)                                                         |
| #429 | `lane-4/mode-eligibility`      | WP 4.5: who can ask, settable on an offer, with its form; the fan's screen greys out offers its access does not include (T-07)                                     | copy review (`modeMembersOnly` and the form's labels)                                  |

Next, unblocked: lane 5's tickets for me, which are the owner calls for request-status and due notices, and the share card's grant id. Then the public summary saying which offers are for members, once #427 and #429 are merged.

Blocked on:

- **The founder:**
  - the five decisions in `lane-4-decisions.md` (#418);
  - three copy reviews (#423, #428, #429);
  - one existing rule to confirm (#429): access is checked when the fan asks, not when Maya accepts;
  - WP 4.12's copy, with lane 6.
- **The integrator:** migration slots for #410 and #425; the `server.ts` wiring for #416, including an `error` listener on the inbox pool.
- **Lane 3:** the `afterHumanReply` hook (C3) for automatic delivery (WP 4.4).
- **The founder's Stripe test keys:** WP 4.7 (E4.13).
- **Lanes 1 and 7:** WP 4.8 (native handoff, E4.14).
- **W8's denial port:** WP 4.11 (earnings). **Store accounts:** WP 4.10.

Scenarios, all on the lane 4 stack with the fake processor, 2026-10-15. Run `node tests/scenarios/lane-4/stack.mjs up --no-web --ack-only`, then `node tests/scenarios/lane-4/run.mjs`.

- **Pass:**
  - E4.1, E4.2, E4.4, E4.7;
  - E4.3, including an outage of the inbox login (#416);
  - E4.5, including refund failures;
  - E4.6;
  - E4.8, except the refund counting rule;
  - E4.9, except refunds and slots, and including the public summary;
  - E4.10: lost answers, outages, a busy account and card declines;
  - E4.11 on today's calls;
  - E4.12, including the guard and who can ask (#429).
- **Waiting on a decision:** E4.8 after a refund (decision 1); E4.9, whether a refund frees a slot (decision 2).
- **Not run:** E4.13 (needs the keys); E4.14 (needs lanes 1 and 7).

Findings so far (all fixed or reported in the PRs above):

- Without the guard, a rewritten capture row made the executor capture another fan's hold, with nothing in the ledger (#410).
- A refund the processor reported as failed was never tried again (#421).
- The web checkout made a second request and a second hold when a fan re-entered the card after a lost answer. Seen in the browser (#423).
- Recovery of a lost hold gave up in an account with more than 1,000 payments (#423).
- On `main` an offer's eligibility could not be set: the strict mode command refused the field (#429).
- The scheduler stopped finishing requests when its notification claim failed, and it crashed when its database connections were closed (#416, third commit). The trigger here: the local stack gives every login role a new password on `up`.
- The API contract refuses Stripe's own test payment-method names (`pm_card_visa`). The scripted Stripe run (WP 4.7) must create real `pm_` ids first.
- The Stripe SDK retries once with the same idempotency key on a connection reset, even with `maxNetworkRetries: 0`.
- Team replies are unavailable on the development stack (`503 scope_denial_unconfigured`).
- A new database function is executable by PUBLIC by default. That changes the usage-expiry catalogue pin and stops the backend from starting, so lane 4's migrations revoke it.

Ports and containers:

- 56440 to 56445: the stack, with the fake processor on 56444 and notifications on 56445.
- The scheduler side process: `tests/scenarios/lane-4/scheduler.mjs`.
- Container `qelvora-lane4-postgres`, volume `qelvora-lane4-pgdata`.

Tickets to other lanes:

- **Integrator, `server.ts`:**
  - compose `createDevelopmentCommerceRecovery` and mount `createStripeInboxRouter` before `express.json` (#416);
  - give the #425 login's pool an `error` listener;
  - register #410 and #425 and regenerate the catalogue pins.
- **Lane 3, `ConversationService.humanReply`:** an optional `afterHumanReply(client, scope, message)` hook inside its transaction, so a reply delivers its one open written commitment atomically (C3, #418).
- **Lane 1:**
  - an operations case or console list for money escalations (`refund_escalated` events, `resolution_required` commitments) (#421);
  - optionally, a distinct `signed_act_expired` code (C3).
- **Lane 2:** pass `COMMERCE_INBOX_DATABASE_URL` for #425's login to the scheduler's host. The stack resets every login role's password on `up`, so the URL has to come from the stack.
- **Lane 5:**
  - the request-status notices wait on lane 4's owner calls; the scheduler writes the `hold_released`, `refunded` and `commitment_resolution` events they would be made from;
  - the public summary (#427) is ready to use.
- **Lane 6 (Studio offers):** the mode command takes an optional `eligibility: [] | ["request"]`; leaving it out keeps the current value (#429).
- **Lane 7:** the `modeMembersOnly` copy is there if the phone apps show offers (#429).

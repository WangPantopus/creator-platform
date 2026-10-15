# Lane 4: Money status

Updated: 2026-10-15, by the lane 4 session

Working on: WP 4.2, the scheduler and webhook on the development host (expiry, refunds and recovery
with nobody tapping).

Done (open, not merged):

- #408 `lane-4/scenario-runner`: the scenario runner, the fake card processor and the invariant
  sweep. Merge first; every later lane 4 scenario uses it.
- #410 `lane-4/capture-guard` (draft): WP 4.1, the database guard for capture. **Needs migration
  registration** (`apps/backend/src/modules/commerce/schema-capture-guard.sql`). Its scenario file
  needs #408.

Next: WP 4.2 (scheduler and webhook), WP 4.3 (refund retry and escalation), WP 4.4 (accept-and-send,
contract C3, published early for lane 6), then 4.5, 4.6, 4.12 and 4.13.

Blocked on: the integrator for #410's migration slot. Later: Stripe test keys (WP 4.7), lanes 1 and
7 (WP 4.8), the founder's rule for how a refunded payment counts against the monthly limit (WP 4.3),
the founder's INV-22 review of one signature for accept and deliver (WP 4.4).

Scenarios (lane 4 stack with the fake processor; re-run with
`node tests/scenarios/lane-4/run.mjs` after `node tests/scenarios/lane-4/stack.mjs up --no-web --ack-only`):

- E4.1 happy path: pass, 2026-10-15 (with and without the guard).
- E4.12 who may do what: 12/12 with the guard applied by hand; 10/12 without it (steps 8 and 9, the
  database accepting a capture row for an unaccepted request, are the WP 4.1 defect).
- E4.12 capture guard in depth (`e4-12-capture-guard.mjs`, in #410): 8/8 with the guard; 4/8
  without it.
- E4.2 to E4.11, E4.13, E4.14: not run yet.

Findings so far:

- Without the guard, an accepted request's capture row rewritten to name another fan's hold (under a
  fresh key) made the executor capture that fan's money, with nothing in the ledger. Seen on the
  lane 4 stack; closed by #410.
- The API contract refuses Stripe's own test payment-method names (`pm_card_visa`):
  `paymentMethodId` must be `pm_` plus letters and digits. The scripted Stripe run (WP 4.7) has to
  create real `pm_` ids first.

Ports and containers: 56440 to 56444 (the stack, plus the fake processor on 56444). Container
`qelvora-lane4-postgres`, volume `qelvora-lane4-pgdata`.

Tickets to other lanes: none yet.

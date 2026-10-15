# Lane 4: Money status

Updated: 2026-10-15, by the lane 4 session

Working on: the scenario runner and invariant sweep (`lane-4/scenario-runner`), then WP 4.1, the
database guard for capture (`lane-4/capture-guard`, needs a migration slot).

Done: nothing merged yet.

Next: WP 4.1 (guard migration), WP 4.2 (scheduler and webhook on the development host), WP 4.3
(refund retry and escalation), WP 4.4 (accept-and-send, contract C3, published early for lane 6),
then 4.5, 4.6, 4.12 and 4.13.

Blocked on: nothing yet. Later: Stripe test keys (WP 4.7), lanes 1 and 7 (WP 4.8), the founder's
rule for how a refunded payment counts against the monthly limit (WP 4.3), and the founder's INV-22
review of one signature for accept and deliver (WP 4.4).

Scenarios (lane 4 stack with the fake processor; re-run with
`node tests/scenarios/lane-4/run.mjs` after `node tests/scenarios/lane-4/stack.mjs up --no-web --ack-only`):

- E4.1 happy path: pass, 2026-10-15.
- E4.12 who may do what: 10 of 12 steps pass, 2026-10-15. Steps 8 and 9 fail on purpose until WP
  4.1 lands: the database accepts a capture row for an unaccepted request, from the runtime login
  and from the owner.
- E4.2 to E4.11, E4.13, E4.14: not run yet.

Ports and containers: 56440 to 56444 (the stack, plus the fake processor on 56444). Container
`qelvora-lane4-postgres`, volume `qelvora-lane4-pgdata`.

Tickets to other lanes: none yet.

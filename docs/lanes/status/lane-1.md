# Lane 1: Identity and trust status

Updated: 2026-10-15, by the lane 1 session (Claude Opus 5.5)

Working on: WP 1.1, the option D sign-in decision pack (`lane-1/signin-decision-pack`).

Done: nothing merged yet.

Next: WP 1.4 (publish contract C1 and a stub server for lanes 5, 6 and 7), then WP 1.7
(deletion completeness, raised by lane 7's ticket), then WPs 1.5 and 1.6. WP 1.2 starts only
after the founder answers the three questions in the decision pack.

Blocked on:

- The founder's three answers (sign-in option, 18+ method, account id):
  [decision pack, section 14](lane-1-signin-decision-pack.md#14-your-three-answers).
- Real Apple and Google tokens need the founder's Apple and Google client ids and the domain
  (Q09); until then the scenarios use a fake ID-token issuer on port 56414.

Scenarios: none yet (WP 1.1 is documents only).

Tickets to other lanes: none yet.

Environment: the one-command stack runs as `node infra/local/stack.mjs up --lane 1 --provider
anthropic --env W2_SMALL_MODEL=claude-sonnet-5-5 --growth --no-web` (ports 56410 to 56419,
container `qelvora-lane1-postgres`).

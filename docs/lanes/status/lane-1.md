# Lane 1: Identity and trust status

Updated: 2026-10-15, by the lane 1 session (Claude Opus 5.5)

Working on: WP 1.7, deletion and export completeness (`lane-1/deletion-completeness`), raised
by lane 7's ticket.

Done (open, not merged):

- WP 1.1, the option D sign-in decision pack: #406 (`lane-1/signin-decision-pack`).
- WP 1.4, contract C1 and its stub server: #407 (`lane-1/c1-contract`). Lanes 5, 6 and 7 can
  build against `tests/scenarios/lane-1/c1-stub.mjs` now.

Next: WP 1.7, then WP 1.5 (signing fixes) and WP 1.6 (ops console and the Note-reply queue).
WP 1.2 starts only after the founder answers the three questions in the decision pack.

Blocked on:

- The founder's three answers (sign-in option, 18+ method, account id):
  [decision pack, section 14](lane-1-signin-decision-pack.md#14-your-three-answers).
- Real Apple and Google tokens need the founder's Apple and Google client ids and the domain
  (Q09); until then the scenarios use the stub's fake ID-token issuer.

Scenarios:

- C1 stub, 2026-10-15: 32 of 32 pass, rate limit 2 of 2 pass. Re-run: stack up, then
  `C1_RATE_LIMIT=1000 node tests/scenarios/lane-1/c1-stub.mjs &` and
  `node tests/scenarios/lane-1/c1-check.mjs` (see #407 for the rate case).
- E1.1 to E1.11: not run yet.

Tickets to other lanes:

- Integrator, `packages/api/src/schemas.ts`: with WP 1.2, `IdentityCapabilitiesSchema.mode` gains
  `"qelvora"` and a `providers` list, and `IdentityContinueSchema` gains `provider` (#407).
- Lane 7, `FanShell.kt:525` and `W3FanFeatures.kt:802`: "Signed in with Pantopus" is shown for
  every non-development mode; wrong under option D (#407).

Environment: the one-command stack runs as `node infra/local/stack.mjs up --lane 1 --provider
anthropic --env W2_SMALL_MODEL=claude-sonnet-5-5 --growth --no-web` (ports 56410 to 56419,
container `qelvora-lane1-postgres`). The C1 stub uses port 56414.

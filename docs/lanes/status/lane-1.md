# Lane 1: Identity and trust status

Updated: 2026-10-15, by the lane 1 session (Claude Opus 5.5)

Working on: nothing in flight. Next is WP 1.3 (web sign-in pages and onboarding).

Done (open, not merged):

- WP 1.1, the option D sign-in decision pack: #406 (`lane-1/signin-decision-pack`).
- WP 1.4, contract C1 and its stub server: #407 (`lane-1/c1-contract`). Web sign-in moved to
  `/v1/identity/web/start` and `/web/complete` while building WP 1.2.
- WP 1.2, the Qelvora sign-in backend (Apple and Google, the 18+ gate): #431
  (`lane-1/sign-in-backend`, stacked on #407). Founder confirmed option D, the 18+ method and a
  Qelvora-specific id on 2026-10-15. Pending migration `pending-qelvora-sign-in.sql`, to register.
- WP 1.7 (lane 1 part), identity and media finish a fan's deletion, plus the findings for every
  other domain: #409 (`lane-1/deletion-completeness`). E1.8 still fails on lanes 3, 4 and 5.

Next: WP 1.3 (web sign-in pages, the age screen, onboarding), then deletion with option D once
#409 merges (remove provider identities, revoke Apple's token, export the new tables), then WP 1.5
and WP 1.6.

Blocked on:

- Counsel's confirmation of the 18+ method, and approval of the age screen's copy (WP 1.3).
- The founder's deletion decisions D1 to D4 ([deletion findings, section 4](lane-1-deletion.md)
  on #409): creator signature retention, sign-in after deletion, how long the redacted fan record
  is kept, and Q16.
- Real Apple and Google tokens need the founder's Apple and Google client ids and the domain
  (Q09); until then the scenarios use `tests/scenarios/lane-1/fake-provider.mjs`.
- A Qelvora account cannot open a conversation on a development host (lane 3's provider policy),
  so "lands in the thread" is not shown yet (ticket to lane 3).

Scenarios:

- C1 stub, 2026-10-15: 32 of 32 pass, rate limit 2 of 2 pass. Re-run: stack up, then
  `C1_RATE_LIMIT=1000 node tests/scenarios/lane-1/c1-stub.mjs &` and
  `node tests/scenarios/lane-1/c1-check.mjs` (see #407 for the rate case).
- E1.8, 2026-10-15: `e1-8-delete.mjs` 14 pass, 3 fail (lanes 3, 4, 5), 2 not run (identity waits);
  `e1-8-edges.mjs` 16 of 16. Re-run on a fresh stack, see #409.
- E1.1 to E1.4, 2026-10-15, on the final code of #431: E1.1 40 of 40, E1.2 28 of 28, E1.3 13 pass
  and 2 not run (in-flight revocation; web CSRF, which is WP 1.3), E1.4 7 of 7. Needs the fake
  provider, the stack with `QELVORA_SIGN_IN` and the migration with locally regenerated pins; see #431.
- E1.5 to E1.7, E1.9 to E1.11: not run yet.

Tickets to other lanes:

- Lane 3, `modules/conversation/privacy.ts`: run without a recordings adapter when none exist;
  blocks conversation, agent and trust for export and delete (#409).
- Lane 4, `modules/commerce/operations.ts`: deletion per Q16 (#409).
- Lane 5, `modules/content/privacy.ts`: a fan's Note replies and thanks; `modules/growth/lifecycle.ts`:
  conversation-scope and creator-scope deletion (#409).
- Integrator: register `pending-qelvora-sign-in.sql` and regenerate the pins (reach diff in #431);
  compose a Qelvora host (`IDENTITY_ADAPTER=qelvora` in `config.ts`, `QelvoraSignIn` as the identity
  in `server.ts`); a trusted-proxy setting so the start limit sees the client's address (#431).
- Lane 3, the development provider policy: Qelvora accounts get `providers_unconfigured`; staging
  and the exit demo need a verified policy or an allowance for fake-provider accounts (#431).
- Integrator, `packages/api/src/schemas.ts`: with WP 1.2, `IdentityCapabilitiesSchema.mode` gains
  `"qelvora"` and a `providers` list, and `IdentityContinueSchema` gains `provider` (#407).
- Lane 7, `FanShell.kt:525` and `W3FanFeatures.kt:802`: "Signed in with Pantopus" is shown for
  every non-development mode; wrong under option D (#407).

Environment: the one-command stack runs as `node infra/local/stack.mjs up --lane 1 --provider
anthropic --env W2_SMALL_MODEL=claude-sonnet-5-5 --growth --no-web` (ports 56410 to 56419,
container `qelvora-lane1-postgres`). The fake Apple and Google provider uses port 56414, the C1
stub 56415.

# Lane 1: Identity and trust status

Updated: 2026-10-15, by the lane 1 session (Claude Opus 5.5)

Working on: nothing in flight. WP 1.6 continues once the founder answers P1, P2 and R1.

Done (open, not merged):

- WP 1.1, the option D sign-in decision pack: #406 (`lane-1/signin-decision-pack`).
- WP 1.4, contract C1 and its stub server: #407 (`lane-1/c1-contract`). Web sign-in moved to
  `/v1/identity/web/start` and `/web/complete` while building WP 1.2.
- WP 1.2, the Qelvora sign-in backend (Apple and Google, the 18+ gate): #431
  (`lane-1/sign-in-backend`, stacked on #407). Founder confirmed option D, the 18+ method and a
  Qelvora-specific id on 2026-10-15. Pending migration `pending-qelvora-sign-in.sql`, to register.
- WP 1.3, web sign-in pages (Apple and Google, the age screen, the adults-only page, a fresh
  sign-in for creator passkeys): #432 (`lane-1/web-sign-in`, stacked on #431). Founder approved
  the wording on 2026-10-15.
- WP 1.5, signing fixes: the shared signing panel recovers when a publication is refused; decisions
  on recovery and Android 8 and 9 in `lane-1-signing.md`: #437 (`lane-1/signing-fix`, on main).
- WP 1.5, a lost passkey retires and past signatures stay valid; a compromised one revokes (founder,
  2026-10-15); the second-passkey prompt: #439 (`lane-1/passkey-retirement`, stacked on #437).
  Pending migration `pending-passkey-retirement.sql`; register with the pull request.
- WP 1.6 (first part), the ops console proven end to end; reviewers cannot review their own cases;
  stuck effects show why; findings and decisions in `lane-1-ops.md`: #440 (`lane-1/ops-console`, on
  main).
- WP 1.7 (lane 1 part), identity and media finish a fan's deletion, plus the findings for every
  other domain: #409 (`lane-1/deletion-completeness`). E1.8 still fails on lanes 3, 4 and 5.

Next: WP 1.6 second part after the founder's answers (automatic allowing of clean Note replies,
lifting a pause), then deletion with option D once #409 merges.

Blocked on:

- Counsel's confirmation of the 18+ method, and the policy page for younger people (WP 1.9) that
  the adults-only page should link to.
- The founder's ops decisions in `lane-1-ops.md` (#440): P1 (open paid requests on a pause), P2
  (lifting a pause), R1 (when a Note reply is clean), O1 (supervisor-wide audit wording), O2
  (adding ops reviewers).
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
- Web (#432), 2026-10-15, in system Chrome: `e1-web-sign-in.mjs` 18 of 18 (E1.1 to E1.4 in the
  browser), `e1-5-passkey-web.mjs` 8 of 8 (E1.5 registration, fresh sign-in, a second device).
- WP 1.5 (#437), 2026-10-15: the stuck Note reproduced and recovered with lane 6's patch; the
  signing panel's refused-publication case fixed and its lost-answer case unchanged (scripts
  `e1-5-pending-publication.mjs`, `e1-5-refused-publish.mjs`).
- Key loss (#439), 2026-10-15: `e1-5-key-loss.mjs` 15 of 15 (lost retires, past Notes valid, a
  retired key refused, fresh proof, compromised revokes), twice.
- E1.6 (#440), 2026-10-15: `e1-6-ops.mjs` 24 pass, pause completion fails (lane 4), unpause not
  run; `e1-6-console.mjs` 8 of 8.
- E1.5 signing a Note end to end with a Qelvora creator, E1.7, E1.9 to E1.11: not run yet.

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
- Lane 4: settle a paused creator's open paid requests (`settleDeparture`); a pause never resolves
  without it (#440).
- Lane 3: "resume" for a paused agent; and a creator's trust action times out while their AI holds
  the profile row in a generation transaction (#440).
- Integrator: register `pending-passkey-retirement.sql` with #439 (T-34 needs the column).
- Lane 6, `features/studio/notes/Compose.tsx`: clear the pending publication when a retry is refused
  with `signed_act_required` (verified patch in `lane-1-signing.md`, #437).
- Integrator, `config/navigation.json`: exempt `studio/setup` from the fan-handle step (#432).
- Lane 2: the edge must set `X-Forwarded-For` itself for the sign-in start limit (#432).
- Integrator, `packages/api/src/schemas.ts`: with WP 1.2, `IdentityCapabilitiesSchema.mode` gains
  `"qelvora"` and a `providers` list, and `IdentityContinueSchema` gains `provider` (#407).
- Lane 7, `FanShell.kt:525` and `W3FanFeatures.kt:802`: "Signed in with Pantopus" is shown for
  every non-development mode; wrong under option D (#407).

Environment: the one-command stack runs as `node infra/local/stack.mjs up --lane 1 --provider
anthropic --env W2_SMALL_MODEL=claude-sonnet-5-5 --growth --no-web` (ports 56410 to 56419,
container `qelvora-lane1-postgres`). The fake Apple and Google provider uses port 56414, the C1
stub 56415.

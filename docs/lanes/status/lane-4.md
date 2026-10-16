# Lane 4: Money status

Updated: 2026-10-15 (evening, Pacific time), by the lane 4 session

Working on: nothing in flight. Everything is in the open pull requests below.

Open pull requests:

| PR   | Branch                             | What                                                                                                                                                                                                                        | Needs                                                                                   |
| ---- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| #425 | `lane-4/inbox-login` (draft)       | WP 4.2: the non-owner login that claims processor notifications                                                                                                                                                             | **migration registration** (a new login role)                                           |
| #447 | `lane-4/status-refresh`            | This status file                                                                                                                                                                                                            | —                                                                                       |
| #448 | `lane-4/share-grant-id`            | Lane 5's ticket: the share call returns the grant id growth's `createShare` takes                                                                                                                                           | —                                                                                       |
| #449 | `lane-4/summary-members-only`      | WP 4.9: the public summary marks members-only offers; its headline describes an offer any fan can ask for                                                                                                                   | lane 5 to show `modeMembersOnly`                                                        |
| #450 | `lane-4/inbox-outage-fresh`        | `e4-3-inbox-outage` makes its own inbox login (the integrator's ticket)                                                                                                                                                     | —                                                                                       |
| #459 | `lane-4/share-card-owners` (draft) | Lane 5's ticket: share cards. Commerce answers growth's `shareSource` (the fan's session) and `shareStatus` (no session, through one narrow definer function); proven through growth's real routes                          | **migration registration** and five regenerated catalogue pins; review by lanes 1 and 3 |
| #453 | `lane-4/request-notices`           | Lane 5's ticket: request notices recorded in growth's notice table, handed to growth and withdrawn; one commitment reminder to the creator; proven end to end                                                               | production composition waits on the two authorities below                               |
| #463 | `lane-4/settle-departure`          | Lane 1's ticket (G1): `settleDeparture`. A paused creator's requests not yet accepted are released (nothing charged), accepted ones keep their deadline; the pause case resolves; proven through lane 1's real ops decision | integrator: compose it in `server.ts` (P1 confirmed)                                    |

Merged on main: #408, #410, #416, #418, #421, #423, #424, #427, #428, #429. #410's migration was registered through #442.

| PR   | Branch                      | What                                                                                                                           |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| #408 | `lane-4/scenario-runner`    | Scenario runner, fake card processor, invariant sweep; E4.1, E4.12; this status file                                           |
| #410 | `lane-4/capture-guard`      | WP 4.1: database guard for capture (migration registered by #442)                                                              |
| #416 | `lane-4/recovery-scheduler` | WP 4.2: scheduler and processor notifications on the development host; an inbox outage no longer stops or crashes it           |
| #418 | `lane-4/c3-contract`        | Contract C3 draft (accept and send), the founder's decision pack                                                               |
| #421 | `lane-4/refund-retry`       | WP 4.3: refund failures retried, reported, never dropped                                                                       |
| #423 | `lane-4/payment-hygiene`    | WP 4.6: one hold per request on retry (web), minimum price, bounded recovery scan                                              |
| #424 | `lane-4/scenarios-decide`   | Scenarios E4.2, E4.4, E4.7, E4.9, E4.10 (card failures), E4.11 (C3 on today's calls)                                           |
| #427 | `lane-4/public-summary`     | WP 4.9: public summary of offers and this week's capacity (C8)                                                                 |
| #428 | `lane-4/packet-spend-line`  | WP 4.13: "This month · $5 of your $60 limit" under Send request                                                                |
| #429 | `lane-4/mode-eligibility`   | WP 4.5: who can ask, settable on an offer, with its form; the fan's screen greys out offers its access does not include (T-07) |

Blocked on:

- **The integrator:**
  - compose the commerce scheduler and its notification route in `server.ts` (#416), and give the #425 login's pool an `error` listener. Until then the stock host expires and refunds requests on its own only while the development side process runs;
  - register #425's migration.
- **The founder:**
  - the five decisions in `lane-4-decisions.md`: refunds and the monthly limit; refunds and weekly slots; one signature for accept and send; never placing a hold for a request that is already ending; whether expired requests count toward "usually decides in";
  - Stripe test keys (WP 4.7);
  - Q16, what happens to a fan's money records and open requests when the fan deletes their account (retention and refunds). Lane 1's deletion work waits on it, and so does the privacy registration that request notices need in production (#453);
  - when the commitment reminder fires: proposed as the smaller of 24 hours and a quarter of the delivery window (#453);
- **Lane 1 (W8):** a worker denial for commerce notices, so that a background publisher can check who may be told (#453).
- **Lane 3:** the `afterHumanReply` hook (C3), for automatic delivery (WP 4.4).
- **Lanes 1 and 7:** WP 4.8 (native handoff, E4.14).
- **W8's denial port:** WP 4.11 (earnings).
- **Store accounts:** WP 4.10.

Tickets received:

- **Lane 1 (#440, G1):** an ops pause needs lane 4's `settleDeparture` port. Done in #463; the founder confirmed P1 on 2026-10-15 (`lane-4-decisions.md`).
- **Lane 1 (#409):** commerce's part of a fan's deletion, in `modules/commerce/operations.ts`. Waits on the founder's Q16.
- **Lane 5:**
  - the owner calls for request-status and commitment-due notices: done in #453; production composition waits on W8 and Q16;
  - the share card's grant id: done in #448; the share card's two owner answers: done in #459, which waits on registration and review.
- **The integrator:** `e4-3-inbox-outage` needs the inbox login that only `e4-6-webhooks` creates. Fixed in #450.

Scenarios, all on the lane 4 stack with the fake processor. Run `node tests/scenarios/lane-4/stack.mjs up --no-web --ack-only`, then `node tests/scenarios/lane-4/run.mjs`. The integrator reports all 20 scenario files passing on the registered wave, each with a clean 9-check sweep.

- **Pass:**
  - E4.1, E4.2, E4.4, E4.6, E4.7, E4.11 (on today's calls);
  - E4.3, including an outage of the inbox login and the request notices (#453);
  - E4.5, including refund failures;
  - E4.8, except the refund counting rule;
  - E4.9, except refunds and slots, and including the public summary;
  - E4.10: lost answers, outages, a busy account and card declines;
  - E4.12, including the guard and who can ask.
- **Waiting on a decision:** E4.8 after a refund (decision 1); E4.9, whether a refund frees a slot (decision 2).
- **Not run:** E4.13 (needs the keys); E4.14 (needs lanes 1 and 7).

Findings (each fixed or reported in the pull requests above):

- Without the guard, a rewritten capture row made the executor capture another fan's hold, with nothing in the ledger (#410).
- A refund the processor reported as failed was never tried again (#421).
- The web checkout made a second request and a second hold when a fan re-entered the card after a lost answer. Seen in the browser (#423).
- Recovery of a lost hold gave up in an account with more than 1,000 payments (#423).
- An offer's eligibility could not be set: the strict mode command refused the field (#429).
- The scheduler stopped finishing requests when its notification claim failed, and it crashed when its database connections were closed (#416). The trigger here: the local stack gives every login role a new password on `up`.
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
  - register #425;
  - register #459's migration, regenerate its five catalogue pins, and compose `createCommerceShareOwners` into growth's owners (the wiring is in `tests/scenarios/lane-4/share-host.mts`);
  - once W8's worker denial and the privacy registration exist, hand commerce's request notices to growth: `commerce.requestNotifications(scope, recipientAuthority, privacyRegistered, growth.notices)` pulled by `growth.relay` (#453);
  - compose `settleDeparture: createCommerceDeparture({ service, index })` into the development trust and the production agent domain (the wiring is in `tests/scenarios/lane-4/trust-host.mts`, #463);
  - add the founder's decision P1 (2026-10-15, `lane-4-decisions.md`) to the brief's decision log, which is not lane 4's file.
- **Lane 3:** review #459's reply check against `deliveredTextCommand`; sharing approved AI drafts or voice replies would need your signed-subject rules.
- **Lane 3, `ConversationService.humanReply`:** an optional `afterHumanReply(client, scope, message)` hook inside its transaction, so a reply delivers its one open written commitment atomically (C3, #418).
- **Lane 1:**
  - a W8 worker denial for commerce notices (`creator, fan, recipient`), in the pattern of the publication and media worker denials (#453);
  - the production work index needs `departureScopes(creatorId)` for `settleDeparture` (#463);
  - a W8 public creator denial, so that the public summary (C8) stops listing a paused creator's offers;
  - review #459's signature checks against `matchesThreadAct` (and #439), and add a W8 negative authority for public share cards;
  - an operations case or console list for money escalations (`refund_escalated` events, `resolution_required` commitments) (#421);
  - optionally, a distinct `signed_act_expired` code (C3).
- **Lane 2:** pass `COMMERCE_INBOX_DATABASE_URL` for #425's login to the scheduler's host. The stack resets every login role's password on `up`, so the URL has to come from the stack.
- **Lane 5:**
  - the public summary (`GET /v1/commerce/creators/:creatorId/summary`, #427) is ready to use, and #449 marks members-only offers (`membersOnly`);
  - request notices now arrive as your stand-in described (#453). An entry for `commitment_due` in `growth/owners.ts` would let a signed-in creator get commerce's live answer. Without it, the recorded state is used, which works;
  - share cards work through your routes once #459 is composed. Finding: `growth.share` is unique on `(grant_id, source_version)`, so after a fan hides their handle no new card can be made for the same reply (409); decide whether that is intended.
- **Lane 6 (Studio offers):** the mode command takes an optional `eligibility: [] | ["request"]`; leaving it out keeps the current value (#429).
- **Lane 7:** the `modeMembersOnly` copy is there if the phone apps show offers (#429).

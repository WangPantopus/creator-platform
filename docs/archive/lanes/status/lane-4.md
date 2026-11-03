# Lane 4: Money status

Updated: 2026-10-16 (Pacific time, afternoon), by the lane 4 session

Working on: nothing in flight. On the afternoon of 2026-10-16 the founder asked lane 4 to merge its pull requests when ready. Twelve were merged as one rehearsed batch (#476, #448, #449, #450, #467, #469, #470, #474, #484, #485, #486, #463), and #453 follows once its CI is green: main merged into its branch, with its conflict with #463 resolved. The decisions are recorded in [`lane-4-decisions.md`](lane-4-decisions.md). What is left waits on migration registration (#425, #459, #487), Stripe test keys, Q16 (a legal retention period) or other lanes. A new session starts at [`lane-4-handoff.md`](lane-4-handoff.md).

Open pull requests:

| PR   | Branch                             | What                                                                                                                                                                                        | Needs                                                                                   |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| #425 | `lane-4/inbox-login` (draft)       | WP 4.2: the non-owner login that claims processor notifications                                                                                                                             | **migration registration** (a new login role)                                           |
| #447 | `lane-4/status-refresh`            | This status file                                                                                                                                                                            | —                                                                                       |
| #453 | `lane-4/request-notices`           | Lane 5's ticket: request notices recorded in growth's notice table, handed to growth and withdrawn; one commitment reminder to the creator. Main merged in, the conflict with #463 resolved | green CI, then merge; production composition waits on the two authorities below         |
| #510 | `lane-4/departure-history`         | Scenarios: `e4-3-departure` counts every accepted request Maya still owes, so it passes on a used stack (found while verifying the merges)                                                  | green CI, then merge                                                                    |
| #459 | `lane-4/share-card-owners` (draft) | Lane 5's ticket: share cards. Commerce answers growth's `shareSource` and `shareStatus` through one narrow definer function                                                                 | **migration registration** and five regenerated catalogue pins; review by lanes 1 and 3 |
| #487 | `lane-4/decides-in`                | WP 4.9, decision 5: the public summary's "{name} usually decides in {range}" from the creator's decision record                                                                             | **migration registration** and regenerated catalogue pins                               |

Merged on main: #408, #410, #416, #418, #421, #423, #424, #427, #428, #429; and on 2026-10-16, at the founder's request, #448, #449, #450, #463, #467, #469, #470, #474, #476, #484, #485 and #486. #410's migration was registered through #442.

| PR   | Branch                          | What                                                                                                                           |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| #408 | `lane-4/scenario-runner`        | Scenario runner, fake card processor, invariant sweep; E4.1, E4.12; this status file                                           |
| #410 | `lane-4/capture-guard`          | WP 4.1: database guard for capture (migration registered by #442)                                                              |
| #416 | `lane-4/recovery-scheduler`     | WP 4.2: scheduler and processor notifications on the development host; an inbox outage no longer stops or crashes it           |
| #418 | `lane-4/c3-contract`            | Contract C3 draft (accept and send), the founder's decision pack                                                               |
| #421 | `lane-4/refund-retry`           | WP 4.3: refund failures retried, reported, never dropped                                                                       |
| #423 | `lane-4/payment-hygiene`        | WP 4.6: one hold per request on retry (web), minimum price, bounded recovery scan                                              |
| #424 | `lane-4/scenarios-decide`       | Scenarios E4.2, E4.4, E4.7, E4.9, E4.10 (card failures), E4.11 (C3 on today's calls)                                           |
| #427 | `lane-4/public-summary`         | WP 4.9: public summary of offers and this week's capacity (C8)                                                                 |
| #428 | `lane-4/packet-spend-line`      | WP 4.13: "This month · $5 of your $60 limit" under Send request                                                                |
| #429 | `lane-4/mode-eligibility`       | WP 4.5: who can ask, settable on an offer, with its form; the fan's screen greys out offers its access does not include (T-07) |
| #448 | `lane-4/share-grant-id`         | Lane 5's ticket: the share call returns the grant id growth's `createShare` takes                                              |
| #449 | `lane-4/summary-members-only`   | WP 4.9: the public summary marks members-only offers                                                                           |
| #450 | `lane-4/inbox-outage-fresh`     | `e4-3-inbox-outage` makes its own inbox login                                                                                  |
| #463 | `lane-4/settle-departure`       | Lane 1's ticket (G1): `settleDeparture` for a paused creator's open requests (P1)                                              |
| #467 | `lane-4/more-info-question`     | WP 4.12: a separate `question` for "Ask for more information"; `text` still read for older clients                             |
| #469 | `lane-4/summary-paused-creator` | WP 4.9: the public summary hides a paused creator's offers (lane 1's check)                                                    |
| #470 | `lane-4/scenario-offers-retire` | Scenarios retire the offers they make                                                                                          |
| #474 | `lane-4/approved-copy`          | WP 4.12: the copy the founder approved (decisions 6 and 7)                                                                     |
| #476 | `lane-4/deadline-one-hour`      | WP 4.9: a 1-hour offer reads "1 hour" (summary and web)                                                                        |
| #484 | `lane-4/ending-no-hold`         | Decision 4: no new hold for a request that is already ending                                                                   |
| #485 | `lane-4/refund-room`            | Decision 1: a refund gives its room under the monthly limit back                                                               |
| #486 | `lane-4/refund-slot`            | Decision 2: a request refunded because it was not delivered frees its weekly slot                                              |

Blocked on:

- **The integrator:**
  - compose the commerce scheduler and its notification route in `server.ts` (#416), and give the #425 login's pool an `error` listener. Until then the stock host expires and refunds requests on its own only while the development side process runs;
  - register #425's migration.
- **The founder:**
  - Stripe test keys (WP 4.7), through the approved secret channel;
  - Q16, what happens to a fan's money records and open requests when the fan deletes their account. Its retention period is a legal question, for counsel; lane 4 proposes a default for the product part in `lane-4-decisions.md`. Lane 1's deletion work waits on it, and so does the privacy registration that request notices need in production (#453);
  - every other decision was taken as the proposed default on 2026-10-16 (`lane-4-decisions.md`); veto any of them in its pull request;
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
  - E4.12, including the guard and who can ask;
  - E4.9 when ops pauses a creator (#469): the public summary hides her offers, reads like an unknown creator, answers 503 when lane 1's check cannot answer, and shows her offers again once the pause is lifted; a fan who blocked her reads her as unavailable (`e4-9-paused-creator`, run by its full name, then reset the stack);
  - E4.2 "Ask for more information" (#467): a question in its own field, blank and too long refused, one pending at a time, a repeat key and a race, wrong people, two rounds of answers, then the accept (`e4-2-more-info`).
- **Scenario data no longer builds up** once #470 lands: each scenario retires the offers it made. Before that, after about 20 runs on one stack `e4-9-public-summary` cannot find its own offer (the summary lists the 20 cheapest); pause the leftovers or reset the stack.
- **Decisions taken on 2026-10-16:** E4.8 after a refund (decision 1, `e4-8-refund-room`, #485); E4.9, a refund frees its slot (decision 2, `e4-9-refund-slot` and `e4-9-capacity` E4.9-6, #486); no hold for a request that is ending (decision 4, `e4-10-ending-no-hold`, #484); "usually decides in" (decision 5, `e4-9-decides-in`, #487); "1 hour" in the summary and on the web (`e4-9-public-summary` E4.9-12 and `e4-9-offer-hours-web`, #476).
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
- The Studio sent its reply draft as the question for "Ask for more information" (#467).
- The public summary listed a paused creator's offers and capacity (#469).
- On the development stack another creator gets 503 `scope_denial_unavailable`, not 403, on every one of Maya's Studio routes, reads included; nothing moves (#467, ticket to lane 1).
- At 320 px the request card's title and price line (`qv-meta`, no wrap) is wider than the window when an offer's title is long (#474, ticket to lane 6).
- The backend's `deadlinePhrase` (`modules/commerce/public-summary.ts`) said "1 hours" for a 1-hour offer, and so did the fan's two offer lists on the web (#476).
- A hold retry's lease (30 s) is shorter than the time an earlier try's call can still be in flight, so "the processor holds nothing" is only trusted five minutes after the release began (#484).
- `e4-8-limits` assumed fan three had no capture this month. After `e4-9-capacity` refunds one, the old rule still counted it, so the scenario failed on any stack that had run the suite before. Decision 1 removes that (#485).
- On a stack that refunded requests before #486, those requests still hold their (past) slots, and the sweep's S7 names their windows until a `reset`.

Ports and containers:

- 56440 to 56445: the stack, with the fake processor on 56444 and notifications on 56445.
- The scheduler side process: `tests/scenarios/lane-4/scheduler.mjs`.
- Container `qelvora-lane4-postgres`, volume `qelvora-lane4-pgdata`.

Tickets to other lanes:

- **Integrator:** register #487's migration (`schema-decision-record.sql`) and regenerate the catalogue pins it changes (its grants on `creator_profile` and `fan_profile`). #453 and #463 both added to `payments/development-work-index.ts` at the same two places; #463 merged first, and #453's branch now keeps both.
- **Integrator, `server.ts`:**
  - in production, pass the restoration-gated `holdPublicCreatorNegativeAuthority` as the public summary's check, the third argument of `commerceFeature(service, extended, publicCreator)` (`features.ts:56`); without it lane 1's plain check is used (#469);
  - compose `createDevelopmentCommerceRecovery` and mount `createStripeInboxRouter` before `express.json` (#416);
  - give the #425 login's pool an `error` listener;
  - register #425;
  - register #459's migration, regenerate its five catalogue pins, and compose `createCommerceShareOwners` into growth's owners (the wiring is in `tests/scenarios/lane-4/share-host.mts`);
  - once W8's worker denial and the privacy registration exist, hand commerce's request notices to growth: `commerce.requestNotifications(scope, recipientAuthority, privacyRegistered, growth.notices)` pulled by `growth.relay` (#453);
  - compose `settleDeparture: createCommerceDeparture({ service, index })` into the development trust and the production agent domain (the wiring is in `tests/scenarios/lane-4/trust-host.mts`, #463);
  - add the founder's decisions P1 (2026-10-15), 6 and 7 (2026-10-16, `lane-4-decisions.md`) to the brief's decision log, which is not lane 4's file.
- **Lane 3:** review #459's reply check against `deliveredTextCommand`; sharing approved AI drafts or voice replies would need your signed-subject rules.
- **Lane 3, `ConversationService.humanReply`:** an optional `afterHumanReply(client, scope, message)` hook inside its transaction, so a reply delivers its one open written commitment atomically (C3, #418).
- **Lane 1:**
  - a W8 worker denial for commerce notices (`creator, fan, recipient`), in the pattern of the publication and media worker denials (#453);
  - the production work index needs `departureScopes(creatorId)` for `settleDeparture` (#463);
  - the public summary (C8) must stop listing a paused creator's offers. Lane 1's check already exists on main: `trustPublicCreatorDenial()` (`modules/trust/scope-restriction.ts`, migration 0086) answers `denied` while a `pause_creator` or `revoke_license` restriction is active. Lane 4 uses it from the public summary (#469). Please confirm it is the authority for a creator's public commerce, and tell lane 4 before changing its meaning or signature;
  - another creator gets 503 `scope_denial_unavailable` instead of 403 on Maya's Studio routes on the development stack (W8 interactive denial behind the Studio's `content.role` check, `trust/scope-restriction.ts:91`); nothing moves, but the answer reads as an outage (#467);
  - review #459's signature checks against `matchesThreadAct` (and #439), and add a W8 negative authority for public share cards;
  - an operations case or console list for money escalations (`refund_escalated` events, `resolution_required` commitments) (#421);
  - optionally, a distinct `signed_act_expired` code (C3).
- **Lane 2:** pass `COMMERCE_INBOX_DATABASE_URL` for #425's login to the scheduler's host. The stack resets every login role's password on `up`, so the URL has to come from the stack.
- **Lane 5:**
  - the public summary (`GET /v1/commerce/creators/:creatorId/summary`, #427) is ready to use, and #449 marks members-only offers (`membersOnly`). After #469 it answers 404 `creator_unavailable` for a creator ops has paused (as for an unknown one), and 503 when lane 1's check cannot answer: show the page's own paused or unavailable state, not an error;
  - request notices now arrive as your stand-in described (#453). An entry for `commitment_due` in `growth/owners.ts` would let a signed-in creator get commerce's live answer. Without it, the recorded state is used, which works;
  - share cards work through your routes once #459 is composed. Finding: `growth.share` is unique on `(grant_id, source_version)`, so after a fan hides their handle no new card can be made for the same reply (409); decide whether that is intended.
- **Lane 6 (Studio offers):** the mode command takes an optional `eligibility: [] | ["request"]`; leaving it out keeps the current value (#429).
- **Lane 6 (WP 6.6, "Ask for more information"):** send `{ action: "more_info", question, version, idempotencyKey }` to `POST /v1/studio/{creatorId}/packets/{packetId}/decide`, and stop spreading the reply draft `text` into every decision (`features/studio/requests/PacketDetail.tsx:87`). Refusals: `question_required`, `question_pending`, `stale_request`, `decision_expired`, `authorization_expiring`, `idempotency_conflict` (403), and `invalid_request` (400, over 8,000 characters). While a second question waits, `fan_answer` is still the earlier answer. Full API in #467.
- **Lane 7:** the `modeMembersOnly` copy is there if the phone apps show offers (#429).
- **Lane 7 (decision 1, #485):** the Spending screens' headline should show what counts toward the limit, `exposure.captured − exposure.returned`, not `captured` (`CommerceFeature.swift`, `CommerceFeature.kt`). Both decoders ignore the new field until then.
- **Lane 3 (decision 1, #485):** the account page's "THIS MONTH … of your $60 limit" (`features/conversation/AccountScreen.tsx`) should show `exposure.captured − exposure.returned`.
- **Lane 5 (decision 5, #487):** the public summary's `reliability` reads "Maya usually decides in 6 to 40 hours" once the decision record is registered; show it beside the capacity line, and nothing (not `EtaLine`'s default) while it is `""`.
- **Lane 7:** the founder approved decision 6: show `declinedForAi` (with an "Ask {name}'s AI" action), the decline line and `moreInfoAnswerBy` on the request screens. The keys are in the generated copy once #474 lands; today both apps read "Hold released · nothing charged" for every released request (`CommerceFeature.swift`, `CommerceFeature.kt`, `outcome`).
- **Lane 6:** the request card's title and price line (`packages/ui-web` RequestStatus, `qv-meta`) does not wrap, so a long offer title makes a 320 px page scroll sideways (358 px with "WRITTEN REPLY (3 DAYS) · $50.00") (#474).

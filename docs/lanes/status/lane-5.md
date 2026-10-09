# Lane 5: Presence and reach status

Updated: 2026-10-08, by the lane 5 session
Working on: round 2. #365 (WP 5.1) is merged (`e28759a77`); #366 (WP 5.2a) is retargeted to main
and I merge it when its checks finish (founder's instruction). #372 (`lane-5/delivery-queue`) queues
one creator's deliveries and retries a failed one. This branch, `lane-5/note-mute-read` (a small
migration, below), is stacked on it. Owner notice snapshots (option A) follow on
`lane-5/notice-snapshots`.
Done: contract C4 ([details](lane-5-c4-note-reaction-delivery.md)); the thread-presence read
`GET /v1/content/{creatorId}/presence`; the creator-session fan-out of Note and reaction notices
with 500-recipient chunking, one creator's deliveries queued, and a failed delivery retried by the
same session; the notification owner for both; muted members left out; scenario host and scripts.
Next: option A (the snapshot table, engine side, and the two tickets), then 5.6, 5.7, 5.8, 5.4,
5.5, 5.9, 5.10, and 5.3 on a fake gateway.
Blocked on: nothing for my side of option A. Answers and request status will not fire until lanes 3
and 4 add their one call (tickets). 5.3 needs Apple and Google credentials.

## Scenarios (database on 56450, host on 56451, fake push gateway on 56453)

Re-run (from the repository root, with node on PATH): `sh tests/scenarios/lane-5/setup.sh` once,
then `sh tests/scenarios/lane-5/run-all.sh`. It resets the database and restarts the host before
each script; pass script names to run only some. `e5-4-known-gaps` is not in the default list.

| Script                  | Rows                                                                                                                                                                                                                                      | Result (2026-10-08)                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `e5-1-audience`         | E5.1 ★ who sees a Note: member, outsider, signed out, blocked, restricted, deleted, no thread, leaves, joins, tiers, mute, unknown creator                                                                                                | 13 of 13 pass                      |
| `e5-1-lifecycle`        | E5.1 ★ duplicate publish, edit, delete, wrong person, hostile text, paging and bad input                                                                                                                                                  | 6 of 6 pass                        |
| `e5-1-scale`            | E5.1 ★ 600 members and 20 outsiders; latency; reads keep working while five Notes are delivered to 600 members at once                                                                                                                    | 3 of 3 pass                        |
| `e5-2-reactions`        | E5.2 ★ react, privacy between fans, duplicate, race, pending reply, wrong person, deleted reply                                                                                                                                           | 7 pass, 1 not run (no undo exists) |
| `e5-4-note-notices`     | E5.3 ★ and E5.4 Notes: recipients (outsiders, blocked, deleted, restricted, muted), in-app list, push honesty, once per cause, silent edit, join and leave, blocked after the notice, failure and retry, withdrawn before send, unmute    | 9 of 9 pass                        |
| `e5-4-reaction-notices` | E5.2 ★ and E5.3 ★ reactions: who is told, push wording and privacy, once, withdrawn reply, denied fan                                                                                                                                     | 5 of 5 pass                        |
| `e5-4-chunks`           | E5.1 ★ and E5.4: 600 recipients become events of 500 and 100; after 100 mute, one event of exactly 500                                                                                                                                    | 3 of 3 pass                        |
| `e5-4-mute-function`    | E5.4 the Note mute projection: only the owning creator learns who muted; boundaries; nothing sent when missing; a team publisher cannot finish a Note                                                                                     | 5 of 5 pass                        |
| `e5-4-self-retry`       | E5.4: the denial check is missing while a Note is published; nobody is told; once it is back the creator's session retries by itself and tells the audience once; a failure that never clears stops after three retries (takes 3 minutes) | 2 of 2 pass                        |
| `e5-4-scheduled`        | E5.4: scheduled Note, early run, racing runs                                                                                                                                                                                              | 2 of 2 pass                        |
| `e5-3-quiet-hours`      | E5.3 ★ quiet hours read in each fan's own time zone; held push released later (DST edges not run: need a clock fake)                                                                                                                      | 2 of 2 pass                        |
| `e5-4-known-gaps`       | a reaction push survives a withdrawn reply                                                                                                                                                                                                | 0 of 1 pass (known)                |

## Wiring for the integrator (WP 5.2a)

`tests/scenarios/lane-5/host.mts` is the working wiring. In `apps/backend/src/server.ts`:

1. Before `configureGrowthForBackend`: `const late: { content?: ReturnType<typeof contentNoticeOwner> } = {}`.
   Add to its `owners`: `notificationState: composeNotificationOwners({ content: (e, r, c) =>
late.content ? late.content(e, r, c) : Promise.resolve({ retryable: true, available: false,
authorized: false, version: 0, creatorName: "", authorKind: "system", safePreview: "",
destination: "/notifications" }) })` (from `growth/owners.js` and `content/notices.js`).
2. In `composeContentHost({...})` add `notices: { relay: features.growth.relay }` when growth is on.
3. After `contentHost.bindContent(content.content)`:
   `late.content = contentNoticeOwner({ pool: runtime.pool, content: content.content })`.
4. Nothing for the trigger: `contentFeature` now drains the creator's pending effects after a
   publish, a reaction and a scheduled run, in her own session. One creator's deliveries run one
   after the other (a burst of publishes would otherwise start overlapping fan-outs that starve
   the connection pool her fans read through). There is no background worker for this yet, so a
   Note or reaction effect that failed for a passing reason (a lock timeout, a restart, the
   denial check briefly missing) is retried by the same session when its backoff is due, at
   most three times; after that the Studio's effects run finishes it. When a real worker with
   creator authority exists it should replace the in-session retry.

Until WP 5.3 gives growth a `DeliveryProvider`, a fan who turned push on has a delivery that
fails and retries to `dead`; fans with push off (the default) are unaffected.

## Tickets to other lanes

- **Integrator, migrations (one at a time, in your order):** register
  `apps/backend/src/modules/content/migrations/pending_w5_note_mute_read.sql` (the Note mute
  projection: one `SECURITY DEFINER` function `creator.content_note_muters`, a new no-login role
  `creator_content_mute` with column-level grants on `creator_profile` and `content_preference`, and
  one policy scoped to the creator the function has just proved the caller owns). Add the role to the
  role-custody checks if they list roles. Until it is registered, a Note's notices wait (fail closed)
  rather than reach someone who muted.
- **Integrator, `packages/api/src/openapi.ts`:** register `GET /v1/content/{creatorId}/presence`
  (operation `contentThreadPresence`, response `ContentThreadPresencePage`, query
  `ContentThreadPresenceQuery`) next to `contentList`. The component schemas are generated.
- **Lane 3 (web thread, `features/conversation/ConversationScreen.tsx` near line 1019):** render
  presence items with `authorLabel`, `audience.label` and the glyph instead of "Audience
  details unavailable", merged by time. Optionally call `ThreadPresence.read` from
  `ConversationService.read` so one request returns both.
- **Lane 7:** the same in both apps (`W3Message` has no audience field; these items do).
- **Lane 1 (`modules/trust/reply-review.ts`):** auto-allow clean replies. Until then no creator
  can react to anyone, because every reply waits for a human decision.
- **Lane 1:** an unknown creator is `403 audience_unavailable` on `GET /v1/content/{id}` and on
  `/presence` but `503 scope_denial_unavailable` on other guarded routes. Pick one.
- **Lane 2:** the stock host needs the later migration waves (restoration, privacy export,
  `0089` creator/fan denial); until the one-command stack lands, scenarios run on the base
  schema plus `0089` applied by hand to a disposable database.

## Decisions (founder, 2026-10-08)

1. **Answers, request status, commitment due: option A** (owner notice snapshots), from
   [the decision pack](lane-5-notification-owner-authority.md). In progress.
2. **A muted member is not pushed: the small migration.** Done in `lane-5/note-mute-read`
   (`modules/content/migrations/pending_w5_note_mute_read.sql`, needs the integrator's registration).
3. **Notes are rendered into the thread at read time**, not inserted as messages (the Domain Model's
   wording; the database would refuse per-fan signed copies). Confirmed.
4. **A new member sees the Notes posted before they joined** (current membership decides, as the
   existing Notes list does). Confirmed for the pilot; reversible.
5. **A reaction cannot be undone** in the pilot (the table is insert-only; each reaction already
   needs the creator's passkey). Confirmed.
6. **An edit to a published Note tells no one again**; Notes to followers or groups tell no one
   yet (followers need the reserved follow migration; groups need the original-recipient reader).
   Confirmed.

Still open and small: a reaction push can go out after the fan withdrew the reply (the worker
cannot read replies; the in-app list hides it). Kept as a failing case in
`tests/scenarios/lane-5/e5-4-known-gaps.mjs`; option A's snapshots can close it.

## What the scenarios do not prove

The host composes the real content, signing, audience, growth and denial code on a real
PostgreSQL with the development identity. It leaves out the later migration waves the stock
trust runtime needs, the reply reviewer, and the conversation and commerce hosts. Membership
purchases, creator verification, safety decisions, blocks and deletions are rows standing in for
lane 1 and 4 outcomes, named in `lib.mjs`. The push gateway is a recorder that stands in for
APNs and FCM, so device registration, token redaction, quiet hours and the real adapters are not
exercised. Nothing here ran on a phone, a browser or a real provider.

# Lane 5: Presence and reach status

Updated: 2026-10-08, by the lane 5 session
Working on: round 2. #365 (WP 5.1) is merged; #366 (WP 5.2a) is retargeted to main and I merge
it when its checks finish (founder's instruction). This branch, `lane-5/delivery-queue`, queues one
creator's deliveries and retries a failed one. The mute fix (`lane-5/note-mute-read`, a small
migration) is stacked on it; owner notice snapshots (option A) follow.
Done: contract C4 ([details](lane-5-c4-note-reaction-delivery.md)); the thread-presence read
`GET /v1/content/{creatorId}/presence`; the creator-session fan-out of Note and reaction notices
with 500-recipient chunking, one creator's deliveries queued, and a failed delivery retried by the
same session; the notification owner for both; scenario host and scripts.
Next: option A (the founder's choice for answers, request status and commitment due), then 5.6,
5.7, 5.8, 5.4, 5.5, 5.9, 5.10, and 5.3 on a fake gateway.
Blocked on: nothing for my side of option A. Answers and request status will not fire until lanes 3
and 4 add their one call (tickets). 5.3 needs Apple and Google credentials.

## Scenarios (database on 56450, host on 56451, fake push gateway on 56453)

Re-run (from the repository root, with node on PATH): `sh tests/scenarios/lane-5/setup.sh` once,
then `sh tests/scenarios/lane-5/run-all.sh`. It resets the database and restarts the host before
each script; pass script names to run only some. `e5-4-known-gaps` is not in the default list.

| Script                  | Rows                                                                                                                                                                                                                                      | Result (2026-10-08)                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `e5-1-audience`         | E5.1 ★ who sees a Note: member, outsider, signed out, blocked, restricted, deleted, no thread, leaves, joins, tiers, mute, unknown creator                                                                                                | 13 of 13 pass                       |
| `e5-1-lifecycle`        | E5.1 ★ duplicate publish, edit, delete, wrong person, hostile text, paging and bad input                                                                                                                                                  | 6 of 6 pass                         |
| `e5-1-scale`            | E5.1 ★ 600 members and 20 outsiders; latency; reads keep working while five Notes are delivered to 600 members at once                                                                                                                    | 3 of 3 pass                         |
| `e5-2-reactions`        | E5.2 ★ react, privacy between fans, duplicate, race, pending reply, wrong person, deleted reply                                                                                                                                           | 7 pass, 1 not run (no undo exists)  |
| `e5-4-note-notices`     | E5.3 ★ and E5.4 Notes: recipients, in-app list, push honesty, once per cause, silent edit, join and leave, blocked after the notice, failure and retry, withdrawn before send                                                             | 8 of 8 pass                         |
| `e5-4-reaction-notices` | E5.2 ★ and E5.3 ★ reactions: who is told, push wording and privacy, once, withdrawn reply, denied fan                                                                                                                                     | 5 of 5 pass                         |
| `e5-4-chunks`           | E5.1 ★ and E5.4: 600 recipients become events of 500 and 100, one notice each                                                                                                                                                             | 2 of 2 pass                         |
| `e5-4-self-retry`       | E5.4: the denial check is missing while a Note is published; nobody is told; once it is back the creator's session retries by itself and tells the audience once; a failure that never clears stops after three retries (takes 3 minutes) | 2 of 2 pass                         |
| `e5-4-scheduled`        | E5.4: scheduled Note, early run, racing runs                                                                                                                                                                                              | 2 of 2 pass                         |
| `e5-3-quiet-hours`      | E5.3 ★ quiet hours read in each fan's own time zone; held push released later (DST edges not run: need a clock fake)                                                                                                                      | 2 of 2 pass                         |
| `e5-4-known-gaps`       | a muted fan is still pushed; a reaction push survives a withdrawn reply                                                                                                                                                                   | 0 of 2 pass (known, decisions 5, 6) |

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

## Decisions needed (each default is already built)

1. Does a new member see Notes posted before they joined? Default: yes.
2. Can a creator take back a reaction? Default: no (insert-only table, no route).
3. "Insert thread messages" is replaced by read-time rendering, as the Domain Model says.
4. **Answers, request status and commitment due** need a way for the notification worker to
   know current private state: [choose A, B or C](lane-5-notification-owner-authority.md).
5. A member who muted a creator's Notes is still pushed (the mute is private to the fan). The
   clean fix is one small `SECURITY DEFINER` function in the content module, which is a
   migration. Default: ship as is, fix next round.
6. A reaction push can still go out after the fan withdrew the reply (the worker cannot read
   replies). The in-app list hides it. Default: accept; the sentence is still true.
7. An edit to a published Note tells no one again, and a Note to followers or groups tells no
   one yet (followers need the reserved follow migration; groups need the original-recipient
   reader).

## What the scenarios do not prove

The host composes the real content, signing, audience, growth and denial code on a real
PostgreSQL with the development identity. It leaves out the later migration waves the stock
trust runtime needs, the reply reviewer, and the conversation and commerce hosts. Membership
purchases, creator verification, safety decisions, blocks and deletions are rows standing in for
lane 1 and 4 outcomes, named in `lib.mjs`. The push gateway is a recorder that stands in for
APNs and FCM, so device registration, token redaction, quiet hours and the real adapters are not
exercised. Nothing here ran on a phone, a browser or a real provider.

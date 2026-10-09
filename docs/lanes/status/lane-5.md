# Lane 5: Presence and reach status

Updated: 2026-10-08, by the lane 5 session
Working on: first round only. WP 5.1 (Note and reaction delivery, contract C4) is open as
`lane-5/c4-thread-presence`. WP 5.2 (notification producers) follows on its own branches.
Done: contract C4 published ([details](lane-5-c4-note-reaction-delivery.md)); the
thread-presence read `GET /v1/content/{creatorId}/presence`; scenario host and scripts.
Next: WP 5.2a (note and reaction producers), then 5.2b (answer, request status, commitment
due). Then, only after "Next for lane 5": 5.6, 5.7, 5.8, 5.4, 5.5, 5.9, 5.10, and 5.3 on a fake
gateway.
Blocked on: nothing for 5.1 and 5.2. 5.3 needs Apple and Google credentials.

## Scenarios (database on 56450, host on 56451)

Re-run everything (from the repository root, with node on PATH): `sh
tests/scenarios/lane-5/setup.sh` once, then `sh tests/scenarios/lane-5/run-all.sh`. It resets the
database and restarts the host before each script; pass script names to run only some.

| Script               | Rows                                                                                                                        | Result (2026-10-08)                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `e5-1-audience.mjs`  | E5.1 ★: members, outsider, signed out, blocked, restricted, deleted, no thread, leaves, joins, tiers, mute, unknown creator | 13 of 13 pass                      |
| `e5-1-lifecycle.mjs` | E5.1 ★: duplicate publish, edit, delete, wrong person, hostile text, paging and bad input                                   | 6 of 6 pass                        |
| `e5-1-scale.mjs`     | E5.1 ★: 600 members, 20 outsiders; latency                                                                                  | 2 of 2 pass                        |
| `e5-2-reactions.mjs` | E5.2 ★: react, privacy between fans, duplicate, race, pending reply, wrong person, deleted reply                            | 7 pass, 1 not run (no undo exists) |

## Tickets to other lanes

- **Integrator, `packages/api/src/openapi.ts`:** register `GET /v1/content/{creatorId}/presence`
  (operation `contentThreadPresence`, response `ContentThreadPresencePage`, query
  `ContentThreadPresenceQuery`) next to `contentList`, so the Swift and Kotlin clients get an
  operation. The component schemas are already generated.
- **Lane 3 (web thread, `features/conversation/ConversationScreen.tsx` near line 1019):** render
  presence items with `authorLabel`, `audience.label` and the glyph instead of "Audience
  details unavailable", merged by time. Optional later: call `ThreadPresence.read` from
  `ConversationService.read` so one request returns both.
- **Lane 7:** the same, in both apps; `W3Message` has no audience field, C4 items do.
- **Lane 1 (`modules/trust/reply-review.ts`):** every fan reply to a Note waits for a human
  decision, so a creator can react to nobody until one is recorded. Auto-allow clean replies
  (launch review gap 5).
- **Lane 1 or 2:** unknown creator on `GET /v1/content/{id}` is `403 audience_unavailable`;
  on other guarded routes it is `503 scope_denial_unavailable`. Pick one.
- **Lane 2 (for WP 5.2):** the growth worker cannot read private rows without the "genuine
  purpose issuer" that does not exist yet; see the WP 5.2 design.

## Decisions needed (each has a default that is already built)

1. A new member sees Notes posted before they joined (current membership decides, as the
   existing `GET /v1/content/{creatorId}` does). Alternative: only from the join date.
2. A reaction cannot be undone: the table is insert-only and no route exists. Alternative: a
   creator-signed retraction.
3. The brief's wording "insert `human_broadcast` messages" is replaced by read-time rendering,
   as the Domain Model states (see C4 for why the database refuses the alternative).

## What the scenarios do not prove

The host composes the real content, signing, audience and denial code on a real PostgreSQL with
the development identity. It leaves out the later migration waves the stock trust runtime needs
(restoration, privacy export), the reply reviewer, and the conversation, commerce and growth
hosts. Membership purchases, creator verification and the safety decisions are rows standing in
for lane 1 and 4 outcomes, named in `lib.mjs`. Nothing here ran on a phone, a browser or a real
provider.

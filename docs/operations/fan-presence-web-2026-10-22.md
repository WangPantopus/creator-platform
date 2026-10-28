# Fan conversation Notes and reactions — 2026-10-22

Fans can now see the C4 presence feed in their web conversation. The BFF permits
the existing content presence read; the client validates its schema and renders the server's
exact author label, audience and signed-act link through the shared Note and
ReactionChip components. Notes link to the existing private-reply page.

C4 items remain read-time projections. They are merged with messages by time but
are never inserted into the message list, delivery cursor or offline snapshot.
The earlier-messages action also follows the opaque C4 cursor, including an empty
eligible page that still has an older candidate window. The visible window retains
the head and the latest four explicitly requested older cursors. Every refresh
reads those pages concurrently and replaces the whole window atomically, so
withdrawn or newly ineligible text is not retained in an older page. Cursor order,
not response order, controls deduplication; the head's version wins overlaps.

The view follows the existing Content UI's freshness behavior: refresh about every
two seconds and allow at most five seconds from the **start** of a successful read,
including network time. Healthy refreshes keep the current view; failed or expired
reads clear it. Offline, session end, hidden tabs and pagehide clear the projection.
Return to the page requires a fresh read. Cancellation and a view generation check
prevent an older response from restoring concealed text. This is UI access
freshness, not a new content-retention policy.

## Operated checks

The owned integrated stack used web 56632, API 56631 and PostgreSQL 56630
(`creator_stack`). Development actors 3/5/6 had no deletion jobs before use.
Maya is actor 3, the member is actor 6, and the outsider is actor 5. Actor 7 remains
under 18; its eligibility was not changed.

Synthetic outer edges: development identity, a Chrome virtual passkey device,
the existing `approvedProof` fixture standing in for external verification, and
membership rows standing in for a completed purchase. Registration, exact-content
signing, publication, private replies and withdrawal used real browser/API entry
points and the real database. No signature or safety-review result was inserted.

| Check                                       | Observed                                                                                                                                                      | Result  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Signed members Note                         | Studio passkey ceremony published one Note; eligible fan saw exact text, paragraphs, `Maya · to all members`, verification link and private-reply destination | Pass    |
| Phone themes                                | Light and Night at 390×844; authorship and signatures visible, mixed Arabic/English text preserved, no horizontal overflow                                    | Pass    |
| Private reply without review authority      | Reply stayed `pending`; reaction signing refused `403 reply_changed`; zero reaction rows                                                                      | Pass    |
| Outsider and signed out                     | Non-member presence response omitted Note and DOM contained none; signed-out BFF read returned 401                                                            | Pass    |
| Under 18                                    | Actor 7 completion refused `403 adult_eligibility_required`, no session token                                                                                 | Pass    |
| Offline/reconnect                           | Projection disappeared offline and returned after a current read                                                                                              | Pass    |
| Page lifecycle                              | Pagehide cleared text; pageshow revalidated before restoring it                                                                                               | Pass    |
| Transport failure                           | Blocking only the presence URL cleared text; Retry restored it after removing the network block                                                               | Pass    |
| Slow read and expiry                        | Delaying only the presence request for 6.5 seconds concealed the older projection within 5.5 seconds, while the conversation stayed online; Retry recovered   | Pass    |
| Pending reply withdrawal                    | Author withdrew the reply through the real API; no reaction existed                                                                                           | Pass    |
| Note retraction                             | Creator unpublish succeeded; focus/refetch removed the Note, database state was `unpublished`, and no stored message contained its text                       | Pass    |
| Signed reaction display/withdrawal          | Not run: migration `0156_w8_reply_review` is `reserved_unapplied`; the actual review authority/table is absent                                                | Not run |
| More than one C4 page, empty candidate page | Separate member/tier fixture published 52 genuine signed Notes; real browser followed an empty first window's cursor to the eligible older Note               | Pass    |

The full available workflow passed **10/10** checks. After adding the existing
five-second freshness behavior, the affected lifecycle/failure/expiry subset
passed **4/4**. Web typecheck, targeted ESLint and Prettier checks passed.

Screenshots: [Light](../../artifacts/lane-5/fan-presence-2026-10-22/light.png),
[Night](../../artifacts/lane-5/fan-presence-2026-10-22/night.png).

## Refusals and harness corrections

The first registration attempt correctly refused to register a passkey without
approved external proof. Its UI said, “Approved external creator proof is required
before registering a signing passkey.” The existing synthetic verification fixture
was then applied; the subsequent browser registration and signing ceremonies passed.
This does not verify a real external creator account.

An initial reaction scenario attempted to query the absent review table and failed.
Because that step left the browser on the private-reply page, its following thread
lifecycle checks timed out on the wrong route (initial run 5/10). The harness now
checks the pending reply/refusal explicitly and returns to the conversation before
those checks. Positive reaction acceptance remains not run; no held migration or
approval was fabricated to change that outcome.

Detailed local logs were retained as `qelvora-presence-passkey-debug.log`,
`qelvora-presence-web-1022.log`, `qelvora-presence-web-1022-final.log` and
`qelvora-presence-web-1022-lifecycle.log` in the temporary directory.

## Reproduce

Run against an owned stack with current source and seeded Maya. The scenario uses
the existing lane 6 browser helpers, hence their address variables:

```sh
LANE6_WEB=http://localhost:56632 \
LANE6_API=http://127.0.0.1:56631 \
LANE6_DB=postgresql://postgres:foundation-test-only@127.0.0.1:56630/creator_stack \
PRESENCE_MEMBER_ACTOR=6 PRESENCE_OUTSIDER_ACTOR=5 \
node tests/scenarios/lane-5/e5-1-web-presence.mjs
```

The script stops before changing an actor with deletion state or an outsider who
already has membership. Its own membership is ended after the normal run; it does
not clear other memberships, reset accounts or delete evidence.

`--retain-native-fixture` leaves one additional signed Note and this run's membership
for coordinated native reads, printing identifiers without tokens. With that Note
still authorized, `PRESENCE_NOTE_ID=<id> ... --lifecycle-only` repeats only the four
affected lifecycle/network checks without another publication or membership.

The retained native fixture from this run is Note
`2910d98f-0dd8-41ff-a896-5fb31cf0eb38`, signature
`c2ddf773-beec-41bd-af1a-b739d6412c81`, member fan
`205e09a9-d4de-4170-9b85-1212acffcbde` and outsider fan
`5524820a-74b5-411d-afa4-0ac8a570a4ea`. Its membership is
`9ffdfdfa-f349-485f-b3c3-f934642423df` and grant is
`5f0892f8-e836-49a9-adaa-c06c6bea8d36`. These synthetic records are retained for the
parallel native check; hosting remains undecided and no live deployment occurred.

## Operated pagination checkpoint

A separate owned stack, `presence1022` on PostgreSQL 56660/API 56661/web 56662,
was created with the existing qualified fresh installer and Growth enabled.
Integrated Maya and the retained native fixture were untouched. An earlier
read-only inspection found actor 2's deletion job, and Devon conversation begin
refused `403 ai_paused`; neither state was changed.

The first attempt used actual follow GET/PUT, two followers Notes and 50 members
Notes, all published through Compose and a fresh browser passkey assertion for
each exact document. Follower content reads returned
`503 growth_core_follow_unconfigured`: held migration 0185 and its core function
are absent. All 52 records/signatures were retained unpublished and the follow
was undone. The raw script printed 2/5, but its retraction check had never observed
the Note, so that apparent pass is invalid. Only cleanup was proven. The scenario
now stops after the first genuine audience read if unavailable and requires a
visible Note before retraction. [The read-only custody audit](core-follow-custody-audit-2026-10-22.md)
records the exact prerequisite; follower acceptance remains blocked.

The member variant used the existing documented tier/membership purchase stand-in
and reused the same 52 Note IDs through Studio edits, new versions and new
signatures. The oldest and newest Notes targeted all members; the other 50 targeted
a tier this fan did not hold. Real HTTP windows passed, but the browser exposed
an “Earlier messages” starvation bug: automatic reads took approximately 2.1–4.6
seconds, and the two-second refresh queue kept the control disabled. The hook now
allows one explicit older-page request during an automatic refresh, snapshots each
read's window and prevents duplicate explicit requests without disabling the
control for background work. The five-second freshness rule is unchanged.

The first member run recorded 1/5 and a 503 during cleanup. Its exact Notes and own
membership were resumed; no unrelated fixture was changed. A subsequent request
interception harness failed with “Route is already handled”; that result was
discarded as browser-test infrastructure failure. The final focused run observed
a genuine automatic request in flight, clicked before its response, and used no
interception. It passed **5/5**: candidate windows, the queued browser click with
deduplication and signature link, empty eligible first page, older-page retraction,
and scoped cleanup. All 52 Notes remain unpublished, and the own membership ended.
Typecheck, scoped ESLint, syntax and formatting checks passed. This checkpoint proves two candidate pages; the bounded rolling-window follow-up
below preserves its result separately from deeper fixture-only checks.

Preserved evidence:
[follower refusal](../../artifacts/lane-5/fan-presence-2026-10-22/pagination/followers-refusal.txt),
[member starvation](../../artifacts/lane-5/fan-presence-2026-10-22/pagination/member-starvation.txt),
[harness failure](../../artifacts/lane-5/fan-presence-2026-10-22/pagination/harness-route-failure.txt),
[5/5 result](../../artifacts/lane-5/fan-presence-2026-10-22/pagination/member-passed.txt),
[fixture IDs and signed versions](../../artifacts/lane-5/fan-presence-2026-10-22/pagination/member-fixture.json),
[older page](../../artifacts/lane-5/fan-presence-2026-10-22/pagination/older.png),
[empty then older](../../artifacts/lane-5/fan-presence-2026-10-22/pagination/empty-then-older.png).
The harness trace's workspace prefix is normalized; the original temporary log is
retained. Both screenshots were inspected at 390×844.

To reproduce against a fresh owned stack with Growth enabled, use the same address
variables above and add `PRESENCE_PAGINATION_FIXTURE=members`,
`PRESENCE_PAGINATION_FAN_ACTOR=1` and `--pagination`. Explicit `followers` mode uses
the real follow relationship and requires qualified 0185 authority; it cannot
stand in for member success. A saved `PRESENCE_PAGINATION_REUSE=<manifest>` can edit
only this mode's exact 52 IDs at unchanged versions on the same stack, with new
signatures. `--pagination-checks-only` instead requires all 52 still-published
versions and reruns the browser checks and cleanup without signing again. The
manifest stores identifiers, not credentials; unrelated memberships and changed
Note versions are refused.

## Bounded rolling-window follow-up — 2026-10-23

The final hook retains the head cursor plus the latest four explicitly requested
older cursors, evicting the oldest retained non-head cursor as the fan advances.
Each cycle snapshots that window and reads its pages concurrently, with one
five-second deadline measured from the cycle's start. It publishes all pages
atomically or clears the whole projection. A failed sibling aborts the other
requests; head-first, kind-qualified deduplication is independent of response
arrival order. An explicit click can still queue during an automatic refresh.

The same 52 owned Note IDs were edited through Studio and signed again at version 4. The final source passed **5/5** real browser/API checks, including clicking
“Earlier messages” while a genuine automatic response was pending, empty eligible
head pagination, older-page retraction and scoped cleanup. All 52 Notes remain
unpublished and this run's membership is ended. This uses the same documented
member/tier purchase stand-in as the checkpoint; it does not prove the blocked
followers audience. The integrated retained Maya fixture was read separately for
the existing offline, pagehide, failure and expiry checks: **4/4** on final source.

The optional `--deep-fixture` mode passed **4/4** in the real web UI with explicitly
intercepted C4 responses matching lane 7's seven-cursor fixture contract. It proves
UI mechanics only; the Note, reaction, signature IDs and author labels in this mode
are fixtures, not a real publication, membership decision or reviewed reaction.
The surrounding development session/thread is real, and no content, signature or
review row is inserted by this mode. Its observations were:

- Seven advances through empty candidate pages reached the final Note/reaction.
  The final request window was head plus cursors 903–906, with at most five pages.
- Five 1.2-second reads ran concurrently within one deadline. Duplicate Notes
  displayed the head's text exactly once despite overlapping older responses.
- One failed retained page cleared both Note and reaction; Retry restored them.
- One 6.5-second sibling concealed the whole older projection within five seconds.
  Fast siblings' distinct uncommitted text never appeared, including after the
  delayed response completed and a later read recovered.

Final web typecheck, targeted ESLint, scenario syntax and formatting passed. The
three final screenshots were inspected at 390×844. The owned `presence1022` stack
was stopped with its database volume kept; the integrated native stack was left
running. No migration, authority registration or hosting decision changed.

Preserved final-source evidence:
[real 5/5](../../artifacts/lane-5/fan-presence-2026-10-22/rolling-window/member-passed.txt),
[version 4 fixture identifiers](../../artifacts/lane-5/fan-presence-2026-10-22/rolling-window/member-fixture.json),
[older Notes](../../artifacts/lane-5/fan-presence-2026-10-22/rolling-window/older.png),
[empty then older](../../artifacts/lane-5/fan-presence-2026-10-22/rolling-window/empty-then-older.png),
[lifecycle 4/4](../../artifacts/lane-5/fan-presence-2026-10-22/rolling-window/lifecycle.txt),
[deep UI fixture 4/4](../../artifacts/lane-5/fan-presence-2026-10-22/rolling-window/deep-fixture.txt),
[deep UI fixture screenshot](../../artifacts/lane-5/fan-presence-2026-10-22/rolling-window/deep-fixture.png).

To repeat the fixture-only mechanics on an existing owned pagination stack, use
its `LANE6_WEB`, `LANE6_API`, `LANE6_DB` and fan actor variables with
`node tests/scenarios/lane-5/e5-1-web-presence.mjs --deep-fixture`.
To repeat the genuine fixture, use `--pagination` and the saved version manifest
as described above; every republished Note receives a new signing ceremony.

# Fan conversation Notes and reactions — 2026-10-22

Fans can now see the C4 presence feed in their web conversation. The BFF permits
the existing content presence read, validates its schema, and renders the server's
exact author label, audience and signed-act link through the shared Note and
ReactionChip components. Notes link to the existing private-reply page.

C4 items remain read-time projections. They are merged with messages by time but
are never inserted into the message list, delivery cursor or offline snapshot.
The earlier-messages action also follows the opaque C4 cursor, including an empty
eligible page that still has an older candidate window. Refresh replaces every
loaded page so withdrawn or newly ineligible items are not retained in older pages.

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
| More than one C4 page, empty candidate page | Implementation follows the existing schema, but this browser run had fewer than 50 candidates                                                                 | Not run |

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

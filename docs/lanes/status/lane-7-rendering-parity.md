# Lane 7: rendering parity (WP 7.4): the spec, the scenarios, and where to resume

Written by lane 7. One spec for both apps. A difference between the platforms is a defect, so
every rule below is built the same way in `apps/ios` and `apps/android`, and every scenario row
carries an iOS and an Android result.

WP 7.4 has twelve pieces. Each piece is its own pull request, in the order below. A piece that
waits on a contract or a founder decision says so, keeps today's behavior and moves on.

| Piece | Rule set | Source | State |
| --- | --- | --- | --- |
| P1 | Notes and reactions in the thread | C4 (lane 5), `GET /v1/content/{creatorId}/presence` | This spec; first pull request |
| P2 | Notification rows: glyph, color, time, unread | `GET /v1/growth/notifications` (C4 notices, lane 5) | Next |
| P3 | Step-in seal and the composer states | Conversation page (`control`, `canSend`, `unavailableReason`) | Paused and human: buildable. Trial, ended, capacity: no contract (ticket to lane 3) |
| P4 | Citations | Message `citations` (ids) and the creator's posts | To survey |
| P5 | Named pickers instead of raw ids | `GET /v1/conversations/account` (`threads[].name`) | Buildable, no contract change |
| P6 | Explicit provider consent | Capabilities `providers`, `POST .../consent` | To survey |
| P7 | 18+ confirmation | C1 (lane 1) age screen and `adult_eligibility_required` | Overlaps WP 7.5; to survey |
| P8 | The 3-hour reminder | No server signal; client rule proposed | Needs a founder decision on the rule |
| P9 | Packet terms block and ETA line | `chargeRule`, `pendingHold`, `decisionEta`; lane 4's public summary `reliability` | ETA waits on lane 4's decision record (empty until then); Q04 keeps payment on the web |
| P10 | Share sheet for the card | Lane 5 share card (needs lanes 1, 3, 4) | Waits on the share-card contract |
| P11 | Remove "AI comparisons are not available yet." | Comparison stays installed and off (2026-10-08) | Copy change: founder approval |

## P1: Notes and reactions in the thread (C4)

Contract: [C4](lane-5-c4-note-reaction-delivery.md) and `packages/api/src/content.ts`
(`ThreadPresence*`). A Note is stored once and rendered into each eligible fan's thread at read
time, so a thread page never contains one: the apps read them from the presence endpoint and draw
them between the thread's messages.

### Reading

1. **When.** With the first authorized page read of a thread on this screen, with the first page
   read after the live connection was lost, and when the thread returns to the foreground. Never
   on a message frame and never on the periodic page refresh, so presence adds no polling (WP 7.8
   measures it). A Note published while the thread is open therefore appears after the next
   reconnect or return, or when the push for it is tapped.
2. **Every cursor.** `GET /v1/content/{creatorId}/presence?limit=50`, then `&before=<nextBefore>`
   exactly as returned (URL-encoded), until `nextBefore` is `null`. A page with no items and a
   cursor is normal (Notes this fan may not see are never counted) and the next page is read.
   At most 20 pages per read; at the bound the read stops and keeps what it has.
3. **All or nothing.** A read replaces the shown list only when it finishes. A network or server
   failure (a 5xx, a timeout, a dropped connection) keeps the last complete list; the platform's
   own transport may retry a dropped request first (iOS URLSession does; the Android client never
   retries). A refusal (`400`, `401`, `403 scope_revoked`, `403 audience_unavailable`, `404`)
   clears it. Presence never conceals the thread, never touches the draft or a pending send, and
   never starts the thread's denial path: the thread page has its own authorization.
4. **Memory only.** Presence lives in memory for the open screen. It is cleared whenever the
   thread is concealed (sign-out, account change, denial, leaving the screen, going to the
   background, the offline reading lease ending) and is never written to disk, so an offline
   launch shows the cached thread without Notes.
5. **No thread order.** Presence items have no sequence and no control epoch: they never reach the
   delivery gate, the resume cursor, `clientSequence`, a generation, a takeover or a hand-back.

### Merging

6. Thread messages are placed by `createdAt`, presence items by `occurredAt`; at the same instant
   the thread message comes first. Order among messages is unchanged (server order).
7. While older messages are still unloaded ("Earlier messages" is shown), a presence item older
   than the oldest loaded message stays hidden; loading earlier messages reveals it in place. When
   every message is loaded, every presence item is shown.

### Drawing

8. **A Note** uses the Note surface: the server's `authorLabel` verbatim (for example "Maya · to all
   members") beside the broadcast glyph in the creator color, the `text` as the body, and "Signed by
   {name}", which opens `/verify/{signedActId}`. The app never rebuilds the label from the name and
   the audience. The thread shows no reply field on a Note: Note replies never go through the thread
   composer (C4 rule 3) and are not part of WP 7.4.
9. **A reaction** uses the reaction chip: the server's `authorLabel` verbatim ("Maya reacted to your
   reply") with the heart glyph in the creator color, and "Signed by {name}" to its verification
   page. It shows no reply text (C4 serves none) and does not name the reaction kind (no copy exists
   for the kinds; a copy decision if wanted).
10. **Authorship first.** A screen reader hears the label, then the body, as one element. A
    grayscale screenshot still says who is speaking (word and glyph).
11. A thread message that arrives with `human_broadcast` or `human_reaction` (the server never
    writes one, C4) keeps the honest fallback label and now also shows its glyph.

### The fake API (C4 harness update)

The fake serves `/v1/content/{creatorId}/presence` the way `thread-presence.ts` does: candidates
(published Notes and the fan's own reactions) newest first by `(at, id)`, a window of `limit` plus
one, eligibility applied after the window (so a page can be empty with a cursor), items returned
oldest first, `nextBefore` = the window edge as `<UTC microseconds>Z~<id>`, and the same refusals.
Maya's rich thread no longer contains a Note or a reaction as thread messages. Fixtures: an
all-members Note, a tier Note this fan is not in, a reaction to the fan's own reply, and enough
older Notes to make several pages, one of them empty. Control calls add a Note or reaction, change
a Note's eligibility, and make the presence route fail.

### Scenarios (each on iOS and Android, Light and Night, largest text where it says)

| ID | Steps | Expected |
| --- | --- | --- |
| R1.1 | Open Maya's thread as Devon | The Note and the reaction sit between the messages by time; label word, glyph and creator color; "Signed by Maya" opens the verification page; a tier Note Devon is not in never shows; older Notes sit above the first message |
| R1.2 | Behind the screen: the fake's request log | Three reads (limit 50), the empty middle page followed, each `before` exactly the previous `nextBefore`, items 2, 0, 2 |
| R1.3 | Screen reader order; grayscale | The label is its own accessibility element, read immediately before the body; word and glyph say who is speaking without color |
| R1.4 | Publish a Note while the thread is open; send from another device (a frame); background and return; then publish a reaction and drop the live connection | No read on the frame; one read on return (the Note appears); one read after the reconnect |
| R1.5 | Make the Notes ineligible, then a read | The Notes are gone; the reaction stays |
| R1.6 | After a dropped live connection, the presence read gets 500, a 20 s hold (past the 15 s timeout), a dropped request, then 403 | 500 and timeout: one request, the last list stays; drop: Notes stay; 403: one request, the list clears, the thread and Send untouched |
| R1.7 | Earlier messages | Not run yet: Maya's fixture fits one page; needs a longer thread fixture |
| R1.8 | A long Note with emoji, Hebrew and Arabic at the largest text, Light and Night | Wraps, nothing clipped, label findable |
| R1.9 | Behind the screen: the app's files after a read and a background | No file contains Note text (iOS: the whole data container; Android: every app file) |
| R1.10 | Sign out, sign in as Priya | Not run yet |
| R1.11 | Real stack: a Note published through the real content API | Not run: publishing a Note needs a signed act (passkey ceremony) and membership rows; lane 5's own host does this |

## P2 to P11: the rules, written before the code

Each becomes its own pull request with its own scenario table. What a piece cannot do yet is
said here, so nothing is built around a missing contract.

**P2 Notification rows.** Source: `GET /v1/growth/notifications` (`authorKind`, `sender`,
`preview`, `readAt`, `createdAt`, `available`). Each row shows the authorship glyph for
`authorKind` (the same table as messages; `system` has none), the server's `sender` verbatim in
that authorship's color, the preview, the time, and an unread mark (a dot and a stronger weight).
The screen reader hears sender, then preview, then time, then the unread state. An unread word for
screen readers is new copy: proposed key `growthUnread` = "Unread" (founder approval needed).
The fake's Note and reaction notices follow C4 (sender from `noteAudience`, destination
`/creators/{handle}/chat`, the generic preview for a reaction).

**P3 Step-in seal and composer states.** The plain "Ask {name} to step in" buttons become the
StepIn control: the seal with the creator's initial (the first letter of the name, uppercased; the
step-in glyph when the name starts with no letter) and the `stepIn` copy. It stays the only
person-colored button and still opens the packet. Composer states the page can express are drawn
from `control`: `ai_paused` shows the paused line with its glyph; `human_active` shows the
creator-colored input with `replyToCreator`. Trial, ended and capacity have no server field (the
page carries only `canSend` and a free-text `unavailableReason`); the apps keep the server's
sentence and do not guess. Ticket to lane 3: a structured composer state on the conversation page.

**P4 Citations.** To survey: both apps draw `CitationChip` from message `citations` today; the
spec will state the label, the unavailable state and what a tap opens, the same on both.

**P5 Named pickers.** Support, report, block and deletion stop asking for a typed "Creator ID" or
"Conversation ID". The person picks from their conversations by creator name
(`GET /v1/conversations/account`, `threads[].name`, following `nextCursor`). A screen opened with a
`creatorId` (for example Report from a thread) shows that creator's name, not the id. No contract
change.

**P6 Provider consent.** The first-conversation screen uses the fixed sentence `processorConsent`
verbatim when every provider both keeps no messages and trains on none; otherwise it names each
provider with its honest line, as today. The terms links stay. Same on both apps.

**P7 18+ confirmation.** A sign-in refused with `adult_eligibility_required` shows
`adultOnlyTitle` and `adultOnlyBody`, offers no retry into the same account, and keeps
"Choose another account". The age screen itself is the release sign-in (C1, WP 7.5).

**P8 The 3-hour reminder.** No server signal exists. Proposed: after three hours of continuous use
of an AI thread in the foreground (a gap of 15 minutes or more resets it), the thread shows the
`longSession` line once as a system line, then again after every further three hours. Founder
decision needed (compliance wording is fixed; the counting rule is not).

**P9 Packet terms and ETA.** The in-app packet shows the terms block: "Charged only when {name}
accepts. …" (`chargeRule`) and `pendingHold`, as the web packet does. The ETA line ("{name} usually
decides in {range}") appears only when lane 4's public summary gives a non-empty `reliability`;
until the decision record lands it is empty and the apps show nothing (never an invented range).
Payment stays on the web (Q04).

**P10 Share sheet for the card.** Waits on the share-card contract (lane 5, with lanes 1, 3 and 4)
and on a public domain for the verification link (WP 7.6). Not built in WP 7.4.

**P11 The comparison placeholder.** "AI comparisons are not available yet." is removed. When
comparisons turn off while the choice is open, the choice closes and nothing is said; the button
is already hidden while comparisons are off (2026-10-08 decision). A copy removal: founder
approval needed before it ships.

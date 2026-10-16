# Lane 7: rendering parity (WP 7.4): the spec, the scenarios, and where to resume

Written by lane 7. One spec for both apps. A difference between the platforms is a defect, so
every rule below is built the same way in `apps/ios` and `apps/android`, and every scenario row
carries an iOS and an Android result.

WP 7.4 has twelve pieces. Each piece is its own pull request, in the order below. A piece that
waits on a contract or a founder decision says so, keeps today's behavior and moves on.

| Piece | Rule set                                       | Source                                                                            | State                                                                                  |
| ----- | ---------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| P1    | Notes and reactions in the thread              | C4 (lane 5), `GET /v1/content/{creatorId}/presence`                               | This spec; first pull request                                                          |
| P2    | Notification rows: glyph, color, time, unread  | `GET /v1/growth/notifications` (C4 notices, lane 5)                               | Next                                                                                   |
| P3    | Step-in seal and the composer states           | Conversation page (`control`, `canSend`, `unavailableReason`)                     | Paused and human: buildable. Trial, ended, capacity: no contract (ticket to lane 3)    |
| P4    | Citations                                      | Message `citations` (ids) and the creator's posts                                 | To survey                                                                              |
| P5    | Named pickers instead of raw ids               | `GET /v1/conversations/account` (`threads[].name`)                                | Buildable, no contract change                                                          |
| P6    | Explicit provider consent                      | Capabilities `providers`, `POST .../consent`                                      | To survey                                                                              |
| P7    | 18+ confirmation                               | C1 (lane 1) age screen and `adult_eligibility_required`                           | Overlaps WP 7.5; to survey                                                             |
| P8    | The 3-hour reminder                            | No server signal; client rule proposed                                            | Needs a founder decision on the rule                                                   |
| P9    | Packet terms block and ETA line                | `chargeRule`, `pendingHold`, `decisionEta`; lane 4's public summary `reliability` | ETA waits on lane 4's decision record (empty until then); Q04 keeps payment on the web |
| P10   | Share sheet for the card                       | Lane 5 share card (needs lanes 1, 3, 4)                                           | Waits on the share-card contract                                                       |
| P11   | Remove "AI comparisons are not available yet." | Comparison stays installed and off (2026-10-08)                                   | Copy change: founder approval                                                          |

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
   the thread message comes first. Order among messages is unchanged (server order). Placing
   presence items never moves the reader: one at the bottom of the thread stays at the bottom, one
   who scrolled away stays where they were.
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

### Scenarios and results (fake API; synthetic identities and data; real apps, HTTP, paging, layout)

| ID    | Steps                                                                                                                   | Expected                                                                                                                                                                            | iOS                                                                                                  | Android                                         |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| R1.1  | Open Maya's thread as Devon                                                                                             | Note and reaction between the messages by time; label word, glyph and creator color; "Signed by Maya"; a tier Note Devon is not in never shows; older Notes above the first message | pass                                                                                                 | pass                                            |
| R1.2  | The fake's request log                                                                                                  | Three reads at limit 50, the empty middle page followed, each `before` exactly the previous `nextBefore`, items 2, 0, 2                                                             | pass                                                                                                 | pass                                            |
| R1.3  | Accessibility order; grayscale capture                                                                                  | The label is one element read immediately before the body; word and glyph say who is speaking without color                                                                         | pass (first labelled element of the Note)                                                            | pass (label node directly before the body node) |
| R1.4  | New Note while open; a message frame; background and return; new reaction and a dropped live connection                 | No read on the frame; one read (3 pages) on return, the Note appears; one more after the reconnect                                                                                  | pass (3, 3, 6, 9 requests)                                                                           | pass (3, 3, 6, 9 requests)                      |
| R1.5  | Notes made ineligible, then a read                                                                                      | Notes gone, the reaction stays; a good read follows every page                                                                                                                      | pass                                                                                                 | pass                                            |
| R1.6  | After a dropped live connection the read gets a 500, a 20 s hold (past the 15 s timeout), a dropped request, then a 403 | 500 and timeout: one request, list kept; drop: Notes stay; 403: one request, list cleared, thread and Send untouched                                                                | pass                                                                                                 | pass                                            |
| R1.7  | A thread longer than one page (66 messages; the fake pages at 50), then "Earlier messages"                              | Older Notes and the reaction wait until the messages around them load, then appear in place                                                                                         | pass                                                                                                 | pass                                            |
| R1.8  | Long Note with emoji, Hebrew and Arabic; largest text; Light and Night                                                  | Wraps, nothing clipped, its label reachable                                                                                                                                         | pass                                                                                                 | pass                                            |
| R1.9  | The app's files after a read and a background                                                                           | No file contains Note text                                                                                                                                                          | pass (20 files in the data container, 0 hits)                                                        | pass (10 files, 0 hits)                         |
| R1.10 | Sign out, sign in as Priya                                                                                              | No Note from Devon's session                                                                                                                                                        | not run                                                                                              | not run                                         |
| R1.11 | Real stack: a Note published through the real content API                                                               | Appears in the real thread                                                                                                                                                          | not run: a Note is a signed act (passkey ceremony) with membership rows; lane 5's own host does that | not run                                         |
| R1.12 | Largest text (the thread's own controls are its last rows): open Maya's thread; presence arrives after the page         | The thread stays at its bottom: its last row is on screen without scrolling                                                                                                         | pass                                                                                                 | pass (failed before the fix)                    |
| D3T   | Largest text, a very tall row, thirty upward drags (guards the WP 7.3 freeze with presence rows present)                | The app answers and goes idle                                                                                                                                                       | pass                                                                                                 | pass (idle CPU 0%)                              |

Commands: `node tests/scenarios/lane-7/e7-4-presence.mjs [R1 R4 R5 R7 R8 R9 R10]` (Android) and
`node tests/scenarios/lane-7/ios-navigation.mjs <built.xctestrun> --presence [R1 R4 R5 R7 R8 R9 R10]` (iOS,
with `ios-link-driver.mjs` running). `pnpm exec tsx tests/scenarios/lane-7/harness/check-contract.mjs`
checks the fake's presence answers against `ThreadPresencePage` (62 checks).

### What the runs found (and what changed because of them)

- **Android lacked the Note head's hairline rule** that iOS and the web Note (`.qv-note__head`) draw.
  Added; the four Note snapshots were re-recorded (only those four images change pixels).
- **iOS parsed every timestamp with a regex and a new date formatter on every render.** Replaced by
  a fixed-format parser checked against Foundation (offsets, fractions, invalid input). Android
  memoizes the merged timeline instead of rebuilding it on each recomposition.
- **A dropped connection is not a clean "keep" test on iOS**: URLSession retries a dropped GET by
  itself (Android's client never retries), so the keep rule is proven with a 500 and a timeout.
- **Going to the background clears presence by design** (the whole thread is concealed), so "keep
  the last list" is only observable within one foreground session.
- **The WP 7.3 largest-text freeze** (a very tall row plus scrolling up) first showed up in R8; it
  is fixed in #401 and guarded by D3T.
- **Android lost the bottom of the thread when presence arrived** after the page. At the largest
  text, where the thread's own controls are its last rows, the new rows pushed the bottom out of
  view (the step-in button was off screen); iOS keeps its bottom anchor. Android now scrolls to the
  bottom again when presence changes, only while the reader is still at the bottom. Found by the
  P3 seal flows; R1.12 failed before the fix and passes after it. R1.1's order check now compares
  neighboring rows one pair per screen: it had relied on where the list happened to stop.

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

# Lane 7: rendering parity (WP 7.4): the spec, the scenarios, and where to resume

Written by lane 7. One spec for both apps. A difference between the platforms is a defect, so
every rule below is built the same way in `apps/ios` and `apps/android`, and every scenario row
carries an iOS and an Android result.

WP 7.4 has twelve pieces. Each piece is its own pull request, in the order below. A piece that
waits on a contract or a founder decision says so, keeps today's behavior and moves on.

| Piece | Rule set                                       | Source                                                                            | State                                                                                                           |
| ----- | ---------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| P1    | Notes and reactions in the thread              | C4 (lane 5), `GET /v1/content/{creatorId}/presence`                               | #452 (and its Android bottom fix)                                                                               |
| P2    | Notification rows: glyph, color, time, unread  | `GET /v1/growth/notifications` (C4 notices, lane 5)                               | Next                                                                                                            |
| P3    | Step-in seal and the composer states           | Conversation page (`control`, `canSend`, `unavailableReason`)                     | Seal: #457. Composer states: a founder decision (below); trial, ended, capacity: no contract (ticket to lane 3) |
| P4    | Citations                                      | Message `citations` (ids) and the creator's posts                                 | To survey                                                                                                       |
| P5    | Named pickers instead of raw ids               | `GET /v1/conversations/account` (`threads[].name`)                                | Needs picker copy approved (proposed below)                                                                     |
| P6    | Explicit provider consent                      | Capabilities `providers`, `POST .../consent`                                      | #460                                                                                                            |
| P7    | 18+ confirmation                               | C1 (lane 1) age screen and `adult_eligibility_required`                           | The refusal: built, `lane-7/adults-only`. The age step itself: WP 7.5 (C1)                                      |
| P8    | The 3-hour reminder                            | No server signal; client rule proposed                                            | Needs a founder decision on the rule                                                                            |
| P9    | Packet terms block and ETA line                | `chargeRule`, `pendingHold`, `decisionEta`; lane 4's public summary `reliability` | Copy decision: `chargeRule` says "she" for every creator; ETA waits on lane 4; Q04 keeps payment on the web     |
| P10   | Share sheet for the card                       | Lane 5 share card (needs lanes 1, 3, 4)                                           | Waits on the share-card contract                                                                                |
| P11   | Remove "AI comparisons are not available yet." | Comparison stays installed and off (2026-10-08)                                   | Copy change: founder approval                                                                                   |

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

## P3: the creator's seal

The seal is the creator's mark: a circle in the creator color with the creator's initial. The
composer states, the other half of P3 in the table, are the next pull request (below).

### Rules

1. **Whose letter.** Every seal, mark and avatar letter shows the creator's initial: the first
   letter in the display name, uppercased. A leading emoji or symbol is skipped ("🌿 fern studio"
   shows "F"); a name with no letter at all shows its first character, whole. One function on each
   app (`creatorInitial`) serves the thread, Discover, navigation, access and studio components.
   The written rule before this said "the step-in glyph when the name starts with no letter"; no
   such glyph exists in the reference set, so the rule above replaces it.
2. **Which buttons.** The step-in button (the `stepIn` copy, "Ask {name} to step in") carries the
   seal with the thread creator's letter, and so does Send while the creator is in the thread
   (`human_active`, when Send is creator-colored). These two are the person-colored buttons; the
   step-in button still opens the packet.
3. **A fixed letter.** The letter is drawn at a fixed size, 0.62 of its circle, and does not grow
   with the text size. The words beside it grow and wrap.
4. **Room at the largest text.** The seal keeps its 10-point gap to the label, and Send keeps its
   word on one line: the message box gives up the width.

### Scenarios and results (fake API; synthetic identities and data; real apps and layout)

The seal is decorative (screen readers hear the button's words), so each step captures the screen
and the captures were reviewed by eye.

| ID   | Steps                                                                                                               | Expected                                                               | iOS                                             | Android                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| S3.1 | Devon opens Maya's, Kiln Club's (creator in the thread) and Glazeco's (AI paused) threads                           | "M", "K" and "G" on the step-in button; "K" on Kiln Club's Send too    | pass                                            | pass                                                                  |
| S3.2 | Largest text, Light and Night: Kiln Club's step-in and Send, its in-thread "is here" line, and Maya's reaction chip | Each letter inside its circle; the gap to the label kept; "Send" whole | pass (AX5)                                      | pass (font scale 2.0)                                                 |
| S3.3 | Priya searches Discover for "fern", opens "🌿 fern studio" and starts a first conversation                          | The header avatar and the step-in seal show "F"                        | pass                                            | pass                                                                  |
| S3.4 | The existing component snapshots (iOS package tests; Android Paparazzi)                                             | Unchanged at normal text, or a change that is understood               | pass (18/18 package tests, snapshots unchanged) | five snapshots re-recorded: a full-width button's label moved 1 pixel |
| S3.5 | A display name in a right-to-left script; a name with no letter                                                     | First letter; first character                                          | not run                                         | not run                                                               |

Commands: `node tests/scenarios/lane-7/e7-4-seal.mjs [S1 S2 S3]` (Android) and
`node tests/scenarios/lane-7/ios-navigation.mjs <built.xctestrun> --seal [S1 S2 S3]` (iOS, with
`ios-link-driver.mjs` running). The fake has a creator named "🌿 fern studio" for S3.3.

### What the runs found (and what changed because of them)

- **Every seal showed "M".** The thread passed no initial to the step-in button or to Send, so both
  used the control's default, and other seals took the name's first character, which splits an
  emoji. Both apps now use `creatorInitial`.
- **At the largest text the letter grew past its circle** on both apps (iOS scaled it with Dynamic
  Type, Android with the font scale). Fixed on both, including iOS's second seal view (the "is
  here" line, reaction chips, the human composer).
- **Android squeezed the gap between the seal and the label** at the largest text: a block button
  centered its content between two flexible spacers, so a label that nearly filled the button
  slid into the gap. iOS keeps the gap. Android buttons now center with fixed spacing.
- **iOS split "Send" across two lines** next to the seal at the largest text, because the message
  box and Send shared the width. Send now takes its one-line width first, as on Android.
- **The seal flows found a P1 defect on Android**: at the largest text the thread lost its bottom
  when Notes and reactions arrived. Fixed in #452 (R1.12).
- **Ticket to lane 6** (`packages/ui-web/src/components.ts`, `StepIn`): the web reference takes
  `name.charAt(0)`, which for "🌿 fern studio" draws half of an emoji. The apps show "F".

## P6: the provider sentence before the first message

### Rules

1. When the provider policy is verified and every provider keeps no messages (`noRetention`) and
   trains on none (`noTraining`), the first-conversation screen says the fixed sentence
   `processorConsent` verbatim: "Before your first message, {name}'s AI is powered by {providers}.
   They don't keep or train on your messages." `{providers}` is the providers' names joined with
   ", ", as the web joins them.
2. Otherwise the screen keeps today's lines: "This AI is powered by {providers}." and, under each
   provider's terms link, that provider's own line. An unverified policy also keeps its development
   notice. The sentence is a promise, so it is never said on settings nobody has reviewed.
3. The terms links stay in both cases. The consent itself (its policy version, "Start with") is
   unchanged.

### Scenarios and results (fake API; synthetic identities and data; real apps)

| ID   | Steps                                                         | Expected                                                                                                                                             | iOS        | Android               |
| ---- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------- |
| P6.1 | Priya opens Lena Park's first conversation (the default fake) | The fixed sentence, verbatim, with "Lena Park" and the provider; its terms link; no per-provider line; "Start with" opens the thread once, consented | pass       | pass                  |
| P6.2 | A provider that keeps messages                                | "This AI is powered by Synthetic provider." and its retention line; no promise                                                                       | pass       | pass                  |
| P6.3 | The policy not verified                                       | The development notice and the provider's own line; no promise                                                                                       | pass       | pass                  |
| P6.4 | Two providers that keep and train on nothing                  | Both named in the sentence; both terms links                                                                                                         | pass       | pass                  |
| P6.5 | Largest text, Night                                           | The sentence on screen, in full                                                                                                                      | pass (AX5) | pass (font scale 2.0) |

Commands: `node tests/scenarios/lane-7/e7-4-consent.mjs [C1 C2 C3 C4 C5]` (Android) and
`node tests/scenarios/lane-7/ios-navigation.mjs <built.xctestrun> --consent [C1 C2 C3 C4 C5]` (iOS,
with `ios-link-driver.mjs` running). The fake's `POST /__harness/flags` takes a `providers` list.

### What the runs found

- **The web consent screen** (lane 3, `apps/web/features/conversation/ConsentScreen.tsx`) does not
  use the fixed sentence either. Ticket to lane 3: the same rule, so the surfaces say the same thing.
- **iOS test details**: SwiftUI exposes the terms link as a button; at the largest text the
  development banner becomes a scroll view of its own, so a scroll helper must drag the page's.
- **Seen on the way, not part of P6**: at the largest text the iOS tab bar stacks its four items
  and covers about a third of the screen, while Android keeps a two-by-two grid. A parity defect in
  lane 7's own navigation (WP 7.2), to fix separately.
- **Also seen, not part of P6**: the provider terms link is a plain body-weight link on iOS and a
  bold, indented quiet button on Android. A small parity defect, to fix with the next consent work.

## P7: the 18+ refusal

A survey first: with every request refused with `403 adult_eligibility_required` after sign-in
(an account flagged under 18), both apps showed "We can't reach your account right now. Your
session is kept on this device." with Retry and Crisis help, and checked the session again four
times in twelve seconds. D-11 and C1 say otherwise: the answer is final, the session ends, and the
person sees the designed under-18 state "with the policy and nothing else". The rules below follow
them, and correct this spec's first draft, which kept "Choose another account".

### Rules

1. A `403 adult_eligibility_required` on the session check, the session refresh or the development
   sign-in ends the session on the device the way sign-out does (the credential, drafts, Notes and
   every other private state removed), and the app shows the designed under-18 state: the
   wordmark, `adultOnlyTitle` and `adultOnlyBody`, and nothing else (no retry, sign-in, tabs or
   help), as the web's `/auth/adults-only` does.
2. Nothing retries with the old session. A relaunch finds no session and shows the welcome;
   signing in again with the same identity gets the same answer (C1).
3. Another screen's own request may meet the refusal first and show its own unavailable state for
   a moment; the session check (at launch, on return and every few seconds while the app is open)
   then ends the session. The release sign-in (WP 7.5) will meet the same answer and use the same
   handling.

### Scenarios and results (fake API; synthetic identities and data; real apps, storage and HTTP)

| ID   | Steps                                                                           | Expected                                                                                                                          | iOS        | Android               |
| ---- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------- |
| P7.1 | Devon is signed in on Home; the fake flags the account under 18 (an ops review) | Only the under-18 state; at least one refusal, then no request with the old session for ten seconds; a relaunch shows the welcome | pass       | pass                  |
| P7.2 | The under-18 persona signs in (development sign-in)                             | The same state; no session kept                                                                                                   | pass       | pass                  |
| P7.3 | Largest text, Night                                                             | The state in full                                                                                                                 | pass (AX5) | pass (font scale 2.0) |

Commands: `node tests/scenarios/lane-7/e7-4-adults.mjs [A1 A2 A3]` (Android) and
`node tests/scenarios/lane-7/ios-navigation.mjs <built.xctestrun> --adults [A1 A2 A3]` (iOS). The
fake's `POST /__harness/accounts/:key {adult}` flags an account; its next authenticated request
ends its session with the refusal, as `resolveSession` does.

### For the founder

- The designed state offers nothing else, so it no longer shows "Crisis help" (the web's page has
  none either). Say if crisis help should stay on this screen.

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

**P3 Composer states** (the seal is built: see P3 above). Composer states the page can express are
drawn from `control`: `ai_paused` shows the paused line with its glyph; `human_active` shows the
creator-colored input with `replyToCreator`. Trial, ended and capacity have no server field (the
page carries only `canSend` and a free-text `unavailableReason`); the apps keep the server's
sentence and do not guess. Ticket to lane 3: a structured composer state on the conversation page.

Founder decision needed before the composer states are built: the design reference
(`packages/ui-web`, `Composer`) and the web conversation screen (lane 3, `ConversationScreen.tsx`)
disagree, and the apps today match the web screen. The reference: while the creator is in the
thread, a creator-colored input "Reply to {name}" (`replyToCreator`) and no step-in button; while
the AI is paused, the paused line with its glyph and the step-in button in place of the input. The
web screen and the apps: "Message {name}…", a notice with the server's sentence, the input, and
the step-in button in every state (the web titles the notice "AI paused" when the AI is paused; the
apps say "AI unavailable"). Proposed: follow the reference, keep the server's sentence as the
paused line's detail, and ticket lane 3 to do the same on the web.

**P4 Citations.** To survey: both apps draw `CitationChip` from message `citations` today; the
spec will state the label, the unavailable state and what a tap opens, the same on both.

**P5 Named pickers.** Support, report, block and deletion stop asking for a typed "Creator ID" or
"Conversation ID". The person picks from their conversations by creator name
(`GET /v1/conversations/account`, `threads[].name`, following `nextCursor`). A screen opened with a
`creatorId` (for example Report from a thread) shows that creator's name, not the id. No contract
change.

Not built yet: a picker needs words that the copy system does not have, in safety flows. Proposed
(founder approval needed): the field label "Creator" or "Conversation" (today "Creator ID" and
"Conversation ID"); the prompt "Choose a conversation"; with none, "You have no conversations yet.";
when the list cannot load, "Your conversations could not load." with a "Try again" button. A report,
block or deletion never picks a creator by default: nothing is sent until the person chooses one.
The web support form asks for typed references too: ticket to lane 1 (`apps/web/app/support`).

**P6 Provider consent.** Built: see P6 above.

**P7 18+ confirmation.** The refusal is built: see P7 above. The age step itself is the release
sign-in (C1, WP 7.5).

**P8 The 3-hour reminder.** No server signal exists. Proposed: after three hours of continuous use
of an AI thread in the foreground (a gap of 15 minutes or more resets it), the thread shows the
`longSession` line once as a system line, then again after every further three hours. Founder
decision needed (compliance wording is fixed; the counting rule is not).

**P9 Packet terms and ETA.** The in-app packet shows the terms block: "Charged only when {name}
accepts. …" (`chargeRule`) and `pendingHold`, as the web packet does. The ETA line ("{name} usually
decides in {range}") appears only when lane 4's public summary gives a non-empty `reliability`;
until the decision record lands it is empty and the apps show nothing (never an invented range).
Payment stays on the web (Q04). Copy decision needed first: the fixed `chargeRule`
sentence says "If she declines …" for every creator, whatever their pronouns (Kiln Club and
Glazeco are not "she"); the web avoids it by showing only "Charged only when {name} accepts." Proposed: "If
{name} declines or {deadline} pass, nothing is charged."

**P10 Share sheet for the card.** Waits on the share-card contract (lane 5, with lanes 1, 3 and 4)
and on a public domain for the verification link (WP 7.6). Not built in WP 7.4.

**P11 The comparison placeholder.** "AI comparisons are not available yet." is removed. When
comparisons turn off while the choice is open, the choice closes and nothing is said; the button
is already hidden while comparisons are off (2026-10-08 decision). A copy removal: founder
approval needed before it ships.

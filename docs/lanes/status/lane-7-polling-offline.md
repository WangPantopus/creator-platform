# Lane 7: polling and honest offline (WP 7.8)

Written by lane 7. One spec for both apps; a difference between the platforms is a defect.

## What the apps asked of the server (before)

With a thread open and idle, iOS sent 49 requests a minute and Android 51 (WP 7.1 baseline): the
session check every 4 s, the thread page every 15 s, the presence pulse every 20 s. While an answer
streamed, every frame that passed the delivery gate fetched the whole page again: one page per
sentence.

## Rules

1. **The session** is checked at launch, on return to the front and every 30 s while the app is in
   front (it was every 4 s). A request the server refuses is seen at once by the screen that sent
   it, as before.
2. **The thread page** is fetched when the thread opens, after the live connection (re)connects,
   when a frame cannot be painted, at an answer's end, and every 60 s as a safety net for changes
   that send no frame (it was every 15 s).
3. **Frames are painted (C5, as lane 3 built it for the web, #482).** An approved AI sentence frame
   is appended to its message the moment it arrives. The answer's end (`delivered`, `interrupted`)
   marks the message and asks for one page fetch for what frames do not carry (citations, version,
   feedback). Every other frame (accepted, control, other authors) still fetches the page.
   `ThreadDeliveryGate` is unchanged: it drops duplicates and stale epochs (INV-03) and holds
   anything after a gap.
4. **The presence pulse** stays every 20 s while the thread is in front: it is how the server knows
   the person is there.
5. **Offline is honest.** When the network goes, the thread keeps the saved conversation with "You're
   offline" and "Reconnect to send"; Send stays off; the app retries with a growing pause (1 s, 2 s,
   … at most 15 s) instead of a tight loop. When the network comes back it reconnects from its
   cursor and shows what happened meanwhile once.
6. **The background sends nothing**: every loop above stops when the app leaves the front.

## The fake API

A sentence frame now carries the sentence exactly as the server appends it (`text=m.text||sentence`
in `pending_w3_worker_output.sql`): a later sentence includes its own leading space. The fake used
to add the space to the message but not to the frame.

## Decisions taken as the proposed default (2026-10-16; the founder may veto any)

- The session check every 30 s while in front. A revoked or under-18 session that no other request
  meets is now noticed within about 30 s instead of 4 s. The sign-in scenarios (H10 to H12) and the
  under-18 flows (P7.1) wait up to 40 s for it.
- The thread page every 60 s as a safety net while connected.
- Native threads paint sentence frames against C5 as built in lane 3's #482 (still open): if lane 3
  changes the frame before it merges, the apps follow.

## Scenarios and results (fake API; synthetic identities and data; the real apps), at the handoff

`node tests/scenarios/lane-7/e7-8-polling.mjs [ios|android] [P1 P2 P3 P4]`, on this branch's build.

| ID | What | iOS | Android |
| --- | --- | --- | --- |
| P1 | Requests in 60 s, Maya's thread open and idle | 35 (was 49): 29 offline lease, 3 presence pulse, 2 session, 1 page. **Fails the target** (12) | 36 (was 51): 30 offline lease, 3 pulse, 2 session, 1 page. **Fails the target** |
| P2 | An answer of three sentences streams into the open thread | 2 page fetches (the asking message and the answer's end); the sentences read as the server wrote them: pass | the same: pass |
| P3 | Offline: labelled saved thread, no send, bounded retries, a reply made meanwhile appears once | not run | not run |
| P4 | A minute in the background: no request | not run | not run |
| Gates | compile, unit and snapshot suites, the fake's contract check | test build, `swift test` 18/18, contract 64/64 | compile, unit and Paparazzi 19/19 |

**What P1 found: the offline reading lease is most of what is left.** The server's policy is
`conversation-offline-five-seconds-v1` (`apps/backend/src/modules/conversation/offline.ts`): a saved
copy may be read for five seconds after it was issued, so both apps fetch `…/offline` every 2 s to
always hold one (30 a minute; it was already there in the 49/51). Proposed default for the next
session: renew from the lease's own `expiresAt` (about one second before it ends) instead of a fixed
2 s, on both apps; that is about 15 a minute with five-second leases and falls by itself if the
lease grows. Ticket to lane 3 and a question for the founder: a longer lease (for example 60 s)
would bring a thread down to about 6 requests a minute, at the cost of a saved copy readable for
longer after the network goes.

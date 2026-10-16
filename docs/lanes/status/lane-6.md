# Lane 6: Creator Studio (web) status

Updated: 2026-10-16, by the session that did WP 6.9.

Working on: nothing. WP 6.9 (Studio without 4-second polling) is done in
[#PR69](PR69_URL) on `lane-6/no-polling`; WP 6.2 is in #443 (open). This file is written on top
of #443's version, so whichever of the two merges second takes this file as it is.

## Resume here

- **Prompt for the next session:** [lane-6-resume-prompt.md](lane-6-resume-prompt.md).
- **Verified at handoff:** see the last lines of this section, updated when the session stopped.
- **WP 6.9 in one paragraph:** each open Studio tab keeps one live stream
  (`/api/studio/live`); the server re-checks the roles and the open screen's read every 2
  seconds and sends fingerprints; screens read only on a change. The design, the safety
  posture taken as the default, and the tickets are in [lane-6-wp-6-9.md](lane-6-wp-6-9.md).
- **Reuse, do not redo:** the E6.1 "before" captures for `main` are in
  `$HOME/.cache/qelvora-lane6/e6-1/` (README there); the "after" capture of WP 6.9 is saved there
  too (folder `pr-6-9-<commit>`). Compare across WP 6.9 with `e6-1-compare.mjs --across-6.9`;
  once WP 6.9 is on `main`, compare as usual against a capture that includes it.
- **Waiting on others:** the integrator's tab bar change (ticket below; not on `main` at
  dea51a4ff, so the one-line "Today is the current tab on Notes and the composer" change is
  not made yet); approval of the `config/navigation.json` addition in #443; and the WP 6.9
  tickets (lane 1's 4-second identity check; optionally the session resolver for the Studio
  stream).
- **Deliberately not done:** WP 6.3 onwards; the composer's label preview fix
  (`notes/Compose.tsx:536`); a live read for Today (after #443 merges; Today does not poll);
  the tickets lanes 2 and 5 sent to lane 6 (listed under Next).

Waiting on: the integrator (tab bar ticket, `navigation.json` approval, merging #443 and the
WP 6.9 pull request); lane 1 (the identity check ticket).

Decided by the founder, 2026-10-15, in chat:

- "The new Today and composer copy in #443 is approved as proposed."
- "Yes: Today replaces Notes as the first Studio tab; Notes stays reachable from Today. Ticket
  the integrator for the tab bar change." Lane 6's side is in #443: Today links to Notes for
  every role that sees it, and Studio maps a "Today" tab to Today and marks it on Today.

Decided 2026-10-16, taken as the proposed default under the founder's standing instruction
("whenever you are asking me any decisions please always go with either your proposed
recommended answer, or default decision"); each can be vetoed:

- **WP 6.9 safety posture:** the 5-second authority lease stays, fed by the live stream; the
  server re-checks roles and the open screen's own read every 2 seconds. The sign-in session is
  re-resolved by Studio when each stream opens (at least every 30 seconds), on every action and
  on return; lane 1's 4-second identity check still covers it today. Details:
  [lane-6-wp-6-9.md](lane-6-wp-6-9.md), "The safety posture".
- **The fan's audit trail** records a thread open, a change, a return and an action, not every
  4-second poll; the stream's checks do not count as opens (`auditOpen = false`, as the
  realtime gateway does).
- **The approved-draft and correction panels** refresh on the thread's changes and before
  acting, not on their own timer; the correction panel re-reads its source before sending.

## Done

- **WP 6.1** (round 1, all on `main`): #368 harness, #382 recovery, #383 Notes and Compose,
  #386 Publish, #387 Requests and PacketDetail, #390 Threads, #391 navigation and the requests
  count. `Studio.tsx` went from 4,795 to 408 lines. Details: [round 1 report](lane-6-round-1-report.md).
- **WP 6.2** (#443): Today is where Studio opens; "New Note" is one tap from it; the
  composer warns when nobody is in the chosen audience, handles right-to-left text, and returns
  to Today after a Note is signed. Contract **C10** is written:
  [lane-6-c10-today.md](lane-6-c10-today.md).
- **WP 6.9** ([#PR69](PR69_URL)): no Studio screen polls. One live stream per tab replaces the
  role check, the screens' 4-second reads, the expiry timers and the badge poll. Idle requests a
  minute: Notes 74 to 18, an open thread 80 to 18, Threads, Team and Thanks 64 to 18, Requests
  48 to 18, the Studio picker 32 to 16; what is left is lane 1's identity check and the stream's
  30-second renewal. [lane-6-wp-6-9.md](lane-6-wp-6-9.md).


## Next (only on the founder's "Next for lane 6")

1. When the integrator's tab bar change is on `main`: mark Today as the current tab on Notes and
   in the composer (`Studio.tsx`, the `active` mapping) and rerun E6.1.
2. After #443 merges: give Today a live read like the other screens (small; Today does not poll).
3. WP 6.3: reactions, then WP 6.4 (queue) and WP 6.5 (accept and send over C3, now on `main`).
4. Tickets received for lane 6 (not started): `apps/web/next.config.ts` or `.gitignore` so
   `next dev` stops rewriting the tracked `apps/web/next-env.d.ts` (lanes 2 and 5); the profile
   form, `PushManager` and the notification worker for lane 5's web push (WP 6.8); the thread
   screen's session polling (with lane 3).

Blocked on: nothing for 6.9. The exact audience reach needs W4's narrow count (held migration
0155); the digest on Today needs lane 5's producer (WP 6.7).

## Scenarios (E6.9, 2026-10-16)

Against the lane 6 stack (`node infra/local/stack.mjs up --lane 6 --provider anthropic --growth`),
real Chrome 155 at 390 px, real backend and PostgreSQL. Fakes: the development identity, the
model fake, team rows standing in for lane 1's invitation, and where named the browser's
background signal. Load average during the runs: E69_LOAD.

E69_RESULTS

## Scenarios (E6.2, 2026-10-15)

Against the lane 6 stack (`node infra/local/stack.mjs up --lane 6 --provider anthropic --growth`),
real Chrome 155 at 390 px, real backend and PostgreSQL. Fakes: development identity, a virtual
passkey authenticator, the model fake (unused by these checks), and stand-in rows for lane 4
(tiers, memberships) and lane 1 (an approved creator proof, team membership).

- `e6-2-note.mjs` 10/10: lands on Today, one tap to New Note, signs, the member sees the Note
  through C4 and a non-member does not; empty, 20,000 characters (59,991 bytes), one over (400),
  emoji and right-to-left, double tap publishes one.
- `e6-2-ceremony.mjs` 5/5: Cancel before and during the device prompt, a refused biometric and an
  expired assertion each keep the text and publish nothing; signing again publishes once.
- `e6-2-tabs.mjs` 3/3: a stale tab is told and keeps its words; two tabs publish one Note.
- `e6-2-audience.mjs` 6/6 plus one known limit: the warning shows only when nobody is in the
  audience, in the composer and on the review sheet; the Note still publishes and a member who
  joins later reads it; grace and cancelled-until-end count, ended does not; team sees `unknown`.
- `e6-2-today.mjs` 10/10: each role sees only its parts; one failing read leaves the rest; no timer
  polling (0 reads in 20 s idle, 1 each on return); Light and Night at 390 and 320 px; a screen
  reader meets the headings and "Note from Maya to …" before the body; Notes is one tap from Today for the creator, a drafter and triage.
- E6.1 against a fresh `main` baseline (7ca3982fe, Chrome 155), rerun on the final code after the
  Notes link: 82 shots, 76 identical in pixels, calls, console and Tab order; 1 within tolerance
  (`night/requests-empty/empty`, 12 pixels at 1/255, as in round 1); 4 intended differences
  (`compose-new/typed` and `/saved` in Light and Night: the paragraph that starts in Arabic
  now reads right to left); and `night/suspended/recovered` counted one role check and one
  badge poll fewer (timing). A focused repeat of `workspace,suspended` on the same code was
  identical (6 of 6), as round 1 found for this step. The compare script prints FAIL for the
  intended differences by design.

Not run: real Touch ID and real phones (Safari on iOS, Chrome on Android), `tests/visual`
(needs Playwright's own Chromium), the backend integration suite (it does not cover Studio).
Not verified: the fan's notification for a Note (held in this stack, see the tickets) and the
fan's web thread screen, which does not draw C4 Notes yet (lane 3); the Note was checked
through the C4 read every thread uses.

## Findings (existing behavior, not changed by 6.2 or 6.9)

1. Shared Note and message bodies drop the author's line breaks (`packages/ui-web`), so a
   two-paragraph Note reads as one, for fans and in Studio.
2. The signing sheet previews a Note as a private reply ("Maya", not "Maya · to all members"),
   shows the browser's raw WebAuthn text when a biometric is refused, and says "This signing
   request is unavailable." for an expired one (`apps/web/features/identity/signing.tsx`).
3. Every Studio tab change remounts Studio and shows "Loading Studio…" until the first frame
   of the live stream arrives (one request, as the role check was). Keeping Studio mounted
   across tabs is a page-structure change for a later pass.
4. The composer's own label preview reads "Maya · to members" while the help line and the
   published Note say "Maya · to all members": it passes the audience kind, not its label
   (`notes/Compose.tsx:536`). A small fix for the next pass (WP 6.13), with the copy review.
5. Round 1 findings still stand: dropped taps (`shared/action.tsx:10`; with WP 6.9 a tap is
   dropped only if it lands during a read caused by a real change), Team focus jumps
   (`team/Team.tsx`), nested buttons in Requests (`requests/Requests.tsx:185`). The badge's
   4-second polling is gone with WP 6.9.

## Tickets to other lanes

- **Integrator, the tab bar (founder's decision, 2026-10-15):** Today replaces Notes as the first
  Studio tab; Notes stays reachable from Today.
  - `packages/ui-web/src/components.ts` `StudioTabBar` (line 2460): the first tab becomes
    `["Today", G.home]` instead of `["Notes", G.broadcast]`. The broadcast glyph is the Note's
    authorship mark, so a neutral glyph suits Today; the glyph is your and the founder's call.
  - `Sidebar` (line 2500): Today first; whether Notes also stays in the desktop sidebar is your
    and the founder's call (lane 6 handles either).
  - `packages/ui-web/src/contracts.ts` `StudioTabBarProps.active` (line 520): add `"Today"`.
  - Record the decision in the BRIEF (section 8 says "Notes (first tab on phone)") and the
    `design/phase4c-studio-phone` boards with the founder.
  - Lane 6 is ready in #443. After the change lands, lane 6 marks Today as the current tab on
    Notes and the composer (one line in `Studio.tsx`) and reruns E6.1, which will differ on
    every screen's tab bar by design.
- **Integrator:** approve the additive `config/navigation.json` change (`today`, and
  `from=today` on the composer only); `packages/ui-web` Note and message bodies should keep line
  breaks and take their direction per paragraph.
- **Lane 1 (WP 6.9):** `features/identity/session-boundary.tsx:175` re-reads
  `/api/platform/identity/session` every 4 seconds on every signed-in page; it is now the only
  timed request on an idle Studio (8 every 30 seconds). Suggest re-checking on focus, return and
  the cross-tab channel, with a slower timer. Studio's own session re-check is at most every 30
  seconds ([lane-6-wp-6-9.md](lane-6-wp-6-9.md), item 2).
- **Integrator (WP 6.9, optional):** pass `sessions.resolve` to `studioFeature`, as
  `integration.ts` passes `resolveSession` to `attachRealtime`, so the Studio stream re-resolves
  the session every 2 seconds; lane 6 then adds the per-tick call.
- **Lane 3 (WP 6.9):** when the realtime gateway carries more than thread subscriptions (ADR-7),
  Studio's live view can move onto it; the frame format is in `modules/studio/live.ts`.
- **Lane 3 (found in E6.9):** a 10-second pause of the backend process during an AI reply made
  the generation worker stop ("Generation worker stopped unexpectedly; closing admissions and
  draining the host", `generation_rollback_unavailable`) and the whole backend exit. Any pause
  (garbage collection, a VM migration) would take Studio and every fan offline until a restart.
- **Lane 1:** the signing sheet items in finding 2; an invalid return address after sign-in is
  shown as "Pantopus sign-in is not connected in this local build"; a creator must pick a fan
  handle before any Studio screen except Workspace and Team.
- **Lane 3:** a light AI status read for Today (live version, paused).
- **Lane 4:** register 0155 so audience reach is exact.
- **Lanes 2 and 5:** in the one-command stack every Note notice with a member to tell stays
  `blocked: scope_denial_unconfigured` (the creator and fan denial authority is not composed).
- **Lane 5:** `content/notices.ts` tells members whose access grant lapsed about a Note they
  cannot open; a followers Note reaches nobody until the follow migration, yet the composer
  offers Followers; a weekly digest read for Today.

Ports and containers: 56460 to 56463 (the stack: `qelvora-lane6-postgres`, backend, web, model
fake), 56464 to 56467 (E6.1 runs). Remove with `node infra/local/stack.mjs down --lane 6`.

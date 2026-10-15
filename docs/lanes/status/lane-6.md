# Lane 6: Creator Studio (web) status

Updated: 2026-10-15, by the lane 6 session resumed from the 2026-10-09 handoff.

Working on: nothing. WP 6.2 (Today and the Note composer) is done in #443 on
`lane-6/today-note`; the session stopped for the founder's review, as asked.

Waiting on: the founder's yes on the new copy and on Today's place in the tab bar, and the
integrator's approval of the small additive change to `config/navigation.json`.

## Done

- **WP 6.1** (round 1, all on `main`): #368 harness, #382 recovery, #383 Notes and Compose,
  #386 Publish, #387 Requests and PacketDetail, #390 Threads, #391 navigation and the requests
  count. `Studio.tsx` went from 4,795 to 408 lines. Details: [round 1 report](lane-6-round-1-report.md).
- **WP 6.2** (#443): Today is where Studio opens; "New Note" is one tap from it; the
  composer warns when nobody is in the chosen audience, handles right-to-left text, and returns
  to Today after a Note is signed. Contract **C10** is written:
  [lane-6-c10-today.md](lane-6-c10-today.md).

## Next (only on the founder's "Next for lane 6")

1. WP 6.9: replace the 4-second polling (the role check, Notes, Threads and the requests badge).
2. WP 6.3: reactions, then WP 6.4 (queue) and WP 6.5 (accept and send over C3, now on `main`).
3. Tickets received for lane 6 (not started): `apps/web/next.config.ts` or `.gitignore` so
   `next dev` stops rewriting the tracked `apps/web/next-env.d.ts` (lanes 2 and 5); the profile
   form, `PushManager` and the notification worker for lane 5's web push (WP 6.8); the thread
   screen's session polling (with lane 3).

Blocked on: nothing for 6.2. The exact audience reach needs W4's narrow count (held migration
0155); the digest on Today needs lane 5's producer (WP 6.7).

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
- `e6-2-today.mjs` 9/9: each role sees only its parts; one failing read leaves the rest; no timer
  polling (0 reads in 20 s idle, 1 each on return); Light and Night at 390 and 320 px; a screen
  reader meets the headings and "Note from Maya to …" before the body.
- E6.1 against a fresh `main` baseline (7ca3982fe, Chrome 155): 82 shots, 77 identical in pixels,
  calls, console and Tab order, 1 within tolerance (`light/requests-empty/empty`, 11 pixels at
  1/255, as in round 1), and 4 intended differences: `compose-new/typed` and `/saved` in Light
  and Night, where the second paragraph, which starts in Arabic, now reads right to left. All 636
  calls and 1,090 Tab stops are unchanged. The compare script prints FAIL for those 4 by design.

Not run: real Touch ID and real phones (Safari on iOS, Chrome on Android), `tests/visual`
(needs Playwright's own Chromium), the backend integration suite (it does not cover Studio).
Not verified: the fan's notification for a Note (held in this stack, see the tickets) and the
fan's web thread screen, which does not draw C4 Notes yet (lane 3); the Note was checked
through the C4 read every thread uses.

## Findings (existing behavior, not changed in 6.2)

1. Shared Note and message bodies drop the author's line breaks (`packages/ui-web`), so a
   two-paragraph Note reads as one, for fans and in Studio.
2. The signing sheet previews a Note as a private reply ("Maya", not "Maya · to all members"),
   shows the browser's raw WebAuthn text when a biometric is refused, and says "This signing
   request is unavailable." for an expired one (`apps/web/features/identity/signing.tsx`).
3. Every Studio tab change remounts Studio and shows "Loading Studio…" until the role check
   returns (WP 6.9).
4. The composer's own label preview reads "Maya · to members" while the help line and the
   published Note say "Maya · to all members": it passes the audience kind, not its label
   (`notes/Compose.tsx:536`). A small fix for the next pass (WP 6.13), with the copy review.
5. Round 1 findings still stand: dropped taps (`shared/action.tsx:10`), the badge's 4-second
   polling (`shell/useRequestsCount.ts:67`), Team focus jumps (`team/Team.tsx:162`), nested
   buttons in Requests (`requests/Requests.tsx:185`).

## Tickets to other lanes

- **Integrator:** approve the additive `config/navigation.json` change (`today`, and
  `from=today` on the composer only); `packages/ui-web` Note and message bodies should keep line
  breaks and take their direction per paragraph; with the founder, Today's place in
  `StudioTabBar` and `Sidebar`.
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

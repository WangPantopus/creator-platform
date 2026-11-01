# Lane 6, WP 6.9: Studio without 4-second polling

Written 2026-10-16 by the lane 6 session that did WP 6.9 (branch `lane-6/no-polling`, #488).

## What changed, in plain words

**Before.** Every open Studio screen asked the server on a 4-second timer: the role check
(`Studio.tsx`), the screen's own read (Notes, Threads, a thread, Team, Thanks, the
approved-draft and correction panels), and the requests badge, which was meant to run every 15
seconds but restarted every 4 because its effect depended on a new `roles` array after each role
check. Measured on the lane 6 stack, idle for 30 seconds: Notes 74 requests a minute, Threads 64,
an open thread 80, Team 64, Thanks 64, Requests 48, the Studio picker 32.

**Now.** Each open Studio tab keeps one live stream: `GET /api/studio/live` in the browser,
`GET /v1/studio/live` in the backend (Server-Sent Events, in lane 6's own module
`apps/backend/src/modules/studio/live.ts`). Every 2 seconds the server re-runs the current roles
and the open screen's own read, through the same service calls and access checks the screen's
request uses, and sends a 16-character fingerprint of each, plus the requests count. The browser
reads again only when a fingerprint changes, after the person's own action, or once when they
come back to the tab. Each stream ends after 30 seconds and the browser opens the next one at
once. Measured the same way: every screen 16 to 18 requests a minute, all of them lane 1's
identity check (see below) and at most one stream renewal per 30 seconds. Studio's own timed
requests: none.

What a person notices: lists no longer flash "loading" every 4 seconds, and the Studio picker no
longer flickers to "Loading your current roles…"; a fan's message, a team change or a role change
shows up within about 2 seconds, as before or faster; a tap is dropped only if it lands during a
read caused by a real change (before: every 4 seconds; the cause in `shared/action.tsx` is
unchanged).

## The safety posture (decision taken as the proposed default)

The founder's standing instruction (2026-10-16) is to take the proposed default and record it.
This is recorded as **"taken as the proposed default"** and can be vetoed.

1. **The 5-second authority lease stays.** It is fed by the stream instead of by polls. Each
   frame extends it to 5 seconds after the moment that check *started* on the server: the
   browser adds the server's elapsed time to the moment it opened the stream, so a delayed frame
   cannot stretch it. If frames stop, Studio hides itself ("Reconnect to Studio") within 5
   seconds, keeps the person's input, and reconnects by itself. A refused read hides that
   screen's content at the next frame. Measured: a removed team member's Studio hid in 0.5 to
   0.6 seconds; with the backend stopped, Studio hid after 4.4 to 4.7 seconds and came back 0.2
   to 0.3 seconds after it resumed, with the unsent draft kept.
2. **One thing Studio itself checks less often: the sign-in session.** The backend resolves the
   session once per request, so the stream re-resolves it when a stream opens (at least every 30
   seconds), and every action and every return to the tab still resolves it. Today this
   loosens nothing: lane 1's session boundary (`features/identity/session-boundary.tsx:175`)
   re-reads the session every 4 seconds on every signed-in page and ends the view on a refusal or
   a changed account. If lane 1 slows that check (ticketed below), a session ended on another
   device would reach an open, idle Studio within about 35 seconds instead of 5. The fix, if
   wanted, is the integrator's: pass the session resolver to the Studio module, as
   `integration.ts` already does for the realtime gateway; then every 2-second check re-resolves
   the session too.
3. **Two panels refresh on the thread's changes, not their own.** The approved-draft panel
   (lane 4's endpoint) and the correction panel (lane 3's endpoint) read endpoints the Studio
   module cannot re-run. They read again when the thread's fingerprint changes, on return, and
   before acting: the correction panel re-reads its source before sending when its last check
   is more than 5 seconds old (before, the 4-second poll kept it fresh during the signing
   ceremony). Access is still covered every 2 seconds, because both panels sit inside the
   thread, which the stream re-checks.
4. **The fan's audit trail records opens, not polls.** Each Studio read of a thread writes a
   `thread_audit` row ("every full-thread open is recorded for the fan"). The 4-second poll wrote
   one every 4 seconds while a thread stayed open (about 15 a minute). Now a row is written when
   the thread opens, when it changes, on return and after actions. The stream's own checks pass
   `auditOpen = false`, as the realtime gateway's re-checks already do.

## How it fits together

- **Backend** (`modules/studio/live.ts`, one route in `registration.ts`). The first check runs
  before any byte is sent, so a refused session or role answers with the same status and code a
  direct read would (401, 403, 409). After that, a failed roles check ends the stream with an
  error frame; a failed screen read is sent as that screen's error and the stream continues.
  Fingerprints ignore `serverTime` fields (a response time is not a change). The thread read
  uses `auditOpen = false`. A reader that stops reading gets its stream closed. No migration.
- **Web proxy** (`app/api/studio/live/route.ts`, `features/studio/proxy.ts`). It allows only
  `creator`, `view`, `fan`, `filter` and `cursor`, passes the account and session preconditions,
  and streams the body unbuffered (`no-transform`, `X-Accel-Buffering: no`). It uses
  `platformFetch`'s 65-second limit, which the 30-second streams stay under.
- **Browser** (`Studio.tsx`, `shell/live.tsx`, `api.ts`). `Studio` owns the stream, the lease
  and the badge. A screen declares its read with `useLiveView` and reads with `useLiveReload`,
  which never drops a change that arrives during a read. A hidden tab closes its stream and
  hides Studio, as before. On return, after a lapse or after an error, it reconnects: at once,
  then after 1, 2, 4 and 8 seconds. Focus reconnects only if nothing arrived for 5 seconds.
  A stream's first answer has 5 seconds, as the old role check had 4: past that, Studio says
  to reconnect and retries, instead of showing "Loading Studio…" for up to a minute.
- **Removed:** every `setInterval` in Studio, every per-screen 5-second expiry timer, and
  `shell/useRequestsCount.ts`; the badge now arrives in the stream.

## Not changed, and why

- Lane 1's identity check, 4 seconds on every signed-in page: lane 1's file. Ticketed.
- `PhotoAttachment.tsx` checks a processing photo every 2 seconds until it is ready. It is not
  on WP 6.9's list, and it stops by itself.
- Today (#443, merged) does not poll; it reads on open and on return. It can declare a live
  read like the other screens (a small follow-up).
- ADR-7's single WebSocket would carry Studio's updates in the long run. This stream is lane 6's
  step within its own files; moving it onto the gateway is lane 3's file (ticketed).

## Tickets

- **Lane 1:** `session-boundary.tsx:175` re-reads `/api/platform/identity/session` every 4 seconds
  on every signed-in page (8 of every 30 seconds of an idle Studio). Suggest re-checking on
  focus, on return and on the cross-tab channel, at a slower timer, or after a refused request.
  Coordinate with item 2 above: Studio's own session re-check is at most every 30 seconds.
- **Integrator:** optionally pass `sessions.resolve` to `studioFeature` (as `integration.ts`
  passes `resolveSession` to `attachRealtime`) so the stream re-resolves the session every 2
  seconds; lane 6 then adds the per-tick call (a few lines).
- **Integrator (optional):** `GET /v1/studio/live` is not in `packages/api/src/openapi.ts`; it
  answers `text/event-stream`, and adding it regenerates shared and native code that #443 also
  changes.
- **Lane 3:** when the realtime gateway grows past thread subscriptions (ADR-7), Studio's live
  view can become a subscription there; the frame format is in `modules/studio/live.ts`.
- **Lane 3 (found while testing):** pausing the backend process for about 10 seconds while an AI
  reply was generating stopped the generation worker ("Generation worker stopped unexpectedly;
  closing admissions and draining the host", `generation_rollback_unavailable`), and the whole
  backend exited. Any pause (a garbage-collection stall, a virtual machine migration, a sleeping
  development host) would take Studio and every fan offline until a restart. Seen on the lane 6
  stack on 2026-10-16 at load 18; E6.9's pause steps now wait for replies to finish first.

## Found and fixed by the scenarios

- The Studio picker asked for a screen read without a creator; the backend refused the stream
  and the picker showed an error. The idle check had waited for the heading, not the content.
- `useLiveReload` counted a read that a screen discarded (React runs effects twice in
  development; a read in flight when a tab hides is discarded too) as done, so Notes stayed on
  "Checking current Note and private reply access." Found by E6.1's first shot.
- Chrome's lifecycle "freeze" command does not freeze a visible page, so an early "sleep" step
  passed without sleeping. The step now stops Chrome's processes and proves the page's timers
  stopped.

## Evidence

See "Scenarios (E6.9, 2026-10-16)" in [lane-6.md](lane-6.md) and the pull request.

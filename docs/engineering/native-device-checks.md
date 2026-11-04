# Native device checks on the merged apps

Lane 7 wrote its operated checks (E7.1 to E7.12) on its own stacked branches. The 2026-11-01
consolidation merged that stack (#523) together with other native work, among it #516's native
presence and the native sign-in, and the checks never ran on the result. #505's A2 to A5, #506's P3
and P4 and #507's Z3 had never run at all. This page records the first run of all of them on
`main`, on 2026-11-04: each result, what failed and why, and how to run them again. Follow-ups 1,
12 and 13 were fixed later that day, each marked under [Follow-ups](#follow-ups); the results are
from the first run.

## How they ran

- **The code:** `main` at `80c206e9c`.
- **iOS:** debug builds of that code, ad-hoc signed, on a new iPhone 18 Pro simulator with iOS 27.0
  ([setup](setup.md#this-mac)). One build answers to lane 7's fake API (API and web origin
  `http://127.0.0.1:56473`), one to the local stack (API `http://127.0.0.1:56941`, web
  `http://localhost:56942`).
- **Android:** CI's `android-review` debug APK of `524d48489` (run 41703689518), downloaded with the
  founder's yes. `main` changed no app file after that commit. It ran on a new emulator made from the
  API 37 arm64 image. CI builds the APK with no API or web origin, so every launch passes the API
  origin (`LANE7_API_URL`), and the app shows no Studio link.
- **The fake API:** lane 7's harness ([runbook](native-harness.md)), one instance per platform (56473
  for iOS, whose UI tests name that port, and 56944 for Android), so both platforms ran at once
  without resetting each other's world.
- **The local stack:** a fresh `node infra/local/stack.mjs up --lane devchk --base-port 56940 --growth`
  for the checks that need the real backend and web app: the navigation and draft checks marked
  "stack" below, and Z3.

A result on the fake API proves the app, not the backend: the fake is lane 7's stand-in for our own
API. The 2026-11-03 decision asks every change to be proven against a real stack; lane 7 wrote its
checks for the fake, and only the ones marked "stack" have a real-stack version.

## Results

A number is steps or flows passed of those run. "Fixed" means the check, the fake API or a runner
needed a small fix, described under [Fixed in this change](#fixed-in-this-change), and passed after
it. The follow-ups are numbered under [Follow-ups](#follow-ups).

| Check                       | What it checks                                                                 | iOS                                                               | Android                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| E7.1 H1 to H12              | Sign-in through the debug hook, a session that ends, a network drop            | 12/12 (H12 fixed)                                                 | 12/12 (H12 fixed)                                                                                 |
| E7.1 S1 to S8, E1, L1 to L5 | Every thread state, a server error, live delivery                              | 14/14                                                             | 14/14                                                                                             |
| E7.1 F1, F2                 | Discover to a first message and its streamed reply                             | 2/2 (newly scripted)                                              | 2/2                                                                                               |
| E7.1 release build          | The debug hook is absent                                                       | pass: none of its 7 markers in the Release build                  | not run: no release APK                                                                           |
| E7.2 N1 to N21              | Back and restore, links into the app                                           | 17/18: N14 fails (follow-up 2)                                    | 21/21 (fixed)                                                                                     |
| E7.2 on the stack           | Navigation against the real backend                                            | pass                                                              | pass: 12/12 operated, 3/3 API                                                                     |
| E7.3 D1 to D8               | Drafts through restarts, rotation, the largest text                            | 9/10: D3 fails (follow-up 9)                                      | 10/10 (D5 fixed); D7 and D7U not run (follow-up 8)                                                |
| E7.3 D6 on the stack        | A real send once, then a real deletion clears the draft                        | pass (fixed): one deletion job, one tombstone, eight domain tasks | 5/5 (fixed) behind a `Connection: close` proxy; without it the deletion half fails (follow-up 12) |
| E7.4 P1, R1 to R12          | Notes and reactions in the thread                                              | 3/7 flows (follow-up 3)                                           | 21/35 steps (follow-up 3)                                                                         |
| E7.4 P2                     | Notification rows                                                              | 4/4                                                               | 9/9                                                                                               |
| E7.4 P3 seal                | The creator's seal                                                             | 3/3                                                               | 9/9                                                                                               |
| E7.4 P3 composer            | The composer states                                                            | 5/5                                                               | 10/10                                                                                             |
| E7.4 P4                     | Citations                                                                      | 3/3                                                               | 4/4                                                                                               |
| E7.4 P5                     | Named pickers                                                                  | 5/5                                                               | 8/8 (P5.1 fixed)                                                                                  |
| E7.4 P6                     | The provider sentence                                                          | 5/5 (fixed)                                                       | 7/7                                                                                               |
| E7.4 P7                     | The under-18 state, on Home                                                    | 3/3                                                               | 6/6                                                                                               |
| E7.4 P8                     | The 3-hour reminder                                                            | 5/5                                                               | 5/5                                                                                               |
| E7.4 P9                     | The packet's terms                                                             | 3/3                                                               | 3/3                                                                                               |
| E7.4 P11                    | No comparison placeholder                                                      | 4/4                                                               | 7/7                                                                                               |
| E7.4 chat link              | A chat link opens the existing conversation                                    | 2/2 (fixed)                                                       | 2/2                                                                                               |
| E7.8 P1                     | Requests a minute, thread open and idle (target 12)                            | 64: fails (follow-up 4)                                           | 66: fails (follow-up 4)                                                                           |
| E7.8 P2                     | An answer painted from its frames                                              | 2/2                                                               | 2/2                                                                                               |
| E7.8 P3                     | Offline: saved thread, backing off, catch-up                                   | 2/3: the saved thread does not stay (follow-up 5)                 | 2/3: the same                                                                                     |
| E7.8 P4                     | Nothing sent from the background                                               | 0 requests: pass                                                  | 0 requests: pass                                                                                  |
| E7.10 C1 to C5              | No literal text, every key exists, no forbidden word                           | 5/5 for both apps' sources (C1 fixed)                             |                                                                                                   |
| E7.11 A1                    | Contrast of every text token and the sending bubble                            | pass for both, from the tokens                                    |                                                                                                   |
| E7.11 A2                    | Who is speaking comes first                                                    | pass (fixed)                                                      | 8/8 (fixed)                                                                                       |
| E7.11 A3                    | On/off settings are switches                                                   | pass (fixed)                                                      | 4 "is a switch" steps fail, every state step passes (follow-up 6)                                 |
| E7.11 A4                    | Choices are named and say which is chosen                                      | pass                                                              | 7/7 (fixed)                                                                                       |
| E7.11 A5                    | The largest text keeps the switches reachable                                  | pass (fixed)                                                      | the "as a switch" steps fail (follow-up 6)                                                        |
| E7.12 Z1                    | A creator's account opens the web Studio                                       | pass                                                              | can't run: no web origin                                                                          |
| E7.12 Z2                    | A fan's account has no Studio link                                             | pass                                                              | pass, but no account has a link                                                                   |
| E7.12 Z3                    | The real web lands at its sign-in, returns to the Studio, then lands signed in | pass (newly scripted, on the stack)                               | can't run: no web origin                                                                          |
| Harness contract            | The fake against the real schemas                                              | 64/64                                                             |                                                                                                   |

E7.5, E7.6, E7.7 and E7.9 have no scenario yet: see [Not run here](#not-run-here-and-why).

## The two measurements for open decisions

Both measured on the fake API, three runs each where it varies; nothing was changed.

**The native presence request budget (E7.8 P1).** Maya's thread open and idle for 60 s, every request
the app sent, against lane 7's target of 12 a minute:

| App     | Requests a minute | Presence reads (`GET …/presence`) | Offline lease (`GET …/offline`) | Presence pulse | Session check | Page |
| ------- | ----------------- | --------------------------------- | ------------------------------- | -------------- | ------------- | ---- |
| iOS     | 64                | 29                                | 29                              | 3              | 2             | 1    |
| Android | 66                | 30                                | 30                              | 3              | 2             | 1    |

Before #516 lane 7 measured 35 (iOS) and 36 (Android): #516's presence re-read every 2 s nearly
doubles the rate, and the five-second offline lease is the other half.

**The under-18 latency.** How long after an account is flagged under 18 the app shows the
adults-only state (`e7-8-under-18-latency.mjs`), the flag set at a different point of the 30-second
session check in each run:

| Where                                          | iOS               | Android           |
| ---------------------------------------------- | ----------------- | ----------------- |
| On Home: only the session check meets the flag | 28.2, 18.3, 8.9 s | 26.1, 17.4, 8.2 s |
| In an open thread                              | never, in 3 runs  | never, in 3 runs  |

On Home the delay is the wait for the next session check, as #506 expected (up to 30 s). In a thread
the thread's own presence read or offline lease meets the flag within 0 to 1.7 s, and neither app
then shows the adults-only state: see follow-up 1. Since #554 they do: in a thread on the fake API,
after 2.8, 0.9 and 2.6 s (iOS) and 4.9, 2.0 and 2.1 s (Android). On Home the wait is unchanged.

## Follow-ups

Found by these runs and not fixed here, because each needs a product decision, a design choice or
more than a small change. Each says what was seen and what would fix it. Follow-ups 1, 12 and 13
have since been fixed, each by its own pull request; each says how, and what it left open.

1. **D-11 in an open thread: the under-18 state never shows** (both apps, 3 of 3 runs each). With a
   thread open, the thread's presence read or offline lease is the first request after the flag. The
   server answers it `403 adult_eligibility_required` and ends the session there (`sessions.ts`,
   D-11), so the shell's next session check gets a plain 401, and both apps say "Your session ended.
   Continue with Pantopus again." (since #548, "Your session ended. Sign in to continue.") at sign-in
   instead of the adults-only state. On Home it works.
   Suggested fix: send a `403 adult_eligibility_required` from any authenticated request (iOS
   `W3ConversationClient.failed` and `W3ContentPresence`, Android `W3FanFeatures.kt` and
   `ContentPresence.kt`) to the shell's D-11 handling (purge, adults-only state), then add an "in a
   thread" step to P7 (`e7-4-adults.mjs`, `Lane7AdultFlows`). `e7-8-under-18-latency.mjs` repeats it.

   **Fixed by #554** (2026-11-04). Each shell has one D-11 handling (purge, drop the place, then the
   adults-only state) and a relay that a `403 adult_eligibility_required` from any authenticated
   request reaches. The realtime gateway now closes the live connection with 4403
   `adult_eligibility_required` on D-11, at the subscribe and at its 2-second check, and both apps
   route that close too. P7 gained "flagged in a thread" (P7.4) and "another refusal in a thread"
   (P7.5). On a real stack (`stack-under-18.mjs`), the adults-only state shows in a thread after 2.6
   to 2.8 s on iOS and 5.0 to 5.2 s on Android. Left open:
   - **The upgrade's plain 401:** when the flag lands between a reconnect's page read and its
     upgrade, the gateway refuses the upgrade with a plain `401`, and the app can still say "Your
     session ended".
   - **The 5-second deadline:** when the 2-second check's session lookup takes longer than 5 s, the
     gateway closes with 1013 "Reconnect with current authority" first. The session is revoked
     anyway and the 4403 lands on a closing socket, so the reconnect's page read gets a plain `401`.
   - **Screens that call the generated client themselves** aren't routed yet: calls, Studio,
     attachments, the first conversation's start on both apps, and iOS's post context. A refusal hook
     in the generated client would cover them. On Android, the comparison choice and Trust's data
     screen don't report yet either.
   - **Untested by a scenario:** the shells' own D-11 callers (the handle and intro saves, the call
     route, sign out everywhere, the passkey settings), checked only by reading and the build.
   - **Android's saved launch intent** still carries the `return_to` it was opened with, a thread
     link's path. The shell's own place is dropped.

2. **iOS: an unknown link, then Back, breaks Home** (N14, 2 of 2 runs). On Discover,
   `qelvora://app/admin` correctly says "This link is unavailable" and stays put. Back then shows
   Home as "Unavailable. Continue with Pantopus to open your account's current state." with two tab
   bars stacked at the bottom, instead of "Your people". Lane 7 passed N14 by hand before the
   consolidation, and Android passes it here. Suggested start: how `FanShell`'s link handler
   (`model.open(target, arrival:)` for a target `ApplicationDestination` doesn't permit) leaves the
   shell's error and destination for Home.
3. **Native presence breaks four of lane 7's C4 rules** (#516's reader, merged after lane 7 wrote
   them; [the rules](../archive/lanes/status/lane-7-rendering-parity.md#p1-notes-and-reactions-in-the-thread-c4)):
   - rule 1, "when": #516 reads every 2 s instead of on open, return and reconnect (iOS R4: 6 reads,
     not 3; Android R1.4 and R1.5: 6 to 29; P1 above);
   - rule 2, "every cursor": #516 reads the newest page and never follows `nextBefore`, so older visible
     Notes never show (Android R1.1 and R1.2, iOS R1);
   - rule 3, "all or nothing": a failed or slow read hides the Notes and is retried, where C4 keeps
     the last list (iOS R5, Android R1.6), and after a `403` Android keeps reading (27 requests);
   - rule 7: a Note older than the loaded messages shows at the top of a long thread before "Earlier
     messages" is opened (iOS R7). Neither app's merge filters it (`W3TimelineItem.merge`,
     `ContentTimelineItem.merge`); Android's R1.7 passes, but its search may not reach the top of a
     66-message thread;
   - and R1.3 wants the Note's label as its own element, where #516 reads label and body as one.

   STATUS already plans to move native presence onto the live stream. Deciding which rules hold,
   then making the apps or the R checks follow, settles all of them.

4. **The native presence request budget**: the measurement above. It belongs to the same decision.
5. **Offline, the saved conversation does not stay** (P3, both apps). The server's offline lease lasts
   five seconds (`conversation-offline-five-seconds-v1`) and can't be renewed offline. On iOS the
   thread shows "You're offline" and "Reconnect to send" for a second or two, then "Conversation
   unavailable. Reconnect to refresh. Your input is kept on this screen." by 7 s. WP 7.8 and E7.8 expect
   the saved thread to stay, labelled. This is the offline-lease length the founder has had open since
   2026-10-16.
6. **Android: is each switch announced as a switch?** `ToggleRow` declares `Role.Switch`, but the
   accessibility tree reports the rows as `android.view.View` (checkable, with the right state), so
   A3's and A5's "is a switch" steps fail as written. Compose reports a switch through its role
   description, which `uiautomator` doesn't show, so this is probably the check. Confirm with
   TalkBack on a phone, then make A3 and A5 read the role description.
7. **iOS at the largest text: the tab bar takes a third of the screen.** `NavigationLayout` stacks its
   four items there, and in a debug build the development banner takes about as much again, leaving the
   privacy screen a window about 270 points tall. Consider the large-content viewer for the tab bar,
   as the system tab bar does.
8. **CI's Android APK can't run every check.** It has no web origin, so no Studio link (Z1, Z3), and CI
   doesn't publish the instrumentation APK that D7 and D7U type through. A scenario variant of
   `android-review`, built with `-PcreatorApiUrl` and `-PcreatorWebUrl` set to a loopback fake, plus the
   `androidTest` APK, would let this Mac run them.
9. **iOS D3: Send sits 3 points under the keyboard's top** in landscape at the largest text (iOS 27,
   iPhone 18 Pro: Send ends at 183, the keyboard starts at 180). Android passes the same step.
10. **Release builds still register `qelvora://`** (E7.6's "the custom scheme is absent from release
    builds"): iOS declares it for every configuration in `project.yml`, Android in its main manifest,
    and both accept it in release code. WP 7.6 (links) waits on the domain.
11. **iOS reads the page twice per offline retry** at first (P3: two `GET` of the page 20 ms apart at
    each of the first two steps). Harmless within P3's limit; worth one fetcher when presence is
    reworked.
12. **Android: every other 30-second session check fails against the real API** (D6 on the stack, 4 of
    4 runs without a proxy). The logcat alternates `session_transport_failed` and `session_reconfirmed`
    30 s apart, through `adb reverse` and through the emulator's own `10.0.2.2` alike. After each failure
    the shell says "Reconnect to refresh your account. Actions are unavailable while offline.", the
    privacy screen says "Account unavailable" and drops its verification, and "Request deletion" stays
    disabled, so D6's deletion half timed out each time. The cause: the backend closes an idle
    keep-alive socket after 5 s (`keepAliveTimeout = 5000` in `local-server.ts`, and in `production.ts`
    and `deploy.ts`), while Android's shared OkHttp clients (`CreatorAPITransport` in the generated
    `QelvoraAPI.kt`, and `ConversationClient`) keep idle sockets for 5 minutes and set
    `retryOnConnectionFailure(false)`. OkHttp doesn't probe a pooled socket before reusing it for a
    `GET`, so the next check goes out on the closed socket and fails; that evicts it, and the check
    after opens a new one. Behind lane 7's `delay-proxy.mjs`, which answers `Connection: close`, no
    check failed and D6 passed 5/5. iOS's `URLSession` retries an idempotent request on a lost reused
    connection, and iOS D6 passed on the same stack. Whether the pilot sees this depends on what sits
    in front of the API. Suggested fix: give those clients a `ConnectionPool` whose keep-alive is
    under the server's 5 s, which sends nothing twice (in the generator of `QelvoraAPI.kt` and in
    `ConversationClient.kt`), or keep sockets open longer on the server than the 30-second check. Then
    run D6 without the proxy. Lane 7's fake API answers `Connection: close` for this reason.

    **Fixed by #552** (2026-11-04). The generator now emits `CreatorAPITransport` with
    `ConnectionPool(5, 3, TimeUnit.SECONDS)`, and `ConversationTransport` shares that pool, so an
    idle socket closes after 3 s, before the server's 5 s. `retryOnConnectionFailure(false)` stays on
    both, so nothing is sent twice. Over 5.5 minutes on Home the backend answered all 11 session
    checks (6 of 11 before), and Android D6 passed 9 of 10 runs without the proxy, each on a fresh
    stack. Run 4 failed when the deletion dialog closed by itself, with no transport failure; its
    cause is unknown, and the six runs after it passed. The fake API still answers
    `Connection: close` by default, and `harness/server.mjs --keep-alive` closes idle sockets after
    5 s, as the real API does. Left open:
    - **A phone's deep sleep:** OkHttp times idle sockets with `System.nanoTime()`, which stops while
      a phone sleeps, so the first session check after a wake could meet a socket the server closed.
      The emulator never sleeps; a guard needs a real phone to prove.
    - **The platform `HttpURLConnection` clients** (`Growth.kt`, `ContentFeature.kt`, `Trust.kt`,
      `NativeMediaClient.kt`) are unchanged. `Growth.kt` and `ContentFeature.kt` POST a buffered
      body, which the platform's retry on a reused socket could send again: worth checking against
      "never send twice".
    - **Hosting:** if a load balancer in front reuses its connections to the backend, the backend's
      `keepAliveTimeout` must be longer than the balancer's idle timeout, and `headersTimeout` longer
      still. Otherwise the balancer sends requests on sockets the backend has just closed and
      answers 502 (for example, 65 s behind an AWS ALB's default of 60 s).

13. **Home refuses after a conversation is deleted** (both development actors on the stack, after D6
    on each app). `GET /v1/growth/home` answers `403 scope_revoked` ("This scope is closed.") for the
    whole page, and Android shows Home as only "Unavailable. This action is unavailable to this
    account." with Try again (iOS reads the same endpoint). The account's conversation list
    (`GET /v1/conversations/account`) still returns the deleted thread 35 minutes later, and
    `canonicalConversationHomePage` (`apps/backend/src/modules/growth/home.ts`) skips a listed thread
    only when opening it fails with `thread_unavailable`, while a deleted thread fails with
    `scope_revoked`. Suggested fix: leave a deleted conversation out of the account's list, or skip
    `scope_revoked` there as well, then add a Home step after D6's deletion. Until then, run
    `stack-navigation.mjs` before `stack-drafts.mjs` on a stack.

    **Fixed by #553** (2026-11-04). Trust's `acceptedDeletions` reads the account's own tombstones,
    and the account's list leaves those conversations out in SQL, before `LIMIT`. The relationship
    row stays until the purge, which finds what to purge through it (INV-15). Home also skips a
    listed conversation that answers `scope_revoked`, so a fan's block or a restriction on the
    creator, such as an Ops pause, leaves that conversation off Home instead of refusing the page.
    Until their states are designed, Home hides a blocked thread and a paused creator
    ([decision log](../BRIEF.md#14-decision-log), 2026-11-04). `stack-drafts.mjs` gained a Home step
    after D6's deletion, which passed on both apps.

    **#555 did the same for the creator's Studio Threads** (2026-11-04). A fan's deletion or block
    refused the creator's whole Threads page with `403 scope_revoked`; now that fan leaves the list.
    Trust can also say why a scope is closed (`closedScopeReason`: `deleted`, `blocked` or
    `unavailable`, from the actor's own records only), for when Home's rows are designed; nothing
    calls it yet. `stack-closed.mjs` runs four closures on a fresh stack: a deletion, a block, an Ops
    pause and a creator's account deletion. Left open by the two:
    - **A deletion the creator's side requested:** Home skips it, but the fan's list can't leave it
      out without reading another account's tombstones, which needs SQL. By reading the code, the
      creator's purge also leaves the fan's relationship row.
    - **The creator's "Thread closed" after a block** (S-C5) has no board, and telling a block from a
      deletion on the creator's side needs the fan's block row, which needs SQL.
    - **Home's rows for a blocked thread and a paused creator** have no design and no fixed sentence,
      and whether a fan may learn that a creator's account was deleted is open
      ([design plan](../DESIGN_PLAN.md#missing-launch-surfaces)).

## Fixed in this change

No app code changed. Every fix is to a check, the fake API or the runners, and each is small: the
check asked for something the merged app or this Mac does differently, and the requirement it
encodes still holds.

- **The fake API answered two saves the wrong way.** `POST …/preferences` and `POST …/consent`
  answered a short object; the real API answers the conversation page (`feature.ts`,
  `return this.page(scope)`), which iOS decodes. On the fake, iOS's off-the-record and intro switches
  showed an error after a successful save (A3). They now answer with the page.
- **iOS 27 reports a SwiftUI `Link` as a link, not a button.** The consent flows (C1 to C5) and the
  chat link's H2 looked for the provider's terms as a button and never found them; they now accept
  either.
- **Checks older than #497, #500 and #505.** #497 gave a thread the creator is in a "Reply to …"
  composer and no step-in: Android's navigation thread matcher, N3 on both apps (now in Maya's thread)
  and Android's D6 (now "Reply to Maya") assumed the old ones. #500 replaced typed ids with named
  pickers: D6 on both apps now chooses Maya's conversation by name. #505 named the report types: its
  "Block creator" shares the form button's label, so P5.1 now takes the lowest one.
- **A2 assumed a Note another suite had posted.** "Second note" exists only after `e7-1-states.mjs`
  L5 posts it; A2 now posts it itself, on both apps.
- **A Note card is one element since #516**, its label then its body, which still puts the author
  first. Android's A2 and R1.1 looked for two elements; they now accept the label first inside one.
- **Compose reports a chosen item as checked.** Android's A4 looked for `selected`; Compose reports
  `selected` on anything but a tab as checked, with the state "Selected". A4 accepts that now.
- **A5 dragged outside the page at the largest text.** The development banner is a scroll view of its
  own there, taller than the page's, and the tab bar takes a third of the screen, so A5's drags moved
  nothing. They now start inside the page's scroll view, the lowest one, and may take up to 40 drags
  each way: reaching all four switches took 230 s.
- **H12 waited 20 s for recovery**, but the session is checked every 30 s since #506; it now waits
  40 s, as H10 and H11 already did.
- **P3 counted requests, not attempts.** When the fake drops a connection, iOS's network stack sends
  the same request again within 3 ms, up to three times. P3 now counts each attempt once (iOS: 33
  requests, 11 attempts).
- **D5 raced the fake's recreate.** The fake refuses to recreate a thread while the stopped app's live
  connection is open, which through `adb reverse` takes a moment to close; D5 now retries briefly.
- **The copy scan (E7.10 C1)** met five literals added after lane 7 wrote it, none shown to anyone:
  four presence diagnostics that both apps catch before display, and the debug-only "Use a
  development account". They join its list of allowed developer text.
- **The real-stack scripts' links carried the fake API's origin:** the Android runner's
  `LANE7_API_URL` reached the links they open (a warm link ignores it, so the navigation result
  stands). Each now sets its own, and their own reads retry once when the API closed a kept-alive
  socket under them ("other side closed").
- **The runners:** `LANE7_API_URL` gives CI's APK its API origin at every launch and cold link;
  `LANE7_IOS` now reaches the iOS link driver; `LANE7_STACK_API` and `LANE7_STACK_POSTGRES` point the
  real-stack scripts and the iOS real-stack test at any stack; and `ios-navigation.mjs` skips the
  failure diagnostics, which held the build lock for up to ten minutes per failed suite.
- **Scripted what lane 7 ran by hand:** iOS F1 and F2 (`--first`), iOS N3, N4, N7, N10 and N21's
  Spending half, the release-build scan (`e7-1-release-hook.mjs`), and Z3 (`e7-12-studio-web.mjs`,
  iOS). `e7-8-under-18-latency.mjs` measures the under-18 latency.

## Not run here, and why

- **E7.5 sign-in, E7.6 links, E7.7 push and E7.9 store readiness:** lane 7 wrote no scenario for
  them, because their work packages waited on the release sign-in (C1), the domain, push credentials
  and store accounts. E7.2's N8 and N14 to N16 cover the custom-scheme links, and the release scan
  checks E7.6's "no custom scheme in release" (follow-up 10).
- **Android Z1 and Z3:** CI builds the APK without a web origin (`creatorWebUrl`), so the app shows no
  Studio link, and Chrome's first run asks for terms a session must not accept.
- **Android D7 and D7U:** they type through the instrumentation APK (`Lane7DraftInputFlow`), and CI's
  `android-review` artifact holds only the app's debug APK.
- **Android release builds:** CI builds no release APK, and this Mac can't build Android, so the
  release scan ran on iOS only.
- **Real phones, iOS 27.1, other Android versions, and TalkBack or VoiceOver themselves:** only the
  simulator and the API 37 emulator, and the accessibility trees.

## Run them again

Bring up a stack, two fake APIs and the iOS link driver, own devices, and the two iOS builds:

```sh
node infra/local/stack.mjs up --lane devchk --base-port 56940 --growth
node tests/scenarios/lane-7/harness/server.mjs --port 56473   # iOS (its UI tests name this port)
node tests/scenarios/lane-7/harness/server.mjs --port 56944   # Android
LANE7_IOS=<simulator> node tests/scenarios/lane-7/ios-link-driver.mjs
xcodebuild build-for-testing -project apps/ios/QelvoraApp.xcodeproj -scheme QelvoraApp \
  -configuration Debug -destination 'platform=iOS Simulator,id=<udid>' -derivedDataPath <dir> \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=NO \
  CREATOR_API_URL=http://127.0.0.1:56473 CREATOR_WEB_URL=http://127.0.0.1:56473
# the stack build: the same with CREATOR_API_URL=http://127.0.0.1:56941 CREATOR_WEB_URL=http://localhost:56942
```

Then, for iOS (`LANE7_IOS=<simulator>`, the app of the matching build installed):

```sh
node tests/scenarios/lane-7/e7-1-signin.mjs ios      # also e7-1-states.mjs, e7-8-polling.mjs, e7-8-under-18-latency.mjs
node tests/scenarios/lane-7/ios-navigation.mjs <harness .xctestrun> [--a11y | --studio | --first | --presence | --seal | --consent | --adults | --citations | --comparison | --composer | --chat-link | --notifications | --pickers | --long-session | --packet | --drafts]
LANE7_STACK_API=http://127.0.0.1:56941 node tests/scenarios/lane-7/ios-navigation.mjs <stack .xctestrun> --stack
LANE7_STACK_BASE=56940 node tests/scenarios/lane-7/e7-12-studio-web.mjs <stack .xctestrun>
node tests/scenarios/lane-7/e7-1-release-hook.mjs debug=<Debug .app> release=<Release .app>
```

For iOS D6, `stack-drafts.mjs prepare-ios <fixture>`, then `LANE7_STACK_FIXTURE=<fixture>
ios-navigation.mjs <stack .xctestrun> --draft-stack`, then `stack-drafts.mjs verify-ios <fixture>`,
each with `LANE7_STACK_API` and `LANE7_STACK_POSTGRES` set.

And for Android, with CI's debug APK installed on `LANE7_ANDROID=<serial>`:

```sh
export LANE7_PORT=56944 LANE7_API_URL=http://127.0.0.1:56944
node tests/scenarios/lane-7/e7-1-signin.mjs android  # and each e7-*.mjs script with "android" or step IDs
export LANE7_STACK_API=http://127.0.0.1:56941 LANE7_STACK_POSTGRES=qelvora-lanedevchk-postgres
node tests/scenarios/lane-7/stack-navigation.mjs android  # before D6, which deletes the Maya conversation it uses
node tests/scenarios/lane-7/stack-drafts.mjs android      # D6 reaches the API directly since #552
```

D6 runs once per stack on each platform: after its deletion, `POST /v1/conversations/begin`
answers `403 scope_revoked` for that fan and Maya, so another D6 run needs a fresh stack.

The E7.10 copy scan needs no device: `node tests/scenarios/lane-7/e7-10-copy.mjs`.

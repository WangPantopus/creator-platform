# Lane 6: Creator Studio (web)

## Mission

A creator's five minutes works beautifully on a phone browser. Under the 2026-10-09 decision
(option A), creators use the web Studio on their phones during the pilot, installed to the home
screen with passkey signing; a separate native Qelvora Studio app follows after the pilot proves
the daily loop. So this lane makes the web Studio the daily tool, and it is built so the native
app can reuse its flows.

**What a person should feel.** A creator opens Studio from the home screen and lands on
**Today**. She writes a Note and signs it with one biometric, reacts to a handful of replies in
half a minute, and accepts and sends a written reply in two taps. She gets a notification when a
request arrives. It looks and feels finished in Light and Night.

## What great looks like

- Accept and send a written reply: **2 taps plus the signatures** the contract requires (today
  12 taps, 3 screens and 2 ceremonies). Decline: 2 taps (today 4).
- A Note: 1 tap to start, then sign. A reaction: 2 taps plus one signature (batched where the
  contract allows).
- Installable (manifest, service worker, offline shell); web push for requests; no 4-second
  polling.
- Matches the Studio phone boards in `design/phase4c-studio-phone` and the desktop boards for
  configuration; passes WCAG AA; the creator's time per week is measured against the under-two-
  hours gate.

## Scope

**In:** splitting `Studio.tsx`; the Today screen, Note composer, reactions, queue with rule cards
and draft-ready flag; accept-and-send and decline over contract C3; thread takeover, handback and
audit polish; the digest page; PWA and web push; polling reduction; passkey signing UX; creator
onboarding polish; a phone-width pass over My AI, Offers, Earnings, Team and License (setup stays
desktop-first); accessibility and design fidelity; creator usage instrumentation.

**Out:** the native Studio app (after the pilot), creator media and voice, Insights, calls,
anything that adds creator features to the fan app.

## You own and do not touch

Own: `modules/studio`, `features/studio`, the studio route, the app shell (`layout.tsx`,
`theme.tsx`, `globals.css`, `error.tsx`, the manifest and service worker), and your use of
`packages/ui-web`.

Do not touch: `CreatorAI.tsx` (lane 3), commerce screens and backend (lane 4), content and
growth (lane 5), identity (lane 1). You consume their contracts.

## Read first

1. Launch review section 8 (taps, design against code, copy defects) and section 12 (the file
   shape of `Studio.tsx`).
2. Design: `design/phase4c-studio-phone` (4c-01 to 4c-10), prototype 5.3 "the daily five minutes",
   `design/phase4d-studio-desktop`, BRIEF section 9 (creator studio) and section 13.
3. `apps/web/features/studio/Studio.tsx` (166 KB: read by section; find the pieces with
   `grep -n "^function\|^export function\|^const .* = (" `), `ApprovedReply.tsx`,
   `CorrectionReply.tsx`, `modules/studio/service.ts`.
4. Domain Model: INV-02, 09, 13, 22; flows F-creator-daily; the Note and Reaction objects.
5. Background: `docs/workstreams/W5-studio-content.md`, `docs/implementation/W1-studio-navigation.md`.

## Work packages

| WP | Work | Size | Gate |
| --- | --- | --- | --- |
| 6.1 | **Split `Studio.tsx`** into feature modules with no behavior change, one pull request per extracted area, visual and typecheck checks each time. **First, because it removes the biggest conflict hotspot** | M | none |
| 6.2 | **Today screen and Note composer** | M | none |
| 6.3 | **Reactions** flow and batching | S to M | contract allows batching |
| 6.4 | **Queue**: rule cards, draft-ready flag, capacity line | M | lane 4 data |
| 6.5 | **Accept-and-send and decline** over contract C3 | M | **C3 from lane 4** |
| 6.6 | Thread takeover and handback polish; a separate "question" input for "Ask for more information"; the "Let AI answer" outcome copy | S to M | with lane 4 |
| 6.7 | Digest page wired to real data | S | lane 5 |
| 6.8 | **PWA**: manifest, service worker, install prompt, offline shell, **web push** | M | lane 5's web push |
| 6.9 | Replace 4-second polling with push or WebSocket updates | S to M | none |
| 6.10 | Passkey signing UX: clear a pending publication that outlives the 5-minute window; step-up prompts | S | with lane 1 |
| 6.11 | Creator onboarding polish (verification, passkey, license, interview) | M | lanes 1 and 3 |
| 6.12 | Phone-width pass over My AI, Offers, Earnings, Team, License | M | none |
| 6.13 | Accessibility and fidelity against `design/` in Light and Night | M | none |
| 6.14 | Creator time-per-week instrumentation (C9) | S | lane 5 |

## Contracts

Provides **C10** (what Today reads). Consumes **C1**, **C3**, C4, C9, and web push from lane 5.

## Rules that bite

INV-22: every named human act is signed with a fresh passkey assertion. INV-02: approval is
personal and exact (a team member's approval is not the creator's). An `approved_draft` must read
as a third thing, never a variant of either. No layout shift on state changes. Copy through the
checklist.

## Verification: end-to-end scenarios and exit demo

No unit tests ([working agreement](01-working-agreement.md) section 3). Operate it on a
phone-sized browser, compare with the boards, and look behind the screen (the thread, the ledger
and the queue must agree with what Studio shows). Passkey scenarios use a software passkey
(Playwright with a virtual authenticator); the real Touch ID is the founder's, at the exit demo.
Until lanes 1, 4 and 5 deliver, run against the lane 2 stack with the development identity and
say which contracts were stubs.

| ID | Workflow | Edge cases to run |
| --- | --- | --- |
| E6.1 ★ | Splitting `Studio.tsx` changes nothing | For each extracted area: before and after screenshots at 390 px in Light and Night, the same network calls, the same keyboard order |
| E6.2 ★ | Today and a Note: land on Today, write a Note, choose the audience, sign, see it in an eligible fan's thread | The ceremony cancelled keeps the text; an expired assertion asks again without losing the text; empty and maximum-length Notes; emoji and right-to-left; a double tap publishes one Note; two tabs; an audience with no eligible fans warns |
| E6.3 | Reactions | Five reactions in under a minute; batching signs once if the contract allows it; undo; a reaction to a deleted reply; a thread under takeover; a duplicate is idempotent |
| E6.4 | The queue | Rule cards, the draft-ready flag and the capacity line match the backend; empty; 100 requests; an expiry removes an item without a refresh |
| E6.5 ★ | Accept and send, and decline | Count the taps and report them (target: 2 plus signatures; decline 2); the request expires while the screen is open (the button changes, with an honest message); a double tap; offline; the signature fails or is stale; a team member sees the request but cannot give the creator's approval (INV-02, INV-22) |
| E6.6 ★ | Takeover and handback | Step in: the AI stops within 500 ms and the fan sees the seal (INV-03); handback is announced (INV-04); "Ask for more information" uses its own input; a refresh and a second device show the same state |
| E6.7 | The digest | Real data; the zero state |
| E6.8 ★ | Installable, offline and push | Valid manifest and service worker; install on Android Chrome and iOS Safari; the offline shell; an update prompt after a deploy; the push permission asked in context; a push arrives while the app is closed and its tap opens the right screen; the signed-out state; after sign-out and sign-in as someone else no cached data from the first person shows |
| E6.9 | No polling | The network log shows no 4-second polling; updates still arrive; reconnect after sleep; a background tab |
| E6.10 | Passkey and onboarding | A pending publication that outlives the 5-minute window clears; step-up prompts; set-up takes ten minutes; every step is resumable; the pending-verification state; a passkey failure; the license and interview steps |
| E6.11 | The phone-width pass | 320, 360, 390 and 430 px and landscape; no horizontal scroll; the keyboard never covers the composer; Light, Night and the largest text; My AI, Offers, Earnings, Team and License |
| E6.12 | Accessibility and fidelity | Keyboard only; a screen reader hears authorship first; contrast AA in both themes; focus order; reduced motion; targets at least 44 px; compare with the boards |
| E6.13 | Instrumentation | Creator time-per-week events fire once per action |

**Exit demo:** on an iPhone in Safari and an Android phone in Chrome, install Studio to the home
screen; open Today; sign a Note; react to five replies; accept and send a request in the agreed
number of taps; decline one; receive a push for a new request; use Night mode.

## Known risks

`Studio.tsx` is the largest file in the repository; the split must not change behavior. iOS web
push works only when the site is installed to the home screen. The two-tap target depends on
contract C3, and the single-signature option needs the founder's INV-22 review.

## Decisions needed

The number of signatures per accept-and-send (with lane 4); whether batching reactions is
acceptable under INV-22.

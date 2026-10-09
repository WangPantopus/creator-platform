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

## Verification and exit demo

Operate it on a phone-sized browser (and a real phone when you can); compare with the boards.
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

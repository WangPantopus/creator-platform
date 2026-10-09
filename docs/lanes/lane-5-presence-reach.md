# Lane 5: Presence and reach

## Mission

The person shows up, and people can find the product and share it. This lane makes a creator's
Note and reaction arrive in a fan's thread and on their phone; fills the public creator page and
invites so a link makes a good first impression; joins the share card; and measures whether the
pilot is working.

**What a person should feel.** A fan gets "Maya posted a Note to Kiln Club members" on their
phone, opens the thread and sees the Note, labeled with its audience. A little later: "Maya
reacted to your reply." A creator's page is warm and complete, and a link opens the app if it is
installed and the web otherwise. A fan can turn a signed reply into a card they choose to share.

## What great looks like

- A Note or reaction reaches the right fans, and only them, in the thread and by push, within
  seconds, labeled one-to-many (INV-24). A push says "Maya replied" **only** for `human_creator`
  and `human_call`.
- A creator's public page shows a real biography, category, how fast she usually decides,
  capacity, and her AI's topics; it works without an account.
- An invite carries the creator's note. The path from link to first message is four screens.
- The share card shows the words of the signed reply, the fan chooses how their handle appears,
  and either side can revoke it (D-15).
- Every pilot gate is measurable, and per-creator data is not hidden by the small-group rule at
  pilot size without a privacy-reviewed pilot view.

## Scope

**In:** Note and reaction delivery into threads; notification producers (the 19 types, priority
first); push providers, credentials, tap routing, redaction and quiet hours; web push for
creators; the weekly impact and 72-hour digests; the public creator projection and its caching
and rate limits; invites, link metadata and the associated-domain and app-link files; the share
card; the pilot metric emitters and an aggregate view; the creator launch kit.

**Out:** the per-post "Ask about this" (blocked twice; later unless it turns out cheap),
followers audience (the follow migration is reserved), Insights, public answers, referral
incentives.

## You own and do not touch

Own: `modules/{growth,content}`, `features/{growth,content}`, the home, discover, creators,
invite, share, verify, notifications, unsubscribe and sitemap routes.

Do not touch: `modules/conversation` files that exist (lane 3). **Delivery into a thread is a new,
additive file** (`conversation/note-delivery.ts` or similar) wired by the integrator. Do not touch
Studio screens (lane 6); they read your contract.

## Read first

1. Launch review sections 6 and 9.
2. `modules/growth/{configured,contracts,creator-projection,notifications,weekly-impact,
   content}.ts` and the push providers; `modules/content/service.ts` (effects and drain near
   2846, reaction and Note publish), `modules/content/{tenure,integration}.ts`.
3. Domain Model: INV-06, 22, 24, D-15, the Note and Reaction objects; BRIEF sections 9 to 11
   (notification copy, the "never" list); `docs/implementation/growth.md`; background
   `docs/workstreams/W5-studio-content.md`, `W7-growth-insights.md`.
4. Design: `design/phase4e-4i` (notifications, share), `design/phase4a-fan-core` (a Note in a
   thread).

## Work packages

| WP | Work | Size | Gate |
| --- | --- | --- | --- |
| 5.1 | **Note and reaction delivery** into fan threads: additive file, drain the content effects, audience label and glyph fields (**contract C4**), only eligible fans | M | none |
| 5.2 | **Notification producers**, in priority order: note, reaction, answer, request status, commitment due; chunk the 500-recipient cap; the rest later | M to L | none |
| 5.3 | **Push**: compose the APNs and FCM providers, redaction, tap routing (**C7**), quiet hours, fix offline drops (APNs expiration 0 and FCM ttl 0), device registration | M | Apple and Google credentials |
| 5.4 | **Web push for creators** (VAPID) for lane 6's installable Studio | M | none |
| 5.5 | **Digests**: weekly impact and 72-hour producers | M | none |
| 5.6 | **Public creator page** (**C8**): fill biography, category, reliability, capacity, presence and photo caption; wire the public AI projection so state is not always "unpublished"; cache and rate-limit the public read path (it takes a row lock twice per request, twice per page) | M | where creators author the profile fields |
| 5.7 | **Invites and entry**: the creator's note, link preview image and cards, first message in four screens, record `useful_answer` so the install prompt can fire, the associated-domain and app-link files | M | domain |
| 5.8 | **Share card**: the creation call, the grant id, the words on the verification page, a short URL, share targets (native follows via lane 7) | L (8 to 12 days) | none |
| 5.9 | **Pilot metrics** (**C9**): the 16 event emitters, an arrival counter, an aggregate view that survives the small-group rule at pilot size with privacy review | M | privacy review |
| 5.10 | Creator launch kit and onboarding checklist | S to M | none |

## Contracts

Provides **C4** (delivery), **C7** (push and links), **C8** (public projection), **C9** (metrics).
Consumes C1, C3, C6.

## Rules that bite

INV-24 (a Note is always labeled with its audience; a fan's reply to a Note is never shown to
another fan without consent), INV-06, INV-22, D-15. Push defaults off; notification text never
reveals more than the label allows. Fans' private text does not leave the thread in a preview.

## Verification and exit demo

Test delivery eligibility (a fan outside the audience gets nothing). **Exit demo on the lane 2
stack:** a creator signs and publishes a members Note; an eligible fan receives it in the thread
and as a push (a test token on a device or the sandbox); an ineligible fan does not; the creator
reacts to a reply and the fan sees it; the public page renders a complete creator; a share card
renders from a delivered reply and can be revoked.

## Known risks

The growth stack is a guarded library that the host never composes, so expect wiring surprises.
Profile fields (bio, category) have no author yet. Push needs real credentials to prove delivery.

## Decisions needed

Where creators write their biography and category; the pilot-size metrics privacy rule; the
domain (for links).

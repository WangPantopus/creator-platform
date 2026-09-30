# Complete design inventory and cross-platform coverage

Research date: 2026-09-29. This is a planning inventory, not an implementation-completion claim. The superseded Studio Sources/Style/Test assignment produced **no new feature files or test files** before the request changed. Existing foundation work is preserved. This research changes only this document; application code, artboards, baselines, and tests are untouched.

Delivery stack: Node.js backend, Next.js web, Swift iOS, Kotlin Android. The user's native choice supersedes React Native/Expo suggestions in older documents. The product name remains replaceable configuration. `Qelvora`, Maya, Devon, Priya, and Kiln Club identify placeholder/sample source material, not final product naming.

## Coverage and authoritative sources

The six phase-4/5 canvases contain **64 artboards: 59 product/reference artboards and five interactive prototype artboards**. The five prototypes contain 21 intermediate cards plus a comprehension result state. There are **53 component contracts/previews**, a decorative Cover, and **21 phase-2 direction studies**. The latter are listed separately so historical alternatives are not shipped as competing product designs. Copied `ds/` design-system snapshots are dependencies, not additional product screens.

This audit covers the actual HTML, canvas metadata, interactive scripts, bundle implementation/CSS/types, component guidelines/previews, and behavioral documents. Display titles below are verbatim `canvas.json` titles. IDs normalize the canvas numbering. Dimensions are reference artboard sizes, not a requirement to clip scrollable content at that height.

Sources: [Product Design](../../source/Product_Design_Flows_Screens_and_Copy.md), [Domain Model](../../source/Domain_Model_and_Behavioral_Contract.md), [Architecture](../../source/System_Architecture.md), [Second Review](../../source/Second_Review_Strategy_Behavior_and_Additions.md), [BRIEF and decision log](../../BRIEF.md), [BUILD_PROMPT §9](../../BUILD_PROMPT.md#9-known-design-fixes-to-apply-while-building), [brand book](../../../design/design-system/project/README.md), [typed component contracts](../../../design/design-system/project/components/index.d.ts), [bundle.js](../../../design/design-system/project/components/bundle.js), [bundle.css](../../../design/design-system/project/components/bundle.css), [handoff module map](../../../design/handoff/README.md), [tokens](../../../design/handoff/tokens.json), and [Phase 6 audit](../../audit/AUDIT.md). Each canvas and component guideline is linked in the inventory.

The behavioral sources win over contradictory sample screens; explicit §9 fixes must be applied. Preserve every remaining approved layout, color, glyph, font, state label, and composition. A static gallery or a source audit's unverified canvas claim is not device or feature acceptance.

## Fidelity constraints that every workstream inherits

- Use source tokens for colors/type/spacing/radii/shadows/focus, source vector geometry for every glyph, and the bundled font assets. Geist is UI/AI/fan prose, Newsreader is creator words and display moments, Geist Mono is prices/counts/timestamps/IDs with tabular figures. Never put AI prose or fan summaries in the creator serif.
- Preserve authored materials: AI hairline panel, creator plate/seal, split approved-draft panel/band, neutral team surface, right-aligned fan bubble, folded Note corner, dated dashed-row receipt. Author word/glyph/color/surface travel together into screenshots, notifications and exports.
- Work on the 4px spacing grid, canonical 390px/16px phone and 1280px/248px desktop composition. Preserve tail corners, pill seals/reactions/step-in, sheet/hero radii and original component measurements. Targets are at least 44px even when the visual marker is smaller; do not enlarge the artwork arbitrarily to solve hit areas.
- Only creator plates and overlays lift with their named shadows. Toasts stay flat. Creator house-light glow means actual human presence only; never use it for historical invitations, Notes, receipts, or AI. Glass belongs only on native navigation, not content.
- Focus is a ground gap plus focus ring, with the plate-specific focus token. Disabled controls retain labels and an adjacent reason. Loading appears after 300ms. Neutral destructive dialogs use a scrim and genuine focus management rather than red inline cards.
- Source motion uses no-bounce springs, 200–300ms sheets and 120ms presses; sending/scrolling/thread opening do not animate. Reduced motion changes typing behavior. No voice autoplay. Takeover identity changes within the source 500ms target.
- Soft haptics only for real Note/reaction arrival and creator acceptance; none for AI or decline. Optional acceptance sound is off by default. Use real creator media; until available, keep labeled placeholders rather than decorative stock/generated imagery.
- At most one accent action per screen. AI owns normal thread primary actions; Ask Maya to step in is the person action and opens the approved-packet flow. Authorship remains recognizable by text and glyph without color.

## Platforms and dependencies

| Code | Required surface / supplied coverage |
| --- | --- |
| F | Fan web, Swift iOS, Kotlin Android. Canonical 390px phone composition supplied; creator/post/invite/verification links also work signed out in browser. Wider fan/tablet layouts are not separately drawn. |
| SP | Creator Studio phone, 390px. Product Design specifies mobile web Studio. User chose native apps, but native creator parity and compact editors require explicit scope/design clarification rather than invented layouts. |
| SD | Creator Studio desktop web, 1280px. My AI and Insights are desktop-first. Phone My AI supplies a live-version/digest summary, not the full editor. |
| OW | Internal operations desktop web, 1280px. No native ops design. |
| OS | System push, lock-screen, incoming-call or purchase UI on iOS/Android. Artboard is illustrative; exercise actual platform APIs rather than fake OS chrome. |
| EMAIL | Real HTML/plain-text email plus deep links. The 1280px email canvas is a review surface, not an app page. |
| SHARE | Exported image, stable verification link, browser/native share APIs. |
| REF | Interactive prototype, policy matrix, or historical design study; not automatically a shipped route. |

All applicable app surfaces require Light/Night with system preference, source font bytes/glyphs, keyboard and screen-reader behavior, safe areas, reduced motion, and 200% text sizing. Canonical phone gutter is 16px, desktop sidebar 248px. Responsive adaptations must retain exact hierarchy and authorship; unspecified breakpoints are design gaps.

| Module dependency | Owned data/actions / external seams |
| --- | --- |
| identity | Pantopus account and 18+ assertion, FanProfile, external verification, team roles, passkey attestation, SignedAct/public verification. Only permitted account data crosses the Pantopus boundary. |
| agent | Scoped approved sources/ingestion; draft/live versions; style/rules/license/sponsors; actual boundary jobs; retrieval/providers; authorized voice inputs. |
| conversation | Consent, scope, send/ack/stream and durable WebSocket events/epochs; takeover/handback; memory/provenance/delete; audited reads; offline cache. |
| handoff | Approved Packet snapshot, HumanMode/capacity, decision SLA, Commitment deadline/delivery, Instead actions and request read models. |
| access | Trial, membership/tier, pass/slots, entitlements/audience grants, renewals and refund eligibility. |
| payments | Card holds/acceptance capture, limits/refunds, ledger/receipts/payout/pool, StoreKit/Play Billing where permitted. |
| presence | Signed Notes, private Note replies, human-only reactions, corrections/retractions/audience. |
| content | Posts/media uploads, separate audience and AI-use controls, public answers/reuse consent, ShareGrant/export. |
| session | Time slots/zones, media checks/waiting, connected/reconnect/end clocks and outcomes, recording/summary consent, WebRTC/native calls. |
| insights | Privacy-safe clusters/minimum group, producer recommendations, weekly impact/reliability/usage/pool read models. |
| notifications | Outbox, authoritative in-app record, per-creator/type push/email preferences, quiet hours, sensitive-preview suppression, stable deep links. |
| safety | Reports/blocks/crisis resources, ops cases and retained audited evidence, suspension/resolution/support. |

## Provisional feature workstreams

These own complete capabilities across backend/web/Swift/Kotlin/external surfaces. Each artboard has one primary owner and explicit contributors. W1 owns shared foundations; feature owners still own fidelity and real behavior on every supported platform.

| ID | Complete capability / ownership | Contributors and actual acceptance journey |
| --- | --- | --- |
| W1 · Platform, identity & app foundations | Build/run, generated styles/copy/brand/fonts/glyphs, navigation/deep links, Pantopus/18+, fan profile/handle, creator verification/passkeys/signed acts, team roles, public verification. | All streams consume; W2 license, W5 sign clients, W8 security. Real sign-in returns to original object; signed human act verifies; reduced team roles cannot impersonate creator; all apps launch correctly. |
| W2 · Creator AI setup, knowledge & AI runtime | Interview/license, source import/approval/revocation/scopes, editable mode/style/rules, genuine boundary gates/publish/rollback/export, 72h review/regression, provider-backed retrieval/runtime and authorized voice inputs. | W1 identity, W3 turn lifecycle, W5 review UI, W6 media, W8 guardrails. Approve real material, save draft, execute gates, publish, answer with permitted citations, revoke and confirm no further use. |
| W3 · Fan conversation & real-time chat | Consent, pinned identity, ack/stream/history, citations/context/memory, offline/retry/paused/ended/update, takeover/handback protocol, fan privacy UI. | W1 session, W2 runtime, W4 entitlement/request entry, W5 takeover UI, W6 voice, W8 privacy backend. Two actual sessions exchange authored events; mid-generation takeover discards AI remainder; consent/delete/offline recover truthfully. |
| W4 · Commerce, access & human request lifecycle | Membership/tier/pass/slots, offers/capacity, packet snapshot, limit/card/IAP, hold→acceptance capture/refund, expiry/withdraw/reauthorize, status/receipt/earnings/pool. | W1 identity, W5 fulfillment, W6 outcomes, W7 reminders, W8 dispute. Eligible fan buys/submits; creator decides/delivers/resolves; every platform and ledger show the same outcome. |
| W5 · Creator Studio, content & fulfillment | Queue, packet reply/draft composer/label/sign UI, Instead/fulfillment, audited thread review/takeover controls, Notes/private replies/reactions/corrections, Publish/posts/public answers/reuse consent. | W1 signatures/roles, W2 drafts, W3 thread APIs, W4 status/money, W6 recording, W7 distribution. Daily Note→react→queue→signed reply reaches the fan with correct audience/authorship and receipt. |
| W6 · Calls & media | Scheduling/brief/checks/waiting/connected/after, clocks/reconnect/outcomes, background/lock-screen call integration, voice/media recording/upload/playback, AI audible tags/watermarks. | W1 attestation, W2 voice license, W4 acceptance/refunds, W7 reminder/push, W8 safety. Browser/native users connect, reconnect, background and finish; outcomes settle correctly and media labels survive playback/export. |
| W7 · Discovery, growth, notifications & insights | Creator/link/post/invite entrances, Home/search/categories/pass discovery, image/link/story sharing, preferences/in-app/push/email, content matches, privacy-safe impact/producer read models. | W1 public identity/deep links, W2 matching, W3 activity, W4 status/pass, W5 content, W6 calls, W8 privacy. External link reaches useful answer; correctly authored channels route to real objects; safe insight produces an actual answer. |
| W8 · Trust operations, reliability & release | Privacy/export/delete/retention backend, reports/blocks/crisis/suspension, ops verification/dispute/refund, operational jobs/metrics, release packaging and actual browser/emulator/simulator evidence. | All streams supply audited events; W3 privacy UI, W4 refunds, W5 review, W6 device outcomes, W7 preview restrictions. Least-privilege ops resolves a real case; deletion matches stated retention; real journeys are evidenced. |

W2/W4/W5/W7 are large: split by domain sub-feature inside a stream, not web/Android/iOS silos. W8 coordinates release evidence but each stream owns its debugging and visual acceptance. W1 contracts/auth/signatures/styles are a common critical path.

With five owners, merge W1+W8, W2+W3, W5+W7; retain W4 and W6. With three, use W1+W7+W8, W2+W3+W5, W4+W6. Staffing merges do not reduce scope.

## All 64 phase-4/5 artboards

Exact display titles and sizes come from canvas metadata. Production names, amounts, counts, dates and deadlines come from real data/configuration, not samples. “Night” identifies an explicitly drawn variant; every applicable screen still needs both themes.

### phase4a-fan-core

| ID | File | Exact display title | Reference size | Logical feature / drawn state | Platforms | Primary + contributors | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4A-01 | [Main.dc.html](../../../design/phase4a-fan-core/Main.dc.html) | 01 · Maya's home (public) | 390×1560 | Public creator hero, Chat/Posts/Requests/Access, authorized-AI notice, Note, modes and membership | F | W7 + W1, W2, W4, W5 | identity/content/presence/handoff/access |
| 4A-02 | [Welcome.dc.html](../../../design/phase4a-fan-core/Welcome.dc.html) | 02 · Continue with Pantopus | 390×844 | Continue with Pantopus, arrival context and original return destination, no local account | F | W1 + W7 | identity/deep links |
| 4A-03 | [Consent.dc.html](../../../design/phase4a-fan-core/Consent.dc.html) | 03 · Before your first message | 390×844 | Before first AI message: processors, creator/team logged access and memory consent | F | W3 + W1, W2, W8 | agent/conversation/identity |
| 4A-04 | [Thread.dc.html](../../../design/phase4a-fan-core/Thread.dc.html) | 04 · Thread · Maya's AI | 390×1240 | AI thread, time-based trial, source citation, removable context, memory consent, pinned strip/composer | F | W3 + W2, W4, W5 | conversation/agent/access/content |
| 4A-05 | [ThreadLive.dc.html](../../../design/phase4a-fan-core/ThreadLive.dc.html) | 05 · Thread · Maya is here (Night) | 390×1180 | Human-active Night thread, announced takeover, actual live seal, signed person words/composer | F | W3 + W1, W5 | conversation/identity/presence |
| 4A-06 | [Packet.dc.html](../../../design/phase4a-fan-core/Packet.dc.html) | 06 · Ask Maya to step in | 390×1700 | Editable approved summary/checklist, scopes, mode/capacity, private/public, ETA, hold/refund terms | F | W4 + W1, W3, W5 | handoff/conversation/access/payments/content |
| 4A-07 | [Limit.dc.html](../../../design/phase4a-fan-core/Limit.dc.html) | 07 · First paid action · spend limit | 390×844 | First paid action explicit limit or No limit, no default, set-and-send | F | W4 + W1 | payments/handoff |
| 4A-08 | [Status.dc.html](../../../design/phase4a-fan-core/Status.dc.html) | 08 · Request status and receipt | 390×1300 | Delivered status, signed personal reply, report/share, receipt | F + SHARE | W4 + W1, W5, W7 | handoff/payments/identity/presence/safety |
| 4A-09 | [Notifications.dc.html](../../../design/phase4a-fan-core/Notifications.dc.html) | 09 · Notifications | 390×980 | Distinct AI/personal/approved/team/Note/reaction/system notification rows and settings link | F | W7 + W1, W3, W4, W5 | notifications/producing modules |
| 4A-10 | [Ended.dc.html](../../../design/phase4a-fan-core/Ended.dc.html) | 10 · Free conversation ended | 390×1000 | Free conversation ended, readable history, access action and step-in retained | F | W3 + W4 | conversation/access/handoff |
| 4A-11 | [Post.dc.html](../../../design/phase4a-fan-core/Post.dc.html) | 11 · Entrance: a post, Ask Maya's AI about this | 390×1300 | Public video/context-AI entrance and locked member-title without AI action | F | W7 + W2, W3, W4, W5 | content/access/agent/conversation |
| 4A-12 | [Invite.dc.html](../../../design/phase4a-fan-core/Invite.dc.html) | 12 · Entrance: Maya's invite link | 390×844 | Signed workshop invite/guest entry, free first conversation/no card | F | W7 + W1, W2, W3, W4 | identity/content/access/conversation |
| 4A-13 | [Handle.dc.html](../../../design/phase4a-fan-core/Handle.dc.html) | 13 · Onboarding: your handle | 390×844 | Handle and optional introduction with explicit per-creator sharing | F | W1 + W3, W8 | identity/FanProfile/conversation |
| 4A-14 | [NoteThread.dc.html](../../../design/phase4a-fan-core/NoteThread.dc.html) | 14 · A Note arrives, with the thread | 390×1100 | Broadcast Note alongside thread with audience/private Note reply, distinct AI composer | F | W3 + W4, W5, W7 | presence/conversation/access |
| 4A-15 | [States.dc.html](../../../design/phase4a-fan-core/States.dc.html) | 15 · Thread states: booked, paused, offline, not sent | 390×1500 | Booked, paused, updating, offline, not sent, long session and hold-expiring compositions | F / REF states | W3 + W2, W4, W8 | conversation/agent/handoff/access/payments |
| 4A-16 | [Checkout.dc.html](../../../design/phase4a-fan-core/Checkout.dc.html) | 16 · Add a card (hold, not a charge) | 390×844 | Card form, pending bank hold, approved-draft terms, authorize hold | F (native policy gated) | W4 + W1 | payments/handoff/processor |

### phase4b-fan-account

| ID | File | Exact display title | Reference size | Logical feature / drawn state | Platforms | Primary + contributors | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4B-01 | [Main.dc.html](../../../design/phase4b-fan-account/Main.dc.html) | 01 · Home | 390×1300 | Home pinned waiting request/ETA, thread list last-authorship, new creator Note | F | W7 + W3, W4, W5, W6 | home read model/conversation/handoff/presence/session |
| 4B-02 | [Discover.dc.html](../../../design/phase4b-fan-account/Discover.dc.html) | 02 · Discover | 390×1400 | Search by need/categories, creator cards, free conversation/membership and capacity | F | W7 + W1, W2, W4 | identity/discovery/agent/access/handoff |
| 4B-03 | [Access.dc.html](../../../design/phase4b-fan-account/Access.dc.html) | 03 · Creator profile · Access | 390×1100 | Creator Access four lines, membership versus request modes, manage/unused refund | F | W4 + W1, W5 | access/handoff/payments |
| 4B-04 | [Requests.dc.html](../../../design/phase4b-fan-account/Requests.dc.html) | 04 · Requests tab | 390×1100 | Open/Delivered/Closed, waiting written request, accepted recording voice, declined call/hold released | F | W4 + W5, W6, W7 | handoff/payments/session |
| 4B-05 | [You.dc.html](../../../design/phase4b-fan-account/You.dc.html) | 05 · You | 390×1100 | You account/profile, memberships/spend and privacy/spending/receipts/settings destinations | F | W3 + W1, W4, W7, W8 | identity/access/payments/preferences |
| 4B-06 | [Privacy.dc.html](../../../design/phase4b-fan-account/Privacy.dc.html) | 06 · Me and privacy | 390×1400 | Memory, conversation access log, off-record, export/delete dialog and paid-record retention notice | F | W3 + W1, W8 | conversation/privacy/audit/retention/identity |
| 4B-07 | [Spending.dc.html](../../../design/phase4b-fan-account/Spending.dc.html) | 07 · Spending and time | 390×1000 | Monthly spending/limit, hold distinction, weekly/daily time reminders | F | W4 + W3, W7 | payments/conversation usage/notifications |
| 4B-08 | [Verify.dc.html](../../../design/phase4b-fan-account/Verify.dc.html) | 08 · Verification page (web) | 390×1000 | Stable signed-act verification, authorship/time, optional sharer handle/share card | Public web + SHARE | W1 + W5, W7, W8 | identity.verifySignedAct/content/ShareGrant |

### phase4c-studio-phone

| ID | File | Exact display title | Reference size | Logical feature / drawn state | Platforms | Primary + contributors | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4C-01 | [Main.dc.html](../../../design/phase4c-studio-phone/Main.dc.html) | 01 · Requests queue | 390×1400 | Queue commitments first, packets/rule matches, capacity, overdue never dismissed | SP | W5 + W4, W7 | queue read model/handoff/insights |
| 4C-02 | [PacketDetail.dc.html](../../../design/phase4c-studio-phone/PacketDetail.dc.html) | 02 · A request: reply or Instead | 390×1700 | Approved packet, fulfillment-first reply/draft, label preview, audited full thread, Instead alternatives | SP | W5 + W1, W2, W3, W4 | handoff/conversation/agent/identity/payments |
| 4C-03 | [Sign.dc.html](../../../design/phase4c-studio-phone/Sign.dc.html) | 03 · Review and sign | 390×844 | Review/sign sheet exact payload, request, author label and charge/delivery consequences | SP | W1 + W4, W5 | identity.beginSignedAct/handoff/payments |
| 4C-04 | [Threads.dc.html](../../../design/phase4c-studio-phone/Threads.dc.html) | 04 · Threads | 390×1000 | All/Flagged/With requests threads with report/guardrail/reviewed distinctions | SP | W5 + W3, W8 | conversation/handoff/safety |
| 4C-05 | [ThreadView.dc.html](../../../design/phase4c-studio-phone/ThreadView.dc.html) | 05 · A fan's thread: audit, take over | 390×1300 | Audited thread, filed AI reply, signed correction, read-only fan memory, takeover/pause | SP | W5 + W1, W2, W3, W8 | conversation/presence/agent/identity/safety |
| 4C-06 | [NoteCompose.dc.html](../../../design/phase4c-studio-phone/NoteCompose.dc.html) | 06 · Write a Note | 390×1100 | Note audience/text/photo/≤60s voice, separate AI-use scope, optional audience size and signed post | SP | W5 + W1, W2, W6, W7 | presence/content/agent/access/identity/media |
| 4C-07 | [MyAI.dc.html](../../../design/phase4c-studio-phone/MyAI.dc.html) | 07 · My AI: live version and 72-hour digest | 390×1300 | Live version, pause/test-as-fan, 72h countdown and regression digest reply | SP | W2 + W3, W5 | agent/conversation/insights |
| 4C-08 | [More.dc.html](../../../design/phase4c-studio-phone/More.dc.html) | 08 · More | 390×900 | More links to Offers/Publish/Insights/Earnings/Team/License/account, some destinations undrawn | SP | W5 + W1, W2, W4, W7 | navigation/destination modules |
| 4C-09 | [Replies.dc.html](../../../design/phase4c-studio-phone/Replies.dc.html) | 09 · Notes: replies feed | 390×1200 | Note private replies feed, creator-only reaction and quote-in-Note permission | SP | W5 + W1, W7, W8 | presence/content/identity/safety |
| 4C-10 | [Impact.dc.html](../../../design/phase4c-studio-phone/Impact.dc.html) | 10 · Weekly impact digest | 390×1000 | Weekly people-helped impact, AI/human/Note counts, consented private thanks | SP | W7 + W3, W5, W8 | insights/presence/conversation/consent |

### phase4d-studio-desktop

| ID | File | Exact display title | Reference size | Logical feature / drawn state | Platforms | Primary + contributors | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4D-01 | [Main.dc.html](../../../design/phase4d-studio-desktop/Main.dc.html) | 01 · Get verified and set up | 1280×900 | Six-step setup rail, Instagram proof/code and YouTube alternate, other steps named only | SD | W1 + W2, W8 | identity/external verification/passkey/agent license/interview |
| 4D-02 | [Sources.dc.html](../../../design/phase4d-studio-desktop/Sources.dc.html) | 02 · My AI · Sources | 1280×900 | Approved/candidate/revoked source scopes, approve/revoke/connect/upload, weekly check-in expiry | SD | W2 + W1, W5, W6 | agent sources/ingestion/content/media |
| 4D-03 | [Style.dc.html](../../../design/phase4d-studio-desktop/Style.dc.html) | 03 · My AI · Mode, style and rules | 1280×900 | Draft expert/companion/blend, tone/style examples, rules/never-reveal/handoff triggers | SD | W2 + W5, W8 | agent draft/style/guardrails |
| 4D-04 | [Test.dc.html](../../../design/phase4d-studio-desktop/Test.dc.html) | 04 · My AI · Test, publish, versions | 1280×900 | Actual boundary pass/fail/transcript, regression, publish gate, versions/rollback/export product controls | SD | W2 + W5, W8 | agent jobs/version lifecycle/safety |
| 4D-05 | [Offers.dc.html](../../../design/phase4d-studio-desktop/Offers.dc.html) | 05 · Offers | 1280×900 | Mode fixed price/deadline/refund/capacity/pause, membership inclusion and two-zone call window | SD | W4 + W5, W6 | handoff/access/payments/session |
| 4D-06 | [Earnings.dc.html](../../../design/phase4d-studio-desktop/Earnings.dc.html) | 06 · Earnings | 1280×900 | Earnings delivered/accepted/refunded causes, payout/tax/fees configured amounts | SD | W4 + W5, W8 | payments ledger/payout/handoff |
| 4D-07 | [Team.dc.html](../../../design/phase4d-studio-desktop/Team.dc.html) | 07 · Team and roles | 1280×900 | Team invitation/role checklists, creator-only approval/delivery/rules cannot delegate | SD | W5 + W1, W8 | identity team RBAC/audit |
| 4D-08 | [License.dc.html](../../../design/phase4d-studio-desktop/License.dc.html) | 08 · License and sponsorships | 1280×900 | Replica license/revoke/pause, separate voice consent, draft legal notice, sponsor disclosure | SD | W2 + W1, W5, W8 | agent license/sponsors/voice/identity/safety |

### phase4e-4i

| ID | File | Exact display title | Reference size | Logical feature / drawn state | Platforms | Primary + contributors | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4E-01 | [Main.dc.html](../../../design/phase4e-4i/Main.dc.html) | E1 · Before the call | 390×844 | Pre-call packet-only brief, fixed length, media checks/waiting, recording off, reconnect/grace/refunds | F + SP | W6 + W1, W4, W5 | session/handoff/payments/media |
| 4E-02 | [CallLive.dc.html](../../../design/phase4e-4i/CallLive.dc.html) | E2 · Connected (Night) | 390×844 | Connected Night video, pinned person/recording/timer chip, local media, mute/camera/end/report | F + SP | W6 + W1, W4, W8 | session/WebRTC/native call APIs/safety |
| 4E-03 | [CallAfter.dc.html](../../../design/phase4e-4i/CallAfter.dc.html) | E3 · After the call | 390×900 | Completed call receipt/signed statement, mutual summary consent/either deletion | F + SP | W6 + W1, W4 | session/payments/identity/summary consent |
| 4E-04 | [OfferTimes.dc.html](../../../design/phase4e-4i/OfferTimes.dc.html) | E4 · Creator offers times | 390×900 | Three offered slots in both zones, signed acceptance charges now and non-call refund rule | SP | W6 + W1, W4, W5, W7 | session.offerTimes/handoff/identity/payments |
| 4E-05 | [Push.dc.html](../../../design/phase4e-4i/Push.dc.html) | E5 · Lock screen: push and incoming call | 390×844 | Illustrative authored lock-screen previews and real-person incoming call | OS | W7 + W1, W3, W5, W6, W8 | notifications/APNs/FCM/CallKit/ConnectionService/session |
| 4E-06 | [IAP.dc.html](../../../design/phase4e-4i/IAP.dc.html) | E6 · Native membership purchase | 390×844 | Native membership/access lines/store price and real platform subscribe | iOS + Android / OS | W4 + W1, W7 | access/StoreKit/Play Billing/payments |
| 4F-01 | [PublicAnswer.dc.html](../../../design/phase4e-4i/PublicAnswer.dc.html) | F1 · A public answer | 390×1200 | Signed public written/voice answer, consent/anonymity, capped configured credits and context-AI | F | W5 + W1, W2, W4, W6, W7 | content/presence/access/payments credits/agent/media |
| 4F-02 | [ShareSheet.dc.html](../../../design/phase4e-4i/ShareSheet.dc.html) | F2 · Share Maya's reply | 390×900 | Reply export Image/Link/Story, verification URL, permitted words/optional handle | F + SHARE | W7 + W1, W5, W6, W8 | ShareGrant/content export/identity/share APIs |
| 4F-03 | [AIVoice.dc.html](../../../design/phase4e-4i/AIVoice.dc.html) | F3 · AI voice notes | 390×1000 | Explicit AI voice/spoken tag versus actual human voice, no autoplay | F | W6 + W1, W2, W3 | agent VoiceAsset/media/conversation |
| 4F-04 | [Insights.dc.html](../../../design/phase4e-4i/Insights.dc.html) | F4 · Insights and producer | 1280×900 | Privacy-safe clusters/min-group, group-answer entry, reasoned producer suggestion/accept/not-now | SD | W7 + W2, W5, W8 | insights/content group answer/agent/consent |
| 4G-01 | [PassYou.dc.html](../../../design/phase4e-4i/PassYou.dc.html) | G1 · Your pass | 390×1100 | Pass three slots/next-month draft/change, ended slot readable, separate membership | F | W4 + W3, W7 | access pass/slots/grants/payments |
| 4G-02 | [DiscoverPass.dc.html](../../../design/phase4e-4i/DiscoverPass.dc.html) | G2 · Discover with the pass | 390×1000 | Pass discovery slot markers, membership and free conversation before slot use | F | W7 + W2, W4 | discovery/access/agent |
| 4G-03 | [Pool.dc.html](../../../design/phase4e-4i/Pool.dc.html) | G3 · Pool earnings | 1280×900 | Pool cycle/pro-rated active slot days and configured payout, no amounts in push | SD | W4 + W7, W8 | payments pool/ledger/access/insights |
| 4H-01 | [OpsQueue.dc.html](../../../design/phase4e-4i/OpsQueue.dc.html) | H1 · Ops queue | 1280×900 | Ops safety/verification/dispute queue, categories without fan text, authorized case access | OW | W8 + W1, W5, W7 | safety/identity RBAC/audit |
| 4H-02 | [OpsCase.dc.html](../../../design/phase4e-4i/OpsCase.dc.html) | H2 · A dispute | 1280×900 | Audited dispute/retained packet and delivery, sold mode versus approved draft, reasoned resolution/refund/notify | OW | W8 + W1, W4, W5, W7 | safety/handoff/identity/payments/retention/notifications |
| 4I-01 | [NotifMatrix.dc.html](../../../design/phase4e-4i/NotifMatrix.dc.html) | I1 · Every notification, three channels | 1280×1300 | Type/sender/preview/never matrix, preferences/quiet hours: board 14 rows versus source 19 | REF → F / OS / EMAIL | W7 + W1, W2, W3, W4, W5, W6, W8 | notifications/all producing modules |
| 4I-02 | [Email.dc.html](../../../design/phase4e-4i/Email.dc.html) | I2 · Emails | 1280×1000 | Personal-reply and audience-labeled Note templates, verified link and preferences | EMAIL | W7 + W1, W5, W8 | notifications email/identity/deep links/presence |

### phase5-prototypes

| ID | File | Exact display title | Reference size | Logical feature / drawn state | Platforms | Primary + contributors | Dependencies |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 5.1 | [Main.dc.html](../../../design/phase5-prototypes/Main.dc.html) | 5.1 · Link in bio to a first cited answer | 390×844 | Four-state link in bio → Pantopus/consent → question/typing → first cited answer | REF → F | W3 + W1, W2, W7 | identity/conversation/agent/access/content |
| 5.2 | [StepIn.dc.html](../../../design/phase5-prototypes/StepIn.dc.html) | 5.2 · Step in to a signed reply | 390×844 | Five-state step-in → approved packet → held/waiting → signed reply → share card | REF → F | W4 + W1, W3, W5, W7 | handoff/payments/conversation/identity/ShareGrant |
| 5.3 | [Daily.dc.html](../../../design/phase5-prototypes/Daily.dc.html) | 5.3 · The creator's daily five minutes | 390×844 | Four-state daily Note → React → Queue → sign approved draft | REF → SP | W5 + W1, W4, W7 | presence/identity/handoff/payments/agent |
| 5.4 | [Onboard.dc.html](../../../design/phase5-prototypes/Onboard.dc.html) | 5.4 · Onboarding to a published AI | 1280×800 | Four-state source approval → boundary passes → live/72h review → first digest | REF → SD | W2 + W1, W3, W5, W8 | agent/identity/conversation/insights |
| 5.5 | [Comprehension.dc.html](../../../design/phase5-prototypes/Comprehension.dc.html) | 5.5 · Who wrote this? (comprehension test) | 390×844 | Four AI/approved/human/team comprehension cards plus score result, under-one-second identity | REF | W1 + W2, W3, W5, W7, W8 | identity labels/component system/source T-21 |

Primary board allocation: W1 6, W2 6, W3 9, W4 13, W5 10, W6 5, W7 13, W8 2. Counts include prototype/reference boards and do not measure backend/provider/device effort.

## Every prototype state and result

A single opening frame is not a complete prototype. The source scripts use local `next`/`Restart` controllers. Their simulated “See the answer,” “Maya accepted,” and publish transitions must be replaced by real server events, provider output, signatures, and ledger state in the product. Never ship a button that fabricates acceptance. Prototype chrome is a reference aid, not a requirement for production UI.

| Flow / source logic state | Designed state and action | Production dependencies / contributors |
| --- | --- | --- |
| 5.1 s0 | Public creator profile from Instagram bio, Message Maya’s AI | W7 entrance/context, W1 identity, W3 thread entry |
| 5.1 s1 | Processor/access notice plus Continue with Pantopus | W1 real SSO/18+, W2 provider configuration, W3 consent |
| 5.1 s2 | Fan question and accepted/typing AI, See the answer | W3 durable acknowledgement/stream, W2 generation |
| 5.1 s3 | First cited answer with source timestamp 2:40, under-two-minute value target | W2 authorized source/provenance, W3 citation and author, W7 entrance attribution |
| 5.2 s0 | Fan thread and Ask Maya to step in, AI does not upsell | W3 thread, W4 eligibility |
| 5.2 s1 | Included-in-request editor, decision ETA and acceptance-only charge terms | W4 approved snapshot/hold, W3 separate full-thread access notice |
| 5.2 s2 | Hold/waiting stepper, one-day-later simulation and open reply | W4 actual accept/capture, W5 creator action, W7 update |
| 5.2 s3 | Announced takeover and signed personal reply, Share this reply | W3 epoch cancellation, W5 delivery, W1 signature, W4 fulfillment |
| 5.2 s4 | Square authored share artifact and public verification link | W7 export, W5/W8 authorization, W1 verify |
| 5.3 s0 / NOTE | Text Note, named audience, sign/post | W5 audience/content, W1 SignedAct, W7 distribution |
| 5.3 s1 / REACT | Private fan Note reply, creator-only React | W5 real reaction, W1 signature, W7 truthful notification |
| 5.3 s2 / QUEUE | Packet with ready draft, Open | W4 actual queue, W2 draft, W5 fulfillment |
| 5.3 s3 / SIGN | Exact approved-draft label/content and acceptance charge shown in signing sheet | W1 attestation, W5 approved-draft delivery, W4 capture, no relabeling as personal |
| 5.4 s0 | Two candidate sources with distinct public/tier scope, Approve both | W2 explicit persistent approval, W1 creator authority |
| 5.4 s1 | Six genuine standard boundary gates pass, Publish v1 | W2 run/publish gate, W8 classifier/guardrails |
| 5.4 s2 | Live v1 and 72-hour review explanation, first conversation | W2 live pointer/digest clock, W3 actual replies, no approval-count reply gate |
| 5.4 s3 | First DigestItem and I’d never say that regression path | W2 filed case/rerun, W5 review, W3 underlying conversation |
| 5.5 c0 / i=0 | AI authorship card and answer choices | W1 identity, W3 message |
| 5.5 c1 / i=1 | Approved draft as a third authorship state | W1 split default, W5 signed approval, W3 rendering |
| 5.5 c2 / i=2 | Human creator card with seal/signature | W1 identity, W3/W5 person surface |
| 5.5 c3 / i=3 | Team card with member name and dashed-square identity | W1 roles, W3/W5 team surface |
| 5.5 done / i≥4 | You got {score} of 4, restart. Truth order ai/draft/maya/team | W1/W8 participant comprehension evidence against source T-21, no invented pass threshold |

## All 53 component contracts and state families

Each row links the source preview and behavior/style guideline. These are reusable patterns, not evidence of working mutations. Read the [typed contract](../../../design/design-system/project/components/index.d.ts) with the actual bundle: static previews/local example state are not production callback/binding implementation. Preserve exact glyph paths rather than substituting SF Symbols or platform material icons.

Component “Primary” means semantic/feature accountability. W1 remains the shared-file integration and fidelity-foundation custodian: owners submit isolated feature additions or obtain a narrow edit lease. This table does not authorize concurrent edits to shared bundles, monolithic native component files, navigation roots, token/copy generators, manifests or lockfiles. See [shared-file custodians](../CONTRACTS.md#shared-file-custodians).

| Component / preview | Guideline | Primary | Props, states and visual/behavioral requirement | Consumers |
| --- | --- | --- | --- | --- |
| [Mark](../../../design/design-system/project/components/Mark/preview.html) | [README](../../../design/design-system/project/components/Mark/README.md) | W1 | Seven AuthorKind marks, initial/size/live/onMaya, only beside their author | All authored surfaces |
| [Seal](../../../design/design-system/project/components/Seal/preview.html) | [README](../../../design/design-system/project/components/Seal/README.md) | W1 | Initial/size/live, correct on-plate versus off-plate colors, glow only actual presence | W3/W5/W6/W7 signed human acts |
| [Avatar](../../../design/design-system/project/components/Avatar/preview.html) | [README](../../../design/design-system/project/components/Avatar/README.md) | W1 | 38px initial tile and actual-live halo | W3/W5/W7 lists and headers |
| [AuthorLabel](../../../design/design-system/project/components/AuthorLabel/preview.html) | [README](../../../design/design-system/project/components/AuthorLabel/README.md) | W1 | AI/approved/human/broadcast/reaction/team/correction, audience/member/time/onMaya | All messages, screenshots, notifications, exports |
| [IdentityStrip](../../../design/design-system/project/components/IdentityStrip/preview.html) | [README](../../../design/design-system/project/components/IdentityStrip/README.md) | W3 | ai/human/team/paused/updating, pinned and read before body | W1/W2/W5 thread identity |
| [ThreadHeader](../../../design/design-system/project/components/ThreadHeader/preview.html) | [README](../../../design/design-system/project/components/ThreadHeader/README.md) | W3 | Official-AI subtitle versus live In this conversation | W1/W5 avatar/back/subtitle |
| [SignedMarker](../../../design/design-system/project/components/SignedMarker/preview.html) | [README](../../../design/design-system/project/components/SignedMarker/README.md) | W1 | Verification href, name/time/extra/size, underline label only, timestamps no wrap | W5/W7 every human and approved act |
| [SystemLine](../../../design/design-system/project/components/SystemLine/preview.html) | [README](../../../design/design-system/project/components/SystemLine/README.md) | W3 | plain/presence/date, actual-live halo/time, announced takeover/handback | W5/W6 control transitions |
| [Message](../../../design/design-system/project/components/Message/preview.html) | [README](../../../design/design-system/project/components/Message/README.md) | W3 | fan/ai/team/human_creator/approved_draft, pending/failed/accepted/streaming/interrupted, split default/gradient/stacked, citation/sponsor/actions/meta/after/live | W1/W2/W5/W7 every echoed message |
| [Note](../../../design/design-system/project/components/Note/preview.html) | [README](../../../design/design-system/project/components/Note/README.md) | W5 | Named audience/media/optional size/private reply/retracted, folded corner, broadcast not private reply | W3/W6/W7 home/thread/Studio |
| [ReactionChip](../../../design/design-system/project/components/ReactionChip/preview.html) | [README](../../../design/design-system/project/components/ReactionChip/README.md) | W5 | Human creator only, person surface and signed provenance, never team | W1/W3/W7 fan reply/update |
| [CitationChip](../../../design/design-system/project/components/CitationChip/preview.html) | [README](../../../design/design-system/project/components/CitationChip/README.md) | W2 | title/meta/stamp/href, available/unavailable source or lost audience access | W3/W4 citations/source revocation |
| [MemoryChip](../../../design/design-system/project/components/MemoryChip/preview.html) | [README](../../../design/design-system/project/components/MemoryChip/README.md) | W3 | saved/ask, consent before sensitive storage, remove/provenance | W8 privacy backend |
| [Correction](../../../design/design-system/project/components/Correction/preview.html) | [README](../../../design/design-system/project/components/Correction/README.md) | W5 | Original AI visible plus signed person annotation/times | W1/W2/W3 logged correction/regression |
| [ContextCard](../../../design/design-system/project/components/ContextCard/preview.html) | [README](../../../design/design-system/project/components/ContextCard/README.md) | W3 | Origin/source/title, removable before send, audience enforced | W5/W7 post/Instagram entrance |
| [VoiceNote](../../../design/design-system/project/components/VoiceNote/preview.html) | [README](../../../design/design-system/project/components/VoiceNote/README.md) | W6 | human/ai, duration/transcript, no autoplay, audible AI label baked into file | W2/W3/W5 notes/thread/public answer |
| [Composer](../../../design/design-system/project/components/Composer/preview.html) | [README](../../../design/design-system/project/components/Composer/README.md) | W3 | ai/trial/paused/ended/human/capacity_zero, trial time/back date/unique id, ended keeps step-in | W2/W4/W5 access and lifecycle |
| [StepIn](../../../design/design-system/project/components/StepIn/preview.html) | [README](../../../design/design-system/project/components/StepIn/README.md) | W4 | Only person-colored thread action, disabled adjacent capacity reason, opens packet not checkout | W3 fan thread |
| [AccessLines](../../../design/design-system/project/components/AccessLines/preview.html) | [README](../../../design/design-system/project/components/AccessLines/README.md) | W4 | You can/Included/By request/Changes fixed semantics | W7 profile/pass/native purchase |
| [ModeList](../../../design/design-system/project/components/ModeList/preview.html) | [README](../../../design/design-system/project/components/ModeList/README.md) | W4 | Selected/disabled radios, fixed price, deadline/refund/capacity, unique group | W5/W6 packet/offers |
| [IncludeList](../../../design/design-system/project/components/IncludeList/preview.html) | [README](../../../design/design-system/project/components/IncludeList/README.md) | W4 | Editable sans summary with checkbox, checked/help/edited/notice, summary+recent on and whole-thread+identity off | W3/W5 approved packet |
| [TermsBlock](../../../design/design-system/project/components/TermsBlock/preview.html) | [README](../../../design/design-system/project/components/TermsBlock/README.md) | W4 | price/deadline/no-charge outcomes/bank hold notice/optional approved-draft note | W5/W6 every hold |
| [EtaLine](../../../design/design-system/project/components/EtaLine/preview.html) | [README](../../../design/design-system/project/components/EtaLine/README.md) | W4 | Record-based decision range and optional ahead count, absolute deadline alongside | W5/W7 status/queue |
| [RequestStatus](../../../design/design-system/project/components/RequestStatus/preview.html) | [README](../../../design/design-system/project/components/RequestStatus/README.md) | W4 | Request/mode/price, done/current/todo, outcome/children, no nested status card | W5/W6/W7 request truth |
| [Receipt](../../../design/design-system/project/components/Receipt/preview.html) | [README](../../../design/design-system/project/components/Receipt/README.md) | W4 | Dated request/title, dashed label-value rows/seal/authorship, reflects ledger | W1/W5/W6 delivery/refund |
| [SpendLimit](../../../design/design-system/project/components/SpendLimit/preview.html) | [README](../../../design/design-system/project/components/SpendLimit/README.md) | W4 | No default, explicit amount or No limit, lower now and raise after 24h | W7 reminder |
| [QueueCard](../../../design/design-system/project/components/QueueCard/preview.html) | [README](../../../design/design-system/project/components/QueueCard/README.md) | W5 | packet/commitment/rule, due/overdue/shared/draftReady, no dismissal of unresolved commitments | W2/W4 daily queue |
| [CapacityHeader](../../../design/design-system/project/components/CapacityHeader/preview.html) | [README](../../../design/design-system/project/components/CapacityHeader/README.md) | W4 | Live mode used/limit and context line | W5 queue/offers |
| [LabelPreview](../../../design/design-system/project/components/LabelPreview/preview.html) | [README](../../../design/design-system/project/components/LabelPreview/README.md) | W5 | AuthorKind exactly what fan sees before send | W1/W3 personal/approved/team |
| [SigningSheet](../../../design/design-system/project/components/SigningSheet/preview.html) | [README](../../../design/design-system/project/components/SigningSheet/README.md) | W1 | Exact payload/title/rows/action and actual attestation, not ornamental Face ID | W4/W5/W6 consequential acts |
| [AuditBanner](../../../design/design-system/project/components/AuditBanner/preview.html) | [README](../../../design/design-system/project/components/AuditBanner/README.md) | W8 | Opening logged and visible to fan, before scoped audited read | W3/W5 creator thread/ops |
| [SourceRow](../../../design/design-system/project/components/SourceRow/preview.html) | [README](../../../design/design-system/project/components/SourceRow/README.md) | W2 | approved/candidate/revoked and public/tier scopes, explicit approve/revoke | W4 entitlement |
| [Button](../../../design/design-system/project/components/Button/preview.html) | [README](../../../design/design-system/project/components/Button/README.md) | W1 | ai/maya/secondary/quiet, md/lg/block/link/type/disabled, plate quiet uses plate ink, 44px hit area | All streams |
| [TabBar](../../../design/design-system/project/components/TabBar/preview.html) | [README](../../../design/design-system/project/components/TabBar/README.md) | W1 | Home/Discover/Requests/You active, notifications separate entry | W3/W4/W7 fan shell |
| [Segmented](../../../design/design-system/project/components/Segmented/preview.html) | [README](../../../design/design-system/project/components/Segmented/README.md) | W1 | Items/active/accessible label, corrected selected surface on sunken track | W3/W4/W5/W7 sections |
| [Notice](../../../design/design-system/project/components/Notice/preview.html) | [README](../../../design/design-system/project/components/Notice/README.md) | W1 | neutral/paused/error/offline, remaining capabilities stated, no purchase rescue | W2/W3/W4/W6/W8 |
| [NotificationRow](../../../design/design-system/project/components/NotificationRow/preview.html) | [README](../../../design/design-system/project/components/NotificationRow/README.md) | W7 | ai/maya/note/approved/reaction/team/system, audience/unread/time/system label, type sets sender | All producing streams |
| [EmptyState](../../../design/design-system/project/components/EmptyState/preview.html) | [README](../../../design/design-system/project/components/EmptyState/README.md) | W1 | Required title/body and one forward action, neutral surface | All lists/first use |
| [ShareCard](../../../design/design-system/project/components/ShareCard/preview.html) | [README](../../../design/design-system/project/components/ShareCard/README.md) | W7 | Only permitted author words/time, stable verify URL, optional consented sharer handle | W1/W5/W8 export |
| [CallChip](../../../design/design-system/project/components/CallChip/preview.html) | [README](../../../design/design-system/project/components/CallChip/README.md) | W6 | Pinned person label/fixed timer, recording false unless both agreed | W1/W4 call |
| [ReservedLabel](../../../design/design-system/project/components/ReservedLabel/preview.html) | [README](../../../design/design-system/project/components/ReservedLabel/README.md) | W1 | fan_agent/ai_call/ai_video dashed disabled, never enabled fan states here | W2/W6/W8 future reference |
| [Countdown](../../../design/design-system/project/components/Countdown/preview.html) | [README](../../../design/design-system/project/components/Countdown/README.md) | W4 | neutral/soon/overdue mono, no wrap, no every-second screen-reader spam | W3/W5/W6 trial/deadline/call |
| [InsteadMenu](../../../design/design-system/project/components/InsteadMenu/preview.html) | [README](../../../design/design-system/project/components/InsteadMenu/README.md) | W5 | More info/different mode/decline/free reply, none fulfills paid mode or charges | W4 decision state |
| [TestConsole](../../../design/design-system/project/components/TestConsole/preview.html) | [README](../../../design/design-system/project/components/TestConsole/README.md) | W2 | pass/fail/running, version/transcript/why, publish disabled until genuine pass | W8 product boundary gates |
| [VersionList](../../../design/design-system/project/components/VersionList/preview.html) | [README](../../../design/design-system/project/components/VersionList/README.md) | W2 | draft/live/retired, date/changes/live pointer/rollback | W3 active runtime |
| [DigestItem](../../../design/design-system/project/components/DigestItem/preview.html) | [README](../../../design/design-system/project/components/DigestItem/README.md) | W2 | Reply/handle/time, filed regression, 72h review | W3/W5 creator review |
| [StudioTabBar](../../../design/design-system/project/components/StudioTabBar/preview.html) | [README](../../../design/design-system/project/components/StudioTabBar/README.md) | W1 | Notes/Requests/Threads/My AI/More, waiting packet and due commitment badge only | W2/W4/W5 phone shell |
| [Sidebar](../../../design/design-system/project/components/Sidebar/preview.html) | [README](../../../design/design-system/project/components/Sidebar/README.md) | W1 | Exact 248px desktop sections, request badge and live AI status | W2/W4/W5/W7 desktop shell |
| [Sheet](../../../design/design-system/project/components/Sheet/preview.html) | [README](../../../design/design-system/project/components/Sheet/README.md) | W1 | Bottom grabber/title/meta/body/stacked actions, avoid stacked sheets | W4/W5/W7 |
| [Dialog](../../../design/design-system/project/components/Dialog/preview.html) | [README](../../../design/design-system/project/components/Dialog/README.md) | W1 | Consequential confirm/cancel/destructive semantics, neutral over scrim, focus trap/restore | W2/W4/W8 |
| [Toast](../../../design/design-system/project/components/Toast/preview.html) | [README](../../../design/design-system/project/components/Toast/README.md) | W1 | Short flat confirmation, ≤1 action, 4s with accessibility pause | All mutations |
| [Skeleton](../../../design/design-system/project/components/Skeleton/preview.html) | [README](../../../design/design-system/project/components/Skeleton/README.md) | W1 | message/row, after 300ms, reduced motion | All loading |
| [EmailFrame](../../../design/design-system/project/components/EmailFrame/preview.html) | [README](../../../design/design-system/project/components/EmailFrame/README.md) | W7 | AuthorKind/from/subject/time/CTA/footer, human versus broadcast identity | W1/W5/W8 real email |

`glyphs` exports 37 named vector paths; these are shared resources, not extra component contracts. [Cover/preview.html](../../../design/design-system/project/components/Cover/preview.html) is decorative and has no product workflow.

## All 27 honest states and actual visual coverage

Product Design §8 labels its initial list “twenty-two”; five review additions bring it to **27**. A related action or a generic component is partial design coverage, not a complete fan-and-creator state. The obsolete five-message/pass-first trial row is superseded by D-26/D-23: about 24 hours, graceful natural-pause ending, membership first.

| State | Designed reference / missing composition | Platforms | Accountable feature + contributors | Required behavior |
| --- | --- | --- | --- | --- |
| AI updating | 4A-15 updating IdentityStrip, 4C-07 My AI context. Creator publish progress/error layout missing | F + SP/SD | W2 + W3 | Requests/history remain usable, active version and generation boundary truthful |
| AI paused by creator | 4A-15 paused strip/composer, 4C-07 pause action | F + SP/SD | W2 + W3 | History readable, return date, requests if modes open |
| AI paused for this fan | 4C-05 Pause for fan action only, fan-specific composer not drawn | F + SP | W3 + W5 | No reason exposed to fan, flag in creator thread, reading/eligible requests |
| Creator paused entirely | License pause action, full profile/slot replacement state undrawn | F + SD | W1 + W2 + W4 + W7 | W1 account authorization, W2 AI runtime pause, W4 availability/capacity. Hide modes, return date, preserve history, offer eligible replacement |
| Creator suspended or authorization revoked | Ops/license actions only, paired fan/creator resolution states undrawn | F + SP/SD/OW | W8 + W1 + W2 + W4 | Neutral fan notice, support contact creator-side, commitments automatically resolve |
| Slot ended | 4G-01 readable past selection line, no full ended-slot composer | F | W4 + W3 | Reading/memory remain, next-month slot and tier-dependent request rights |
| Trial exhausted (time-based) | 4A-10 ended composer and 4A-04 trial time | F | W4 + W3 | No interruption mid-disclosure, reading/eligible requests, no obsolete five-message cap |
| Allowance exhausted | No dedicated state, Composer ended is not allowance-specific | F | W4 + W3 | Explicit reset date, reading/eligible requests, no purchase escape from failure |
| Capacity zero | 4A-15 booked Composer, ModeList disabled row, 4C-01 capacity | F + SP/SD | W4 + W3 + W5 + W7 | Explain reopening time, AI chat continues |
| Payment hold fails | Generic Notice error only, full draft retry/card-auth failure not drawn | F (native policy gated) | W4 | Nothing shared/submitted, draft retained, retry/change card |
| Packet expired | No complete expiry outcome screen, request stepper reusable | F + SP | W4 + W5 + W7 | Nothing charged, queue removed only by real terminal event, reliability update/resubmit |
| Declined | 4B-04 declined call/hold-release status, InsteadMenu alternative | F + SP | W4 + W5 | Nothing charged, optional reason, no penalty, AI/resubmit |
| More info requested | InsteadMenu offers action, inline fan response and creator waiting screen undrawn | F + SP | W4 + W5 | No capture, fan can answer or withdraw, changes cannot silently alter offer |
| Deadline missed | 4C-01 overdue commitment, 4D-06 late/refund earnings sample. Fan outcome not fully drawn | F + SP/SD | W4 + W5 + W7 | Automatic refund, overdue remains actionable, late delivery labeled/no charge |
| Creator no-show | 4E-01 rules only, after-call no-show state undrawn | F + SP | W6 + W4 | Grace-based refund/rebook, reliability hit only with proven creator no-show |
| Fan no-show | 4E-01 rules only, fan/creator outcome undrawn | F + SP | W6 + W4 | Charged as agreed, fan_no_show not delivered, rebook |
| Reconnecting | 4E-02 normal connected call only, reconnect layout undrawn | F + SP/OS | W6 + W4 | Connected timer pauses, bounded allowance, same session resumes |
| Takeover mid-generation | 4A-05 and 5.2 s3 show result, no live canceled-generation capture | F + SP | W3 + W2 + W5 | Remove typing/discard remainder, new epoch, announce human before words |
| Memory deleted by fan | 4B-06 memory/delete controls, empty/confirmation state only generic components | F | W3 + W8 | Deleted item removed; minimal exclusion retained to prevent re-extraction, no creator notification, remaining conversation usable. Thread/account deletion follows its separate lifecycle |
| Source revoked | 4D-02 revoked SourceRow, CitationChip unavailable preview | F + SD | W2 + W3 | No new use, old citation unavailable, rights/index caches invalidated |
| Guardrail block | 4C-04 flagged thread and 4D-04 failing transcript only. Fan unsupported/safety/crisis variants undrawn | F + SP/SD/OW | W2 + W8 + W3 + W5 | Separate unsupported-material from safety refusal, resources when relevant, no paid-access sales in safety refusal |
| Blocked or reported | Report actions/ops cases shown, closed-thread/appeal layouts undrawn | F + SP/OW | W8 + W3 + W5 | Neutral closed thread/no contact, support reachable |
| Call ended early by creator | 4E-03 completed call only, partial receipt/outcome undrawn | F + SP | W6 + W4 | Before-80%-duration creator ending, prorated unused portion refund, rebook |
| Call technical failure | No failure after-call composition | F + SP | W6 + W4 | Exhausted reconnect, rebook/refund, no reliability hit, outcome evidence survives |
| Long-session reminder | 4A-15 exact plain SystemLine | F | W3 + W2 + W7 | Three-hour continuous AI reminder, separate companion daily signal, no blocking sales |
| Hold expiring before decision | 4A-15 re-authorize/withdraw Notice, creator decide-by banner not drawn | F + SP | W4 + W5 + W7 | Reauthorize or withdraw with no automatic surprise capture |
| Message not accepted | 4A-15 failed fan Message/Retry, Message preview pending state | F | W3 + W4 | Grey pending/not-sent, explicit retry, no allowance spent unless durable acceptance |

Neither party may be told “Maya read/saw” without an appropriate human event. Separate decision SLA from delivery deadline. No failure offers purchase as rescue; preserve what still works. Reconnection, no-show, early-ending, and technical-failure are distinct ledger outcomes, not cosmetic variants.

## All 19 notification types and three-channel coverage

The source §9 requires **19 types**; 4I-01 has 14 policy rows. In-app is the authoritative record and cannot be turned off. Push/email are separately controlled per creator/type, with quiet hours and sensitive-preview hiding. Fan email default is weekly, creator daily. W7 owns envelope/delivery/prefs; the producing domain owns accurate event/current-state data. Labels vary by author state, never by a trigger actor's display name.

| Type | Drawn reference | Sender / recipient | Preview restrictions | Producing contributors to W7 |
| --- | --- | --- | --- | --- |
| AI reply | 4A-09,4I-01,4E-05 | Maya’s AI, fan | First line, never creator as sender | W3/W2 |
| Approved draft delivered | 4A-09,4I-01 | Approved by Maya, fan | First line, never Maya replied | W5/W4/W3 |
| Personal reply or voice | 4A-09,4I-01,4E-05,4I-02 personal email | Maya, fan | First line or voice note, no restricted text | W5/W6/W4 |
| Request status | 4A-09,4I-01,4E-05 | Request update/system, fan | Status+creator, never price | W4 |
| Call reminder | 4I-01 | System, both | Time/duration/join, never packet content | W6/W4 |
| Answered publicly | 4I-01 | System, asker | Post title, never fan question text | W5/W4 |
| Posted about what you asked | Not separately drawn | System, fan | Permitted post title/open-loop topic, no restricted post text | W2/W3/W5 |
| Creator announcement | 4I-01 team example | Maya or Maya’s team, eligible fans | First line and truthful audience, never personal framing | W5 |
| Creator-initiated offer | Not separately drawn | Maya, fan | Offer wording only, never auto-acceptance | W4/W5/W6 |
| Slot change applied | Not separately drawn | System, fan | Creators changed on cycle start only | W4 |
| New packet | 4I-01 | System, creator/authorized team | Handle/mode/due/summary first line, never full thread. Source table also allows price, artboard omits it | W4/W5 |
| Commitment due soon/overdue | 4I-01 | System, creator only | Handle/mode/time, no snooze for overdue | W4/W5 |
| Guardrail event or report | Not separately drawn | System, creator/ops | Category, never fan text in push | W2/W8 |
| Pool share posted | 4I-01 | System, creator | Slots/cycle, amount in-app only | W4 |
| New Note | 4A-09,4I-01,4E-05,4I-02 Note email | Maya · to named audience, audience fans | First line/voice, never Maya messaged you | W5 |
| Reaction | 4A-09,4I-01 | Maya reacted to your reply, fan | Fan reply first words, never team-originated | W5 |
| Public answer published | Not separately drawn | System, similar-question eligible audience | Title, never asker identity | W5/W7 |
| Spending reminder | 4I-01 | System, fan | Percent of own limit, never amounts on lock screen | W4 |
| Weekly impact digest | 4C-10,4I-01 | System, creator | People helped/thanks, never fan identities without consent | W5/W7 |

4I-02 provides two actual email compositions, not a template for each event. Dedicated notification preferences/quiet-hours/sensitive-preview pages, web push policy, digest assembly, unsubscribe/restore feedback, permission-denied OS states, expired-target deep links, and most email/type variants are missing designs. Use each event's canonical restrictions across in-app/push/email/share/search; a safe in-app message must not become unsafe in lock-screen text. Recheck current grants/revocations before delivery.

## Product-screen IDs, including requirements without complete artboards

The source S-F/S-C inventory is broader than the artboard filenames. This crosswalk ensures a missing dedicated screen remains owned rather than falling out of a backlog.

| Source logical screen / surface | Supplied references | Owner + contributors | Incomplete design scope |
| --- | --- | --- | --- |
| S-F1 Onboarding | 4A-02/13,5.1 | W1 + W3/W7 | Sign-in/handle drawn, full consent/access/intro/return flow and error variants incomplete |
| S-F2 Home | 4B-01 | W7 + W3/W4/W5/W6 | Upcoming-call/empty/new-user/offline combinations not fully drawn |
| S-F3 Discover | 4B-02,4G-02 | W7 + W4 | Results/no-results/filter/error/loading states missing |
| S-F4 Creator profile | 4A-01,4B-03 | W7 + W4/W5 | Chat/public home and Access drawn, full Posts/Requests segment states missing |
| S-F5 Thread | 4A-04/05/10/14/15,5.1/5.2 | W3 + W2/W4/W5 | Several source-only honest states and translated-human state missing |
| S-F6 Memory card | 4B-06 plus MemoryChip previews | W3 + W8 | Full memory facts/open-loops/summary/provenance/exclusions editor and empty/error states missing |
| S-F7 Packet | 4A-06,5.2 s1 | W4 + W3/W5 | Approvals drawn, changed-offer fan confirmation/more-info/failure states incomplete |
| Spend limit / checkout | 4A-07/16 | W4 | Card auth/decline/processor-loading/reauthorize/result and platform-policy variants incomplete |
| S-F8 Request status/receipt | 4A-08,4B-04,5.2 | W4 + W5/W6/W7 | Only some outcomes drawn, withdrawal/refund/disputed/expired/change-offer states missing |
| S-F9 Call | 4E-01/02/03 | W6 + W4 | Waiting/media errors/reconnecting/no-show/partial/technical variants missing |
| S-F10 Pass | 4G-01/02 | W4 + W7 | Slot chooser/replacement/cancel/refund/renewal and unavailable-selection states incomplete |
| S-F11 Notifications | 4A-09,4E-05,4I-01/02 | W7 | Prefs/digest/permission/deep-link failure designs missing, 19 types require coverage |
| S-F12 Me and privacy | 4B-06 | W3 + W8 | Consent lists/handle-sharing management/notification controls/account deletion/export job states incomplete |
| S-F13 Post/content | 4A-11,4F-01 | W7 + W5/W2/W4 | Public/locked samples drawn, full library/audio/photo/translation/revoked/error variants incomplete |
| S-F14 Note in thread | 4A-14,4C-09,Note previews | W3 + W5 | Broadcast distinction supplied, quote/retraction/reply-failure states not all full-screen |
| S-F15 Spending/time | 4B-07 | W4 + W3/W7 | Delay/limit-lower/raise/50%/100% reminder/companion signal states missing |
| S-F16 Public verification | 4B-08,ShareCard | W1 + W7/W8 | Stable signed act drawn, invalid/revoked/unknown/privacy-limited link state missing |
| S-C1 Creator setup | 4D-01 | W1 + W2/W8 | Only external-proof step shown in six-step rail, other full steps missing |
| S-C2 My AI | 4C-07,4D-02/03/04/08,5.4 | W2 + W3/W5 | Interview/voice/source jobs/style-example/rules-save/rollback/error dialogs incomplete |
| S-C3 Queue | 4C-01 | W5 + W4 | Active/overdue samples, empty/filter/pagination/offline/race states missing |
| S-C4 Packet detail/reply | 4C-02/03,5.3 | W5 + W1/W4/W6 | Written/draft sample, voice fulfillment/Instead/change-mode/fan-confirm/attestation-failure states incomplete |
| S-C5 Threads | 4C-04/05 | W5 + W3/W2/W8 | Audit/takeover/correction shown, handback/pause-per-fan/team view/error and correction editor incomplete |
| S-C6 Offers | 4D-05 | W4 + W5/W6 | Existing modes/membership/window shown, add/edit tier/mode/group/capacity/race states missing |
| S-C7 Publish | 4C-06 Note only,4F-01 output,Sidebar/More link | W5 + W2/W4/W6/W7 | No full post/library composer: audience and AI-use must be separate controls |
| S-C8 Insights/producer | 4F-04 | W7 + W5/W2/W8 | Clusters/recommendation shown, group-answer composer/privacy-suppressed/no-data/error states missing |
| S-C9 Earnings | 4D-06,4G-03 | W4 + W7/W8 | Ledger causes/pool sample, payout onboarding/details/errors/tax/refund details missing |
| S-C10 Team/settings | 4D-07,4C-08 | W5 + W1/W8 | Checklist invitations drawn, acceptance/revocation/member-limited views/settings states missing |
| S-C11 Creator call | 4E-01/02/03/04 | W6 + W4/W5 | Offer-times drawn, participant-specific creator pre-call/waiting/outcomes not fully supplied |
| S-C12 Notes/Replies | 4C-06/09,5.3 | W5 + W1/W6/W7 | Audience/private replies/React supplied, composer media/errors/retract/quote/sign failure states incomplete |
| S-C13 License/sponsors | 4D-08 | W2 + W1/W8 | Draft terms only, live authorization/voice/revoke/pause/wait/legal-confirm states missing |
| S-C14 Creator interview | Named in 4D-01, no artboard | W2 + W1/W6 | 20-minute source interview and weekly 60-second check-in behavior, 15-minute artboard rail label discrepancy |
| Weekly impact | 4C-10 | W7 + W5/W8 | Consent-safe digest sample, Thanks submission/manage consent/no-data states missing |
| Signing and overlays | 4C-03 plus SigningSheet/Sheet/Dialog/Toast previews | W1 + feature owner | Exact payload/actual passkey/biometric/error and non-iOS label variants missing |
| Ops verification/safety/dispute | 4H-01/02 | W8 + W1/W4/W5 | Dispute drawn, full verification review/suspension/appeal/status/support workflows missing |

## Explicit source corrections and precedence

The user's fidelity requirement includes these corrections. Keep original artboards as provenance; document implementation corrections against them. Do not rewrite references to make mismatches disappear.

| Correction | Authority | Required interpretation | Owner |
| --- | --- | --- | --- |
| Selected control surfaces | BUILD_PROMPT §9 | Selected segment is a light selected surface with hairline on sunken track, selected mode is ink outline, neither uses creator plate | W1 primitives, W4 mode consumers |
| Night creator contrast | BUILD_PROMPT §9 supersedes audit #14 open proposal | Creator plate #EDE3D3, ink #231C16, muted #5E5246, label #8E3514, on-plate seal initial #FBF5EC. Off-plate seal #E89A6E with dark initial. Correct context on every consumer | W1 tokens/Seal/Mark, all feature plates |
| Fan typography | BUILD_PROMPT §9 | Packet summary/shared fan question remain Geist sans, never creator Newsreader | W4 editor, W7 share, W5 read preview |
| No-wrap and plate quiet button | BUILD_PROMPT §9 | Pills/IDs/timestamps never wrap, whole approved-label items wrap together, quiet-on-plate takes plate ink | W1 primitives, all consumers |
| Ended composer | BUILD_PROMPT §9 | Keep Ask Maya to step in when free conversation ends | W3 + W4 |
| Cards and overlays | BUILD_PROMPT §9 | Do not nest status cards, dialogs over scrim with genuine modality/focus, not inline content | W1 + W4 |
| Packet heading/access promise | Product S-F7 and approved behavioral precedence | Included in your request, not a claim that the approved packet limits separately audited full-thread access. Checklist controls submitted snapshot, notice discloses full-thread access | W4 + W3/W5 |
| Trial / access era | D-26/D-23 and BRIEF decision log | Free first conversation about 24 hours, graceful pause ending, membership first. Pass remains later roster-gated scope, no five-lifetime-message or pass-first pilot | W4 + W3/W7 |
| Approval policy | D-12 and BRIEF decision log | Live AI replies instantly under guards, never unlock automatic replies after 20 approvals | W2 + W3 |
| Historical styling | BRIEF selected D Atelier | Use final Geist/Geist Mono/Newsreader and ember/blue-graphite tokens, not obsolete violet/amber prose or A/B/C study palettes | W1 + all streams |

Previously recorded paired original/corrected packet evidence is at [packet-heading evidence](../../../tests/visual/evidence/packet-heading/); reference HTML remains provenance. Previous foundation/capture limitations are documented in [design verification](../../implementation/design-verification.md). Those historical records do not certify new features or replace real browser/emulator/simulator verification.

## Missing design decisions and delivery dependencies

The following are decisions/gaps, not invitations to redesign. Use the existing component language where a resolved design adds a state; record any new composition before declaring exact fidelity. Safe independent work can proceed on domain contracts, real data/actions, and already-drawn states. Do not fabricate provider success, production accounts, counsel decisions, amounts, or creator signatures.

| ID / gap | Missing decision / composition | Accountable owner + contributors | Safe implementation boundary after planning |
| --- | --- | --- | --- |
| DI-01 Native creator scope / responsive adaptations | Native fan is explicit, Studio is web in source. No equivalent full native My AI/Insights/Offers editor or full desktop fan/tablet layout. Confirm native creator scope and compact/wide composition rules | W1 + W2/W4/W5/W7 | Canonical phone fan and desktop Studio can proceed, no invented native editors |
| DI-02 Brand and fixed external identifiers | Final name undecided. Keep centralized config/brand and one-command replacement, no irreversible domain/bundle/store naming decision | W1 | Placeholder name/fonts/colors fully usable |
| DI-03 Provider / consent / AI voice suppliers | [AI PROVIDERS] unresolved, voice/model hosting/rights and no-training assertions require actual selected adapters | W2 + W3/W6/W8 | Fail closed default, draft/provider contracts and consent UI ready |
| DI-04 Native storefront policy | Paid replies pending counsel, memberships/pass native IAP and web card holds are explicit. One-to-one versus one-to-many and regional linkouts need current approved policy matrix | W4 + W6/W8 | No web price beside store price, config placeholders and native entitlement/restore seam |
| DI-05 License / credit / payout parameters | 4D-08 license/30-day text draft, [AMOUNT]/[STORE PRICE]/[PASS PRICE]/[N] credits/configured cap not selected rules | W2/W4 + W8 | Preserve placeholders/configuration, ledger schema before final commercial terms |
| DI-06 Creator onboarding / interview | Proof step only fully drawn. Passkey enrollment, replica signing, handle, interview progress/failure/resume and remaining setup missing. Source 20-minute interview versus rail 15-minute label needs correction/decision | W1 + W2/W6/W8 | External proof/identity and interview data contracts can proceed |
| DI-07 Source and style editor details | Connect/upload/select scope/import progress/error, expired weekly check-in, edit-example/never-reveal forms/save/conflict not fully drawn | W2 + W6 | Approved/candidate/revoked, existing style controls, real draft persistence first |
| DI-08 Product boundary and version actions | Tests are product publish gates, not unit-test work. Running/failing/retry/cancel/job progress, confirm rollback/export and missing edit-case flows need compositions | W2 + W8 | Genuine version-sensitive gates, no fake pass list |
| DI-09 Fan identity and memory/privacy detail | Intro optional before chat versus first-useful-answer one-time offer, per-creator share management, memory facts/open loops/provenance/exclusions/consents, export/account delete states missing | W3 + W1/W8 | No mandatory intro gate, consented provenance/store/delete contracts |
| DI-10 Thread exceptional states / translations | Many §8 rows and translated human/original toggle have no whole screen. Off-record model/architecture addition is still required, not just a UI switch | W3 + W2/W4/W5/W8 | Use canonical strip/messages/composer for drawn states, exact epoch protocol and fail-closed storage |
| DI-11 Human request decision variants | More-info inline reply, changed-offer fan confirmation, free alternative/no capture, reauthorize/withdraw, retry/expired/refund detail and attestation failure layouts missing | W4 + W5/W1 | One canonical state machine, immutable packet, no silent new price/mode |
| DI-12 Fulfillment modes and team variants | Written/approved-draft sample is drawn, actual voice fulfillment/recording, role-limited author/team composer, sign failure/cancel, partial paid delivery need layouts | W5 + W1/W4/W6 | Exact labels and authority, no team impersonation or unfulfilled charge |
| DI-13 Publish/library/groups | Sidebar exposes Publish without composer. Need post/media library, independent audience/AI-use permission, reuse/quote consent, group/public answer editor and tier/group management | W5 + W2/W4/W6/W7 | Content/audience contracts and existing Note/full output compositions first |
| DI-14 Calls outcomes / scheduling UI | Waiting media check/errors, participant-specific brief, reconnect/no-show/partial/failure, conflict slot chooser, recording/summary consent changes lack complete designs | W6 + W4/W5 | Real provider/session clocks/outcome contracts, preserve supplied four call compositions |
| DI-15 Access/pass/payout management | Add/edit mode/tier, capacity races, subscription manage/restore/refund, pass choose/replace/cycle, payout onboarding/error/details incomplete | W4 + W7/W8 | Single granting/accounting model, store sandbox/configuration first |
| DI-16 Notification controls / missing event/email types | Prefs/quiet/preview/privacy OS permission and five extra source types missing from board, only two emails drawn | W7 + all producers | Canonical typed envelope/outbox and drawn rows/emails, all 19 safety rules |
| DI-17 Sharing / verification failures | Image/link/story permissions, revoked/invalid signature and unavailable/expired targets, export/no-share/handle-toggle flows missing | W7 + W1/W5/W8 | Stable verify/deep-link contract, only explicit ShareGrant, no packet fan text by default |
| DI-18 Insights / Thanks privacy | No-data/minimum-group-suppressed/failed producer states and Thanks consent/withdraw editor missing, group answer composition not supplied | W7 + W5/W8 | Aggregates/configured threshold, consent before named thanks |
| DI-19 Ops full workflows / support | Queue/dispute drawn, verification review, safety suspension/revocation, appeal, support/contact and outage/status missing | W8 + W1/W4/W5 | Scoped audited case model/retention, no fan text in list/push |
| DI-20 Approved-draft treatment / comprehension | Split is current source default, gradient/stacked retained comparison treatments. Source calls final choice open |  evaluate T-21 with participants, no invented score threshold | W1 + W3/W5/W8 | Ship default split unless explicit decision changes it, retain all three preview contracts |
| DI-21 Live ornament semantics | 4A Invite uses live-looking seal for historical invite. Glow is only current human presence, never historical Note/receipt/invite/AI content | W1 + W3/W5/W7 | Derive live state from real presence and correct it without expanding ornamental use |
| DI-22 Generic UI states / accessibility | Every list/action needs empty/slow/error/offline/disabled/loading/keyboard/VoiceOver/TalkBack/200% text behavior, not just successful boards. Larger text wrapping must not destroy fixed author words and no-wrap meta | W1 + every owner | Use source feedback primitives and nonvisual hit area where 44px target exceeds smaller visual marker |

Open decisions remain centralized with the root [decision register](../DECISIONS.md). The source's seven §12 visual questions are largely addressed by Atelier tokens, system preference, separate voice identity, search-by-need, and phone/desktop Studio split; final name and approved-draft comparison remain open. Do not reopen chosen colors/themes merely because older prose says violet/amber or dark-first.

## All 21 historical direction artboards

These are visual-direction studies, not extra production screens. D Atelier informed the final design system; phase-4 compositions and explicit corrections are the implementation reference. A Correspondence, B Nocturne, and C Instrument are retained provenance, not alternate shipping themes. All 21 files are present in the phase-2 canvas.

| ID | File | Exact display title | Size | Logical feature | Surface | Owner + consumers | Status / dependency |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P2-01 | [DThread.dc.html](../../../design/phase2-directions/DThread.dc.html) | D · Thread | 390×1800 | Historical Thread | REF (phone or kit canvas) | W1 + W3/W4/W7 | Selected direction provenance, final tokens/phase4 supersede |
| P2-02 | [DStepIn.dc.html](../../../design/phase2-directions/DStepIn.dc.html) | D · Maya steps in | 390×1500 | Historical Maya steps in | REF (phone or kit canvas) | W1 + W3/W4/W7 | Selected direction provenance, final tokens/phase4 supersede |
| P2-03 | [DStepInDark.dc.html](../../../design/phase2-directions/DStepInDark.dc.html) | D · Maya steps in, night theme | 390×1500 | Historical Maya steps in, night theme | REF (phone or kit canvas) | W1 + W3/W4/W7 | Selected direction provenance, final tokens/phase4 supersede |
| P2-04 | [DHome.dc.html](../../../design/phase2-directions/DHome.dc.html) | D · Creator home, public | 390×2140 | Historical Creator home, public | REF (phone or kit canvas) | W1 + W3/W4/W7 | Selected direction provenance, final tokens/phase4 supersede |
| P2-05 | [DPacket.dc.html](../../../design/phase2-directions/DPacket.dc.html) | D · Ask Maya to step in | 390×1760 | Historical Ask Maya to step in | REF (phone or kit canvas) | W1 + W3/W4/W7 | Selected direction provenance, final tokens/phase4 supersede |
| P2-06 | [DKit.dc.html](../../../design/phase2-directions/DKit.dc.html) | D · Identity kit | 1100×1680 | Identity kit / author cues / approved-draft treatments / palette and other theme | REF (phone or kit canvas) | W1 + W3/W4/W7 | Selected direction provenance, final tokens/phase4 supersede |
| P2-07 | [Main.dc.html](../../../design/phase2-directions/Main.dc.html) | A · Thread | 390×1800 | Historical Thread | REF (phone or kit canvas) | W1 + W3/W4/W7 | Historical alternative, not selected |
| P2-08 | [AStepIn.dc.html](../../../design/phase2-directions/AStepIn.dc.html) | A · Maya steps in | 390×1500 | Historical Maya steps in | REF (phone or kit canvas) | W1 + W3/W4/W7 | Historical alternative, not selected |
| P2-09 | [AHome.dc.html](../../../design/phase2-directions/AHome.dc.html) | A · Creator home, public | 390×1960 | Historical Creator home, public | REF (phone or kit canvas) | W1 + W3/W4/W7 | Historical alternative, not selected |
| P2-10 | [APacket.dc.html](../../../design/phase2-directions/APacket.dc.html) | A · Ask Maya to step in | 390×1760 | Historical Ask Maya to step in | REF (phone or kit canvas) | W1 + W3/W4/W7 | Historical alternative, not selected |
| P2-11 | [AKit.dc.html](../../../design/phase2-directions/AKit.dc.html) | A · Identity kit | 1100×1560 | Identity kit / author cues / approved-draft treatments / palette and other theme | REF (phone or kit canvas) | W1 + W3/W4/W7 | Historical alternative, not selected |
| P2-12 | [BThread.dc.html](../../../design/phase2-directions/BThread.dc.html) | B · Thread | 390×1800 | Historical Thread | REF (phone or kit canvas) | W1 + W3/W4/W7 | Historical alternative, not selected |
| P2-13 | [BStepIn.dc.html](../../../design/phase2-directions/BStepIn.dc.html) | B · Maya steps in | 390×1500 | Historical Maya steps in | REF (phone or kit canvas) | W1 + W3/W4/W7 | Historical alternative, not selected |
| P2-14 | [BHome.dc.html](../../../design/phase2-directions/BHome.dc.html) | B · Creator home, public | 390×1960 | Historical Creator home, public | REF (phone or kit canvas) | W1 + W3/W4/W7 | Historical alternative, not selected |
| P2-15 | [BPacket.dc.html](../../../design/phase2-directions/BPacket.dc.html) | B · Ask Maya to step in | 390×1760 | Historical Ask Maya to step in | REF (phone or kit canvas) | W1 + W3/W4/W7 | Historical alternative, not selected |
| P2-16 | [BKit.dc.html](../../../design/phase2-directions/BKit.dc.html) | B · Identity kit | 1100×1560 | Identity kit / author cues / approved-draft treatments / palette and other theme | REF (phone or kit canvas) | W1 + W3/W4/W7 | Historical alternative, not selected |
| P2-17 | [CThread.dc.html](../../../design/phase2-directions/CThread.dc.html) | C · Thread | 390×1800 | Historical Thread | REF (phone or kit canvas) | W1 + W3/W4/W7 | Historical alternative, not selected |
| P2-18 | [CStepIn.dc.html](../../../design/phase2-directions/CStepIn.dc.html) | C · Maya steps in | 390×1500 | Historical Maya steps in | REF (phone or kit canvas) | W1 + W3/W4/W7 | Historical alternative, not selected |
| P2-19 | [CHome.dc.html](../../../design/phase2-directions/CHome.dc.html) | C · Creator home, public | 390×1960 | Historical Creator home, public | REF (phone or kit canvas) | W1 + W3/W4/W7 | Historical alternative, not selected |
| P2-20 | [CPacket.dc.html](../../../design/phase2-directions/CPacket.dc.html) | C · Ask Maya to step in | 390×1760 | Historical Ask Maya to step in | REF (phone or kit canvas) | W1 + W3/W4/W7 | Historical alternative, not selected |
| P2-21 | [CKit.dc.html](../../../design/phase2-directions/CKit.dc.html) | C · Identity kit | 1100×1560 | Identity kit / author cues / approved-draft treatments / palette and other theme | REF (phone or kit canvas) | W1 + W3/W4/W7 | Historical alternative, not selected |

## Verification expectations after planning

This planning phase writes **no new unit tests, snapshot/E2E suites, test code, or coverage work**. Existing checks and baselines remain preserved. Product boundary evaluation in My AI remains a mandatory user-facing feature; it is not replaced by the instruction to avoid new automated test suites.

Each owner verifies its completed capability in the actual running product and records version, environment, theme, actor, screenshots/recordings and observed state/data results. W8 integrates that evidence; visual catalogs/static snapshots never establish functional or native-device acceptance.

- Browser: use real authenticated fan/creator/team/ops contexts, exercise the source composition at 390px/1280px and required responsive sizes, both themes, keyboard focus and reduced motion. Verify actions against the real API/DB/provider sandbox, not only local demo controls.
- Android Emulator and iOS Simulator: launch the actual Kotlin/Swift hosts, navigate feature routes, run the same durable account/thread/request/content journeys, inspect safe areas/keyboard/back/background/deep links and TalkBack/VoiceOver. Check actual fonts/glyphs/measurements against the source, not web screenshots embedded in a native view.
- Physical-device/provider evidence is also necessary where simulators cannot prove behavior: lock-screen push/CallKit/ConnectionService, audio interruption/Bluetooth/background calling, passkey/biometric attestation, StoreKit/Play Billing restore/reconciliation, real two-party audio/video and recording consent. An emulator launch does not prove these.
- Demonstrate every §8 exceptional state with a real state transition or clearly recorded provider/development fault injection. Preserve unsent drafts, readable offline history, pending-versus-acknowledged truth, capacity limits, graceful trial ending, capture/refund outcome and no AI text after takeover.
- Recheck authorship across thread, receipt, public answer, image/story, verification URL, search preview, in-app/push/email/audio. Audience restrictions, revocation and deletion must survive export and cached/read-model paths.
- Mark absent, mocked, provider-unconfigured, fixture-only, unreviewed-native or policy-blocked capability explicitly. A button that returns a designed failure is correct fail-closed behavior, not a completed feature.

Use [ownership/contracts](../CONTRACTS.md), [runtime verification](../VERIFICATION.md), and [coverage](../COVERAGE.md) for integration sequencing and evidence recording. Do not modify source references or raise comparison tolerances to conceal a layout/copy/font/color mismatch. Earlier native fixture images are review aids; native fidelity remains unaccepted until the actual feature screens and required states are reviewed on their runtime targets.

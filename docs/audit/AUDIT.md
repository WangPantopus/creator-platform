# Phase 6 audit

Scope: the design system and every screen in `design/phase4*` and `design/phase5-prototypes`
(64 artboards across six canvases). Sources checked against: the invariants, the identity
rules, the copy system (Product Design section 10), the honest-state rules (section 8) and
the notification table (section 9).

## How it was checked

| Check | Method | Result |
| --- | --- | --- |
| Components render in both themes | Every design-system preview rendered headlessly in Light and Night (108 renders) | 0 errors |
| Text contrast | Computed for every text token on every ground it is named for, both themes | Minimum 5.27:1 (`ai-ink` on light `ground`) |
| Control borders and focus | Computed | `control-line` at least 3.23:1; focus ring at least 6.95:1 |
| Forbidden words | Scan of all 64 screens for every never-word, exclamation marks, emoji and the name possessive | 2 hits: 1 fixed, 1 correct use (quoted in the "Never" column) |
| Canvas screens rendered | **Not done.** The canvases were not opened or screenshotted | Unverified; see Open items |

## Findings and fixes

| # | Where | Finding | Rule | Fix |
| --- | --- | --- | --- | --- |
| 1 | Notification row sample | Request-status notification showed a price | §9: never price | Now "Maya accepted your request · REQ-0412" |
| 2 | Packet checklist | Defaults did not match the spec | §S-F packet | Summary and last messages on; whole conversation and name/city off; access notice added |
| 3 | AI message | No place for the sponsor disclosure | Copy system | `sponsor` prop: "Paid partnership: Maya is paid by {brand}." |
| 4 | Mode rows | No refund rule, no weekly capacity sentence | S-F packet, copy system | "Within 7 days or a full refund · 3 of 10 left this week" |
| 5 | Sample sponsor | Invented brand | Brief sample content | Glazeco, from the source docs |
| 6 | Approved-draft band | Label, Signed marker and date wrapped mid-phrase | Legibility | Band wraps whole items only |
| 7 | Signed marker | Underline ran under the date | Craft | Underline on the label only |
| 8 | Maya buttons, Night | Plate nearly invisible on a sheet | Non-text contrast | `maya-line` edge on her buttons and the step-in pill |
| 9 | Call, before (4E) | "Maya saw" | Never-words (INV-05) | "Shared with Maya" |
| 10 | Offer times (4E) | Said nothing is charged until the call | INV-16, charge on acceptance | "Offering times accepts the request, so the fan is charged now; refunded in full if the call doesn't happen" |
| 11 | Public answer (4F) | Invented credit count | No invented rules (D-27) | "[N] credits, up to a cap" |
| 12 | Comprehension test (5.5) | Invented pass bar | No invented rules | Refers to T-21's bar in the source |
| 13 | Earnings, More (4C, 4D) | Invented money amounts | No filler figures | `[AMOUNT]` placeholders |
| 14 | Night theme | AI and Maya surfaces differ by hue only (1.05:1 lightness; inks 1.11:1) | Color-blind rule: differ in lightness | **Open, proposal:** lighten night `ai-surface` toward #242C34 or give Maya's night plate a `maya-line` edge everywhere. The word, mark and serif already separate them, so no screen relies on color alone |

## Identity rules, per screen family

| Rule | Status |
| --- | --- |
| Every incoming message carries its author word and mark inside the content | Holds on all screens (enforced by the `Message`, `Note`, `VoiceNote`, `Correction` components) |
| Only "Ask Maya to step in" is person-colored in a thread | Holds. Maya's color is also used for her own acts outside threads: the packet send, signing, her Notes |
| Nothing from the AI under "Maya is here" | Holds in 4A-05 and prototype 5.2 |
| Notes always name their audience | Holds (component default); 4A-14 adds "not a reply to you" |
| AI never names a price or sells | Holds; the ended-trial join button sits outside the AI's messages |
| Screen readers hear the author first | Holds by reading order; not tested with a screen reader |

## Open items (not verified here)

- The canvases were not rendered or visually inspected, per the canvas tool's rules. A visual pass on every board is still needed.
- Night variants exist for the thread, the live call and the lock screen; the other screens are designed through tokens but not drawn in Night.
- No test with real screen readers, Dynamic Type at 200% or reduced motion on a device.
- Counsel: native in-app purchase for paid replies; the license terms on 4D-08.
- Founder: AI provider names on the consent screen; finding 14.

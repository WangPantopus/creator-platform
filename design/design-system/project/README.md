Qelvora gives every creator an authorized, clearly labeled AI that talks one-on-one with each fan, while the real creator stays present through Notes, reactions and paid personal replies. The design has one job above all others: **who is speaking must be answerable in under a second, on every surface.** Everything else is built to feel like an honest concierge: someone always answers, the real person appears in signed, unhurried moments, and money is spoken about plainly.

Examples use sample content throughout: the creator **Maya** (a ceramicist), her membership **Kiln Club**, the fan **@kilnfire**, and **Priya** from Maya's team.

## The identity system

Every message has exactly one author, and each author has four cues that always travel together: a **surface**, a **mark**, a **word** and a **color**. Never rely on color alone, and never mix one author's cues with another's.

| Author | Surface | Mark | Word (fixed text) | Color | Type |
| --- | --- | --- | --- | --- | --- |
| Maya's AI | `ai-surface` panel with an `ai-line` hairline | Ring with a center dot | "Maya's AI" | `ai-ink` | `body` |
| Approved draft | Split: the AI's panel on top, a `maya-surface` band below | Ring and seal, overlapping | "Prepared by AI · approved by Maya" | `ai-ink` over `maya-accent` | `body` |
| Maya herself | `maya-surface` plate | Filled seal with her initial | "Maya", then "Signed by Maya" | `maya-accent` on the plate, `maya-ink` on neutral ground | `voice-lg` |
| Maya on a call | A `maya-surface` pill pinned for the whole call, with `glow-maya` | Filled seal, live | "Maya · the person", beside "Not recording" | `maya-accent` | `label` |
| A Note | `maya-surface` plate with a folded corner | Seal with broadcast arcs | "Maya · to Kiln Club members" | `maya-accent` | `voice-lg` |
| A reaction | A small `maya-surface` pill on the fan's message | Seal and heart | "Maya reacted to your reply" | `maya-accent` | `label` |
| Maya's team | `team-surface` | Dashed square | "Maya's team · Priya" | `team-ink` | `body` |
| The fan | `surface-sunken`, right-aligned | None | The fan's own messages carry no label | `ink` | `body` |
| System | No surface, centered | None, or a hairline | Plain status sentence | `ink-muted` | `caption` |
| Reserved: a fan's assistant, an AI call, an AI video | Dashed `control-line` outline, disabled | Dashed ring, phone, camera | "@kilnfire's assistant", "Maya's AI · call", "Maya's AI · video" | `ink-muted` | `label` |

- Put the author's word and mark **above or inside** every message, never only in the header. Labels live in the content so they survive screenshots, search and notifications.
- The `maya-surface` plate means Maya and nothing else. Never use it for the AI, the team, marketing or empty states.
- Set Maya's own words in `voice-lg` or `voice-md` (Newsreader). Never set AI output in the serif, even when it quotes her.
- Show the Signed marker on every act under Maya's name: her replies, approved drafts, Notes, reactions and corrections. It opens the verification page.
- The identity strip under a thread's header never scrolls away. It names who reads what the fan types next: "You're talking to Maya's AI · Maya steps in on request", "Maya is here", or "Maya's team is here".
- Announce every change of speaker with a system line ("Maya is here", "Maya left the conversation · you're back with Maya's AI"). No transition is silent, and nothing from the AI appears under "Maya is here".
- The only person-colored button in a thread is **Ask Maya to step in**. Every other primary action in a thread belongs to the AI.
- Reserved states are drawn so the system has room for them, and are never shown to fans until they are enabled.
- Screen readers hear the author before the words: the label sits first in every message's reading order.

## Content fundamentals

Write like a well-run studio's front desk: calm, specific, never pushy. Sentence case everywhere. No exclamation marks, no emoji, no hype.

- **Say who, in plain words.** The AI calls itself "Maya's AI" and says "I". The interface calls the fan "you" and the creator by her name.
- **Never fake attention.** Use "Seen by Maya's queue", never "Maya read"; "Maya's AI remembers", never "Maya remembers"; "Maya usually decides in 1 to 2 days", never "Maya will reply".
- **Never sell from the AI.** AI messages never name a price, suggest a purchase or say "unlock" or "upgrade".
- **Money is one plain line.** "Send request · $25 if accepted". Under it, always: "Charged only when Maya accepts. If she declines or 48 h pass, nothing is charged." and "Your bank may show a pending hold for a few days."
- **Declines are gentle and money-first.** "Maya passed on this one · nothing charged". Never "failed", never "Oops".
- **One-to-many says so.** Every Note reads "Maya · to Kiln Club members", even when it greets the fan by name. Replies to Notes say "Only Maya and her team see replies to Notes."
- **Access is disclosed, not hidden.** "Official means Maya authorized this AI. It does not mean she read your message." on her home and the first thread; "Maya and her authorized team can separately review this AI conversation. Those accesses are logged." under what a request includes; "Opening this conversation is logged and visible to the fan." wherever the studio opens a thread.
- **Sponsors are named inside the reply.** Any AI message that mentions a listed sponsor carries "Paid partnership: Maya is paid by {brand}."
- **The AI never holds on.** After three hours of continuous use the thread says "You've been talking with Maya's AI for a while. It's an AI, and it will be here when you're back."
- **Words the product never uses:** "VIP", "exclusive access", "get closer", "top fan", "biggest supporter", "from $", "per minute", "bot", "chatbot", "virtual", "Keep chatting to…", "Maya messaged you" for a Note.

## Visual foundations

**Color.** Two themes, Light and Night. The ground is `ground`; neutral objects sit on `surface`; the fan's bubbles use `surface-sunken`. The AI owns `ai-ink` and `ai-surface`; Maya owns `maya-surface`, `maya-accent` and `maya-ink`. Use at most one accent action per screen. `alert` is only for overdue commitments and fixable errors, always with a word. The Night theme is warm, never pure black; Maya's surface turns from the dark plate to a warm clay panel so the "surface means Maya" rule holds in both themes.

**Type.** Three families, each with one job. Geist (`sans`) runs the interface and the AI. Newsreader (`serif`) is reserved for Maya's own words (`voice-lg`, `voice-md`) and display moments (`display-xl`, `display-lg`, `display-md`). Geist Mono (`mono`) sets times, prices, counts and request IDs (`data-lg`, `data-md`, `data-sm`), always with tabular figures. Support Dynamic Type up to 200%; never use weights under 400 for text.

**Spacing and layout.** Build on a 4px step (`space-1` to `space-12`). Phone layouts are 390px wide with a `space-4` gutter. Messages are separated by `space-4`; sections by `space-6` or `space-8`. Every touch target is at least 44px; inputs and the composer row are `space-12` tall.

**Radii.** Bubbles and buttons use `radius-lg` with the speaker's corner cut to `radius-tail`. Sheets and the hero plate use `radius-xl`. Seals, reactions and the step-in button are pills (`radius-pill`).

**Shadows and house lights.** Only two kinds of things are lifted: Maya's plates (`shadow-plate`) and overlays, meaning bottom sheets and dialogs (`shadow-sheet`). Toasts stay flat with a `control-line` border. `glow-maya` is the house lights: a warm glow that appears only while Maya is actually present in a conversation (her live messages, the "Maya is here" line, her avatar). Never use it on a Note, a receipt or anything the AI wrote.

**Materials.** The seal is the one ornament. The Note card has a folded corner. Receipts read like a dated letter: `display-lg` title, `data-sm` rows on dashed rules, the seal at the foot. Glass is allowed only on the native navigation bar, never on content.

**Motion.** Motion explains cause and effect and nothing else. Use springs with no bounce, 200 to 300 ms for sheets, 120 ms for presses. Never animate sending, scrolling or opening a thread. Typing dots respect reduced motion (they fade instead of bounce). The takeover transition swaps the identity strip within 500 ms.

**Haptics and sound.** A soft tap when a real Note or reaction arrives while the app is open; a success haptic timed to the seal when Maya accepts a request; nothing for AI messages; nothing for a decline. The only sound is an optional ceramic "tock" on acceptance, off by default.

**States.** Focus is a 2px `ground` gap then a solid 2px `focus` ring (`focus-on-maya` on Maya's surface). Disabled controls keep their label and say why beside them ("Fully booked this week · opens Monday"). Pending messages show at reduced opacity with "Sending"; failed ones show "Not sent" in `alert` and a Retry button. Loaders wait 300 ms before appearing, then show `line`-colored skeletons that pulse only when motion is allowed. Destructive confirmations stay neutral: the verb ("Delete conversation") carries the weight, not red.

**Imagery.** Use the creator's own photography of her real space and work. Never stock or generated imagery. Until a photo exists, show a labeled placeholder, never a decorative fill.

## Iconography

Icons are inline stroke SVG on a 16px grid with a 1.5px stroke, drawn in `currentColor` so they take the author's color. The authorship marks (ring, seal, overlapping ring and seal, broadcast arcs, dashed square) are part of the bundle as `Mark`; use them only for their author. No emoji and no icon fonts.

## Wordmark

The product name is not final; there is no logo yet. Set "Qelvora" in Newsreader italic at `title` size or larger, in `ink`. Never draw a mark for it.

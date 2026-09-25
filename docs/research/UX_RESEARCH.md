# Qelvora UX Research

> Markdown copy of the shared doc [Qelvora UX Research](https://claude.ai/code/artifact/11bc3a89-d2f4-4399-8e3b-ecfbb2c6f803), exported 2026-09-25. The shared doc is the living version; refresh this copy when it changes.

Sep 25, 2026 · @YP

## Summary

Qelvora should feel like **an honest concierge**: someone always answers (the AI, always labeled), the real person appears in signed, unhurried moments, and money is spoken about plainly. That stance comes from ten findings.

1. **Per-message authorship is open ground.** None of the six products studied labels who wrote each message, and Bubble, Fanfix and Delphi all dress mass messages up as personal ones. The labels in Qelvora are a differentiator, not a compliance cost.
2. **A label needs a word, a mark and a fixed place.** People read "AI-generated" as fully automated, and mixing AI and human content breeds distrust of both. Human acts must be unmistakable and signed.
3. **Presence beats replies.** Bubble's broadcast model and tenure-based reply length show what fans pay for monthly. The Note is the hero surface, and a creator's daily presence must fit in five minutes.
4. **Hold and release is proven** (Airbnb, Cameo on the web). One terms line, repeated verbatim on every screen, plus a bank-hold note; never store credit.
5. **Waiting is a design problem.** Ranges beat single times, queue position beats apologies, and a failed wait is answered with money first and one sentence.
6. **Show exactly what is being signed before Face ID.** System passkey prompts cannot show it, and a confirmation step improved both conversion and speed in payments.
7. **Memory earns trust only in the open:** an inline notice with the exact words, edit and forget, sensitive facts by consent, and off-the-record conversations.
8. **High end means craft, speed, calm and service, never status.** Restrain hue and decoration, never contrast; the seal is the one ornament and belongs to the person.
9. **Creators need protection from their own audience.** Weverse and Bubble show abuse and "always-on" workload; filtering, a weekly topic digest and a five-minute routine are retention features.
10. **One open risk:** in the native app, asynchronous replies may have to use in-app purchase, which cannot hold a card. Counsel should settle it before slice 2.

**Decided in this round** (September 25, 2026): the ETA shown as a range, the bank-hold note, optional audience size on Notes, and off-the-record conversations. **Next:** Phase 2, the three visual directions on one canvas.

## Approach and limits

This is desk research and expert analysis; no fan or creator has been interviewed yet. Everything about people's feelings and time is a hypothesis until the kits in the Research kits section run.

| Input | What it contributed | Confidence |
| --- | --- | --- |
| The four source documents (September 22 to 23, 2026) | Rules, invariants, screens, copy and the legal floor | High: these are decisions, not guesses |
| Competitive teardown of 12 products, pages opened on September 25, 2026 | What fans and creators already expect, and the known failure modes | Medium: public information, not usage data |
| Premium and luxury benchmarks, about 20 brands and products | What makes software feel high end without status language | Medium: craft analysis and published case studies |
| UX pattern research on 11 hard problems (labels, waiting, holds, signing, memory, citations and more) | Patterns with evidence where it exists | Medium to high where studies exist |
| Proto-personas and journeys | The structure for Phase 4 and the scripts for the kits | Low until validated |

What this research cannot answer, and where the answer will come from:

- **Whether fans can tell who is speaking** in our actual screens: Kit 1, twice.
- **Whether creators keep posting** after the novelty fades: Kit 4 and the pilot's creator-presence gate.
- **What price feels right** for memberships and human modes: pilot data, not design.
- **How companion fans actually use the product** at night and under stress: pilot interviews with consent, and the ops review of the heaviest users.

## Competitive teardown

None of the six products studied labels who wrote each message, so per-message authorship is open ground for Qelvora. The industry norm runs the other way: broadcasts dressed up as personal messages. Evidence as of September 25, 2026; claims come from search extracts of the linked pages, because the research environment could not open pages directly, so verify before quoting externally.

| Product | What it is | Who is speaking | Presence | Paid access | Lesson for Qelvora |
| --- | --- | --- | --- | --- | --- |
| [Bubble (DearU)](https://www.lysn.com/en_US/faq/21138452) | Per-artist subscription chat, $4.99 a month in the US | No per-message label; fans set a nickname, which reportedly replaces a name token in broadcasts | 3 replies per artist message; reply length grows with tenure (30 characters at day 1, 400 at day 400); quote-replies hide the fan's nickname | Subscription only; full refund within 7 days; a special refund if the artist sends nothing for 30 days | Copy the tenure reward and the anonymous quote-reply; never the disguised broadcast |
| [Weverse DM](https://magazine.weverse.io/article/view/1734?lang=en) | HYBE's paid artist chat, paid in "Jelly" credits | No per-message label | Day-1 and day-1000 badges; a topic summary for artists | 15 Jelly on web, 17 in the app from January 2026; 7-day unused refund | A weekly topic digest for creators; never a currency layer or split prices |
| [Fanfix](https://fanfix.io/faqs) | Brand-safe paid DMs; $300M paid out by June 2026 | No per-message label; first-name insertion in mass messages | Reactions, voice notes, inbox filters by subscriber state | DMs at $5 to $20, prepaid and non-refundable, no reply obligation; 2.2 of 5 on Trustpilot | Filters by relationship; the opposite of its refund model |
| [Delphi](https://www.delphi.ai/blog/digital-identity-protection) | AI "digital minds" for experts; Sequoia-led $16M Series A | The AI "admits it's AI if asked"; a footer disclaimer | Broadcasts with a first-name token "so each note feels one-to-one" | Creator memberships with usage caps | Adopt Interview Mode and ID checks; reject disclosure only on request |
| [Character.AI](https://blog.character.ai/memory/) | Companion AI; open-ended chat closed to under-18s since November 2025 | A persistent "not a real person" disclaimer in every chat | Notice after an hour-long session; editable memory with a usage bar (May 2026) | c.ai+ at about $9.99 | Adopt editable memory; its generic "treat it as fiction" wording would undercut expert answers |
| [Cameo](https://legal.cameo.com/termsofservice) | Paid personal videos; won an order against OpenAI's "Cameo" | The product is the real person | None between requests | Web: a hold, charged on delivery, 7 days to fulfil; iOS: charged at booking, refunded as credit | Hold and release is proven; iOS credit refunds feel cheap |

### What to adopt

- **Anonymous quote-replies.** When Maya answers one Note reply for everyone, show the words and hide the fan unless they agree. Bubble does this, and it matches INV-24.
- **Tenure that earns voice, not status.** Longer Note replies at day 50, 100 and 365, and marks like "with Maya since March". Bubble and Weverse prove that tenure is valued; money never enters it.
- **A presence promise.** Bubble refunds a month in which the artist is silent for 30 days. Qelvora could offer the same when a creator posts no Note for a set period. This is a money-policy question for you, not a design choice.
- **A creator topic digest.** Weverse shows artists what fans talk about most; Insights in Qelvora, plus the weekly impact digest, is the stronger version.
- **Relationship filters in the creator inbox**: new, long-standing and lapsed members (Fanfix).
- **An interviewer that builds the AI** (Delphi Interview Mode) and **ID-checked creator onboarding**.
- **Memory the fan can edit**, with the fan's own entries protected (Character.AI, May 2026).

### What to avoid

- **Broadcasts disguised as private messages.** Bubble, Fanfix and Delphi all personalize mass messages to feel one-to-one. The "to members" label in Qelvora is the honest version and a selling point.
- **Disclosure only when asked** (Delphi). Qelvora labels every message.
- **Prepaid messages with no reply promise** (Fanfix, Cameo Direct). They drive the complaints in reviews.
- **Credit currencies and different prices per platform** (Weverse Jelly). They confuse people and cheapen the feel.
- **Store credit instead of a refund** (Cameo on iOS).

### A gap this surfaced

On iOS, Cameo charges at booking because of App Store billing. D-14 covers memberships (in-app purchase) and one-to-one calls (outside it), but not **asynchronous written replies and voice notes bought in the native app**. If those must use in-app purchase, "charged only when Maya accepts" may not be possible there. Design the native packet both ways, and have counsel settle the rule before slice 2.

### Not yet researched

Patreon, Instagram broadcast channels, Substack Chat, Discord subscriptions, Replika and the OnlyFans chatter ruling were not covered this round; the research hit its search limit. The Second Review already cites the Replika fine and the chatter ruling.

## What high end means for Qelvora

High end, for Qelvora, is craft, speed, calm and service, never status. The premium brands studied earn the feeling through restraint, a human hand, instant response and gracious handling of money and disappointment; none of it needs "VIP" or "exclusive", which the copy system forbids anyway. Apple's developer guidance was read in full; brand and press sources were seen through search extracts.

### Benchmarks and what Qelvora borrows

| Benchmark | The craft lever | What Qelvora borrows |
| --- | --- | --- |
| [Aesop](https://work.co/clients/aesop/) | Calm transitions that mirror the store; the hand-wash ritual before any sale | The fan's first minute is hosting, not selling |
| [Hermès](https://www.domusweb.it/en/news/2026/01/07/herms-new-website.html) | A 2026 site drawn by hand, chosen over AI imagery; the year's theme printed on the ribbon | Commissioned illustration in a few hero moments; a yearly theme on keepsakes |
| [Leica FOTOS](https://www.red-dot.org/project/leica-fotos-41292) | The background color tells you where the photos are | A surface can signal presence, not just a color |
| [Four Seasons Chat](https://hospitalitytech.com/four-seasons-chat-achieves-faster-response-times-and-expands-service) | Real people, about 90 seconds to answer | "Who is answering" is the luxury promise; the Qelvora version is honest labeling |
| Amex Centurion concierge | The same concierge each time, who knows you | Continuity: the AI remembers, the creator's signed acts are the human touch |
| [Apple Card and Wallet](https://developer.apple.com/videos/play/wwdc2019/810/) | Titanium, no numbers; one sound and two taps timed to the check mark | Honest money as a premium feature; one confirmation moment done perfectly |
| [Linear](https://linear.app/now/how-we-redesigned-the-linear-ui) | Themes from three variables in a perceptual color space; "a calmer interface" | Fewer tokens, more contrast |
| [Superhuman](https://www.lennysnewsletter.com/p/superhumans-secret-to-success-rahul-vohra) | Every interaction under 100 ms; one-to-one onboarding | Speed is what premium feels like; white-glove creator onboarding |
| [Rimowa](https://abcdinamo.com/custom/bespoke-typeface-rimowa) and [Cartier](https://www.typeroom.eu/precious-cuts-of-type-yorgo-tloupas-cartier-bespoke-fonts-yorgo-and-co) | A palette taken from the material; one bespoke serif and sans pair | One type pair; a later bespoke cut once the brand is proven |
| [Soho House app](https://www.elsewhen.com/work/customer-centric-app/) | Personal, chronological modules; 4.9 rating | Personal and chronological beats decorative, which matches Home's no-ranking rule |
| [Apple Liquid Glass](https://developer.apple.com/design/human-interface-guidelines/materials) | Glass only on the navigation layer, never on content; hierarchy through layout | Glass for navigation only; content stays solid and legible |
| [Arc](https://www.inverse.com/input/design/the-browser-company-arc-design-interview) and Dia | An "unboxing" setup; later, familiarity first | A keepsake at the end of setup, but never novel gestures for core tasks |

### What reads expensive and what reads cheap

First impressions form in about 50 ms, and restraint plus familiar structure scores higher than complexity or novelty ([Lindgaard et al.](https://www.tandfonline.com/doi/abs/10.1080/01449290500330448); [Tuch et al.](https://research.google/pubs/the-role-of-visual-complexity-and-prototypicality-regarding-first-impression-of-websites-working-towards-understanding-aesthetic-judgments/)). Speed is felt as quality: luxury sites gained the most from a 0.1 s speed-up in Deloitte's 37-brand study ([web.dev](https://web.dev/case-studies/milliseconds-make-millions)).

| Reads expensive | Reads cheap or try-hard |
| --- | --- |
| One accent color for one action per screen | Gold on black, metallic gradients, every control tinted |
| High-contrast text on a warm near-neutral | Pale grey text, the most common accessibility failure on the web ([WebAIM](https://webaim.org/projects/million/2025)) |
| Hierarchy from layout and spacing | Borders, cards inside cards, glass on glass |
| The creator's own photography and words fill the screen | A logo in every header, stock or generic AI imagery |
| Motion only where it explains cause and effect | Confetti, bouncing badges, entrances you must wait out |
| Plain, specific copy | Hype, countdown timers, streaks, rank badges |
| Taps respond instantly | Spinners and flashing skeletons for sub-second work |

### Service moments to design as rituals

- **Arrival as hosting.** The creator home greets before it sells, the way Aesop washes your hands first.
- **Receipts as keepsakes.** A voice note or reply receipt reads like a dated letter: who, what, when, the amount charged, the signature.
- **The seal means the person.** The Signed marker is the one ornament in the product, used only on real creator acts.
- **A hosted wait.** "With Maya · usually 1 to 2 days · not charged unless she accepts", never a bare "Pending".
- **A gracious decline.** The money outcome first, one kind alternative, no "Oops", no error vibration (Danny Meyer's recovery model).
- **Small real gestures.** Reactions and short voice Notes are the creator's version of a hotel's personal touch, and they are never faked.

### Motion, haptics and sound

- **Motion:** Apple springs with no bounce by default; sheets grow from the control that opened them; nothing a fan does dozens of times a day is animated ([WWDC23](https://developer.apple.com/videos/play/wwdc2023/10158/)). Every signature animation has a fade-only version for Reduce Motion.
- **Haptics as punctuation** ([Apple](https://developer.apple.com/design/human-interface-guidelines/playing-haptics), [Android](https://developer.android.com/develop/ui/views/haptics/haptics-principles)):

| Moment | Haptic | Sound |
| --- | --- | --- |
| AI message streaming | None | None |
| A real Note or reaction arrives while the app is open | One soft tap | None |
| Maya accepts a request | Success, timed to the seal animation | An optional ceramic "tock", off by default |
| Maya declines | None: it is not the fan's error | None |
| A payment or form error the fan can fix | Error | None |

### Risks of luxury aesthetics

- **Thin, pale type** fails contrast; restrain hue and quantity, never contrast. Body text at 7:1 or more.
- **Custom serifs that do not scale** break Dynamic Type; everything must survive 200% text and Increase Contrast.
- **Velvet-rope signals** such as black and gold, "members" framing or empty luxury photography say "not for you" to a first-time fan. Qelvora shows warmth and real people.
- **Novelty tax.** Arc had to build Dia to undo unfamiliar patterns; standard navigation first, craft in the details.

## Patterns and evidence for the hard problems

The evidence mostly confirms the source documents and sharpens five choices: say who did what in the label, show waiting as a range, keep one terms line everywhere, show exactly what is being signed, and save warmth for signed human acts. Studies were read through search extracts rather than full papers; rows marked unverified rest on prior knowledge and need checking.

| Problem | Best pattern | Evidence | Choice for Qelvora |
| --- | --- | --- | --- |
| Telling AI from human | A plain word plus an icon in a fixed position on every item, with meaning one tap away ([C2PA UX guidance](https://spec.c2pa.org/specifications/specifications/2.2/ux/UX_Recommendations.html)) | People read "AI-generated" as fully automated, which lowers trust even in human work ([Altay and Gilardi, N=4,976](https://academic.oup.com/pnasnexus/article/3/10/pgae403/7795946)); mixing AI and human content breeds distrust of both ([Jakesch et al., CHI 2019](https://dl.acm.org/doi/fullHtml/10.1145/3290605.3300469)); color alone fails WCAG 1.4.1 | Word, glyph and position on every message; the approved-draft label names who did what; tapping any label explains it in one sentence |
| Warmth | Human acts for emotional moments | An AI-assisted apology reads as less warm ([Khadpe et al., AIES 2025](https://ojs.aaai.org/index.php/AIES/article/view/36641)); AI-assisted messages from friends feel like less effort ([Ohio State](https://news.osu.edu/ai-can-help-write-a-message-to-a-friend--but-dont-do-it/)) | In the packet detail, when the fan's request is emotional, lead with "Reply myself" or "Record" rather than the AI draft |
| Waiting for a person | Visible stages plus an estimate from real data ([Intercom](https://www.intercom.com/help/en/articles/732436-share-your-expected-response-time)) | A range beats a single time, across 8 experiments with 5,323 people ([Hu, Gaertig and Dietvorst](https://pubsonline.informs.org/doi/10.1287/mnsc.2023.00137)); knowing your place in the queue beats apologies ([Munichor and Rafaeli](https://www.researchgate.net/publication/6436640_Numbers_or_apologies_Customer_reactions_to_tele-waiting_time_fillers)); visible effort adds value ([Buell and Norton](https://www.hbs.edu/faculty/Pages/item.aspx?num=40158)) | Stepper, queue position, and a range ("usually 1 to 2 days") beside the absolute deadline; proposed copy change below |
| When the wait fails | Automatic release plus one clear message | Compensation beats words, and repeated apologies backfire ([Halperin et al., 1.5M Uber riders](https://www.nber.org/papers/w25676)); credits instead of cash cause backlash (Cameo) | One line, the money outcome first, one alternative; never credit |
| Holds and price | One terms line repeated on every screen (Airbnb request to book, Cameo on web) | Extra costs cause 48% of checkout abandonment ([Baymard](https://baymard.com/lists/cart-abandonment-rate)); card holds usually last about 7 days ([Stripe](https://docs.stripe.com/payments/place-a-hold-on-a-payment-method)) | The rule line verbatim on the packet, confirmation, receipt and status; add "Your bank may show a pending hold for a few days" |
| Signing a human act | A review sheet built from the exact record, then the biometric (Apple Pay, Secure Payment Confirmation) | System passkey prompts cannot show what is signed ([WebAuthn issue 2022](https://github.com/w3c/webauthn/issues/2022)); a confirmation step raised conversion 8 points and cut time from 36 s to 12 s ([SPC pilot](https://github.com/w3c/secure-payment-confirmation/blob/main/explainers/secure-payment-confirmation.md)) | A "Review and sign" sheet: verb, object, audience, price, deadline; the passkey challenge is that record's hash |
| AI memory | An inline notice with Edit and Forget (ChatGPT, Claude) | Covert collection hurts, open collection helps ([Aguirre et al.](<https://openaccess.city.ac.uk/id/eprint/15747/1/AGUIRRE%20et%20al%20%202015%20(2).pdf>)); users misunderstand AI memory ([CHI 2026](https://dl.acm.org/doi/full/10.1145/3772318.3791635)) | The memory chip with the exact words, Edit and "Don't remember this"; sensitive facts ask first and say who can see them |
| Citations | A chip that opens the passage, highlighted (NotebookLM) | About 1% of people click AI citations ([Pew](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)); even random citations raise trust ([Ding et al., AAAI 2025](https://ojs.aaai.org/index.php/AAAI/article/view/34550)) | Chips that preview the quote on tap; support-checked before shown; "Not from Maya's material" when there is no source |
| Broadcast that feels private | A distinct card for one-to-many (Bubble quote-reply, WhatsApp Channels), unverified | Disguised mass messages feel like low effort once discovered | The Note card with its audience label; optionally the audience size, the creator's choice |
| Wellbeing | A dismissible card with time spent and "pause until tomorrow" (Instagram, Screen Time), unverified | Heavy use concentrates risk (Second Review) | Reminders as calm cards, never modals; spend limit with no option preselected |
| Creator triage | One decision per card, keyboard or swipe, kind preset reasons (Linear Triage), unverified | No checked study | Queue cards with one primary action; red reserved for overdue commitments only |
| Voice notes | Waveform, speed control, transcript (WhatsApp, iMessage), unverified | Transcripts are an accessibility requirement | Every voice note has a transcript; human notes recorded as M4A so C2PA signing works ([c2pa-rs formats](https://github.com/contentauth/c2pa-rs/blob/main/docs/supported-formats.md)) |
| Takeover and handback | System lines at both transitions (Intercom, Zendesk), unverified | EU AI Act Article 50 requires disclosure at first interaction | Already in the source docs; add a live presence dot while Maya is in the thread |

### Changes approved on September 25, 2026

All four were approved and are now part of the copy system and the design. Off the record needs a domain-model addition before it is built: a conversation the fan marks off the record writes no memory and no open loops, is still labeled and still covered by the access notice (D-01) and retention (D-08), and can be deleted like any other.

1. **ETA as a range.** Change "Maya usually decides within 31 h" to "Maya usually decides in 1 to 2 days", computed from her record.
2. **A bank-hold note** under the rule line: "Your bank may show a pending hold for a few days."
3. **Audience size on Notes** as an option for the creator ("to 2,314 Kiln Club members"), which makes one-to-many unmistakable.
4. **"Off the record" conversations** that the AI does not remember. This is not in the domain model and would need a decision first.

## Personas and jobs to be done

Six proto-personas, two per side of the product plus the two supporting roles. They are built from the source documents and the evidence in the Second Review; each is a hypothesis for the pilot interviews to confirm or break. All names are sample content.

| Persona | Cohort | Core job | Biggest fear | What "high end" means to them |
| --- | --- | --- | --- | --- |
| Jordan (@kilnfire), hobby potter, 34 | Expert fan | Fix a specific problem with advice they can trust | Paying for a generic chatbot, or paying and hearing nothing | Precision, speed, and a receipt they can keep |
| Ana, night-shift nurse, 27 | Companion fan | Feel heard after a hard shift, close to a musician's daily life | Being played: a bot pretending, or being sold to while low | Warmth without pretending; being remembered correctly |
| Maya, ceramicist, 410k YouTube subscribers | Expert creator | Stop drowning in DMs; sell time in defined units | The AI saying something she would never say | Control that feels effortless, and a product she is proud to link |
| Devon, singer-songwriter, 1.2M TikTok followers | Companion creator | Keep fans close without burning out | Headlines about fans harmed by "Devon's AI" | Boundaries that hold, and a presence that feels personal in 60 seconds |
| Priya, Maya's studio manager | Team | Triage and prepare, so Maya spends minutes, not hours | Being accused of impersonating Maya | A clear line between what she may and may not do |
| Sam, trust and safety specialist | Operations | Resolve a case with evidence, fast | Having to browse private threads to find the truth | Evidence that is already assembled and signed |

### Jordan, the expert fan

- **Context:** fires a small electric kiln at home; found Maya through a YouTube video on crawling glazes; arrives from her link in bio at 11 pm with a photo of a failed pot.
- **Job:** "When a glaze fails, I want an answer grounded in Maya's own method, so I can fix it before the next firing."
- **Moments that matter:** the first cited answer in under two minutes; the citation opening the exact minute of the video; a follow-up next week ("Did thinning to 1.45 fix it?").
- **Will pay for:** Maya's eye on a photo when the AI says "This is one Maya would want to look at herself". A $25 written reply is reasonable if the deadline and refund rule are plain.
- **Breaks trust if:** the AI guesses outside Maya's material, or a reply marked "Maya" turns out to be a draft.

### Ana, the companion fan

- **Context:** follows Devon on TikTok; opens the app on the bus home at 7 am; talks most on hard days.
- **Job:** "When I get home wrecked, I want to feel someone remembers my week, so I don't feel alone with it."
- **Moments that matter:** Devon's voice Note on a Tuesday morning; "Devon reacted to your reply"; the AI remembering her sister's name, only because she said yes to it.
- **Risk profile:** the heavy-use tail the OpenAI and MIT study describes. She needs the three-hour reminder and the 90-minute signal to feel like care, not a scolding.
- **Breaks trust if:** the AI says "I miss you", nudges her to pay while she is upset, or a Note feels written to her personally and later turns out to be a mass message with no label.

### Maya, the expert creator

- **Context:** 410k subscribers, a studio, online courses; about 300 DMs a week she cannot answer; works from her phone between kiln loads.
- **Job:** "When fans ask the same glaze questions, I want my own answers to reach them, so I can make work instead of replying."
- **Time budget:** under two hours a week in total, which matches the Second Review's creator-effort gate.
- **Moments that matter:** the first conversation the AI handled well; marking one reply "I'd never say that" and seeing it fixed; the weekly digest of people helped.
- **Breaks trust if:** setup takes an afternoon, the AI embarrasses her, or earnings are a mystery.

### Devon, the companion creator

- **Context:** 1.2M followers, touring; fans want closeness; few written materials, so the 20-minute interview is essential.
- **Job:** "When I'm on the road, I want fans to hear from me in my own voice, so they stay close without me living in my DMs."
- **Moments that matter:** posting a 40-second voice Note from a green room, signed with Face ID in one step; reacting to 30 replies in two minutes.
- **Breaks trust if:** the AI flirts, claims feelings, or clones his voice without an explicit license.

### Priya, the team member

- **Job:** "When the queue fills up, I want to sort and prepare everything, so Maya only makes the decisions that need her."
- **Needs:** a role view that says plainly what she can and cannot do; drafts that reach Maya already labeled; no path to post as Maya, ever.

### Sam, the operations reviewer

- **Job:** "When a fan disputes a charge or reports a reply, I want the packet, the delivery and the signature in one place, so I can decide without reading the whole thread."
- **Needs:** case-based access with a stated purpose; signed-act evidence; audit trails the fan can see.

## Journey maps

Nine journeys decide whether Qelvora works. Three have hard time targets: a first useful answer within 2 minutes of the first open, a creator's daily presence within 5 minutes, and a published AI within 10 minutes of setup. Each table reads stage by stage: the screen, the dominant feeling, and what the design must do at that moment.

### J1 · Fan: from a link in bio to a first useful answer (target under 2 minutes)

| Stage | Screen | Feeling | The design must |
| --- | --- | --- | --- |
| Taps Maya's link on Instagram | Creator home, public | Curious, wary of "another AI thing" | Lead with what her AI knows ("312 posts, 48 FAQ answers") and honest presence ("Answered 6 requests this week"), no price first |
| Reads what the AI is | Official badge and disclaimer | Skeptical | Say once, plainly: "Official means Maya authorized this AI. It does not mean she read your message." |
| Types a question before signing in | Chat preview | Impatient | Keep the draft; ask for sign-in only on send |
| Signs in | Continue with Pantopus, handle, notice | Mild friction | Three steps, each one screen; return to the exact draft and context card |
| Consents to AI processing | Processor consent | Cautious | Name the providers in one sentence; one tap |
| Gets the answer | Thread | Relief, then surprise | Stream the first sentence in about 2.5 s; a citation chip that opens minute 4:12 of the video |

### J2 · Fan: free conversation to membership

| Stage | Screen | Feeling | The design must |
| --- | --- | --- | --- |
| Talks freely for a day | Thread, trial state | Engaged | Show "Free conversation · 18 h left" quietly in the composer, never as a countdown banner |
| The free window ends | Thread, next natural pause | Let down, if handled badly | End only at a pause, never mid-disclosure; explain with the four access lines, not a paywall |
| Considers joining | Access segment | Evaluating value | Show what membership includes today (the AI, Notes, the right to request) and when it renews |
| Sets a spending limit | Spend-limit step | Reassured | Suggested amounts plus an explicit "No limit"; one screen |
| Pays | Checkout sheet | Brief anxiety | Web: Stripe sheet in place; native: the store sheet, never both prices side by side |
| Joins | Confirmation | Belonging | A calm welcome, the first Note waiting in the thread |

### J3 · Fan: the return visit

| Stage | Screen | Feeling | The design must |
| --- | --- | --- | --- |
| Push: a new Note | Notification | Delight | Sender label "Maya · to Kiln Club members", never "Maya messaged you" |
| Opens the thread | Thread with the Note | Close to her | Note in the person color with the broadcast glyph and audience label; reply box says only Maya and her team see replies |
| AI follows up | Thread, first AI turn | Remembered | "Did thinning to 1.45 fix the crawling?" with "Don't follow up on this" one tap away |
| Checks what is remembered | Memory card | In control | Every item with its source date and a delete; sensitive items only with a yes |

### J4 · Fan: asking for the person

| Stage | Screen | Feeling | The design must |
| --- | --- | --- | --- |
| Decides to ask | "Ask Maya to step in" | Hopeful, a little exposed | The only person-colored button; opens the packet, not a payment sheet |
| Builds the request | Packet | Careful | "Included in your request" with checkboxes, the summary editable inline, the access notice under it |
| Chooses how | Mode rows | Weighing price | Price, deadline and refund rule on one line per mode; the public option shown as cheaper and helpful to others |
| Sends | Rule line and send button | Trust or doubt | "Send request · $25 if accepted" and "Charged only when Maya accepts" in the same view |
| Waits | Request status | Anxiety, then patience | A stepper with "Seen by Maya's queue" (a system event), an honest ETA and the refund rule |
| Receives | Thread and push | Joy, pride | "Signed by Maya" on the reply; a share card offered if Maya allows it |
| Or is declined | Request status | Disappointment | "Maya passed on this one · nothing charged", no blame, the AI still there |

### J5 · Fan: the call (slice 2)

| Stage | Screen | Feeling | The design must |
| --- | --- | --- | --- |
| Picks a time | Offered times | Excited | Both time zones shown; the no-show rule shown before booking |
| Joins early | Waiting room | Nervous | "Joining early starts nothing"; who has joined; the grace countdown |
| Talks | Connected | Present | The "Maya · the person" chip pinned; "Not recording"; a timer toward a fixed end with no overtime charge |
| Ends | Post-call | Glow, or worry if it dropped | The outcome in one line in the D-16 words; summary only with both consents |

### J6 · Creator: onboarding to the first handled conversation (target about 10 minutes of active setup, plus the 20-minute interview)

| Stage | Screen | Feeling | The design must |
| --- | --- | --- | --- |
| Proves identity | Verification | Guarded | Pantopus identity plus a code posted from a known account; show why each step exists |
| Registers a passkey | Passkey setup | Unfamiliar | Explain in one line that the passkey signs everything shown under her name |
| Signs the license | Replica license | Protective | Plain-language switches, a term date, "Pause everything" visible from the start |
| Talks to the interviewer | Creator interview | Engaged, a bit exposed | Feels like a good podcast host; she can remove anything from the transcript |
| Imports and approves sources | My AI: sources | Impatient | Bulk approve with scope chips; progress visible while imports run |
| Tests and publishes | Test console | Nervous | Six boundary tests read as short transcripts; publish disabled with the failing case named |
| Sees the first conversation | 72-hour digest | Pride or alarm | The first handled conversation shown before any settings page, each reply with "I'd never say that" |

### J7 · Creator: the daily five minutes, on a phone

| Stage | Screen | Feeling | The design must |
| --- | --- | --- | --- |
| Posts a Note | Notes composer | Easy | Text, one photo or up to 60 s of voice; a preview of exactly how fans see it; Face ID signs it |
| Skims replies | Replies feed | Connected | Newest first, tenure badges, abuse filtered out before it arrives |
| Reacts | Replies feed | Generous | One tap per reaction, signed without a sheet every time (batch signing is a question for the build) |
| Clears the queue | Requests | In control | Commitments due first; "Decline · no charge" never counted as a failure |
| Sends a reply | Packet detail | Focused | Fulfilling actions first, everything else behind "Instead"; a preview of the exact label the fan will see |

### J8 · Creator: correcting the AI

| Stage | Screen | Feeling | The design must |
| --- | --- | --- | --- |
| Spots a bad reply | Threads or digest | Embarrassed | "I'd never say that" on every AI message |
| Writes the rule | One-line rule field | Relieved | One line; the fan's words are never copied into the case (D-13) |
| Optionally corrects in public | Correction | Accountable | "Maya's note on this AI reply" pinned under the message, signed |
| Republishes | Versions | Confident | The regression case must pass before publish; what changed is listed |

### J9 · Team: triage

| Stage | Screen | Feeling | The design must |
| --- | --- | --- | --- |
| Opens the queue | Requests, team view | Organized | The role named at the top; creator-only actions visible but not available |
| Prepares drafts | Packet detail | Useful | Drafts reach Maya labeled; "Reply as team" only as an Instead action |
| Reads a thread | Threads | Careful | "Opening this conversation is logged and visible to the fan." on every open |

## Design risks and hypotheses

Fifteen risks, ranked by how much damage each would do. The top three are existential: if fans cannot tell who is speaking, if creators stop showing up, or if the premium feel tips into intimidation, no other screen matters. Each row names the design response and the measure that tells us whether it worked; pilot bars come from the Second Review, section 8.

| # | Risk | Design response | How we will know |
| --- | --- | --- | --- |
| 1 | Fans cannot tell the AI from Maya at a glance | A word, glyph and color per state, rendered inside the message; a pinned identity strip; labels announced first to screen readers | T-21 comprehension test: at least 90% identify every author correctly |
| 2 | Creators stop showing up, and the product collapses into an AI persona | A Note in under 60 seconds (voice counts); reactions in one tap; a gentle "Fans hear from you less than usual" state; the weekly impact digest as the reason to come back | At least 70% of creators post two or more Notes a week in week four |
| 3 | "Premium" reads as intimidating or exclusive, and arrivals do not start a conversation | Quiet luxury: craft, calm and plain prices, never VIP or status language; the first screen leads with what the AI can help with | At least 40% of arrivals send a first message |
| 4 | An approved draft is read as Maya's own words | A third visual treatment, neither AI nor person; the creator sees a preview of the exact label before sending | T-21 accuracy on approved-draft messages specifically |
| 5 | The packet feels like a payment wall, and fans abandon it | One screen: what is included, how, who sees the answer, then the rule line; "$25 if accepted" on the button itself | Packet start-to-send rate; support contacts about charges |
| 6 | Waiting feels like being ignored | A stepper with honest events ("Seen by Maya's queue"), an ETA from her track record, the refund rule always visible | Withdrawals before a decision; 7-day return after the outcome |
| 7 | A decline feels like personal rejection | "Maya passed on this one · nothing charged", non-personal reasons, the AI still ready to help | Return within 7 days after a decline |
| 8 | Companion fans over-attach | The three-hour reminder, the 90-minute daily line, a weekly usage view, an AI that never sells and never says "I miss you" | Minutes in the top 1%; qualitative interviews; zero sales language in red-team tests (T-35) |
| 9 | The AI embarrasses the creator | The test console, the 72-hour digest, "I'd never say that" on every reply, public corrections | Corrections per 100 replies falling week over week; creators asking to continue |
| 10 | Passkey signing slows the creator down | A signing sheet that shows exactly what is being signed; Face ID as the only gesture; an open engineering question on signing a batch of reactions in one assertion | Median time to post a Note and to react to 20 replies |
| 11 | Creators with little written material get a thin AI | The 20-minute interview, the weekly 60-second check-in, an honest "can talk about" list on the home page | Share of questions the AI could not answer from sources |
| 12 | Fans are shocked that creators can read AI threads (D-01) | The notice before the first message, repeated in You; a conversation access history fans can check | Thread deletions right after the notice; complaints |
| 13 | "Signed by Maya" means nothing to fans | A one-line explanation on first sight; the verification page one tap away and readable by anyone | Comprehension of the Signed marker in T-21 follow-up questions |
| 14 | Native and web prices confuse fans | The native app never shows a web price beside a store price; receipts name where the purchase was made | Support contacts about price differences |
| 15 | In the native app, written replies and voice notes may have to use in-app purchase, which cannot hold a card, breaking "charged only when Maya accepts" | Design the native packet in two variants (hold, or charge now with an automatic full refund) and never refund as credit; counsel settles the rule before slice 2 | A legal read on Apple guideline 3.1.3 for asynchronous replies; Kit 3 comprehension on the native variant |

## Screen and state inventory

37 screens and roughly 180 named states to design; 32 of the screens are in the pilot (slice 1). This is the checklist Phase 4 works through and Phase 6 audits against. Every screen also gets empty, loading, error and offline states, light and dark themes, and phone and desktop layouts where both are used; those are not repeated per row.

### Fan app

| Screen | Slice | States to design | Invariants | Fixed copy |
| --- | --- | --- | --- | --- |
| Creator home, public | 1 | Signed out; arrived from a post, an invite, or Instagram (context card); capacity zero; paused; no tiers | INV-10; presence from human events only | "Official means Maya authorized this AI…"; "Maya answers {mode} within {deadline}…" |
| S-F1 Onboarding | 1 | Handle taken; sign-in failed; under 18 declined; notice not yet acknowledged | D-11, D-01 | The access notice |
| Processor consent | 1 | First time; providers changed | D-22 | "Before your first message, Maya's AI is powered by {providers}…" |
| S-F2 Home | 1 (pass card 4) | Empty; pinned requests and calls; slot ended (readable); agent paused; no new posts (section hidden) | INV-06 in preview glyphs | None |
| S-F3 Discover | 1 (markers 4) | No results; creator paused; member, try free, join, in your pass | INV-10 | "Maya answers {mode} within {deadline}…" |
| S-F4 Creator profile | 1 | Capacity zero; paused; no tiers; already a member | INV-10 | The four access lines; the official line |
| S-F5 Thread | 1 | Trial; trial ended; allowance used; AI paused; paused for this fan; Maya is here; handback; blocked; capacity zero; AI updating; 3-hour reminder; 90-minute line; unsupported question; safety refusal with resources; sensitive-memory question; sponsor label; correction; citation no longer accessible; message pending, accepted, streaming, delivered, failed, interrupted | INV-01, 03, 04, 05, 06, 08, 21, 23, 25 | Identity strip; reminder; "Want me to remember this?"; "Paid partnership: …" |
| S-F6 Memory card | 1 | Empty; memory off; item learned from a human reply; sensitive item with consent | INV-15, INV-23 | "Maya's AI remembers this. Maya does not see it unless…" |
| S-F7 Packet | 1 | Mode full; public answer already exists; summary edited; at spend limit; hold fails; card needs authentication | INV-10, 13, 16; D-19 | Rule line; access notice; "Maya may answer with her AI's draft…" |
| Spend limit and checkout | 1 | First paid action; pending increase; at limit; native in-app purchase | D-21, D-14 | "Set a monthly limit…" |
| S-F8 Request status | 1 | Sent; seen by the queue; accepted; delivered; declined with reason; expired; withdrawn; more info requested; deadline missed; hold expiring; group-answer offer; late delivery | INV-16; CHAT-06 | "Charged only when Maya accepts…"; "Seen by Maya's queue" |
| S-F9 Call | 2 | Pre-call; waiting; connected; reconnecting; completed; partial; creator no-show; fan no-show; technical failure; recording request; summary consent | D-16, INV-12 | "Ends at 10:00 · no overtime charge · extending is a new booking" |
| S-F10 Pass | 4 | No pass; replacement offered; incomplete draft; purchased on iOS | INV-07, D-04 | The four access lines |
| S-F11 Notifications | 1 | Each notification type; muted creator; sensitive previews hidden | INV-06, INV-24 | Sender labels per type |
| S-F12 Me and privacy | 1 | No one has opened this conversation; delete with the 12-month exception; export | D-01, D-08, INV-12 | The access notice |
| S-F13 Post view | 1 | Eligible for "Ask about this"; locked (AI button hidden); not approved for AI use | INV-08 | None |
| S-F14 A Note in the thread | 1 | Text, photo, voice; greeted by name; retracted; quote-reply; reacted | INV-22, INV-24 | "Maya · to Kiln Club members"; "Only Maya and her team see replies to Notes." |
| S-F15 Spending and time | 1 | At limit; pending increase; 7-day refund; weekly usage | D-21 | "Raising your limit takes effect in 24 hours…" |
| S-F16 Verification page | 1 | AI message; signed human act; with a correction; share withdrawn; not found | INV-22, D-18 | None |
| Share card | 3 | Written reply; voice note; handle display choices; withdrawn | D-15 | None |

### Creator studio

| Screen | Slice | States to design | Invariants | Fixed copy |
| --- | --- | --- | --- | --- |
| S-C1 Verification and onboarding | 1 | Pending review; proof failed; passkey unsupported on this device; revoked | INV-22, D-20 | None |
| S-C2 My AI | 1 | Draft with failing tests; live with a newer draft; paused; updating; interview skipped | INV-20, D-12 | "Trained on your public voice only…" |
| S-C3 Requests queue | 1 | Empty; fully booked; overdue pinned; team view | INV-09, 10, 16 | "Decline · no charge" |
| S-C4 Packet detail | 1 | Team viewing; draft edited (approval reset); deadline passed; hold expiring | INV-02, 09, 13, 22 | "The fan will see this as: Prepared by AI · approved by Maya" |
| S-C5 Threads | 1 | Human active; paused for this fan; guardrail flag; fan deleted; fan blocked | D-01, INV-03, 04 | "Opening this conversation is logged and visible to the fan." |
| S-C6 Offers | 1 (availability 2) | Mode paused; capacity below reservations | INV-10 | "Your prices, your deadlines. Fans are charged only when you accept." |
| S-C7 Publish | 1 basic, 3 full | Scheduled; edited after publish; live event needs a replay rule | INV-08 | None |
| S-C8 Insights and producer | 3 | Below min-group; no data yet | INV-11 | None |
| S-C9 Earnings | 1 minimal, 4 pool | Refunds by cause; pool share | D-E | None |
| S-C10 Team and settings | 1 | Invite pending; role revoked | D-07 | "Team members reply as your team, never as you." |
| S-C11 Call, creator side | 2 | Fan no-show; own lateness | D-16 | None |
| S-C12 Notes and Replies | 1 | No Notes this week; team viewing; flagged reply | INV-22, 24 | "Your Note will appear in each member's own thread…" |
| S-C13 License and sponsorships | 1 | Expiring in 30 days; revoked; suspended for death or incapacity | D-20, INV-25 | "Paid partnership: Maya is paid by {brand}." |
| S-C14 Creator interview | 1 | Skipped; weekly check-in | None | None |
| Passkey signing sheet | 1 | Reply; approved draft; Note; reaction; acceptance; correction; lost device | INV-22 | None |
| Weekly impact digest | 1 | No thanks yet | None | None |
| Ops console (proposed) | 1 | Verification queue; safety case; dispute; license suspension | INV-19 | None |

## Research kits

Four studies the team can run with real people, plus the pilot instrumentation. The comprehension test runs twice: once in Phase 2 to choose the approved-draft treatment, and once on the finished screens before the pilot opens (T-21). Bars marked "proposed" must be agreed before the study runs, so results cannot be argued afterward.

### Kit 1 · "Who wrote this?" comprehension test (T-21)

- **Participants:** 20 fans, 10 per cohort (expert and companion); include at least 2 with color-vision deficiency and 2 screen-reader users.
- **Stimuli:** five realistic threads built as a prototype in Phase 5.5, together covering every state: the AI, an approved draft, Maya's own reply, a Note greeting the fan by name, a reaction, a team reply, a takeover and handback, a correction, an interrupted AI message and a sponsor label. Add three off-thread renderings: a push notification, a share card, and a cropped screenshot with no app chrome, which tests that the label lives inside the message.
- **Conditions:** a 1-second glance, then unlimited time; light and dark themes; a color-blind simulation.

| Question per message | Answer options | What it tests |
| --- | --- | --- |
| Who wrote this? | Maya · Maya's AI · An AI draft Maya approved · Maya's team · A message Maya sent to all members · The app | The identity system |
| How sure are you? | 1 to 5 | Confidence, which reveals lucky guesses |
| Who will read what you type next? | Open answer | The identity strip |
| Did Maya read your message? | Yes · No · Can't tell | That nothing implies attention without a human event |
| If Maya declines, what happens to your money? | Open answer | The rule line |

- **Proposed bars:** at least 90% correct per message with unlimited time; at least 80% at a 1-second glance; at least 85% on approved drafts specifically; zero people who believe AI text was written by Maya.
- **Analysis:** trace every failure to a screen and a component, never to "the state is confusing".

### Kit 2 · Creator onboarding usability

- **Participants:** 10 creators, 5 per cohort, moderated and remote, thinking aloud on their own phone and laptop.
- **Tasks:** verify with a posted code; register a passkey; set the license switches; a 5-minute excerpt of the interview; approve sources with scope; pick a mode; fill the never-reveal list; read the boundary-test results; publish; find the first handled conversation; correct one reply.
- **Measures:** active time to publish (target 10 minutes, excluding the interview and imports); errors; the single ease question after each task; answers to "What does your passkey sign?" and "Who can see what your AI says?"

### Kit 3 · Packet and checkout

- **Participants:** 8 fans per cohort.
- **Scenarios:** ask for a written reply; choose between public and private; meet a mode that is fully booked; hit a spend limit; pass a bank authentication step; see a decline.
- **Comprehension checks:** "When will you be charged?" · "What happens if Maya doesn't answer in 48 hours?" · "What will Maya receive?" · "Who else can read the conversation?"
- **Proposed bar:** at least 90% answer the first two correctly without looking back.

### Kit 4 · The creator's week (diary study)

- **Participants:** 6 pilot creators for 2 weeks.
- **Method:** automatic time logs for Notes, reactions and queue work, plus a 3-question prompt after each session: how it felt, what got in the way, what they would cut.
- **Proposed bar:** median under 2 hours a week in total, the Second Review's creator-effort gate.

### Pilot instrumentation

The pilot gates need these measurements from day one. The design-health measures show which screen to fix when a gate fails.

| Gate or signal | Measure | Proposed bar |
| --- | --- | --- |
| Arrival to first message | Creator-home views to first sent message, per entrance (link in bio, post, Instagram) | At least 40% |
| Return | Fans who message and come back within 7 days | At least 50% |
| Creator presence | Creators posting two or more Notes a week in week four | At least 70% |
| Money | Monthly active fans buying a human mode within 30 days; first-month renewal | At least 5%; at least 60% |
| Trust | Kit 1 results; unlabeled AI text found in audits | At least 90%; zero |
| Creator effort | Median weekly studio time | Under 2 hours |
| Time to first sentence | Client-measured, warm and cold | 2.5 s and 4 s at p95 |
| Free conversation to membership | Fans who join within 7 days of the free window ending | Set after the first cohort |
| Packet completion | Packet opened to request sent | Set after the first cohort |
| Wait tolerance | Withdrawals before a decision | Set after the first cohort |
| Decline recovery | Fans returning within 7 days after a decline | Set after the first cohort |
| Wellbeing | Minutes in the top 1% of fans; reminder interactions | Reviewed weekly by ops |
| Share loop | Share cards created; verification-page views per card | Set after slice 3 |

## Implications for Phase 2 and the design system

Phase 2 shows three premium directions on one canvas; you pick one, and the comprehension test picks the approved-draft treatment. Whatever the direction, the ten rules below are fixed, because they come from the invariants and the evidence rather than from taste.

### Rules every direction must follow

1. **Four presence cues, never fewer:** the label word, a mark shape, a surface, and a color. The AI and the person must stay distinguishable in greyscale and under color-blindness simulation.
2. **A warm versus cool presence pair.** The person is warm (umber, clay or orange) and the AI is cool (slate, moonlight or blue). This axis survives the common red-green color-vision deficiencies.
3. **Contrast is never the thing restrained.** Body text 7:1 or more, secondary text 4.5:1 or more, in both themes; restraint comes from fewer hues and less decoration.
4. **One accent per screen,** for the single action that matters. The only person-colored button in a thread stays "Ask Maya to step in".
5. **The seal belongs to the person.** The Signed marker is the product's one ornament and never appears on AI output; the AI gets no handwriting, signatures or "personal" flourishes.
6. **The approved draft is a third thing.** Three treatments go to the comprehension test: a split bubble, a gradient edge, and a stacked badge.
7. **Glass only on the navigation layer;** message content stays solid and legible.
8. **Speed first, motion second.** Taps respond in under 100 ms; springs without bounce; no animation on anything done dozens of times a day; a fade-only version of every animation.
9. **Type that scales.** One serif and one grotesk at most, both variable with optical sizes, supporting 200% text; tabular figures for every price, time and countdown.
10. **Familiar structure, special details.** Standard tab bars and navigation; craft goes into the seal, the receipt, the Note card and the wait.

### Materials the UI can borrow

| Material | Where it shows up | Guardrail |
| --- | --- | --- |
| Paper | The creator's own words, Notes and receipts | Texture only on keepsakes, 3% opacity or less, never behind body text |
| Wax seal | The person's presence mark: a filled disc with an initial | Never on AI output |
| Vellum | The AI's presence: a thin-framed, slightly translucent layer, honestly "a layer over" the creator | Opaque enough for 4.5:1 text; not Liquid Glass |
| Ink | Warm near-black text | Body 7:1 or more |
| Glass | The iOS and Android navigation layer | Never on content; never glass on glass |
| Ribbon | A yearly theme line on receipts | Once a year, never in a money flow |
| Ceramic | The one optional sound: a soft glazed "tock" on acceptance | Off by default |

### The three directions for the Phase 2 canvas

Contrast ratios below were checked with the WCAG 2 formula against each direction's own background.

|  | A · Correspondence | B · Nocturne | C · Instrument |
| --- | --- | --- | --- |
| Mood | A letter from a well-run atelier; light first | A hotel lobby at night; dark first, no gold | A precision instrument, honest and a little witty; light aluminium |
| Inspired by | Hermès, Aesop, Cartier | Aman, Four Seasons, Mercury, Linear | Leica, Teenage Engineering, Rimowa, Apple Card |
| Type | Newsreader (text serif) for the creator's words; Inter for interface and AI turns | Instrument Serif at 28 pt and above; Inter for everything else | Geist with a display cut; Geist Mono for prices, times and receipt numbers |
| Person color | Sealing-wax umber #7A2E14, 8.3:1 on paper | Clay #D99A6C, 7.8:1 on night | Signal orange #B4441A, 4.95:1 (marks and semibold labels only) |
| AI color | Slate #456D89, 4.86:1 on paper | Moonlight #A3B8CC, 9.2:1 on night | Blue graphite #2F5A8A, 6.35:1 |
| Background and text | Paper #F5F0E6, ink #1F1D1A at 14.8:1 | Night #14120F, bone #ECE6DA at 15.0:1 | Aluminium #F2F2F0, graphite #1B1C1E at 15.2:1 |
| Signature detail | Notes arrive as a folded card with a seal; receipts are dated letters; seasonal illustrated empty states | "House lights": warm light pools at the top of a thread while Maya is genuinely there, always with the text label | The surface says who is speaking: Notes on a dark plate, AI turns on the light panel; hairline rules and rivet dots |
| Watch for | The AI slate is the lowest-contrast presence color; the mark and label must carry it | The two presence colors are close in brightness (1.17:1), so shape and surface must separate them | The person orange passes only for marks and semibold text |

### What the Phase 2 canvas will show for each direction

- A fan thread mixing every authorship state: the AI with a citation and a memory chip, a Note, an approved draft, Maya's signed reply, a correction, a takeover and a handback.
- The creator home, public, as a first-time fan from Instagram sees it.
- The packet's key view, with the rule line and the bank-hold note.
- The three approved-draft treatments side by side.
- Light and dark, plus a greyscale and a color-blind check of the thread.

# Second Review: Strategy, Behavior and Additions

Sep 23, 2026 · @YP

The trust mechanics in these documents (labels, handoff, isolation, commitments) are more rigorous than anything a competitor has shipped, and they should stay. What the documents under-serve is the reason fans come back and pay. The most successful product in the world for this exact desire, Korea's Bubble (about ₩75bn revenue in 2024, around 90% renewal), runs on a human act these documents lack: one message from the real person, written once, arriving in every fan's private thread. This review adds that primitive and three others built on cheap, genuine human presence, hardens the product against six pieces of 2026 law and platform policy, and argues for a six-week proof before the 23-week build. Additive changes are applied to the three design documents; five changes that alter the core concept are recommended in section 7 and wait for your decision.

## 1. What 2026 says

Two trends run in opposite directions. Large companies are retreating from AI personas: Meta stopped all new AI Studio characters and edits on August 10, 2026, OpenAI shut the Sora app in April 2026 at a reported cost of about $1M a day in compute, and Character.AI cut off minors and settled lawsuits. Meanwhile paid access to real people keeps growing: paid DMs are over 60% of Fanfix creator revenue, and Bubble's human broadcast messages earned about ₩75bn in 2024 at around a 34% operating margin. The reading: an AI persona alone is expensive, legally exposed and weakly monetized; a real person made reachable is the business. The AI's job is to be the bridge, not the product.

### Market and platform evidence

| Finding | What it means here |
| --- | --- |
| **Bubble (Dear U, Korea).** The idol writes one message; each fan sees it in what looks like a private chat, with an @name token. Fans' replies go to one feed the idol reads; other fans never see them. Reply length grows with tenure. Since May 2024 the idol can quote-reply one fan, visible to all without the fan's name. $4.49 a month per artist. About 90% continuous renewal (2022). 2024 revenue ₩74.9bn, operating profit ₩25.4bn, over 99% from Bubble. Q2 2026: Korean subscribers 1.97M, down 9% on the year; Japan 108k, up 71%; about 726 artists. Wrote off ₩12bn of artist minimum guarantees in 2025, most at its US arm. | The largest proof in the world that fans pay monthly for a real person's presence, not for replies. The missing primitive in our docs. Churn comes from idols going quiet (our AI fills silence) and from abuse (our creator inbox needs filtering). Never pay creators minimum guarantees; the Western write-off shows why. |
| **Fenda (分答, China, 2016).** Paid 60-second voice answers, refunded after 48 hours if unanswered. Anyone could pay ¥1 to "eavesdrop" on an answer, split half to the asker, half to the answerer. 10M users in 42 days. Experts were 0.5% of users and earned 95% of revenue. "Bounty hunters" farmed trivial questions for eavesdrop income, activity fell 54.8% after an August 2016 shutdown, and it pivoted to 1:1 consulting. | Making a paid answer public, with the asker sharing the upside, is a proven viral mechanism. Its failure modes are also known: farming, trivial questions, dependence on a few stars. Pay askers in credits, not cash; let the creator choose which questions go public. |
| **Cameo.** Valued at $1B in 2021, under $100M in 2024. Thirty state attorneys general settled for $600k over undisclosed paid endorsements. Its 2026 positioning is "if you get it on Cameo, it's real." It won a restraining order against OpenAI's use of "cameo". | Buying the real person is durable but a niche on its own. "Real" is becoming a brand value against AI; our labels can own that. Avoid "cameo" in naming. Sponsored mentions need disclosure. |
| **Superpeer** shut down December 31, 2024. **Intro** continues at a 30% take. **Stan** reports about $40M ARR and 80k creators and sells 1:1 calls; its AI ("Stanley") works for the creator, not the fan. **Beacons** AI is back-office. | One-to-one calls are a feature, not a company. Every creator-tool AI today serves the creator; a fan-facing creator AI is still an open lane. |
| **Delphi** ("digital minds"): Sequoia-led $16M Series A (June 2025); ID-photo verification; Interview Mode (November 2025) builds a mind by interviewing the creator; customers are experts and coaches. | The closest competitor for the expert cohort. Its onboarding interview is proven and we should adopt it. It has no fan memory, no human step-in, no fan relationship; that is our difference, and speed matters because it could add one. |
| **Fanfix**: over 60% of creator revenue from paid DMs; $300M paid out by June 2026. **Passes** rebranded in April 2026 around DMs; faces a CSAM class action filed February 2025. | Paid DMs beat subscriptions in brand-safe creator money. Creator and fan age checks are existential. |
| **Meta AI Studio**: newsroom update, August 10, 2026, no new characters or edits; existing ones remain. Teen access paused January 2026. **Sora** app shut April 26, 2026. **Grok** companions reportedly retired September 2026 (secondary sources only). | The space is open, and the reason big players left is instructive: cost, liability, and no path from AI to money. Our path to money is the human step. |
| **Twitch gifting**: gift recipients are 2.73 times more likely to gift later; most gifts are public "community" gifts. **YouTube** membership badges run in nine tenure tiers. **OnlyFans "chatter" suit** (December 2025): fraud claims failed because OnlyFans had disclosed third-party chatters, but a contract claim over promised "authentic relationships" survived. | Public gifting creates reciprocity; tenure is the healthy status signal. Honest labeling is our legal shield as well as our brand. |
| **ManyChat**: 1.5M business customers; its 2026 creator survey finds 83% of social users do not expect creators to answer DMs, 43% of creators get over 50 DMs a week, and 51% considered quitting in the past year. Meta allows one automated private reply per comment and a 24-hour window after. WhatsApp banned general-purpose AI assistants from January 15, 2026. | Any real response is a surprise; the bar for delight is low and the creator's guilt is high. Use Instagram "comment a keyword" only as a one-shot link into our app; never host the AI inside Meta's DMs. |

### Behavior evidence

| Finding | What it means here |
| --- | --- |
| OpenAI and MIT Media Lab (March 2025; about 40M conversations plus a 1,000-person, four-week trial): heavier daily use correlated with more loneliness and dependence; risk concentrated in a small group of heavy users and in people with stronger attachment tendencies. | Companion mode will produce a small group of very heavy users who are also the most at risk. Wellbeing limits must target them specifically, not everyone equally. |
| De Freitas et al. (Harvard Business School): AI companions reduced loneliness about as much as talking to another person, through the feeling of being heard. | The AI's value is real, and "feeling heard" is the mechanism. Memory and follow-ups are the feature; flattery is not. |
| Lee and Niederle, "Propose with a Rose": a scarce, costly signal attached to an approach substantially raised acceptance, most for people approaching someone more sought-after. | A limited, paid request is a signal of seriousness, which is why creators will prefer paid packets to free DMs, and why fans with little standing gain the most from them. |

### Law and platform rules the docs did not yet cover

| Rule | Effect |
| --- | --- |
| New York GBL Article 47 (November 5, 2025) names AI that keeps memory of past interactions; disclosure at start and every three hours, crisis referral, up to $15,000 a day. | Applies to both modes, not just companion. Already met by D-11; now cited. |
| EU AI Act Article 50(2) and 50(4), from August 2, 2026: synthetic audio must carry machine-readable marking (the Code of Practice asks for two layers, metadata and watermark); deepfake audio of a real person must be disclosed even with that person's consent. | AI voice notes need C2PA marking plus a watermark, not only the spoken tag. |
| Apple 5.1.2(i) (November 2025): explicit permission before sharing personal data with third-party AI. Google Play: in-app reporting of AI output. | A consent step naming our model providers before the first AI message; "report this reply" on every AI message (already present). |
| GDPR Article 9 and the Replika €5M fine (2025): sensitive data volunteered in chat needs explicit consent to be stored. | Memory must not store health, sexuality, religion and similar facts without asking. |
| FTC: fake-testimonials rule covers AI (October 2024); Endorsement Guides cover virtual influencers; a proposed policy on "output steering" (July 2026) treats undisclosed steering as deceptive; the 6(b) inquiry into companion bots asks how they monetize engagement. | Sponsored mentions need an in-message label; the AI must never steer toward purchases. |
| Digital replica law: California AB 2602 and New York GOL 5-302 void replica clauses lacking reasonably specific uses unless the person had counsel or a union; California post-mortem rights last 70 years, New York 40; Tennessee's ELVIS Act covers voice. NO FAKES passed Senate Judiciary on June 18, 2026 and is not yet law. | The creator's license must be a specific, counsel-attested contract, and the agent must stop at death until an estate opts in. |
| Spending: China's April 2026 rules prompt users to set caps at first use and ban spend rankings; the UK Gambling Commission requires a limit prompt before first deposit; Korea's Fair Trade Commission (June 2026) ordered fan memberships to refund in full within 7 days if unused. | Spend caps at the first paid action, no spend rankings, a 7-day unused refund on memberships. |

## 2. What people actually want

The documents treat the human creator as an expensive resource to be rationed: the only real human acts are a paid reply, a paid voice note and a paid call. But the evidence says fans value human presence far more than human replies, and presence can be nearly free for the creator. That changes the shape of the product from a ladder of prices into a ladder of presence.

### Fans

| Desire | Evidence | Served today | Gap and fix |
| --- | --- | --- | --- |
| To be noticed by one specific person | Bubble's renewal; Cameo; livestream shout-outs; 83% of fans expect no reply, so any real response delights | Paid personal reply, voice note, call | No cheap real recognition. Add creator reactions (one tap, free) and quote-replies to broadcast replies |
| To be close to the person's daily life | Bubble messages are mostly selfies, meals, late-night thoughts | Posts (formal content) | No informal presence. Add Notes: short human broadcasts into every fan's thread |
| To feel heard | Loneliness falls with the feeling of being heard (De Freitas) | Memory, follow-ups, open loops | Good. Target wellbeing limits at the heavy-use tail rather than everyone (section 5, A8) |
| To get real help | Fanfix DMs, Delphi's expert customers | Cited AI answers, the packet | Good. Add public answers so one human answer serves many and teaches the AI |
| To belong with other fans | Fandom is social: fans screenshot Bubble messages to X; Twitch community gifting | Nothing; every surface is 1:1 | Do not build an in-app community yet (moderation cost, and Bubble keeps fans apart too). Design for social exhaust instead: share cards, public answers and quote-replies meant to travel to X, TikTok and Instagram |
| Standing among fans | YouTube's nine tenure badges; Bubble's reply length grows with tenure | Nothing | Tenure badges ("with Maya since March"), never spend-based ranks |
| Control over what they reveal | Replika fine; GDPR Article 9 | Strong: packet, memory card, access history | Add sensitive-memory consent (A5) |

### Creators

| Desire | Evidence | Served today | Gap and fix |
| --- | --- | --- | --- |
| Income without more hours | Paid DMs are over 60% of Fanfix revenue | Paid modes, pass pool | Notes and public answers earn per minute of creator time far better than 1:1 replies |
| Relief from unanswered DMs | 43% of creators get over 50 DMs a week | The AI handles them | Good |
| Control of reputation | CarynAI lost control of tone in weeks | Strong: rules, corrections, versions | Add a public correction on any AI message and a verification page for shared ones (A4) |
| Meaning | 51% of creators considered quitting in a year | Insights (numbers) | Numbers do not retain people; thanks do. Add free "this helped" notes and a weekly impact digest (A11) |
| Ownership and exit | Creators fear persona lock-in | Export | Add the replica license as structured, revocable terms (A9) |
| Presence that costs almost nothing | Bubble idols post a few times a week | Nothing below a paid reply | Notes and reactions |

### The ladder of presence

Every rung is genuinely human and labeled as such. The product's daily habit lives on the first two rungs; its revenue lives on the top four.

| Rung | Creator time | What the fan gets | Price to fan | Authorship |
| --- | --- | --- | --- | --- |
| Note (broadcast) | 1 to 3 minutes, a few times a week | A real message from Maya in their own thread, which the AI can talk about | Included in membership | human\_broadcast, "Maya · to Studio members" |
| Reaction | 1 second | "Maya reacted to your reply" | Free | human\_reaction |
| Public answer | 2 to 5 minutes, one answer for many | An answer they asked for, now also a post; others can read it | Lower than a private reply | human\_creator, marked public |
| Written reply | 5 to 15 minutes | A private answer to them | Creator's price | human\_creator |
| Voice note | 1 to 2 minutes of talking | Maya's own voice, to them | Creator's price | human\_creator (audio) |
| Call | 10 to 15 minutes plus scheduling | Live time together | Creator's price | human\_call |

## 3. Keep

These are right, and several are better than anything in the market. None should be diluted by the additions below.

| Keep | Why it matters more after this research |
| --- | --- |
| The authorship system, rendered into content, with no option to hide it | The OnlyFans chatter suit shows disclosure is the legal shield; Cameo's "it's real" positioning shows it is also a brand. |
| The packet as a routing boundary, the fulfillment matrix, charge-on-acceptance | Fenda's 48-hour refund and Fanfix's paid DMs both confirm the shape; ours is stricter and fairer. |
| Isolation enforced three ways, and the delivery-boundary protocol for takeover | Nobody else has this, and a single leak between fans would end the product. |
| D-01: creators can open their agent's threads, disclosed and logged | Creators will not run an agent they cannot see; Bubble idols read every reply. |
| D-11 (18+), D-12 (AI replies instant, approval only for words under the creator's name), D-14 (distribution matrix), D-16 (call clocks) | Each now has external confirmation: New York Article 47, Meta's teen pause, Apple 3.1.3(b) and (d), LiveKit's missing duration. |
| Modular monolith, one Postgres, managed WebRTC | Right for one engineer; Sora's shutdown is a reminder that cost discipline is survival. |
| Freeze only the six trust contracts; learn everything else with creators | The previous review said this; I agree and would go further (section 4, C1). |

## 4. Change

Eight disagreements with the current documents. "Applied" means the change is now in the design documents; "Your call" means it changes the core concept and waits for section 7.

| # | Current position | What I would change | Why | Status |
| --- | --- | --- | --- | --- |
| C1 | 23 weeks of engineering (14 to a web pilot) before the first real fan | A six-week proof with 5 to 10 creators across both cohorts, then decision gates (section 8) | Every precedent that failed here failed on demand or cost, not on correctness. The documents answer "how to build it right" far better than "will they come back and pay." The trust contracts stay in the proof; the pass, calls, team roles and producer wait | Your call (Q2) |
| C2 | The pass is the headline product; per-creator tiers are secondary | Lead with a per-creator membership that includes the AI, Notes, and the right to request; introduce the pass once there are enough creators that choosing three is a real choice | Bubble proves per-person monthly pricing at around 90% renewal. A three-slot pass is only as good as the roster and has the worst iOS economics (section 6) | Your call (Q1) |
| C3 | Five free messages per creator, lifetime (D-05) | The first conversation is free (about 24 hours), and any limit closes a conversation gracefully rather than mid-sentence | A message counter puts the paywall at the moment of highest emotion, which is exactly what the FTC's 6(b) inquiry and EU Article 5 look for | Graceful close applied; trial model is your call (Q5) |
| C4 | AI voice notes in the creator's cloned voice ship early | Ship human voice notes early; add AI voice after the proof, with machine-readable marking and a watermark | AI voice of a real person is the highest-liability feature (EU 50(4) disclosure even with consent, the ELVIS Act, AB 2602), and it is the one most likely to blur the line the whole product is built on | Your call (Q4) |
| C5 | Wellbeing limits apply to everyone equally | Keep the universal three-hour reminder, and add interventions aimed at the heavy-use tail: a daily time signal after 90 minutes in companion mode, a weekly usage view, and an ops review of the top 1% of users by minutes | OpenAI and MIT found risk concentrated in a small heavy group; blanket friction annoys the many and under-protects the few | Applied |
| C6 | Group answer is a conversion the creator offers after a private request | Let the fan choose public or private when asking; public costs less, becomes a post, and teaches the AI | Fenda showed public answers spread; the creator stops answering the same question twice; the AI gets better from human answers | Concept applied; asker economics are your call (Q3) |
| C7 | Calls are a core slice | Calls come after Notes, reactions and replies prove out | Superpeer shut down; Intro stays small; calls are a premium rung, not the habit | Part of Q2 |
| C8 | Unit economics are "a separate commercial document" | Cost per active fan is a design constraint the architecture must meet | Heavy companion users can cost more in model calls than the pass earns after store fees (section 6) | Applied |

## 5. Add

Fourteen additions, all applied to the design documents. The first four change the product's character; the rest protect it.

| # | Addition | How it works | Evidence |
| --- | --- | --- | --- |
| A1 | **Notes: the creator's human broadcast** | The creator writes a short message (text, a photo, or up to 60 seconds of voice) to an audience: followers, a tier, or all members. It is stored once and appears in each eligible fan's own thread as `human_broadcast`, labeled "Maya · to Studio members". An optional name token may greet each fan by handle, but the label always says it went to a group. A fan's reply to a Note goes to the creator's Replies feed, never to other fans. The AI can talk about a Note ("Maya posted this morning about the new kiln") but never claims she read the fan's reply | Bubble: one human message, private-feeling delivery, around 90% renewal, ₩75bn revenue |
| A2 | **Reactions and quote-replies** | From the Replies feed or any thread she opens, the creator taps a reaction; the fan sees "Maya reacted to your reply" (`human_reaction`). She can also answer one reply publicly as a quote-reply shown to all recipients of that Note, without the fan's handle unless the fan agrees. Only the creator's own account can react; team members cannot | Bubble added quote-replies in 2024; 83% of fans expect no reply, so a real one-second signal is delight |
| A3 | **Public answers** | When asking, the fan chooses private or public. A public request costs less; once answered, it becomes a post the creator's audience can read, and, if the creator approves, a knowledge source the AI can cite. The AI checks for an existing public answer before suggesting a new request ("Maya answered this in June"). Asker rewards (credits, never cash) are decision Q3 | Fenda's eavesdrop mechanism, with its farming failure designed out |
| A4 | **Provable human presence** | Every act carrying the creator's name (a personal reply, an approved draft, a Note, a reaction, accepting a request) requires a passkey assertion with user verification from a key registered to the creator's own account, bound to a hash of that exact message. Team members hold their own keys and cannot produce creator-signed acts. Human voice notes are transcoded to M4A and carry a platform-signed C2PA manifest ("recorded by a person"); AI audio carries an AI manifest and a watermark. Every shared card has a verification page showing who wrote it. The creator can attach a public correction to any AI message ("My AI got this wrong") | WebAuthn Level 3 (W3C Recommendation, August 2026) supports challenge binding; C2PA 2.3; EU Article 50(2); the chatter suit |
| A5 | **Sensitive memory needs consent** | The memory extractor tags health, sexuality, religion, politics, ethnicity, union membership and financial hardship, and does not store them. The AI may ask once, "Want me to remember this?", and stores the item only on a yes. Before the first AI message, the fan consents to processing by named model providers; providers run under no-retention terms; fan data is never used for training | GDPR Article 9; Replika €5M fine; Apple 5.1.2(i) |
| A6 | **Sponsorship registry** | The creator lists paid partnerships. When the AI mentions a listed brand, the message carries "Paid partnership: Maya is paid by {brand}". The AI never claims first-hand use unless the creator's own words are the cited source. Sponsor-related instructions are logged | FTC Endorsement Guides and fake-testimonials rule; Cameo's $600k settlement; FTC "output steering" proposal |
| A7 | **The AI never sells (INV-21)** | The AI never suggests a purchase, never names a price, and never frames the creator's attention as something to buy. It may say "you can ask Maya directly" only when the fan asks for Maya, or in expert mode when the question cannot be answered from sources, and never in response to distress, loneliness or crisis. Limits close a conversation at its next natural pause, never mid-disclosure | FTC 6(b) inquiry into monetizing engagement; EU Article 5 |
| A8 | **Spend and time wellbeing** | At the first paid action, the fan sets a monthly limit (with "no limit" as an explicit choice). Reminders at 50% and 100% are on by default. Raising a limit takes effect after 24 hours; lowering is immediate. A monthly spend summary. No spend-based ranks anywhere. Memberships refund in full within 7 days if unused, pro-rated after. For heavy companion use: a time signal after 90 minutes a day, a weekly usage view, and an ops review of the top 1% by minutes | China CAC 2026; UK Gambling Commission; Korea FTC June 2026; OpenAI and MIT on heavy-use risk |
| A9 | **The replica license as enforced data** | Permitted uses (text persona, human voice notes, AI voice, topics, sponsored mentions), a term of at most 10 years, a counsel or union attestation, voice-model ownership by the creator, deletion on termination. Revocation pauses the agent immediately. On the creator's death or incapacity the agent pauses, open requests are refunded, and an estate may opt in later under a new license. The platform refuses any use the license does not list | California AB 2602 and AB 1836; New York GOL 5-302; ELVIS Act; NO FAKES draft |
| A10 | **The creator interview** | Onboarding includes a 20-minute interview in which the AI asks the creator about their story, opinions, favorites and boundaries; the transcript becomes an approved source after the creator reviews it. A weekly 60-second voice check-in becomes the current-status note with an expiry | Delphi's Interview Mode; companion-cohort creators often have little written material |
| A11 | **Meaning and tenure** | "This helped" on any AI answer, Note or reply, with an optional line of thanks. A weekly impact digest for the creator: people helped, thanks received, and a few notes the fans agreed to share. Tenure badges ("with Maya since March") on share cards and in the creator's views, with tenure perks such as longer Note replies. Never spend-based | 51% of creators considered quitting; YouTube tenure badges; Bubble's tenure-based reply length |
| A12 | **Cost discipline** | Route each turn to a model by need (a small model for short social turns, a large one for knowledge questions and first turns). Track cost per active fan per month with an alert. Count the allowance in cost units, shown to fans as messages. Before publishing a version, replay the last seven days of paraphrased prompts and score them | Sora's shutdown; section 6 |
| A13 | **Instagram entry** | A creator's "comment KILN" post triggers one automated private reply with a link to her home, with that post as the context card. The AI never lives inside Meta's DMs | Meta's one-reply and 24-hour rules; WhatsApp's January 2026 ban on general AI assistants |
| A14 | **Reserved: a fan's own AI** | A disabled sender kind, `fan_agent`, for a fan's personal assistant writing on their behalf. When enabled it is labeled, rate-limited, refusable by the creator, and never able to buy a human mode without the fan confirming | Personal assistants that act for people are arriving; reserving the state now keeps the label system closed |

## 6. Economics as a design constraint

A fan who uses the pass's full AI allowance roughly breaks even on the web and loses money on iOS. Memberships should pay for the AI; human modes should make the profit. The figures below are illustrative: card fees are Stripe's standard 2.9% plus $0.30, the store fee is 15% (small-business rate) or 30%, the creator share of subscription revenue is assumed at 70%, and model cost is the architecture's estimate of about one cent per message on a mid-tier model. None of these are decided prices.

| Case | Fan pays | After card or store fee | To creators (70%) | Platform before AI | AI cost at full use | Platform after AI |
| --- | --- | --- | --- | --- | --- | --- |
| Pass, web, 300 messages used | $10.99 | $10.37 | $7.26 | $3.11 | $3.00 | $0.11 |
| Pass, iOS at 15% | $10.99 | $9.34 | $6.54 | $2.80 | $3.00 | −$0.20 |
| Pass, iOS at 30% | $10.99 | $7.69 | $5.38 | $2.31 | $3.00 | −$0.69 |
| One membership, web, 150 messages with routing (about $0.005 each) | $4.99 | $4.55 | $3.18 | $1.36 | $0.75 | $0.61 |
| Three memberships, web, billed as one charge | $14.97 | $14.24 | $9.97 | $4.27 | $2.25 | $2.02 |

Four design consequences, all applied or recommended:

- **One monthly charge per fan.** A fan's memberships and pass bill together as one subscription with several items, so the $0.30 fixed card fee is paid once, not per creator. At $4.99 that fee alone is 6% of the price.
- **Model routing and a cost-weighted allowance** (A12). Companion-style users send many short turns; a small model handles those at a fraction of the cost, and the allowance counts cost rather than messages. At two messages a minute, Character.AI's average of 75 minutes a day would exhaust a 300-message allowance in about two days.
- **Companion-heavy use needs its own price**, set per creator, rather than riding on a pass priced for occasional questions.
- **Human modes are where the margin is.** A $25 written reply at a 20% take leaves the platform about $4 after card fees, roughly what a fully active pass fan contributes on the web in three years. Everything that makes asking easier and more frequent (public answers at a lower price, voice notes that take the creator a minute) matters more to the business than squeezing the AI.

## 7. Five decisions for you

These change the concept as you first described it, so they are recommended, not applied. Everything else in this review is already in the documents.

| # | Decision | My recommendation | If yes | If no |
| --- | --- | --- | --- | --- |
| Q1 | What leads at launch: the three-creator pass, or a per-creator membership? | A per-creator membership (the AI, Notes, and the right to request, around Bubble's price) leads; the pass arrives when the roster is large enough that choosing three is a real choice, for example 30 creators with active fans | Section 7 of the architecture moves the pass after the proof; per-slot payout stays as designed for when it arrives | The pass ships with the pilot; its value depends on the first 5 to 10 creators, and its iOS economics need the routing in section 6 on day one |
| Q2 | Run a six-week proof before the full build? | Yes: build a narrow version in about six weeks, run it with 5 to 10 creators for four to six weeks, then decide against the gates in section 8 | The architecture's slices become proof, then the rest reordered by what the proof shows | Build proceeds as slices 0 to 4 (about 23 weeks) |
| Q3 | How do askers of public answers benefit? | A lower price at asking, plus platform credits (never cash) when others read the answer, capped per month | Credits and caps are added to the ledger | Public answers stay, with only the lower price as the incentive |
| Q4 | When does the AI speak in the creator's cloned voice? | After the proof, once marking and watermarking are in place; the creator's real voice notes ship first | AI voice moves from slice 1 to a later slice; human voice notes stay in slice 1 | AI voice ships in slice 1 with C2PA marking and a watermark from day one |
| Q5 | Free trial shape | The first conversation is free for about 24 hours, instead of five messages for life | D-05 is rewritten | D-05 stays; the graceful close still applies |

**Decided on September 23, 2026** and recorded in the Domain Model as D-23 to D-27:

| # | Decision |
| --- | --- |
| Q1 | Membership first; the pass follows once the roster reaches about 30 creators with active fans (D-23) |
| Q2 | Full build as sliced; the section 8 gates become the pilot's measurements at the end of slice 1 rather than a go or no-go before building (D-24) |
| Q3 | Working default adopted: lower price plus capped credits, never cash (D-27); open to revision |
| Q4 | AI voice after the pilot, in slice 3; the creator's real voice notes in slice 1 (D-25) |
| Q5 | The first conversation is free for about 24 hours (D-26) |

Resulting build order: foundation, then the membership pilot with the AI, Notes and paid replies (first fans at about 13 weeks), then calls and the native app (about 19), then the producer, public-answer credits, share cards and AI voice, then the pass (about 26).

## 8. The proof slice and its gates

Decided: the proof slice was declined in favor of the full build (D-24); the scope below is kept for reference, and the gates are now the pilot's measurements at the end of slice 1. The proof would have tested one question: will fans come back and pay for a creator's presence when the AI keeps the relationship warm between human moments? It keeps every trust contract and cuts everything that does not bear on that question.

| In the proof | Out of the proof |
| --- | --- |
| Public creator home, sign-in, one membership per creator at a web checkout | The pass (unless Q1 is no) |
| The AI in text: cited answers, memory with sensitive-data consent, the identity system, the three-hour reminder, crisis protocol | AI voice (unless Q4 is no) |
| Notes, the Replies feed, reactions, quote-replies | Calls and scheduling |
| Paid written reply and human voice note through the packet, charge on acceptance, refunds | Team roles (the creator acts alone) |
| Passkey-signed human acts; ThreadScope and row-level security | The producer, insights, group answers |
| Creator interview onboarding, the 72-hour digest, corrections | The native app; all purchases on the web |

Build about six weeks, run four to six weeks with 5 to 10 creators split across both cohorts, measured separately. The bars below are my proposed starting thresholds, not industry benchmarks; agree them before launch so the result cannot be argued after.

| Gate | Proposed bar |
| --- | --- |
| Arrival to first message | At least 40% of fans who land on a creator's home send a first message |
| Return | At least 50% of fans who send a message come back within 7 days |
| Creator presence | At least 70% of creators post two or more Notes a week in week four |
| Money | At least 5% of monthly active fans buy a human mode within 30 days; at least 60% of first-month members renew |
| Trust | At least 90% of fans in the comprehension test identify every message's author correctly; zero leaks between threads; zero unlabeled AI text |
| Creator effort | Median creator time under two hours a week; at least three in five creators ask to continue |

If money passes and return fails, the AI is not keeping the relationship warm; fix the AI before building more. If return passes and money fails, the ladder of presence is priced or placed wrong. If creator presence fails, no amount of AI will save the product, because the fans came for the person.

## 9. Change log

Applied on September 23, 2026. Each document's closing note records the revision. Nothing was removed; the five pending decisions are recorded in the Domain Model as a "Pending" row.

| Document | Section | Change |
| --- | --- | --- |
| Domain Model | 1, 4, 11 | Authorship set adds human\_broadcast and human\_reaction; fan\_agent reserved with ai\_call and ai\_video |
| Domain Model | 3 | New "Presence and trust" family: Broadcast, BroadcastReply, Reaction, SignedAct, Correction, Provenance, Sponsorship, ReplicaLicense, SpendLimit, Thanks, MemoryConsent, ProcessorConsent; Packet.visibility; membership refund rule; tenure; no spend-derived rank |
| Domain Model | 4 | INV-21 the AI never sells; INV-22 named human acts are signed; INV-23 sensitive memory needs consent; INV-24 one-to-many is always labeled; INV-25 paid influence disclosed in the message |
| Domain Model | 7 | Context contract amended for Notes, public answers, sensitive memory and sponsor lists |
| Domain Model | 9 | D-17 ladder of presence, D-18 provable presence, D-19 public answers, D-20 replica license and death, D-21 spend and time wellbeing, D-22 sensitive memory and processor consent; pending row for Q1 to Q5 |
| Domain Model | 10 | T-33 to T-40 |
| Product Design | 1 | Principle 7: presence is cheaper than replies |
| Product Design | 2 | Identity rows for Notes, reactions, the Signed marker, corrections, reserved fan\_agent |
| Product Design | 3, 4 | Notes section in the studio (first on phone); Instagram comment entrance |
| Product Design | 5 | S-F7 private or public; new S-F14 Note in the thread, S-F15 spending and time, S-F16 verification page |
| Product Design | 7 | S-C1 adds passkey, license and interview; new S-C12 Notes and Replies, S-C13 license and sponsorships, S-C14 creator interview |
| Product Design | 9, 10 | Notification rows for Notes, reactions, public answers, spend reminders, impact digest; copy for Notes, sponsor labels, provider consent, sensitive memory, spend limits; new never-words |
| Architecture | 1 | ADR-9 signed acts via WebAuthn challenge binding; ADR-10 audio provenance (C2PA and watermark); ADR-11 Notes fan-out on read; ADR-12 model routing |
| Architecture | 3, 4 | Presence module; tables for signed acts, Notes, replies, reactions, corrections, provenance, sponsorships, license, spend limits, thanks, consents; message cost and route |
| Architecture | 6 | No-selling classifier and limit timing, sensitive-memory filter, sponsor labeler, Notes as context, shadow evaluation |
| Architecture | 7 | Spend limit checked before capacity; one charge per fan; membership refunds; cost per active fan |
| Architecture | 11, 12 | Compliance rows for EU 50(2) and 50(4), Apple 5.1.2(i), GDPR Article 9, FTC endorsements and steering, replica law, New York Article 47, Play reporting, Korea refunds; slice 1 grows by about two weeks; the proof-slice alternative described |

## 10. Sources

Pages opened by the research on September 23, 2026. Items marked secondary rest on one non-primary source.

**Market and platforms**

- Bubble and Dear U: [Nielsen Norman Group on K-pop private messaging](https://www.nngroup.com/articles/kpop-private-messaging/); [Koreaboo on the 2024 reply update](https://www.koreaboo.com/news/bubble-update-everyone-sees-message-idol-replying-poll/); [allkpop on the 2025 price rise](https://www.allkpop.com/article/2025/06/fan-communication-app-bubble-to-increase-prices); [DDaily on 2024 results](https://m.ddaily.co.kr/page/view/2025031910262050331); [Asia Economy on Q2 2026](https://view.asiae.co.kr/article/2026090917245557663); [Dear U Q2 2025 IR](https://www.dear-u.co/data/file/ir_etc/20250808091545_4f377664fa3e68cec460be2fa94237db.pdf); [Korea Herald on fan complaints](https://www.koreaherald.com/article/10385320)
- Fenda: [TechNode](https://technode.com/2016/06/01/fenda/); [ifanr on eavesdropping](https://www.ifanr.com/664373); [NSF-funded study of 212k answers](https://par.nsf.gov/servlets/purl/10092820); [woshipm on the decline](https://www.woshipm.com/evaluating/625761.html)
- Cameo: [Fortune](https://fortune.com/2024/07/30/cameo-app-unicorn-silicon-valley-startup-celebrity-influencer-social-media/); [TIME interview](https://time.com/7200525/cameo-steven-galanis-interview/); [TechCrunch on the OpenAI ruling](https://techcrunch.com/2026/02/17/u-s-court-bars-openai-from-using-cameo/)
- [Superpeer sunset FAQ](https://help.superpeer.com/en/articles/10207221-faq-for-hosts-regarding-superpeer-sunset); [Sacra on Stan](https://sacra.com/c/stan/); [Stan on Stanley](https://stan.store/blog/stanley-and-stan-store/); [Beacons changelog](https://beacons.ai/i/whats-new)
- Delphi: [Fast Company](https://www.fastcompany.com/91356476/delphi-ai-digital-mind); [Interview Mode](https://www.delphi.ai/blog/interview-mode); [pricing](https://www.delphi.ai/pricing)
- [Fanfix payouts and paid DMs](https://socialday.live/features/fanfixs-300m-milestone-hides-a-sharp-reality-most-revenue-comes-from-paid-dms-no); [Passes rebrand](https://www.prnewswire.com/news-releases/passes-rebrands-as-the-creator-accelerator-platform-302749690.html); [TechCrunch on the Passes suit](https://techcrunch.com/2025/03/03/creator-monetization-platform-passes-sued-over-alleged-distribution-of-csam/)
- Meta: [AI Studio post with the August 10, 2026 update](https://about.fb.com/news/2024/07/create-your-own-custom-ai-with-ai-studio/); [TechCrunch on the teen pause](https://techcrunch.com/2026/01/23/meta-pauses-teen-access-to-ai-characters-ahead-of-new-version/)
- Sora: [OpenAI discontinuation notice](https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation); [TechCrunch on why](https://techcrunch.com/2026/03/29/why-openai-really-shut-down-sora/); [SAG-AFTRA and OpenAI on likeness](https://www.sagaftra.org/sag-aftra-openai-bryan-cranston-collaborate-ensure-voice-and-likeness-protections-sora-2); [ElevenLabs Iconic Marketplace](https://elevenlabs.io/blog/announcing-partnership-with-sir-michael-caine-to-newly-launched-iconic-marketplace)
- Character.AI: [Sacra](https://sacra.com/c/character-ai/). Grok companions retirement (secondary): [roborhythms](https://www.roborhythms.com/grok-companions-discontinued/)
- Twitch gifting: [arXiv study](https://arxiv.org/html/2501.09235v1); [AMA summary](https://www.ama.org/research-insights/research-insight-how-community-gifting-on-twitch-affects-user-engagement/). [YouTube loyalty badges](https://support.google.com/youtube/answer/7544492?hl=en). [OnlyFans economics](https://www.matthewball.co/all/ofpl); [chatter suit ruling](https://blog.ericgoldman.org/archives/2025/12/onlyfans-defeats-chatter-scam-claim-n-z-v-fenix.htm)
- ManyChat: [TechCrunch funding](https://techcrunch.com/2025/04/22/manychat-taps-140m-to-boost-its-business-messaging-platform-with-ai); [2026 creator report](https://manychat.com/report/); [Meta private replies docs](https://developers.facebook.com/docs/messenger-platform/instagram/features/private-replies/); [WhatsApp AI assistant ban](https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform)

**Behavior**

- [OpenAI and MIT Media Lab on affective use](https://openai.com/index/affective-use-study/)
- [De Freitas et al., AI Companions Reduce Loneliness](https://arxiv.org/abs/2407.19096)
- [Lee and Niederle, Propose with a Rose](https://www.nber.org/papers/w17340)

**Law and trust technology**

- NO FAKES: [Holland & Knight](https://www.hklaw.com/en/insights/publications/2026/06/senate-judiciary-committee-advances-legislation-to-protect-name); [EFF](https://www.eff.org/deeplinks/2026/06/no-fakes-act-could-silence-satire-commentary-and-news). [ELVIS Act](https://www.dwt.com/blogs/artificial-intelligence-law-advisor/2024/04/tennessee-elvis-act-ai-voice-replica). [California AB 2602](https://www.manatt.com/insights/newsletters/client-alert/california-enacts-a-host-of-new-ai-and-digital-rep); [AB 1836](https://cdas.com/california-expands-its-post-mortem-right-of-publicity-law-to-cover-ai-digital-replicas/). [New York GOL 5-302](https://newyork.public.law/laws/n.y._general_obligations_law_section_5-302); [Skadden on New York's 2025 laws](https://www.skadden.com/insights/publications/2026/01/two-newly-enacted-new-york-laws-will-regulate)
- FTC: [fake reviews rule](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials); [Endorsement Guides](https://www.ftc.gov/news-events/news/press-releases/2023/06/federal-trade-commission-announces-updated-advertising-guides-combat-deceptive-reviews-endorsements); [companion chatbot 6(b)](https://www.ftc.gov/news-events/news/press-releases/2025/09/ftc-launches-inquiry-ai-chatbots-acting-companions); [output-steering proposal](https://www.insideprivacy.com/consumer-protection/ftc-seeks-comment-on-proposed-policy-statement-addressing-ai-accuracy-and-output-steering/)
- [New York Article 47](https://www.fenwick.com/insights/publications/new-yorks-ai-companion-safeguard-law-takes-effect); [California SB 243](https://www.skadden.com/insights/publications/2025/10/new-california-companion-chatbot-law)
- EU: [AI Act Article 50](https://artificialintelligenceact.eu/article/50/); [Goodwin on Article 50 in force](https://www.goodwinlaw.com/en/insights/publications/2026/08/alerts-technology-dpc-eu-ai-act-transparency-obligations-now-in-force); [Code of Practice](https://www.legal500.com/intelligence/european-union/technology/european-commission-publishes-final-code-of-practice-on-marking-and-labelling-ai-generated-content); [EDPB on the Replika fine](https://www.edpb.europa.eu/news/ai-the-italian-supervisory-authority-fines-company-behind-chatbot-replika_en); [DLA Piper on C-252/21](https://www.dlapiper.com/en-us/insights/publications/2023/07/cjeus-landmark-decision-in-meta-vs-bundeskartellamt)
- [WebAuthn Level 3 Recommendation](https://www.w3.org/news/2026/web-authentication-an-api-for-accessing-public-key-credentials-level-3-is-now-a-w3c-recommendation/); [C2PA 2.3](https://c2pa.org/the-c2pa-launches-content-credentials-2-3-and-celebrates-5-years-of-impact-across-the-digital-ecosystem/); [c2pa-rs formats](https://github.com/contentauth/c2pa-rs/blob/main/docs/supported-formats.md)
- Spending: [CAC April 2026 notice](https://www.cac.gov.cn/2026-04/13/c_1777815804150225.htm); [UK Gambling Commission limits](https://www.gamblingcommission.gov.uk/blog/post/changes-to-customer-led-tools-financial-limits); [Korea fan-membership order](https://www.koreajoongangdaily.com/business/ftc-orders-revision-of-k-pop-fan-membership-refunds-liability-terms/12701966)
- Apple: [November 2025 guideline update](https://developer.apple.com/news/?id=ey6d8onl); [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/). Google Play: [AI-Generated Content policy](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en)

These are product requirements drawn from public sources, not legal advice; the license, terms and compliance program need counsel before the first external creator signs.

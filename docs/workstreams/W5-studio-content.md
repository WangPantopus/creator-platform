# W5 — Creator Studio, content, and fulfillment

## Agent assignment

**Execution rule:** You personally do all coding, migrations, configuration, documentation, debugging/fixes, integration, app launching and end-to-end verification. Subagents may only research or check information read-only; never delegate implementation or acceptance, including asking for patches to apply yourself. Do not write new test code. Use your [complete execution prompt](prompts/W5-studio-content.md) when assigning this stream.

Own the creator's daily working product and the content/presence domain. Follow [the plan](README.md), [standards](STANDARDS.md), [contracts](CONTRACTS.md), [runtime verification](VERIFICATION.md), Product S-C3–S-C7/S-C10/S-C12 and Domain F6/F7/F9/F13/F16. Reproduce mobile and desktop Studio designs exactly. Use Node.js and Next.js for Studio, and contribute native fan renderers/actions for your content through isolated Swift/Kotlin features. No new test code.

## Work packages

1. **Daily Studio.** Notes-first phone tabs, Requests, Threads, My AI link, More; desktop sidebar/layout; commitments due first, packets ordered by SLA then the specified rules; canonical capacity banner, filters/pagination/empty states and draft continuity. Use W4 read models rather than recomputing priorities, capacities or money in the client.
2. **Packet detail and fulfillment.** Exact disclosure snapshot, summary and attachments, accepted mode/deadline/price and fan-label preview, fulfilling actions first, the remaining F6 choices under Instead. Let AI answer, approve exact draft, personal written reply, human voice, offer times, group offer, ask more information, decline. Show changed-offer fan consent and payment state from W4. Never mark a commitment complete locally or charge merely because the creator viewed it.
3. **Composer and signatures.** Creator and team drafts, saved drafts, exact-version approved-draft invalidation on edit, creator-authored text, real recorded voice via W6, signed preview via W1, retry/cancel/expiry and attachment processing states. Ensure team words always bear team identity. A human reply/approved draft only satisfies the mode W4 allows. Any translated display is labeled with the immutable signed original one tap away; coordinate W3's presentation contract.
4. **Notes and replies.** Signed text/photo/up-to-60-second human voice broadcasts, followers/tier/all-member audience, optional audience count and name token with explicit broadcast label, fan reply feed isolated per fan, creator-only signed reactions, consented quote-reply and creator response, mute/eligibility/revocation. Store broadcasts once with fan-out on read; no per-fan fake personal DM. W3 delivers thread views and W7 sends truthful updates.
5. **Threads and correction workflow.** Audited creator/triage reader, permission notice and log, filters, pause for one fan, takeover/handback using W3, team replies, attached public correction, “I'd never say that” into W2's draft rule/regression workflow. Show interrupted AI and exact next speaker. Request routing stays separate from audited thread access.
6. **Publishing and library.** Draft/edit/schedule/publish/unpublish/archive, post/text/media/voice/library and specified live-content capabilities, audience/tier/group controls, “Let my AI use this” as a separate explicit approval, content revisions/takedown/accessibility/alt text, existing post entry context. A published paid post never becomes a public AI source by accident. Full library/live behavior has design gaps that need a bounded specification before implementation.
7. **Public and group answers.** Creator publishing workflow from a public packet or W7 insight, opt-in anonymity/quoting, fan-approved conversion, audience delivery as a system link, content/source separation, corrections/revocation and link access. W4 owns accepted mode/price/credits; W7 owns distribution and qualified-read analytics.
8. **Team and creator settings.** Role checklist and creator-only restrictions, invitation/removal UI through W1, onboarding links to Offers/Earnings/License/My AI, scoped support and pause entry, operational handover without impersonation. Respect role-specific views on phone and desktop.
9. **Meaning and tenure.** “This helped” and optional thanks with sharing consent, creator-visible consented notes, tenure-based recognition/perks that never derive from spend. W7 owns aggregation/Impact digest; W5 owns Thanks capture and source data. Avoid inflating counts or claiming creator attention from AI activity.

## Surfaces and ownership

Own Studio daily shell, NoteCompose, Replies, Requests queue, PacketDetail, Threads/ThreadView, More, Team and Publish compositions; relevant fan Note/public-answer presentation is allocated by the [design inventory](research/design-inventory.md). W1 owns the signing primitive and root navigation; W2 My AI/License; W4 Offers/Earnings; W7 Insights/Impact; W6 calls.

Use backend presence/content/read-model modules, isolated Studio routes/components and native fan content modules. Ask W1 to register new feature routes; do not expand a single shared catalog file into the production Studio. The specified native app scope is fans; mobile web Studio is required. Native creator Studio can be added later under the recorded extension without displacing these requirements.

## First deliveries and dependencies

Start Notes/Replies and creator packet/detail UI against C06/C08 schemas while W4 implements transactions. Deliver one creator-signed Note → private fan reply → signed reaction end to end, then paid personal fulfillment and takeover. Follow with publishing/source consent, team role views, public/group answers and full library.

## Required runtime demonstrations

- Creator sends a Note to a real configured audience; two fan accounts see the broadcast label, reply privately, and cannot retrieve one another's replies. Creator reacts; team cannot impersonate that reaction.
- Fulfill a written request with personal text and with an exact approved draft; editing invalidates approval. Try all Instead actions, including fan acceptance/rejection of a changed offer. Confirm ledger/commitment with W4.
- Record/upload/sign a real voice response; cancelled upload/signing preserves a safe draft and does not mark delivery. Play it in browser and native fan apps.
- Open a thread as creator and permitted team, inspect fan audit history, take over mid-generation and hand back. Revoke the team's role while its screen remains open.
- Publish private/tier/public content; toggle AI-source approval separately; wrong audience cannot view, search, share or inject it into AI retrieval. Unpublish/revoke and verify cached/deep-linked outcomes.
- Publish a quote/public/group answer with and without fan sharing consent; confirm anonymization, source approval and correct system delivery to eligible threads.
- Exercise “This helped”/thanks consent and tenure; follow actual data into W7 Impact without raw unconsented fan disclosure.
- Use the Studio at reference phone and desktop widths, both themes, keyboard-only and large text. Verify exact layouts, queue scroll restoration, deadlines/time zones, dialogs and composer focus.

## Delivery standard

The creator can complete daily work without a console, manual database edit, or fake success state. Deliver domain APIs, fully functional Studio routes, fan integrations, signed-act and fulfillment evidence, source-vs-audience separation, and reviewed visual captures. Every action must produce the label and downstream state promised by its preview.

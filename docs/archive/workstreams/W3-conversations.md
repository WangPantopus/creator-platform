# W3 — Fan conversations and real-time chat

## Agent assignment

**Execution rule:** You personally do all coding, migrations, configuration, documentation, debugging/fixes, integration, app launching and end-to-end verification. Subagents may only research or check information read-only; never delegate implementation or acceptance, including asking for patches to apply yourself. Do not write new test code. Use your [complete execution prompt](prompts/W3-conversations.md) when assigning this stream.

Own the central fan experience and the conversation consistency boundary across Node.js, Next.js, Swift, and Kotlin. Read [the plan](README.md), [standards](STANDARDS.md), [contracts](CONTRACTS.md), [runtime verification](VERIFICATION.md), Domain F3/F4/F9/F12, and the architecture delivery-boundary protocol. Do not write new test suites; demonstrate the actual connected app, including races, restarts and multiple clients.

## Work packages

1. **First conversation.** Creator/post entry context, processor consent before sending to named providers, conversation-access notice, creator/fan intro sharing, trial state, thread creation and first useful answer. W1 owns sign-in, W7 entry destinations, W4 access rules, W2 generation. Consent copy must match the configured providers and verified terms.
2. **Durable messages and transport.** Wire existing acceptance primitives to real generation jobs. Show local-pending until durable acceptance, reserve allowance atomically through W4, emit transactional work, consume/release on outcome, distinguish rejected/unavailable from accepted. Multiplex sockets, sequence messages and sentence frames, deduplicate retries, persist resume cursors, reconnect across two devices and a process restart, and bound buffers/queues. No client can spoof authorship or charge usage with optimistic local state.
3. **Thread UI on all fan clients.** Fixed identity strip, all nine active author states, interruption and handback system lines, citations, memory chips, context card, attachments/audio from W6, typing and read/status semantics, long-message rendering, pagination, composer and keyboard behavior. AI is the main action; the person-colored step-in action opens W4's packet. An ended trial preserves that action without turning the AI's prose into an upsell.
4. **Human control.** Epoch/sequence checks before every emitted/rendered frame, one authority at a time, takeover/handback, human active timeout/exit policy, per-fan and global pause/revocation, team sender identity, and delivery checks against W4's exact-version Approval/invalidation contract. Preserve already delivered text as interrupted. W5 owns creator controls; W6 calls use the same transitions. No AI text appears beneath a newer human boundary on any device.
5. **Memory.** Editable/deletable facts, open loops and summary with provenance, item-specific sensitive consent, ask-once proposals, revision-guarded extraction, semantic exclusions and cache invalidation, “don't remember this,” and return-visit follow-up. W2 proposes extraction; W3 owns writes and correctness. Add the accepted off-the-record decision to an explicit domain/architecture contract before building: no memory/open-loop writes, existing access disclosure and deletion behavior remain.
6. **Fan account/privacy surfaces.** You composition, handle/intro views, memory by creator, conversation access history, provider and sharing consent management, deletion/export job UI from W8, notifications/preferences links from W7, spend/time views from W4. Report/block entry and accessible crisis/resource display remain available irrespective of commercial access.
7. **Audited reads and private replies.** Creator/triage thread reads create fan-visible audit entries; opening a packet is a different action and reveals only its snapshot. Isolate Note replies and all fan/thread APIs; support signed messages, reactions and corrections submitted from W5. Search/export/notification read models retain author labels and correct access.
8. **Offline, wellbeing and lifecycle.** Secure scoped cached reads with stale banner, account-switch purge, no offline sending, transparent retry after reconnect, three-hour AI disclosure reminder and companion 90-minute daily signal/weekly time data. Apply trial/allowance limits at the defined natural pause without erasing disclosure or making safety conditional on payment. Purge hooks cover memory/messages/caches/embeddings and explain retained dispute records. Deleting a memory preserves the minimal exclusion needed to prevent re-extraction; thread/account deletion follows the separately defined exclusion/tombstone lifecycle.
9. **Language and original proof.** AI replies in the fan's language within the configured provider capability. Optional human translation is clearly labeled, with original content one tap away; the immutable signed original remains the verification subject. W2 supplies an authorized translation adapter and W1 proof semantics; do not overwrite the original or infer processor consent for a new provider.

## Surfaces and files

Own fan Thread, ThreadLive, Ended, memory/consent/privacy/account conversation compositions and their honest states; consult the [artboard inventory](research/design-inventory.md) for exact primary ownership of composite You/States/prototypes. W5 owns the Studio thread reader; it uses your APIs. W4 owns request/checkout/access state; W7 owns fan home/notifications.

Develop within backend conversation/realtime modules and separate web/Swift/Kotlin conversation features. Native root navigation, shared components and generated API entrypoints use W1 integration. No second message store or independently implemented takeover protocol in a platform.

## First deliveries and dependencies

Finalize C04 delivery/resume and C03 allowance transaction boundary early. Wire one real thread across web and native before adding every state. Integrate W2's scoped generation and W5's signed takeover next, then memory/consent/deletion and the remaining account states. Expose a precise capability response while providers or identity are unavailable; never treat a fixture response as durable production chat.

## Required runtime demonstrations

- Complete consent → send → approved visible sentence → citation → return visit with editable memory on browser, iOS Simulator, and Android Emulator using the same backend.
- Fan A and B, and creators A and B, cannot read, subscribe to, infer, or assemble each other's private messages/memory through altered IDs, pagination, cache or reconnect cursors. Verify database scope and context evidence.
- Trigger takeover while a sentence is in flight, including two fan devices; drop/reorder delayed network delivery, reconnect and restart a worker. Already delivered text stays; stale frames cannot reappear after the new boundary.
- Send two actions for the last allowance unit and retry one accepted action. Exactly one reservation is accepted, no duplicate message or negative balance appears, and failed generation releases usage.
- Delete sensitive memory while an older extraction job runs; try to rephrase the same fact later. Consent and semantic exclusion remain effective. Exercise off-the-record without hidden memory writes.
- Open a thread as triage and inspect the fan's audit history; opening the queue reveals only the selected packet data. Revoked team access stops immediately.
- Exercise paused, ended, exhausted, updating, offline, rejected, rate-limited, model-failure, source-revoked, blocked and crisis states. Verify allowed recovery actions and exact copy/identity.
- Verify scrolling/keyboard restoration, selection/copy, screen readers hearing author first, font scaling, focus, both themes, and measured acknowledgement/visible response/takeover latency.

## Delivery standard

Deliver a real persisted conversation on all three clients, correct ordered control under failure, scoped editable memory, account/privacy flows, audit and deletion hooks, and matched screen evidence. Evidence must cover actual transport and backend state; a component preview or one-client happy path cannot establish conversation correctness.

# W2 — Creator AI, knowledge, and model runtime

## Agent assignment

**Execution rule:** You personally do all coding, migrations, configuration, documentation, debugging/fixes, integration, app launching and end-to-end verification. Subagents may only research or check information read-only; never delegate implementation or acceptance, including asking for patches to apply yourself. Do not write new test code. Use your [complete execution prompt](prompts/W2-creator-ai.md) when assigning this stream.

Deliver the creator's useful, controllable AI from setup to live responses and correction. Follow [the master plan](README.md), [shared standards](STANDARDS.md), [ownership contracts](CONTRACTS.md), and [runtime verification](VERIFICATION.md). Use the source domain/architecture rather than inventing model behavior. No new engineering test code; the creator-facing evaluation console and publish checks remain required product features.

## Work packages

1. **Creator setup and interview.** Resumeable onboarding after W1 verification; expert/companion/blend mode, story/boundaries interview in text or consented audio, review before interview becomes an approved source, and the weekly short current-status check-in with expiry. Drafts must survive refresh and incomplete verification. Show value while preserving the license/approval/publish gates.
2. **Sources and rights.** Manual upload/text and permitted YouTube caption ingestion initially; candidate/processing/failed/approved/revoked source lifecycle; source origin, rights evidence, audience public/tier/group, validity/expiry and passage provenance. Import retries, deduplication, cancellation, revision, bulk review and revoked connector access. A URL field identifies an approved connector/source; it does not authorize unrestricted fetching. Define allowlists, SSRF protection, rights and size/time limits with W8. Never scrape around access restrictions. Add subsequent RSS/newsletter/platform-export connectors from documented creator demand; keep them explicitly owned.
3. **Ingestion and retrieval.** Bounded parsing/chunking/embedding in the ingestion pool, tenant-scoped storage, object-media link authorization, source status/progress, clean-up, and index lifecycle. Start with the specified scoped exact vector retrieval at pilot scale; filter creator/audience before retrieval, top four chunks and bounded budgets. Measure before changing index strategy. Untrusted source text is data, not model/system instructions.
4. **Configuration and versions.** Style card from creator-owned examples, editable/prunable examples, rules/never-reveal list, tone, mode, handoff policy, daily cost cap and session nudge. Draft/testing/live/paused/retired state machine, immutable compiled prefix/hash and source set, atomic live pointer, safe rollback and cache invalidation. Respect D-12: live AI replies instantly with its label; review-first governs exact approved drafts under the creator's name.
5. **License and sponsorship enforcement.** Structured permitted uses, term/attestation, ownership, voice permission and expiry/revocation/death/incapacity transitions. W8 acts on verified notice and W1 supplies authority; W2 pauses generation within five seconds and W4 automatically refunds open commitments. Estate opt-in requires a new license. Implement sponsorship registry and disclosed influence. Actual license wording needs the recorded counsel decision.
6. **Live AI pipeline.** Real provider adapters for generation, embeddings/classification as chosen; deterministic context order, fixed and retrieved style examples, scoped source chunks, current-thread tail, intro consent, memory/Notes/public answers, sponsor state and creator status. Small/large model routing, cost-weighted usage evidence, provider timeout/cancellation, bounded retries and concurrency, backpressure and fail-closed capability handling. W3 owns durable acceptance, transport/delivery and memory state; W4 owns allowance accounting.
7. **Guardrails and memory proposals.** Input crisis routing and output sentence checks before visibility; false human attention, fabricated promises, no-selling, private/restricted source leakage, companion exclusivity/dependency, unsupported expert answer fallback, sponsorship labels and citation validity. Safety remains accessible without a grant. Propose sensitive-memory questions once and scoped revision-bound memory updates to W3; silence is not consent. Honor off-the-record and exclusion semantics.
8. **Evaluation and improvement.** Six boundary evaluations, actual prompt/assembly pipeline, human-readable transcripts, version comparison, creator corrections → rules/negative examples/paraphrased regressions, publish blocking on failures, seven-day privacy-preserving shadow replay and cost reporting. Bind results to the exact draft revision and provider/classifier/retrieval configuration; edits invalidate prior evaluation evidence. No raw fan text is retained in regression material. Define creator usefulness/style criteria before evaluating; do not aim to fool fans about authorship.
9. **Lifecycle and export.** Creator export of sources/style/rules/versions; purge and revoke hooks for W8; invalidation within five seconds where specified. AI voice after the pilot only with permitted license, creator consent, approved provider, W6 media provenance/watermark and persistent audio/visual disclosure. Reserved live AI calls/video stay disabled.

## Surfaces and ownership

Own My AI, Sources, Style, Test, License/sponsorships, interview and AI setup portions of onboarding, plus the AI paused/updating/source-revoked states. See [exact artboards and gaps](research/design-inventory.md). These are primarily responsive/desktop Studio web; shared fan behaviors must integrate with all W3 clients. W6 owns AI voice player/media surfaces; W7 delivers the 72-hour post-publish digest from W2 events.

Use `apps/backend/src/modules/agent/` and distinct source/ingestion submodules, Studio AI feature routes, namespaced API schemas, and domain migrations. Shared API indexes, worker startup and generated clients go through W1/W8. Do not write directly into W3 memory or W4 money tables.

## First deliveries and dependencies

Begin source/version contracts C05/C08 and draft Studio screens while W1 identity develops. Deliver a candidate source → approved source → evaluated immutable version path. Integrate one real configured model through W3 before expanding connectors and refinements. A provider stub may support screen development but cannot count as a working AI. Finish licensed publish, correction/rollback, source revocation and source-audience isolation before enabling external fans.

## Required runtime demonstrations

- Configure and publish one expert and one companion creator; show a cited answer opening the precise authorized passage, and an unsupported question with the correct fallback.
- Import a damaged/duplicate/large source, interrupt ingestion, retry and revoke it; no duplicate effective source or abandoned private asset remains.
- Ask for another fan's memory and another audience's restricted source through direct and indirect prompt injection. Inspect context/provenance evidence, not only the final prose.
- Try failed boundary evaluation, unverified creator, expired license, invalid voice consent and stale draft publication. The actual publish/generation path enforces the gate.
- Correct an answer, run its product regression evaluation, publish/rollback, and confirm new turns use the right version while historical messages retain truthful citations.
- In a live multi-device thread, trigger takeover, source revocation, memory deletion and provider timeout during generation. Coordinate evidence with W3; settlement/cancellation never leaves a phantom reply or permanent allowance hold.
- Exercise sensitive categories, distress, expiring trial and sponsor recommendations. No commercial crisis path, hidden sponsored claim or unconsented memory appears.
- Measure warm/cold first approved sentence and cost under the agreed profile. Record model/version/provider terms; current prices and no-retention claims must be verified before release.

## Delivery standard

Deliver functioning source/version/configuration workflows and real generation, creator-readable evaluation results, explicit source provenance, operational controls, export/revocation hooks, latency/cost evidence and design comparisons. Report provider or license decisions as specific remaining release gates, not completed integrations.

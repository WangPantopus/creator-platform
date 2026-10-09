# Lane 3: AI engine

## Mission

The AI is worth talking to: fast, grounded in the creator's own work, honest, and it remembers.
This lane owns the whole path from "fan sends" to "first approved sentence is visible", the
guard that approves it, the memory, the creator's My AI pages, and the model provider. It has
**two tracks that run in parallel on different files**.

**What a person should feel.** A fan sends a question and sees it acknowledged at once, then a
sentence in the creator's voice with a citation that opens the exact passage, in a few seconds.
Tomorrow it follows up on something they said. A creator publishes a corrected version without
needing real fan data.

## What great looks like

- Acknowledgment p95 at most 300 ms. First approved sentence p95 at most 4.5 s at the start of
  the pilot (today 19 to 27 s), 2.5 s warm as the target after the provider switch.
- Ordinary advice is not blocked ("spread your glaze", "buy test tiles"); a distressed fan is
  never told to "ask Maya directly" (INV-19, INV-21); the fallback rate on a creator's own FAQ
  set is measured.
- Citations open the exact span and survive a creator's re-ingest.
- Memory is visible, editable and consented (INV-15, INV-23); the AI follows up on an open loop.
- A creator publishes version two using an FAQ set they write.

## Scope

**Track A, speed and reliability:** a measurement harness; waking the worker on accept; removing
repeated verification inside a held transaction; fewer transactions; moving the model safety
check off the pre-acknowledgment path (needs the founder's sign-off); lease renewal; lock
collisions; cost-hold sizing; unknown-cost handling; the frame contract so clients paint without
refetching.

**Track B, quality, memory and provider:** guard revision as the next engine revision; the FAQ
publish check; citation offsets; retrieval fixes; the memory pipeline; the Anthropic adapter and
embeddings provider as one engine revision; consent and provider text; the My AI pages.

**Out:** anything about calls, voice, the pass, public answers.

## You own and do not touch

Own: see the charter table; in particular `modules/{agent,conversation,ingestion,sources}`, the
generation, public-AI and publication files in `modules/identity` with their SQL, `workers`,
`realtime`, `features/{conversation,creator-ai}` and the chat, threads and you routes.

Track A edits the transaction, verification and worker files. Track B edits the prompt, guard,
model, memory and creator-AI files. `generation-pipeline.ts` is shared: Track A touches the
admission and bookend call sites, Track B touches stage content; keep diffs small and rebase
often. If conflicts become frequent, the integrator merges the tracks.

Do not touch: money, growth and content modules, `server.ts`, other lanes' files.

## Read first

1. Launch review sections 4 and 5 (and section 3 rows 3 to 5).
2. `modules/agent/{pipeline,generation-pipeline,model,streaming,service,response-usage}.ts`
   (guard at `hardBlock`, fingerprint and `publishedEngine` in `pipeline.ts`; the publish gate at
   `service.ts` 382 to 407 and 1085 to 1126), `workers/*`, `modules/conversation/{memory,
   generation,runtime,host}.ts`.
3. Domain Model: INV-03, 05, 08, 11, 15, 17, 19, 21, 23, 25; System Architecture sections 5 and 6
   (pipeline, latency budget, agent runtime, guardrails).
4. Background: `docs/workstreams/W2-creator-ai.md`, `W3-conversations.md`,
   `docs/implementation/W1-generation-*.md`, `W3-*.md`, `coordination/W3.md` (Q13).
5. The Anthropic migration checklist in the launch review section 13.

## Work packages

| WP | Work | Size | Gate |
| --- | --- | --- | --- |
| A1 | **Measurement harness**: run the generation path on the fixture database with a fake model, count statements and time per phase, reproduce about 625 W1 and 450 consumer statements per answer. No behavior change. **First pull request** | M | lane 2's stack helps |
| A2 | Wake the worker on accept instead of a 1 s poll | S to M | A1 |
| A3 | **Stop repeating verification inside one held transaction**, keeping begin and end checks and the fresh per-stage scope; tests; the integrator signs off | L | A1 |
| A4 | Fewer transactions (merge admissions, drop the second bookend, merge deliver and readback) | M | A3 |
| A5 | Move the model safety check off the pre-acknowledgment path; keep the synchronous regex | M | **founder safety sign-off** |
| A6 | Reliability: lease renewal, `ai_workspace` lock collisions, cost-hold sizing against the daily cap, treat a non-2xx before any body as known zero cost | M | none |
| A7 | **Contract C5**: frames carry text so a client paints without a refetch; keep the INV-03 gate; web thread implements, lane 7 follows | M | A3 |
| B1 | **Guard revision as engine revision 15**: word boundaries and subject anchors, offset-based verification, normalization, failure sub-codes, a distress-safe fallback; revisions 12 to 14 keep their behavior | M to L | the price rule (INV-21) is the founder's call |
| B2 | **FAQ publish check** replacing the fan-sample gate; a new judge prompt (a refusal is not success); UI in My AI; make `AgentService.read` safe against a comparison policy lapse (2026-11-01) | M | none |
| B3 | Citations: offsets in provenance, a snapshot while the source is approved, survive re-ingest | M | none |
| B4 | Retrieval: evidence floor before history; embed the last user turn plus the message | S to M | none |
| B5 | **Memory**: extraction as a job after the answer, the in-thread consent prompt, follow-up on return, exclusions that remove only what was excluded, the guard accepting memory as evidence (C6); respect Q13 | L | none |
| B6 | **Anthropic adapter**: streaming, structured output, usage and rates, tokenizer, caching, schema warm-up, thinking and effort settings, fingerprint redesign (rates and policy out of the behavioral fingerprint), the embeddings provider; **one engine revision with B1** | L | Anthropic key, embedding choice |
| B7 | Consent and provider text with lane 1 | S | final provider |
| B8 | My AI pages: FAQ UI, publish flow, split `CreatorAI.tsx` when touched | M | none |
| B9 | Small fixes on the fan thread and account pages: hide "Ask Maya to step in" in crisis and guardrail states; remove the "AI comparisons are not available yet" copy from Me and privacy; stop the My AI Test tab polling (and its row lock) while comparison is off | S | none |

## Contracts

Provides **C5** (frames) and **C6** (memory). Consumes C4 (Notes in threads), C8.

## Rules that bite

Published engine fingerprints are immutable: a behavior change is a **new revision**, with older
ones preserved, never an edit in place. Never release a sentence before its guard returns
(INV-05, 17, 21, 25). The AI never sells and never states a price (INV-21). Context is
thread-local (INV-11). Never edit applied SQL; migrations go through the queue.

## Verification and exit demo

Measure before and after; show numbers. Safety-adjacent changes get tests and the integrator's
review. **Exit demo:** on the lane 2 stack with a real provider key, 20 messages from a fan: p95
acknowledgment and first sentence reported; one citation opened at its exact span; the next day
the AI follows up on an open loop; a creator publishes version two from an FAQ set.

## Known risks

The five owner contracts around verification (A3) are the riskiest change in the program. The
provider switch invalidates every live version's fingerprint, so it happens before any real
creator publishes. Retrieval embeds only the current message today, so follow-ups retrieve
nothing.

## Decisions needed

Price rule under INV-21; classifier move (A5); embedding provider; Anthropic key and the final
model choices per role.

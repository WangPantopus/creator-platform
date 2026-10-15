# Lane 3: AI engine status

Updated: 2026-10-15, by the lane 3 session
Working on: A6 (reliability): A6a, a provider error before any body is a known zero cost, branch `lane-3/a6-provider-errors` (stacked on A3); A6b, an interrupted reply's unknown cost counts as its whole hold, #433 (needs a migration registration)
Done: A1 #411, A3 #426, A6b #433, A6a (all open)
Next: the rest of A6 (stuck answers after a claim, crash recovery with lane 4, the acknowledgment-time unknown cost, hold sizing), then B2, A2, B9
Blocked on: nothing. Later: the founder's A5 safety sign-off, the INV-21 price rule (B1), the embedding choice (B6/B1)

## How to measure

```
sh tests/scenarios/lane-3/fresh-stack.sh --provider anthropic --env W2_SMALL_MODEL=claude-sonnet-5-5
node tests/scenarios/lane-3/a1-measure.mjs --messages 20 --detail --out before.json
node tests/scenarios/lane-3/a1-measure.mjs --messages 20 --compare before.json   # E3A.2 after a change
```

Options: `--fans N` (up to 5: development accounts 1, 2, 4, 5, 6), `--chars N` (pad each question to N
characters), `--delay MS` (the model fake's delay per call and per streamed chunk, default 300).
`fresh-stack.sh` rebuilds lane 3's own disposable stack, turns on `pg_stat_statements` in that
container's `postgres` database only (never the product database), and the harness publishes Maya
with a $20 daily cap (see finding 2). A rebuild is needed after any failed reply (finding 3).

## Baseline on main (21b3d4836), Claude adapter against the local fake, 300 ms model delay

| Run                                 | Delivered | Ack p50 / p95         | First sentence p50 / p95 | Delivered p50 / p95 | Worker statements per answer                                    | Longest worker transaction | Host load |
| ----------------------------------- | --------- | --------------------- | ------------------------ | ------------------- | --------------------------------------------------------------- | -------------------------- | --------- |
| Cold start, 3 messages, fresh stack | 3/3       | 639 / 693 ms          | 25.8 / 26.2 s            | 39.1 / 39.9 s       | 7,364                                                           | 4.5 s                      | 10 to 11  |
| 20 messages, one fan                | 1/20      | 686 / 776 ms          | 27.7 s (one sample)      | 42.7 s (one sample) | 7,431 for the answer that completed                             | 5.07 s (message 2 failed)  | 12 to 17  |
| Five fans at once, one message each | 4/5       | 983 / 1,007 ms        | 65.4 / 101.9 s           | 115.8 / 218.3 s     | 7,571                                                           | 5.02 s                     | 10        |
| 2,000-character messages            | 2/3       | 665 / 774 ms          | 27.8 / 28.8 s            | 42.1 / 43.6 s       | 6,068                                                           | 4.93 s                     | 9         |
| 2,001 and 3,000 characters          | refused   | `403 message_invalid` |                          |                     |                                                                 |                            |           |
| Idle worker                         |           |                       |                          |                     | 66 statements a second, 103 to 124 ms of database time a second |                            |           |

Per completed answer (cold start run): 847 runs of the W1 identity catalogue, 3,190 consumer
catalogue statements, 789 scope matches (1,949 counting those inside SQL functions), 24
transactions, 22.6 s of worker database time. The heaviest: the shared permission catalogue
(`core/purpose-catalogue.ts`, about 630 runs, 6.4 s), the W1 catalogue (870 runs, 5.3 s), the W2
consumer owner check (434 runs, 2.9 s), the W3 column catalogue (144 runs, 2.1 s).

## After A3 (same harness and settings)

| Run                          | Delivered (main then A3) | First sentence p50 / p95 (main then A3) | Worker statements per answer | Longest worker transaction |
| ---------------------------- | ------------------------ | --------------------------------------- | ---------------------------- | -------------------------- |
| Cold start, 3 messages       | 3/3 then 3/3             | 25.8 / 26.2 s then 9.0 / 9.1 s          | 7,364 then 2,808             | 4.5 s then 2.8 s           |
| 20 messages, one fan         | 1/20 then 20/20          | 27.7 s (one sample) then 9.5 / 12.4 s   | 7,431 then 2,624             | 5.07 s then 3.0 s          |
| Five fans at once            | 4/5 then 5/5             | 65.4 / 101.9 s then 45.0 / 82.7 s       | 7,571 then 2,532             | 5.02 s then 3.66 s         |
| 2,000 characters, 3 messages | 2/3 then 3/3             | 27.8 / 28.8 s then 10.7 / 11.1 s        | 6,068 then 2,628             | 4.93 s then 2.51 s         |

W1 catalogue runs per answer went from 847 to 37, consumer catalogue statements from 3,190 to 897,
and worker database time per answer from 22.6 s to 6.6 to 7.4 s. The acknowledgment is unchanged
(A3 does not touch that path). The longest transaction is now the terminal one; most of it is lane
4's safety terminal catalogue (ticket below).

## Decisions

- 2026-10-15, founder: an interrupted reply's unknown provider cost counts as its whole cost hold,
  is recorded as an estimate, and the creator is unlocked. Implemented by A6b
  (`pending_w2_interrupted_cost_estimate.sql`, which replaces only the budget lines of
  `creator.generation_begin_agent_attempt`).
- 2026-10-15, founder: a reply that fails on a provider error before any output releases the fan's
  allowance (nothing ran). A6a (#434) records that error as a known zero cost.

## Findings (lane 3 unless noted)

1. Every generation transaction runs within about 0.5 s of the fixed 5-second scope window
   (`generation_scope_matches`); past it the reply fails (`generation_scope_changed` or
   `generation_authority_unavailable`) and the fan sees "interrupted", sometimes after one sentence. A3.
2. With `--provider anthropic` no reply is ever admitted on a stack seeded with a $5 daily cap: the
   Claude adapter's run ceiling is 5.24 M micros (`anthropic-model.ts` `maximumRunCostMicros`:
   22 admissions at the highest rate plus 21 x 4,000 output tokens), larger than the cap. A6.
3. One failed reply leaves a provider-cost row with no cost, and `generation_begin_agent_attempt`
   then refuses every later reply for that creator ("uncertain provider cost"). A6.
4. The reply path refuses messages over 2,000 characters with `403 message_invalid`
   (`modules/agent/runtime.ts:282`), while the API schema allows 10,000. A 4xx other than 403 and a
   matching schema limit would be clearer. B9.
5. The realtime gateway closed the fan's socket with 1013 about every 8 to 10 s during replies
   (2-second authority deadline); a client must reconnect from its cursor. A7.
6. The worker's `FOR UPDATE NOWAIT` on the thread row collides with the API's thread reads
   ("could not obtain lock on row in relation thread", several per run). A6.
7. Any authority change while the model is streaming (takeover, pause, consent withdrawal, licence
   lapse, block, AI pause, sign-out) leaves a provider-cost row with no cost (the aborted stream),
   which then locks the creator's AI for every fan (finding 3). Same on main and A3. A6.
8. An authority change right after the worker claims an answer leaves it "generating" until its
   60 s lease expires and recovery finishes it. Same on main and A3. A6.
9. After a crash once a sentence is stored, recovery fails every pass
   (`generation_terminal_recovery_incomplete`; the database says "Complete actual typed
   output/classifier provenance is unavailable" in `creator.generation_settle_typed_original_allowance`)
   and the answer stays "generating" for good. Same on main and A3; lane 5 reported it too. A6 with lane 4.
10. "Takeover visible within 500 ms" fails when the takeover waits behind a worker transaction: main up
    to 2.3 s, A3 up to 1.2 s. A4.
11. An unknown cost on the acknowledgment-time safety classifier has no hold to count, so after A6b it
    would still lock the creator. A provider error there becomes a known zero in A6a; a timeout or abort
    on that path needs its own bounded estimate (proposal for A6).
12. Account deletion cannot be requested with the development identity (it needs a Pantopus-mode
    session), so the E3A.4 deletion case is not run until lane 1's sign-in is on the stack.

## Scenarios

| ID                   | State                                                                                                                                                                                       | Re-run                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| E3A.1 measurement    | Main and A3 recorded above, 2026-10-15                                                                                                                                                      | `a1-measure.mjs` as above                                                                                                          |
| E3A.2 ★              | Pass on A3: identical visible text, authorship, citations and order for every answer main also delivered                                                                                    | `a1-measure.mjs --compare`                                                                                                         |
| E3A.4 ★              | A3: no AI sentence after any change in 27 runs (7 kinds of change, up to 4 timings). Takeover within 500 ms fails at some timings (finding 10, also on main). Deletion not run (finding 11) | `e3a4-authority.mjs`, one case per fresh stack                                                                                     |
| E3A.5 ★              | A3: kill after admission passes; kill during the guard call leaves an uncertain cost (finding 7); kill after the first sentence never finishes (finding 9). Same on main                    | `e3a5-restart.mjs --at admitted\|guard\|sentence`                                                                                  |
| E3A.6 ★              | Distressed message gets the safe response first: pass. Hard-block half not run (needs the real model)                                                                                       | `e3a6-safety.mjs`                                                                                                                  |
| A3 drift             | Pass on main and A3                                                                                                                                                                         | `a3-drift.mjs`                                                                                                                     |
| A6b interrupted cost | Before the migration: locked after one interruption (6 of 12 steps fail). With it: 12 of 12 pass, and a crash during the model call also unlocks once the hold lapses                       | `a6-interrupted-cost.mjs`; `e3a5-restart.mjs --at guard --after-lapse` (both with the migration applied, see the A6b pull request) |
| A6a provider errors  | Before: one 429 locks the creator; an error during the acknowledgment leaves an unknown cost. After: 7 of 7 pass, every failed call records 0 and the next reply is delivered               | `a6-provider-errors.mjs`                                                                                                           |
| E3B.1 to E3B.7       | Not run yet                                                                                                                                                                                 |                                                                                                                                    |

Model gateway spend for lane 3 so far: none (every run used the local fake).

## Tickets to other lanes

| To         | File                                                                                                                    | Change                                                                                                                                                                                                                                                                                           | Why                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Lane 2     | `tests/scenarios/lane-2/seed-maya.mjs`                                                                                  | Seed a daily cap above the Claude run ceiling (for example 20,000,000) until A6 resizes the hold                                                                                                                                                                                                 | Finding 2: a `--provider anthropic` stack can never deliver a reply                                          |
| Lane 4     | `modules/commerce/generation-audience.ts` (`assertCatalog`), `modules/commerce/generation-safety-terminal-catalogue.ts` | Wrap each check in `verifyInHeldTransaction(client, <its frozen custody object>, () => check)` from `modules/identity/generation-held-verification.ts` (after A3 merges)                                                                                                                         | 68 audience runs per answer; the safety terminal catalogue is about 1 s of the longest remaining transaction |
| Lane 4     | `creator.generation_settle_typed_original_allowance` (W4 safety terminal settlement SQL)                                | Settle an interrupted answer that has stored output but no complete typed provenance, with lane 3 in A6                                                                                                                                                                                          | Finding 9: a crash mid-answer is never recovered                                                             |
| Integrator | `infra/migrations.json`, `infra/migrations/reviews/*`                                                                   | Register `pending_w2_interrupted_cost_estimate.sql`. Its receipt for `creator.generation_begin_agent_attempt` cites the new migration, definition checksum `47688d2d…4012`; regenerate the runtime catalogue pins it changes (the active financial pin becomes `4145eb37…eb63` on a fresh stack) | Founder decision on interrupted costs (A6b)                                                                  |
| Integrator | `tests/scenarios/integrator/anthropic-adapter.mts` (case A6)                                                            | Expect a `ProviderResponseError` with a known zero usage for a non-2xx answer before any body (code, upstream status and the no-secret check are unchanged)                                                                                                                                      | A6a makes that error a known zero cost, as the brief decided; this case pinned the old behavior              |
| Lane 1     | `modules/trust/restoration.ts` (`assertGenerationWorkerRestoredInTransaction`)                                          | The same wrapper, if W8 agrees its restoration facts cannot change inside one transaction                                                                                                                                                                                                        | 41 runs per answer                                                                                           |

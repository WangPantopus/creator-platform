# Lane 3: AI engine status

Updated: 2026-10-15, by the lane 3 session
Working on: A3 (verify reviewed catalogues once per held transaction), branch `lane-3/a3-verify-once`, stacked on A1
Done: A1 measurement harness, pull request `lane-3/a1-measure` (open)
Next: A3, then B2 (FAQ publish check), A2 (wake on accept), B9, A6 (the cost-hold and uncertain-cost lockout below)
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

## Scenarios

| ID                | State                               | Re-run                    |
| ----------------- | ----------------------------------- | ------------------------- |
| E3A.1 measurement | Baseline recorded above, 2026-10-15 | `a1-measure.mjs` as above |
| E3A.2 to E3B.7    | Not run yet                         |                           |

## Tickets to other lanes

| To     | File                                   | Change                                                                                           | Why                                                                 |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Lane 2 | `tests/scenarios/lane-2/seed-maya.mjs` | Seed a daily cap above the Claude run ceiling (for example 20,000,000) until A6 resizes the hold | Finding 2: a `--provider anthropic` stack can never deliver a reply |

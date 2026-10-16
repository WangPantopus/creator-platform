# Lane 3: AI engine status

Updated: 2026-10-16, by the lane 3 session (handoff)
Working on: nothing in flight. Last done: A4 (fewer transactions), open as a PR from `lane-3/a4-fewer-transactions`
Done: merged A1 #411, A3 #426, A6a #434, A6b (#433's code and 0251 through #442). Open: A6c #436, hold sizing #438, B2 #441, A2 #444, B9 #446, finding 15 #451, finding 8 #455, finding 9 #456 (status only, decided), A4 (see Resume here)
Next: the founder picks the next work package; remaining: A5 (safety sign-off), A7 (C5 frames), B1 (price rule), B3 citations, B4 retrieval (recommended next), B5 memory, B7 consent text, B8 My AI publish flow
Blocked on: nothing. Later: the founder's A5 safety sign-off, the INV-21 price rule (B1), the embedding choice (B6/B1)

## Resume here (handoff 2026-10-16)

- Worktree `.claude/worktrees/lane-3-ai-engine-696dd4`, branch `lane-3/a4-fewer-transactions`, clean and
  pushed. Every open lane 3 branch carries this status text with its own section; merge main into a
  branch when GitHub reports a conflict and take the newest status text.
- Tools: node and pnpm from the Codex runtime (`NB=$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies;
export PATH=$NB/node/bin:$NB/bin/fallback:$PATH npm_config_manage_package_manager_versions=false`).
- Stack: lane 3's container `qelvora-lane3-postgres` is stopped with its data (pg_stat_statements on).
  `node infra/local/stack.mjs up --lane 3 --no-ai --no-smoke` restarts it (add `--no-web` for backend
  only); `sh tests/scenarios/lane-3/fresh-stack.sh` rebuilds from nothing in about a minute (needed
  before E3A.5 kills and after any crash, finding 17). Test DB:
  `eval "$(node infra/local/stack.mjs env --lane 3 | grep '^CREATOR_TEST_DATABASE_URL=' | sed 's/^/export /')"`,
  then `(cd apps/backend && pnpm exec vitest run)`; T-11 times out above host load about 20, rerun.
- Real model: only through the founder's capped gateway (`--provider anthropic --model-gateway
http://127.0.0.1:56499`; publish Maya on the fake first, then restart with the gateway). Lane 3 has
  spent 124 calls, 304,174 micros.
- Testing a pending SQL proposal: `catalogues snapshot --out F` on a fresh stack, apply the file by hand,
  patch the `definitionChecksum` values in `infra/migrations/reviews/*.json`, `catalogues write --base F`,
  restart, test, then `git checkout -- infra/migrations/reviews` (never commit pins; the integrator
  regenerates them).
- Waiting on others: the integrator registers #451 and reviews #455 and A4 (custody-adjacent); lane 4
  takes finding 9's condition; lane 7 hides step-in natively (B9); lane 2 makes the model fake's reply
  configurable.

## A4: fewer transactions per answer

Deliver returns its committed cursor (no readback transaction); one fresh read per admission (the
second bookend dropped); the classifier admitted inside the preflight and the reply inside the
retrieval read (released as a known zero if never used). No SQL change. Paired at load 7.3 and 7.7:
first sentence p50 8.17 to 6.88 s, p95 9.60 to 8.20 s; worker statements 2,646 to 2,011; transactions
23.5 to 19.6; worker database time 5.7 to 4.8 s. E3A.2 identical; E3A.4, E3A.6, A6a and A6b scenarios
pass as on main; E3A.5's "admitted" kill point now lands during the classifier call and leaves its
row `admitted` (exposure unchanged); 157 of 157 suites.

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

- 2026-10-15, founder: finding 9 (a crash once a sentence is stored) is fixed by lane 4's one
  condition in `creator.generation_typed_original_allowance_receipt`; the crashed, partly delivered
  answer keeps the fan's reservation held like any unknown receipt (#456, ticket to lane 4).
- 2026-10-15, founder: "Ask Maya to step in" is hidden after the crisis response and the companion
  safety refusal, kept after the expert fallback, and back with the next ordinary answer; with no
  allowance and step-in hidden, the unavailable line drops its step-in sentence. B9 (#446).
- 2026-10-15, founder: a reply's cost hold is a strict upper bound computed from what this pipeline can
  send for the creator's configuration (calls actually made, each at its own model's rate); the cap is
  never exceeded. Implemented on `lane-3/a6-hold-sizing`.
- 2026-10-15, founder: a reply that fails on a provider error before any output releases the fan's
  allowance (nothing ran). A6a (#434) records that error as a known zero cost.

## Findings (lane 3 unless noted)

1. Every generation transaction runs within about 0.5 s of the fixed 5-second scope window
   (`generation_scope_matches`); past it the reply fails (`generation_scope_changed` or
   `generation_authority_unavailable`) and the fan sees "interrupted", sometimes after one sentence. A3.
2. (Fixed by A6 hold sizing.) With `--provider anthropic` no reply is ever admitted on a stack seeded with a $5 daily cap: the
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
8. (Fixed on `lane-3/f8-reconcile-own-answer`, no migration.) An authority change right after the
   worker claims an answer, or while the reply streams, left it "generating" until its 60 s lease
   expired and recovery finished it (main: the answer ended 59 to 64 s after the change). W8 denies
   the worker's completion once the answer's authority no longer holds, but already answers
   `reconciliation_allowed` for its own failed cursor; the worker now reconciles at once with the
   last cursor it committed (W1 accepts only the exact durable one): 2.0 to 3.7 s.
9. After a crash once a sentence is stored, recovery fails every pass
   (`generation_terminal_recovery_incomplete`: "Complete actual typed output/classifier provenance is
   unavailable" in lane 4's `creator.generation_typed_original_allowance_receipt`) and the answer
   stays "generating" for good (reproduced on main 2026-10-15). Cause: the killed reply call's usage
   row stays `provider_state='admitted'`, and that W4 receipt requires every sentence's call to be
   `completed`. Proposed fix (tested by hand on lane 3's stack, pins patched locally and restored):
   one condition in that lane 4 function, accepting an `admitted` reply call only inside the exact
   sealed unknown journal and never as crisis evidence (ticket below). Result: the first recovery
   pass after the restart ends the answer `interrupted` with its sentence kept; the call's cost stays
   unknown and the fan's reservation stays held (the existing unknown-receipt rule, 0237/0238); Maya's
   next answer is delivered. The lane 3 alternative (the journal seal closing orphaned calls as
   completed with an unknown cost) needs a new journal-owned function, a seal change, two custody
   updates and more pins, so it is not proposed. Founder decision 2026-10-15: lane 4 takes the
   one-condition fix, and a crashed, partly delivered answer keeps the fan's reservation held like
   any unknown receipt.
10. "Takeover visible within 500 ms" fails when the takeover waits behind a worker transaction: main up
    to 2.3 s, A3 up to 1.2 s. A4.
11. Account deletion cannot be requested with the development identity (it needs a Pantopus-mode
    session), so the E3A.4 deletion case is not run until lane 1's sign-in is on the stack.
12. Any fan could lock a creator's AI: dropping the connection during the acknowledgment's safety check
    cancelled the provider call, and its unknown cost (no hold) refused every later reply for every fan.
    A6c fixes it: the check runs to its deadline, and a timed-out check records its own upper bound.
13. With the real model, the FAQ "Am I talking to Maya or to her AI?" fails although the AI's first
    sentence is right ("You're talking to Maya's AI, not Maya herself."): the delivery guard
    withholds a later sentence of the same answer (category `ai_identity_question`), and a withheld
    sentence fails the case. An honest identity answer should pass the guard whole. B1 (guard), not B2.
14. The AI answers only from approved sources, and the creator's FAQ answers are not a source. A
    creator whose sources do not cover a question therefore fails that FAQ entry however good the
    expected answer is (three of Maya's five with the real model). Founder decision 2026-10-15: the
    FAQ stays a check only; a creator adds sources that cover the questions.
15. Answers fail when anything else holds the creator's AI workspace row for a moment: the answer
    path locked it with `FOR UPDATE NOWAIT` / `FOR SHARE NOWAIT` in four W2 functions
    (`generation_agent_inputs`, `generation_begin_agent_attempt`, `generation_open_provider_usage`,
    `generation_agent_journal_receipt`; 0096, 0251, 0097, 0105). With Maya's Studio reading her AI
    state every 150 ms, main delivered 3 and 4 of 9 answers. Proposed migration
    `pending_w2_workspace_lock_wait.sql` (branch `lane-3/f15-workspace-lock-wait`, pending registration): those four locks wait (the
    worker's 1 s lock timeout bounds them) and 9 of 9 are delivered in three runs. Two workers on one
    database still lose answers (1 or 2 of 10 on main and with the migration, none answered twice):
    each answer holds the row until its W2 transaction ends, often over 1 s, so the other worker's
    wait times out. That needs the admission in its own short transaction (a design change, A6), and
    the worker's lost-claim reconciliation should skip a task another worker holds (tried, no effect
    while the first cause remains). Lane 4's `generation_typed_original_allowance_receipt` has the same
    `NOWAIT` (ticket).
16. The output guard blocks a harmless answer with a dollar amount: "what is $5 plus $3?" was answered
    "$8" by the real model and withheld as `promise_or_sales` (the pattern `\$\s*\d` matches any
    amount). B1 (word boundaries and subject anchors).
17. After E3A.5's kill and `stack.mjs up`, opening a new conversation fails with `403 ai_updating`
    (`supportsPublishedEngine` false) until the next clean stop and up; same on main. Not
    investigated; `e3a5-restart.mjs --after-lapse` fails its last step for this reason.

## A2: wake on accept

The fan's accepting transaction sends `pg_notify('creator_generation_queued', '')` (delivered only
on commit, carrying nothing). The development host keeps one `LISTEN` session on the worker login,
reconnects with backoff and wakes the worker after every reconnect. A wakeup during a pass runs one
more pass. While the session listens the idle wait is 5 s instead of 1 s; without it, the old 1 s
poll. Fresh stack each, model fake at 300 ms, on main with A1, A3 and A6a (2026-10-15):

| Measure                                    | Main (1 s poll)  | A2                |
| ------------------------------------------ | ---------------- | ----------------- |
| Accept to claim, 8 messages, p50 / p95     | 963 / 2,482 ms   | 429 / 824 ms      |
| Idle worker: statements a second (30 s)    | 63.8             | 15.7              |
| Idle worker: database time a second (30 s) | 112.0 ms         | 23.6 ms           |
| Idle passes in 30 s                        | 20               | 5                 |
| A1 harness, 8 messages: first sentence p50 | 12.2 s (load 20) | 8.4 s (load 10.5) |
| Burst of 30 (5 fans), answered once        | 25 (in 506 s)    | 25 (in 344 s)     |
| Two workers, 10 messages, answered once    | 1 (none twice)   | 2 (none twice)    |

Before A3 merged (same harness): accept to claim 809 / 818 ms on main, 371 / 568 ms on A2; idle
72.1 and 15.7 statements a second. The end-to-end first-sentence difference is mostly host load.
What remains of accept to claim is the pass's own work before the claim (the recovery check and
discovery), which A4 can shrink. The burst failures are the same kinds on both: an answer
interrupted by the thread lock (finding 6) and admissions refused while earlier failed answers
still hold the creator's budget (main's hold envelope; #433 and #438 fix it).

## B9: small fixes on the fan thread and account pages

- **Step-in after a crisis or a safety refusal.** The thread page now says `stepInAvailable`
  (optional, absent means available). It is false while the latest AI turn that has said something
  is the crisis response or the companion safety refusal ("I'm an AI. I can't help with that here."),
  and the web hides "Ask Maya to step in". The expert fallback ("… You can ask Maya directly.")
  keeps it, as the source's state table and INV-21 allow. The next ordinary answer brings it back,
  at the moment its first sentence arrives (an answer with no sentence yet does not count, so the
  button cannot flash while the next reply might be a crisis response). The server compares the
  latest AI text with its own two constants, because the request role cannot read the sentence
  provenance that records a guard fallback (a grant would need a migration). With no allowance the
  unavailable line drops "You can still ask the creator to step in." while step-in is hidden.
- **Me and privacy** shows the "AI comparisons" section only when comparisons are available, so the
  "AI comparisons are not available yet." line is gone.
- **My AI Test tab** stops polling comparisons while they are off. Each read ran inside the agent
  repository's transaction, which locks the creator's `ai_workspace` row (`FOR UPDATE`), the row an
  answer's admission locks with `NOWAIT` (finding 15). With the tab open and comparisons off: main
  14 reads and 14 row locks in 70 s; B9 one read at load, none after (a focus reads once more and
  polling stays off).
- Founder decision 2026-10-15: keep this reading (hidden after the crisis response and the companion
  refusal, kept after the expert fallback, back with the next ordinary answer) and the shortened
  no-allowance line.

## B2: the FAQ publish check

The fan-sample comparison gate (shadow replay of recent fan messages) no longer decides publishing.
The creator writes the questions fans ask, each with the answer they expect (`faq` in the draft, up
to 50, no duplicates ignoring case). The evaluation asks each one as a fan and a judge checks the
AI's answer against the expected one; a refusal or "the sources do not cover this" is not a pass.
A new version may replace the live one only with at least 5 questions and at least 80% of them
passing, on top of the existing boundary cases (all must pass). A first version needs no FAQ.

- Founder decision 2026-10-15: the bar is 5 questions and 80% (`FAQ_MIN_QUESTIONS`,
  `FAQ_PASS_RATE` in `packages/api/src/agent/contracts.ts`); the copy keys `creatorAiFaq*` in
  `config/copy.json` (title "QUESTIONS FANS ASK YOU") and the API's gate and `faq_required`
  sentences in `modules/agent/service.ts` ("Write at least 5 questions fans ask you, …") are
  approved as written; FAQ answers stay a check only, not a source (finding 14).
- Real model (Sonnet through the gateway, Maya's seeded FAQ): all 6 boundary cases pass, 1 of 5
  FAQ entries pass, publishing is refused (`403 evaluation_required`). Three fail because Maya's
  sources do not cover them (finding 14), one is finding 13.
- Studio (web, browser pane, Maya): the panel saves to `creator.ai_workspace.configuration->'faq'`;
  a duplicate shows "This question is already on the list." and the server refuses the save, leaving
  the stored draft unchanged; Night theme at 375 px has no horizontal overflow.
- Not run: the clock past 2026-11-01. The comparison window reads the database clock and the stack
  does not turn on `TRUST_DEVELOPMENT_COMPARISON_POLICY`. On main, reading the state and publishing
  call `comparisonSamples` (`service.ts` read and publish); on B2 neither does, so the date no longer
  matters.

## Scenarios

| ID                    | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Re-run                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| E3A.1 measurement     | Main and A3 recorded above, 2026-10-15                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `a1-measure.mjs` as above                         |
| E3A.2 ★               | Pass on A3: identical visible text, authorship, citations and order for every answer main also delivered                                                                                                                                                                                                                                                                                                                                                                                                                     | `a1-measure.mjs --compare`                        |
| E3A.1/E3A.2 A4        | Paired: first sentence p50 8.17 to 6.88 s, statements 2,646 to 2,011, transactions 23.5 to 19.6; visible output identical                                                                                                                                                                                                                                                                                                                                                                                                    | `a1-measure.mjs --compare`                        |
| E3A.3                 | A2: claims 429 ms after accept (main 963 ms); the wakeup session killed before a send: answered (claimed in 404 ms) and the session returns; the backend killed with work accepted but unclaimed: answered once after the restart; burst of 30: 25 answered once, same as main; two workers: 2 of 10, none twice (main 1 of 10; finding 15)                                                                                                                                                                                  | `e3a3-wake.mjs`                                   |
| E3A.4 ★               | A3: no AI sentence after any change in 27 runs (7 kinds of change, up to 4 timings). Takeover within 500 ms fails at some timings (finding 10, also on main). Deletion not run (finding 11)                                                                                                                                                                                                                                                                                                                                  | `e3a4-authority.mjs`, one case per fresh stack    |
| E3A.5 ★               | A3: kill after admission passes; kill during the guard call leaves an uncertain cost (finding 7); kill after the first sentence never finishes (finding 9). Same on main                                                                                                                                                                                                                                                                                                                                                     | `e3a5-restart.mjs --at admitted\|guard\|sentence` |
| E3A.6 ★               | Distressed message gets the safe response first: pass. Hard-block half not run (needs the real model)                                                                                                                                                                                                                                                                                                                                                                                                                        | `e3a6-safety.mjs`                                 |
| E3A.7 workspace lock  | Main: 3 and 4 of 9 answers while Studio reads every 150 ms (9 workspace refusals); with the pending migration 9 of 9 in three runs, no refusals, no deadlocks, E3A.2 identical. Two workers: 2 of 10 on main, 1 or 2 with the migration (finding 15)                                                                                                                                                                                                                                                                         | `e3a7-workspace-lock.mjs`                         |
| A3 drift              | Pass on main and A3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `a3-drift.mjs`                                    |
| A6 hold bound         | Before: a $5 cap admits no Claude reply. After: hold $2.62 (Sonnet as small model) or $0.20 (Haiku); 10 of 10 replies delivered, spend at most 2.3% of the hold; one real reply cost $0.018 against a $2.62 hold                                                                                                                                                                                                                                                                                                             | `a6-hold-bound.mjs`                               |
| A6c dropped request   | Before: a fan dropping the request during the safety check, or a timed-out check, locks the creator (4 of 7 fail). After: 7 of 7                                                                                                                                                                                                                                                                                                                                                                                             | `a6-ack-disconnect.mjs`                           |
| A6a provider errors   | Before: one 429 locks the creator; an error during the acknowledgment leaves an unknown cost. After: 7 of 7 pass, every failed call records 0 and the next reply is delivered                                                                                                                                                                                                                                                                                                                                                | `a6-provider-errors.mjs`                          |
| E3B.2 ★               | Pass on the fake (11 of 11): no FAQ or one question refused (`faq_required`); five (Spanish and a hidden instruction included) publish version 2 with no fan data; duplicates, 51 and empty questions refused at save; 50 questions evaluated in 66 s; a provider failure midway fails the evaluation. Real model: refused at 1 of 5 FAQ (finding 13). The clock past 2026-11-01 case is not run (see B2)                                                                                                                    | `e3b2-faq-publish.mjs`                            |
| E3B.7 (B9 part)       | Crisis: 8 of 8 on the fake (OpenAI and Claude adapters): hidden after the crisis response, on older pages too, still shown in another fan's thread, back after the next ordinary answer. Real model: the companion refusal hides it and the next answer brings it back; the expert fallback keeps it. Browser: hidden after a crisis, back the moment the next answer appears; Me and privacy has no comparisons section; Test tab stops polling. FAQ UI: see E3B.2. A comparisons-on server is not run (none is configured) | `e3b7-step-in.mjs`                                |
| E3B.1, E3B.3 to E3B.6 | Not run yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |                                                   |

Model gateway spend for lane 3 so far: 124 calls, 304,174 micros (/\_\_stats, 2026-10-15): 6 calls, 19,010 micros for the hold bound; 66 calls, 162,077 micros for B2's FAQ evaluation; 52 calls, 123,087 micros for B9's guard cases (three tries before a prompt tripped the guard).

## Tickets to other lanes

| To         | File                                                                                                                    | Change                                                                                                                                                                                                                                                                                                                                                | Why                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Lane 2     | `tests/scenarios/lane-2/seed-maya.mjs`                                                                                  | Seed a daily cap above the Claude run ceiling (for example 20,000,000) until hold sizing (#438) merges                                                                                                                                                                                                                                                | Finding 2: a `--provider anthropic` stack can never deliver a reply                                          |
| Lane 7     | Thread screens (iOS, Android)                                                                                           | Hide "Ask Maya to step in" when the page's `stepInAvailable` is false (B9, generated models already carry it)                                                                                                                                                                                                                                         | INV-19, INV-21: no way to paid attention right after a crisis response or safety refusal                     |
| Lane 2     | `infra/local/fake-edge/model.mjs`                                                                                       | A control that sets the reply sentences (for example `{"reply": ["…"]}`)                                                                                                                                                                                                                                                                              | The guard can only be exercised with the real model today (B9's refusal case, E3B.1's corpus)                |
| Lane 4     | `creator.generation_typed_original_allowance_receipt` (W4 commerce SQL)                                                 | Lock the creator's `ai_workspace` row without `NOWAIT`, as lane 3's pending `pending_w2_workspace_lock_wait.sql` does for its four functions                                                                                                                                                                                                          | Finding 15: a Studio read at that moment fails the answer's settlement                                       |
| Lane 4     | `modules/commerce/generation-audience.ts` (`assertCatalog`), `modules/commerce/generation-safety-terminal-catalogue.ts` | Wrap each check in `verifyInHeldTransaction(client, <its frozen custody object>, () => check)` from `modules/identity/generation-held-verification.ts` (after A3 merges)                                                                                                                                                                              | 68 audience runs per answer; the safety terminal catalogue is about 1 s of the longest remaining transaction |
| Lane 4     | `creator.generation_typed_original_allowance_receipt` (W4, the provenance check)                                        | Replace `OR u.provider_state IS DISTINCT FROM 'completed'` with `OR (u.provider_state IS DISTINCT FROM 'completed' AND NOT (u.provider_state='admitted' AND receipt.state='unknown' AND p.approval->>'kind'<>'crisis'))` (tested by hand: definition checksum 9e0c8329… → 6798d104…; pins `runtimeCatalogues.financial` and `purposeProfiles` change) | Finding 9: a crash once a sentence is stored is never recovered                                              |
| Integrator | `tests/scenarios/integrator/anthropic-adapter.mts` (case A6)                                                            | Expect a `ProviderResponseError` with a known zero usage for a non-2xx answer before any body (code, upstream status and the no-secret check are unchanged)                                                                                                                                                                                           | A6a makes that error a known zero cost, as the brief decided; this case pinned the old behavior              |
| Lane 1     | `modules/trust/restoration.ts` (`assertGenerationWorkerRestoredInTransaction`)                                          | The same wrapper, if W8 agrees its restoration facts cannot change inside one transaction                                                                                                                                                                                                                                                             | 41 runs per answer                                                                                           |

# Lane 3: AI engine status

Updated: 2026-10-16, by the lane 3 session
Working on: B5 (memory proposals), PR #490. Last done: A5 (safety check after acknowledgment), #489
Done: merged A1 #411, A3 #426, A6a #434, A6b (#433's code and 0251 through #442). Open: A6c #436, hold sizing #438, B2 #441, A2 #444, B9 #446, finding 15 #451, finding 8 #455, finding 9 #456 (status only, decided), A4 #464, B4 #468, B1 #473, B3 #477, A7 #482, A5 #489, B5 #490, B5 web #491, finding 18 F18_PR
Next: finding 5; B8 after #441 and #446 merge; B6 waits on the provider key and the embedding choice
Blocked on: nothing. Later: the embedding choice (B6), the real model for B1's model check and finding 13 (gateway)

## Resume here (2026-10-16, B4)

- Worktree `.claude/worktrees/lane-3-resume-0d9ef8`, branch `lane-3/b4-retrieval` (pushed). The older
  worktree `lane-3-ai-engine-696dd4` is back on `lane-3/a4-fewer-transactions`, clean; a session hook
  refuses writes to another session's worktree, so each session works in its own. Every open lane 3
  branch carries this status text with its own section; merge main into a branch when GitHub reports a
  conflict and take the newest status text.
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
- Waiting on others: the integrator registers #451 and reviews #455 and #464 (custody-adjacent); lane 4
  takes finding 9's condition; lane 7 hides step-in natively (B9); lane 2 makes the model fake's reply
  configurable.
- E3B.4 needs the backend's OpenAI-host calls routed through its recording edge: rebuild with
  `sh tests/scenarios/lane-3/fresh-stack.sh --env QELVORA_FAKE_MODEL_URL=http://127.0.0.1:56438`
  (port 56438 is lane 3's; the scenario opens the edge itself and forwards to the fake on 56433).

## B5: memory proposals after the answer (migration proposal)

After an ordinary answer is delivered (no crisis, refusal or withheld sentence; not off the record),
the generation worker runs the existing extraction (the same prompts as the interactive path: one
extraction and an independent sensitivity call per item, at most five, billed to the attempt under
its `memory` category) and writes what it found as **proposals**, which become memory only when the
fan accepts them; a sensitive one needs its own consent on acceptance (INV-23, W3's existing
`decide`). The write is a new W3 purpose: `pending_w3_generation_memory_proposals.sql` (closed role
`creator_w3_generation_memory`, function `creator.generation_memory_proposals(uuid,uuid,jsonb)`): it
writes only `proposed` rows for the original turn, skips off the record (Q13), a changed turn, a
semantic key the fan excluded (the key or its content hash, as "don't remember this" stores it) and a
key already held, and bumps only `memory_revision`, never the thread revision the answer's own checks
use. The TS consumer (`conversation/generation-memory.ts`) is optional in the worker composition:
**inactive until the integrator registers the migration, its review receipts and the W1 consumer**
(ticket below). A provider or write failure leaves the delivered answer as it is.

Local proof (lane 3's stack only, nothing committed): the SQL applied by hand with its
`schema_migration` row; `catalogues diff` against a snapshot shows only the new role
(`creator_w3_generation_memory: added`), no relation and no other role's reach changed; `catalogues
write` regenerated the 13 pin groups that cover every role; the memory receipt (definition
`583262e5…`, catalogue `4fed8786…`) added to the worker custody and W1's consumer list. With the
committed pins the writer stays off and answers are unchanged (3 of 3 delivered, no memory rows).

E3B.5 (`e3b5-memory.mjs`, a scripted model edge for extraction and sensitivity, which the fake does
not do): main writes no proposals (1 of 16 meaningful steps pass, the rest are vacuous); with the
writer active every step passes:

- the answer is delivered first; the proposal follows about 4.9 s after the first sentence;
- nothing is memory until the fan says yes; yes makes it memory and the next answer's context carries
  it; an open loop is proposed as an open loop and carried on return (the material for a follow-up);
- an edit removes the old text from the next answer at once; the edited text is memory once the fan
  accepts it (W3 treats edited free text as possibly sensitive: consent withdrawn, marked
  `sensitive_unspecified`; kept as is);
- a sensitive fact is proposed with its category and accepting it records its consent (INV-23);
- no stores nothing and the same key is not proposed again, while a different key still is;
- no key stored twice; a crisis answer and an off-the-record message run no extraction.

Not in this PR: a proactive first turn on
return (the AI uses the open loop when the fan writes); the guard treating memory as evidence (C6);
200 items; account deletion and export (lane 1's sign-in, finding 11). Hold sizing (#438) must add
one extraction and five sensitivity calls to `maximumGenerationCalls` (main's run ceiling already
counts them).

**In the thread (web, stacked PR #491).** Under the AI answer it came from, each proposal is asked with
the fixed question "Want me to remember this? Only if you say yes." and Remember / Don't remember
(existing copy keys `sensitiveMemory`, `remember`, `dontRemember`); a remembered item shows as
"Remembered: …" with "Don't remember this" (`remembered`, `dontRememberThis`). The thread loads the fan's
memory list with each page refresh (the worker writes proposals before the answer's final frame, so
the reconciling refresh brings them) and decides through W3's existing memory endpoint. Default taken:
every proposal gets the fixed question, not only sensitive ones, because W3 makes every item a proposal.
`e3b5-memory-web.mjs` (installed Chrome, headless, writer applied locally): asked under the answer;
Remember makes it memory and shows it; Don't remember this undoes it at once; Don't remember stores
nothing; a sensitive item records its consent: 7 of 7. Lane 7 follows natively.

Finding 18 (W3): once a thread has any exclusion ("don't remember this" or a deleted memory), the
conversation context drops **all** memory and all history for that thread (W3's interim rule until a
semantic classifier purpose exists), so after one "no" the AI forgets everything. B5's "an exclusion
removes only what it names" therefore holds for proposals but not for context; the fix replaces
`creator.generation_conversation_context` (a migration) to drop only the excluded keys and the
messages the fan marked.

**Finding 18 fix (migration proposal, PR F18_PR, stacked on B5).** `pending_w3_generation_context_exclusions.sql`
replaces `creator.generation_conversation_context` with the live definition changed in one place:
history, memory and intro load whenever the thread is not off the record; excluded memory keys and
the messages the fan marked "don't remember this" (W3 already sets them and their answer off the
record) stay out. The restrictive fan-profile policy loses only its no-exclusions clause. Owner,
signature, grants and every other check are unchanged. The context consumer accepts the reviewed
replacement (`NNNN_w3_generation_context_exclusions`, source `5937065f…`) through the existing
`generationDefinitions` route, which the worker custody now applies to the context receipt too.
Default taken: a deleted memory's paraphrase elsewhere in recent history is no longer hidden by
dropping everything (INV-15 still excludes the deleted item itself); W3 had chosen to drop all until a
semantic classifier exists. E3B.5 with only B5 active: "after a no" warns and "don't remember this
removes only that message" fails; with the fix both pass (local activation, pins and receipts not
committed). Backend suite 157 of 157.

## A5: the model's safety check leaves the path before acknowledgment

A fan's message is acknowledged after the synchronous check (`needsImmediateSafety`, which still
answers its phrases at once with the fixed safety response). The model's check no longer runs before
a message the AI will answer: the worker's classifier is that answer's first step and answers a
crisis with the fixed safety response before anything else, as a free outcome. A message that would
be refused (a reply already running, a human takeover, a paused AI, no allowance, AI unavailable)
gets the model's check before the refusal, so safety never depends on access (INV-19). No SQL,
engine or copy change.

A5 scenario (`a5-ack-safety.mjs`, a scripted model edge whose classifier calls one hidden phrase a
crisis that the synchronous check does not see), fresh stack each, model fake at 300 ms, load 10 to 13:

| Case                                                    | Main                            | A5                                                                          |
| ------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| Ordinary message acknowledged, p50 / p95                | 636 / 725 ms                    | 248 / 562 ms                                                                |
| Crisis only the model recognises (fan will be answered) | safety response at ack (349 ms) | ack 159 ms, safety response first and alone at 3.35 s, reservation released |
| Same, a reply already running (refused)                 | safety response                 | safety response                                                             |
| Same, during a human takeover (refused)                 | safety response                 | safety response                                                             |
| Crisis the synchronous check recognises                 | at ack, 190 ms, no generation   | at ack, 201 ms, no generation                                               |

- The trade the founder's sign-off was about: a crisis only the model recognises now gets its safety
  response about 3 s after the acknowledgment (the worker's first step) instead of at it; nothing
  else is shown before it and it costs the fan nothing. Typecheck, format and generate checks pass;
  backend suite 157 of 157.

## A7: the web thread paints sentences from their frames (contract C5)

A frame already carried each approved sentence (the server writes it only after the guard approves),
but the web thread refetched the whole page on every frame and painted from that. Now an AI sentence
frame is appended to its message the moment it arrives; the answer's end (`delivered` or
`interrupted`) sets the message state and asks for one reconciling fetch for what frames do not
carry (citations, version, feedback). Accepted and control frames and other authors still refetch,
as before. `ThreadDeliveryGate` is unchanged: it drops duplicates and stale-epoch frames (INV-03) and
holds anything after a gap.

C5 as built: a sentence frame is `{threadId, cursor, epoch, kind: "sentence", messageId, authorKind,
text, generationId, sequence}`, where `text` is the sentence to append to message `messageId` (one AI
message per answer); `delivered` and `interrupted` close it; a client keeps one gate per thread,
paints only what the gate returns, refetches on anything it cannot paint and on a gap or replay
error, and subscribes again from its cursor after a reconnect. Frames do not carry citations (adding
them changes the SQL that writes frames, a migration), so a citation chip appears with the answer's
end.

E3A.8 (`a7-paint-frames.mjs`): installed Chrome (headless) signs in as development actor one, sends
five questions through the composer and drops the network in a sixth answer; every frame and every
change of the thread's text is timestamped on one clock. Fake model at 700 ms per chunk, load 16 to 17.

| Measure                                      | Main           | A7             |
| -------------------------------------------- | -------------- | -------------- |
| Sentence painted after its frame, p50 / p95  | 342 / 1,794 ms | 19 / 102 ms    |
| Page fetches per answer                      | 6, 8, 8, 8, 7  | 6, 8, 7, 5, 10 |
| Final text equals the server's, network drop | yes            | yes            |

- Page fetches hardly change: sentences no longer fetch, but the gateway closes the socket about
  every 8 to 10 s during an answer (finding 5) and each reconnect fetches the page twice. That is the
  next fix (server side).
- One A7 answer ended `interrupted` on the server (load 16); the screen still matched the server.
- Lane 7 follows for the native threads (7.8). Typecheck, lint, format and generate checks pass.

## B3: citations survive a rebuild and open their exact span

- A rebuild of a source at the same revision (a retry, or a change of embedding model, which marks
  every source failed until the creator retries it) keeps each unchanged chunk's id, so a citation
  already delivered still opens. Before, ingestion deleted every chunk and inserted new random ids,
  so every existing citation answered "No longer accessible to you" once the AI was back.
- The chunker never cuts between the two halves of an emoji or other astral character (a lone half is
  stored as U+FFFD, and the chunk no longer equals its span). Sources indexed before keep their
  broken chunks until their next rebuild, which then gives those chunks new ids.
- No SQL, contract, engine or copy change.

E3B.3 (`e3b3-citations.mjs`, a scripted edge that cites the passage holding a case's marker; the
scenario restarts lane 3's stack itself: embedding model A, then B with Maya retrying every source,
then A again with a second retry, then version 1 brought back):

| Case                                                              | Main                   | B3                |
| ----------------------------------------------------------------- | ---------------------- | ----------------- |
| Stored chunks equal to their source span (CRLF, table, emoji run) | 2 of 4                 | 4 of 4            |
| Opened citation is the exact span                                 | 2 of 4 (emoji altered) | 4 of 4            |
| Cited chunk ids after the rebuild                                 | 0 of 4                 | 4 of 4            |
| Old citations open the same span after the rebuild                | 0 of 4 (403)           | 4 of 4            |
| Another fan opens this fan's citation                             | 403                    | 403               |
| A revoked source's citation                                       | 403 (`ai_paused`)      | 403 (`ai_paused`) |

- A revoked source hides its citation only because revoking pauses the whole AI; the narrower case (a
  source unapproved while the AI stays live) has no path today.
- Not in this PR: a citation from an earlier revision (the creator revises a source and publishes
  again) opening its snapshot with an honest "the source changed" line. It needs the older revision's
  chunks kept (revise and ingestion delete them) and a second published version, which needs B2
  (#441) on the stack; and highlighting the guard's quoted words inside the chunk needs their offsets
  stored with the message (a migration). Both are follow-ups.
- Typecheck, lint, format and generate checks pass; backend suite 157 of 157.

## B1: guard revision 16

Engine revision 16 (`w2-context-guardrails-16`, stacked on B4's revision 15) changes only the
sentence guard; retrieval is revision 15's. Revisions 12 to 15 keep their guard byte for byte, so a
published version keeps its behavior until the creator publishes again.

- One comparable form for every pattern: accents stripped, zero-width characters and soft hyphens
  removed, full-width and look-alike (Cyrillic, Greek) letters folded, curly quotes, dashes and space
  variants unified, leetspeak read as letters, and letters spelled apart ("m.a.y.a", "r e a d") read
  joined.
- Word boundaries and subject anchors: "Maya / she / the creator read, saw, remembers, felt, noticed,
  is proud of … you" is blocked; "Spread your glaze", "Thread your wire", "Read your kiln's manual",
  "I read your question as …" pass. Promises need a person as subject ("Maya will reply", "I'll get
  back to you", "expect a reply from Maya"); "your glaze will meet the clay body" passes. Selling is a
  forbidden word (upgrade, unlock, subscribe, exclusive access, become a member) or a purchase verb
  with one of Qelvora's offerings (packet, request, pass, membership, tier, subscription, session,
  call, voice note, the creator's time or attention); "buy test tiles", "get a packet of cones" pass.
  Impersonation adds "this is / it's Maya", "Maya here", "Maya speaking", "as Maya, I".
- Price rule (INV-21, proposed default): a currency amount in a price context (cost, price, pay, sell,
  each, per, a month, a bucket, for $, starts at …) is blocked, also when it comes from the creator's
  own materials ("costs about $40 a bucket"); an amount that is not a price ("$5 plus $3 is $8")
  passes.
- Dependency is checked in every mode (expert mode skipped it: a lonely fan was sent "You only need
  me." on revision 15).
- The guard's echo is compared without quote, dash and space variants (the segments' text against the
  sentence, and each quote against its passage), so curly apostrophes and non-breaking spaces no
  longer turn into `citation_invalid`; any other difference still fails.
- Fallback (INV-19, INV-21): only expert mode without distress says "You can ask Maya directly."
  A fan in distress (the classifier's `sensitive`, a `dependency` block, or words such as lonely, no
  one, hopeless in the message) gets the safety refusal "I’m an AI. I can’t help with that here.",
  after which B9 already hides "Ask Maya to step in"; blend mode drops the step-in sentence.
- Categories stay the closed set the guardrail audit stores; no SQL change.

E3B.1 (`e3b1-guard.mjs`): a scripted model edge (lane 3's port 56438, an outer-edge fake) proposes each
corpus sentence as the AI's reply and scripts the guard's echo for the echo cases; everything else
goes to the stack's fake, whose guard approves everything, so these numbers are the engine's
deterministic checks, not the model's judgment. Corpus through Studio's draft preview, fan path
through the generation worker; fresh stack, load 3 to 4 (the last run at load 57, see below).

| Set                                                              | Revision 15 | Revision 16                    |
| ---------------------------------------------------------------- | ----------- | ------------------------------ |
| Ordinary advice delivered (corpus)                               | 35 of 50    | 50 of 50                       |
| Blocked lines and their variants stay blocked (corpus)           | 33 of 71    | 71 of 71                       |
| Fallbacks: step-in only for expert without distress              | 2 of 7      | 7 of 7                         |
| Guard echo: quote and space drift passes, invented quote fails   | 3 of 6      | 6 of 6                         |
| Held-out 1, ordinary delivered                                   | 37 of 40    | 37 of 40                       |
| Held-out 1, harmful blocked (3 of 20 before its gaps were added) | 2 of 20     | 20 of 20 (tuned, not held out) |
| Held-out 2 (written after that tuning), ordinary delivered       | 23 of 25    | 25 of 25 (one fix: "anyone's") |
| Held-out 2, harmful blocked                                      | 3 of 20     | 9 of 20                        |
| Fan path: ordinary advice, fabricated attention, distressed fan  | 1 of 3      | 3 of 3                         |

- Still blocked on revision 16 (held-out 1, documented): "Get the membership card from your community
  studio desk", "You can get calls about kiln repairs" (a purchase verb with an offering word) and a
  contrived "Maya here refers to …". Still passing (held-out 2): paraphrases such as "Maya cherishes
  every message you send", "Yes, I'm the creator myself", "Join Maya's paid tier", "Packets begin at
  $5". Patterns are the first filter; the model's output check is meant to catch paraphrases, and it
  has not been measured (the gateway was down).
- A version published on revision 15 keeps its guard on the revision 16 backend ("Spread your glaze"
  still withheld for it).
- One run at load 57: the fan path's ordinary case ended `interrupted` after its sentence was
  delivered (finding 6, `could not obtain lock on row in relation "thread"`); the final fresh-stack run
  at load 13 to 16 passed every step. Typecheck, lint, format and generate checks pass; backend suite
  157 of 157.
- Not done here: integer offsets in the guard's verdict and one re-run on structural failures (a
  schema change to validate with the real model); persisting sub-codes and a text hash (the audit's
  category set is closed in SQL, a migration); finding 13 (needs the real model); the fallback's
  latency.

## B4: retrieval (engine revision 15)

Retrieval embeds the fan's previous turn in this thread, then the message (the previous turn cut to
2,000 characters), so a follow-up ("what about the second one?") finds what it refers to. The nearest
passages get up to 1,000 context tokens, and at least the nearest one, before memory, Notes, public
answers and history take the rest of the 2,500 budget; the evidence stays in retrieval order. Both
change what a published version does, so they ship as engine revision 15 (`w2-context-guardrails-15`;
the fingerprint names `scoped-exact-cosine-top4-previous-fan-turn` and `evidenceFloor: 1000`).
Revision 14 stays a historical engine with its exact behavior: a version published before keeps the
old retrieval until the creator publishes again. The worker builds the query inside its held read
from W3's thread-local history (INV-11; an off-the-record thread or one with memory exclusions has
none, and the message is embedded alone), using the published version's own engine, and every
retrieval read re-derives the query and refuses a changed one. No SQL change.

Founder decision 2026-10-16 (the proposed default): B4 is engine revision 15 as built, with the
1,000-token floor; B1 and B6 follow as later revisions.

E3B.4 on the fake model (100 ms), fresh stack each, paired at load 5.3 and 5.6. The fake embeds with
a 64-dimension hash of words; a recording edge in front of it shows the embedded text and the
evidence slot of every reply. Maya: expert mode, 11 synthetic sources, one for a tier no fan holds.

| Case                                                              | Main                      | B4                                 |
| ----------------------------------------------------------------- | ------------------------- | ---------------------------------- |
| Follow-up has its topic's passage in evidence (6 dialogues)       | 1 of 6                    | 4 of 6                             |
| Opening question has its passage                                  | 6 of 6                    | 6 of 6                             |
| Question after five 1,990-character turns: passages in evidence   | 0 (14 history lines kept) | 4, its passage 2nd (12 lines kept) |
| Members-only passage in evidence (the nearest without the filter) | never                     | never                              |
| Another fan's words in a query (21 queries, a simultaneous pair)  | none                      | none                               |
| First message in a thread; off-the-record follow-up               | message alone             | message alone                      |
| Delivered                                                         | 31 of 31                  | 30 of 31 (finding 6, see below)    |
| First sentence p50 / p95                                          | 6.65 / 6.96 s             | 6.60 / 7.85 s                      |

- The two follow-ups B4 still misses ("Why does that matter?" after the wedging question, "And when
  should I do it?" after the handle question) rank their passage low on the fake's stopword-heavy
  hash even with the opening question (the wedging opening alone ranked it 4th). A real embedding model
  is the honest test; it waits on the embedding choice (B6). Embeddings stay on the fake even with
  `--model-gateway`.
- The undelivered answer is finding 6: `could not obtain lock on row in relation "thread"` in
  `begin_generation_terminal` (database log), then lease recovery ended it `interrupted` after 62 s.
- Also run: a clean stack stop and up between the opening and the follow-up (the follow-up is still
  embedded with the opening and finds its passage); a version published on main (revision 14) keeps
  answering on B4, embedding the message alone with main's exact evidence; a 2,000-character previous
  turn is embedded whole (a 2,028-character query). Typecheck, lint, format and generate checks pass;
  backend suite 157 of 157.
- Not run: the real model (the gateway on 56499 was not listening), so the real model's wording with
  no evidence and its citations are not shown (the fake never cites, so "no citation" is trivially
  true on it); a fan who holds the tier (the stack has no tiers or memberships).
- The query is plain concatenation, so a long previous turn on another subject dominates it (the
  2,000-character boundary turn pulled the evidence off the glazes passage). Embedding the two turns
  separately and averaging would keep the message dominant; not done.
- Retrieval still returns the 4 nearest permitted passages however far they are. A distance floor
  needs the SQL function to return distances (a migration); worth proposing only if the real model
  cites far passages.
- Hold sizing (#438) bounds the embedding call by the message's bytes; with B4 the bound must add the
  previous turn (at most 2,000 code points, 8,000 bytes, plus 2). Whichever of the two merges second
  updates `maximumGenerationCalls`.

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

- 2026-10-16, founder (proposed default, B7): the consent screen keeps naming each configured provider with
  its real terms ("Review message retention" while a provider keeps messages); the fixed sentence "They
  don't keep or train on your messages." is used only once every provider has zero-retention terms.
  The development policy names Anthropic and OpenAI (Claude answers, OpenAI embeds) with
  `noRetention: false`. No code change.
- 2026-10-16, founder (proposed default, B8): the `CreatorAI.tsx` split waits until #441 (B2) and #446
  (B9) merge, since both change the comparison code it would move.
- 2026-10-16, founder (proposed default, B5): memory is written by the worker as proposals the fan
  accepts (W3's design), through a new W3 purpose (migration proposal); an edited memory stays a
  proposal until accepted again (W3's consent rule for edited free text).
- 2026-10-16, founder (proposed default, A5 safety sign-off): the model's safety check leaves the path
  before acknowledgment for a message the AI will answer (the worker's classifier answers a crisis
  first, free); a message that would be refused gets the check before the refusal (INV-19).
- 2026-10-16, founder (proposed default, B1): the AI never states a price, also not one from the
  creator's own materials; an amount that is not a price ("$5 plus $3 is $8") is allowed. A fan in
  distress gets the existing safety refusal "I’m an AI. I can’t help with that here." instead of the
  step-in fallback; blend mode's fallback drops "You can ask Maya directly." (INV-21 allows it only in
  expert mode); dependency is checked in every mode. B1 ships as revision 16 on its own.
- 2026-10-16, founder: take the proposed default instead of stopping to ask; each such decision is
  recorded here, marked "proposed default", and can be reversed.
- 2026-10-16, founder (proposed default): B4 ships as engine revision 15 (previous fan turn in the
  query, 1,000-token evidence floor); revision 14 stays a historical engine. B1 (guard) is revision
  16; B6 (provider switch) gets its own later revision instead of sharing one with B1, since it waits
  on the key and the embedding choice.
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
   (2-second authority deadline); a client must reconnect from its cursor. A7. 2026-10-16: not
   the replay's share lock on the thread row (replaying without it: closes 6 to 5, worker thread-lock
   errors 10 to 12 over 20 answers); cause still open, the experiment is an unpushed local branch.
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

| ID                   | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Re-run                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| E3A.1 measurement    | Main and A3 recorded above, 2026-10-15                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `a1-measure.mjs` as above                                                             |
| E3A.2 ★              | Pass on A3: identical visible text, authorship, citations and order for every answer main also delivered                                                                                                                                                                                                                                                                                                                                                                                                                     | `a1-measure.mjs --compare`                                                            |
| E3A.1/E3A.2 A4       | Paired: first sentence p50 8.17 to 6.88 s, statements 2,646 to 2,011, transactions 23.5 to 19.6; visible output identical                                                                                                                                                                                                                                                                                                                                                                                                    | `a1-measure.mjs --compare`                                                            |
| E3A.3                | A2: claims 429 ms after accept (main 963 ms); the wakeup session killed before a send: answered (claimed in 404 ms) and the session returns; the backend killed with work accepted but unclaimed: answered once after the restart; burst of 30: 25 answered once, same as main; two workers: 2 of 10, none twice (main 1 of 10; finding 15)                                                                                                                                                                                  | `e3a3-wake.mjs`                                                                       |
| E3A.4 ★              | A3: no AI sentence after any change in 27 runs (7 kinds of change, up to 4 timings). Takeover within 500 ms fails at some timings (finding 10, also on main). Deletion not run (finding 11)                                                                                                                                                                                                                                                                                                                                  | `e3a4-authority.mjs`, one case per fresh stack                                        |
| E3A.5 ★              | A3: kill after admission passes; kill during the guard call leaves an uncertain cost (finding 7); kill after the first sentence never finishes (finding 9). Same on main                                                                                                                                                                                                                                                                                                                                                     | `e3a5-restart.mjs --at admitted\|guard\|sentence`                                     |
| E3A.6 ★              | Distressed message gets the safe response first: pass. Hard-block half not run (needs the real model)                                                                                                                                                                                                                                                                                                                                                                                                                        | `e3a6-safety.mjs`                                                                     |
| E3A.7 workspace lock | Main: 3 and 4 of 9 answers while Studio reads every 150 ms (9 workspace refusals); with the pending migration 9 of 9 in three runs, no refusals, no deadlocks, E3A.2 identical. Two workers: 2 of 10 on main, 1 or 2 with the migration (finding 15)                                                                                                                                                                                                                                                                         | `e3a7-workspace-lock.mjs`                                                             |
| E3A.8 frames (A7)    | Web thread paints a sentence 19 / 102 ms after its frame (main 342 / 1,794 ms); final text equals the server after a network drop; page fetches unchanged (finding 5)                                                                                                                                                                                                                                                                                                                                                        | `a7-paint-frames.mjs` on a stack with the web app                                     |
| A3 drift             | Pass on main and A3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `a3-drift.mjs`                                                                        |
| A6 hold bound        | Before: a $5 cap admits no Claude reply. After: hold $2.62 (Sonnet as small model) or $0.20 (Haiku); 10 of 10 replies delivered, spend at most 2.3% of the hold; one real reply cost $0.018 against a $2.62 hold                                                                                                                                                                                                                                                                                                             | `a6-hold-bound.mjs`                                                                   |
| A6c dropped request  | Before: a fan dropping the request during the safety check, or a timed-out check, locks the creator (4 of 7 fail). After: 7 of 7                                                                                                                                                                                                                                                                                                                                                                                             | `a6-ack-disconnect.mjs`                                                               |
| A6a provider errors  | Before: one 429 locks the creator; an error during the acknowledgment leaves an unknown cost. After: 7 of 7 pass, every failed call records 0 and the next reply is delivered                                                                                                                                                                                                                                                                                                                                                | `a6-provider-errors.mjs`                                                              |
| E3B.2 ★              | Pass on the fake (11 of 11): no FAQ or one question refused (`faq_required`); five (Spanish and a hidden instruction included) publish version 2 with no fan data; duplicates, 51 and empty questions refused at save; 50 questions evaluated in 66 s; a provider failure midway fails the evaluation. Real model: refused at 1 of 5 FAQ (finding 13). The clock past 2026-11-01 case is not run (see B2)                                                                                                                    | `e3b2-faq-publish.mjs`                                                                |
| E3B.7 (B9 part)      | Crisis: 8 of 8 on the fake (OpenAI and Claude adapters): hidden after the crisis response, on older pages too, still shown in another fan's thread, back after the next ordinary answer. Real model: the companion refusal hides it and the next answer brings it back; the expert fallback keeps it. Browser: hidden after a crisis, back the moment the next answer appears; Me and privacy has no comparisons section; Test tab stops polling. FAQ UI: see E3B.2. A comparisons-on server is not run (none is configured) | `e3b7-step-in.mjs`                                                                    |
| E3B.4 ★              | B4 on the fake: follow-ups 4 of 6 find their passage (main 1 of 6); after five long turns 4 passages (main 0); the members-only passage never retrieved; no other fan's words in any query, also for a simultaneous pair; off the record and first messages embedded alone; restart and a revision-14 version pass. Real model not run (gateway down)                                                                                                                                                                        | `e3b4-retrieval.mjs` on a fresh stack routed through its edge (see B4)                |
| E3B.1 ★              | Revision 16 on the fake with a scripted reply edge: corpus 50 of 50 ordinary delivered (revision 15: 35), 71 of 71 blocked (33), fallbacks 7 of 7 (2), echo 6 of 6 (3); held-out 2: 25 of 25 ordinary, 9 of 20 harmful (revision 15: 23, 3); fan path 3 of 3; a revision 15 version keeps its guard. The model check is not measured (gateway down)                                                                                                                                                                          | `e3b1-guard.mjs` on a fresh stack routed through its edge                             |
| E3B.3                | B3: every chunk and opened citation is the exact span with CRLF, a table and an emoji run (main 2 of 4); after a same-revision rebuild under another embedding model and back, 4 of 4 old citations open the same span (main 0 of 4); other fan and revoked source refused. Earlier-revision snapshots not covered (needs B2)                                                                                                                                                                                                | `e3b3-citations.mjs` on a fresh stack routed through its edge (it restarts the stack) |
| E3B.5 ★              | B5 with the writer registered locally: every step passes (proposal after the answer, yes, open loop on return, edit, consent, no, duplicates, crisis, off the record); main writes no proposals. Context exclusions over-remove (finding 18); in-thread prompt not built                                                                                                                                                                                                                                                     | `e3b5-memory.mjs` on a stack with the writer applied (see B5)                         |
| E3B.6                | Not run yet (needs the provider key)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                       |

Model gateway spend for lane 3 so far: 124 calls, 304,174 micros (/\_\_stats, 2026-10-15): 6 calls, 19,010 micros for the hold bound; 66 calls, 162,077 micros for B2's FAQ evaluation; 52 calls, 123,087 micros for B9's guard cases (three tries before a prompt tripped the guard).

## Tickets to other lanes

| To         | File                                                                                                                    | Change                                                                                                                                                                                                                                                                                                                                                                                                                              | Why                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Lane 2     | `tests/scenarios/lane-2/seed-maya.mjs`                                                                                  | Seed a daily cap above the Claude run ceiling (for example 20,000,000) until hold sizing (#438) merges                                                                                                                                                                                                                                                                                                                              | Finding 2: a `--provider anthropic` stack can never deliver a reply                                          |
| Lane 7     | Thread screens (iOS, Android)                                                                                           | Hide "Ask Maya to step in" when the page's `stepInAvailable` is false (B9, generated models already carry it)                                                                                                                                                                                                                                                                                                                       | INV-19, INV-21: no way to paid attention right after a crisis response or safety refusal                     |
| Lane 2     | `infra/local/fake-edge/model.mjs`                                                                                       | A control that sets the reply sentences (for example `{"reply": ["…"]}`)                                                                                                                                                                                                                                                                                                                                                            | The guard can only be exercised with the real model today (B9's refusal case, E3B.1's corpus)                |
| Lane 4     | `creator.generation_typed_original_allowance_receipt` (W4 commerce SQL)                                                 | Lock the creator's `ai_workspace` row without `NOWAIT`, as lane 3's pending `pending_w2_workspace_lock_wait.sql` does for its four functions                                                                                                                                                                                                                                                                                        | Finding 15: a Studio read at that moment fails the answer's settlement                                       |
| Lane 4     | `modules/commerce/generation-audience.ts` (`assertCatalog`), `modules/commerce/generation-safety-terminal-catalogue.ts` | Wrap each check in `verifyInHeldTransaction(client, <its frozen custody object>, () => check)` from `modules/identity/generation-held-verification.ts` (after A3 merges)                                                                                                                                                                                                                                                            | 68 audience runs per answer; the safety terminal catalogue is about 1 s of the longest remaining transaction |
| Lane 4     | `creator.generation_typed_original_allowance_receipt` (W4, the provenance check)                                        | Replace `OR u.provider_state IS DISTINCT FROM 'completed'` with `OR (u.provider_state IS DISTINCT FROM 'completed' AND NOT (u.provider_state='admitted' AND receipt.state='unknown' AND p.approval->>'kind'<>'crisis'))` (tested by hand: definition checksum 9e0c8329… → 6798d104…; pins `runtimeCatalogues.financial` and `purposeProfiles` change)                                                                               | Finding 9: a crash once a sentence is stored is never recovered                                              |
| Integrator | `tests/scenarios/integrator/anthropic-adapter.mts` (case A6)                                                            | Expect a `ProviderResponseError` with a known zero usage for a non-2xx answer before any body (code, upstream status and the no-secret check are unchanged)                                                                                                                                                                                                                                                                         | A6a makes that error a known zero cost, as the brief decided; this case pinned the old behavior              |
| Integrator | `infra/migrations.json`, `infra/migrations/reviews/*`, the worker custody                                               | Register `apps/backend/src/modules/conversation/migrations/pending_w3_generation_memory_proposals.sql` (version `NNNN_w3_generation_memory_proposals`, source SHA-256 `d84d6e02…`); regenerate the pins (on lane 3's stack only the new role's reach changed: 13 groups); add `custody.memory` `{consumer, catalogueChecksum}` and the same receipt to W1's `identity.consumers` (definition SHA-256 `583262e5…` on lane 3's stack) | B5: memory proposals stay off until registered                                                               |
| Integrator | `infra/migrations.json`, the head review                                                                                | Register `pending_w3_generation_context_exclusions.sql` (`NNNN_w3_generation_context_exclusions`, source SHA-256 `5937065f…`) after B5's, add it to the wave's `sources` and a `generationDefinitions` entry for `creator.generation_conversation_context(uuid,uuid)` (owner `creator_generation_conversation_context`), regenerate the pins                                                                                        | Finding 18: an exclusion removes only what it names                                                          |
| Lane 1     | `modules/trust/restoration.ts` (`assertGenerationWorkerRestoredInTransaction`)                                          | The same wrapper, if W8 agrees its restoration facts cannot change inside one transaction                                                                                                                                                                                                                                                                                                                                           | 41 runs per answer                                                                                           |

# Engine wave: web qualification — 2026-10-22

Worktree: `engine-completion-review/creator-platform`, branch
`codex/engine-qualification-2026-10-22`. This qualifies the pending AI wave
locally; it does not approve deployment or change the main worktree.

## Defects repaired

Commit `ade3b2515` contains only these two web files:

- `apps/web/features/conversation/ConversationScreen.tsx`: memory reads and
  decisions keep the newest thread revision. A slow background read can no
  longer restore a prompt after Remember or Don't remember succeeds. View and
  thread resets clear the retained list.
- `apps/web/features/creator-ai/CreatorAI.tsx`: same-session draft recovery
  preserves unfinished, blank and duplicate FAQ rows, including other unsaved
  configuration changes. Local recovery checks row count, string types and
  lengths; saving still uses the strict shared/server contract. Previously,
  parsing the editing buffer as a complete configuration rejected an unfinished
  FAQ row and discarded the entire unsaved configuration on reload.

## Browser checks

Installed Chrome, headless, against `engine-1022` web `56602` / API `56601`.
The existing database stayed at its captured migration-119 state. The tests
used development identities and normal reads; FAQ writes and memory decisions
were intercepted in the browser. They did not generate replies or mutate the
server's FAQ, memory or model configuration.

| Check | Result |
| --- | --- |
| Add half-written, duplicate and blank FAQ rows alongside unsaved usefulness criteria, then reload | Pass: all rows and criteria restored; duplicate warning retained |
| Try saving the recovered unfinished FAQ | Pass: submitted rows remain incomplete and fail `DraftConfig`; a synthetic 400 response keeps the editing buffer visible. This is contract/UI coverage, not server publication acceptance |
| FAQ panel at 375px in Night | Pass: document width 375px, no horizontal overflow; screenshot inspected |
| Deliver an old memory GET after a successful Remember response | Pass: remembered state remains at the newer revision |
| Deliver an old memory GET after a successful Don't remember response | Pass: removed prompt stays absent at the newer revision |

The memory checks inject synthetic response data into an existing thread's
fan/AI message pair. They exercise the real rendered component and request
ordering. The pending memory writer migration remains inactive; these checks
do **not** establish extraction, storage, sensitive consent or writer acceptance.

Local evidence:

- `/tmp/qelvora-engine-web-1022/checks.json`
- `/tmp/qelvora-engine-web-1022/faq-night-375.png`
- `/tmp/qelvora-engine-web-check.mjs` (the browser reproduction harness)

## Source checks

All passed after the fixes:

```sh
pnpm --filter @qelvora/web typecheck
pnpm exec eslint apps/web/features/conversation/ConversationScreen.tsx apps/web/features/creator-ai/CreatorAI.tsx
pnpm exec prettier --check apps/web/features/conversation/ConversationScreen.tsx apps/web/features/creator-ai/CreatorAI.tsx
git diff --check
```

Read review found no additional defect in `frames.ts` / the delivery gate's
ordered-refresh integration.

## Real streaming and reconnect

The fresh `qualified-1022` stack (registered workspace-wait migration 120)
provided API `56621`, web `56622`, model fake `56623` and PostgreSQL `56620`.
The backend A6 lane first verified five replies at Maya's $5 daily cap. The
original migration-119 stack was preserved after its workspace NOWAIT failure;
it was not reused for AI reply acceptance.

`tests/scenarios/lane-3/a7-paint-frames.mjs --answers 5` passed all 8 steps.
Five normal answers and one answer with network loss mid-stream were delivered.
Every final screen contained exactly the server's answer once, without missing
or duplicated text. Measured normal sentence paints were p50 13 ms and p95
543 ms; thread-page reads per normal answer were 3, 4, 5, 4 and 5.

The harness reported one of ten normal frame latency samples as unmeasured
("never"), despite that answer's exact final text. Its timing check only counts
text increases after a frame, so the number is not proof of a missing sentence;
the cause of that one sample was not established. A focused rerun with HTTP,
frame and DOM timelines passed all 5 steps (two normal answers plus network
loss), with all four normal samples measured at 16–19 ms (p50 17 ms, p95 19 ms).
No rendering defect was reproduced; the initial unmeasured sample remains a
measurement limitation.

Evidence:

- `/tmp/qelvora-engine-web-1022/a7.json` and `a7.log`
- `/tmp/qelvora-engine-web-1022/a7-observed.json` and `a7-observed.log`
- `/tmp/qelvora-a7-observed.mjs` (existing A7 harness with extra timeline capture)

## FAQ publication

The full existing `e3b2-faq-publish.mjs` basic, limits and failure cases passed
all 12 steps on `qualified-1022`. Unlike the UI-only tests above, this scenario
exercised the real draft, evaluation and publication APIs against the model
fake:

- No FAQ and one question both blocked replacing version 1 (`faq_required`).
- Five questions, including Spanish and an instruction-override probe,
  passed evaluation and published version 2 with no fan data.
- Duplicate questions, case-only duplicates, 51 questions and an empty
  question were rejected when saving.
- All 50 valid questions evaluated successfully in 66 seconds.
- A provider failure made the evaluation fail and blocked publication;
  the same five questions passed after the provider recovered.

Evidence: `/tmp/qelvora-engine-web-1022/faq-publication.log`.

Maya remained live and unpaused at version 2 with the $5 cap. The current draft
ended with five questions and a passed evaluation. The model fake ended in
`ok` mode with `delayMs: 100`. All browser and scenario processes were closed,
and the model/Maya lane was returned to the backend agent before further
disconnect, wake and contention checks.

Replay on this local stack (the database password below is the repository's
documented loopback test constant):

```sh
export QELVORA_API_URL=http://127.0.0.1:56621
export QELVORA_FAKE_MODEL_URL=http://127.0.0.1:56623
export QELVORA_STACK_DATABASE_URL=postgresql://postgres:foundation-test-only@127.0.0.1:56620/creator_stack
node tests/scenarios/lane-3/a7-paint-frames.mjs --web http://localhost:56622 --answers 5
node tests/scenarios/lane-3/e3b2-faq-publish.mjs --cases basic,limits,failure
```

The FAQ basic scenario expects its initial live version to be version 1; use a
fresh disposable fixture for a repeat. These fake-model checks establish the
application paths and publication gates, not real-provider answer quality.
The memory writer and exclusion-reader pending SQL files were not activated
by this web qualification.

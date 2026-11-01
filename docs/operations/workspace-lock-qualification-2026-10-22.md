# Workspace lock qualification, 2026-10-22

The local app-completion branch carries the AI engine merge wave from
`origin/lane-3/merge-wave-2026-10-16`, reviewed against `origin/main` at
`b154252e3806ba86aea06c1b7ad9dfb23acd9008`. This is local integration evidence,
not a deployment or a claim that the upstream pull request has merged.

## Problem and change

The first reply completed on the 119-migration stack with its unchanged $5 daily
creator cap. Repeated replies exposed an existing workspace `NOWAIT` collision
with the stock Growth projection. An interrupted call could consume its bounded
unknown-cost estimate, leaving too little budget for the next reply.

Migration `0252_w2_workspace_lock_wait` registers the unchanged proposal
`apps/backend/src/modules/agent/migrations/pending_w2_workspace_lock_wait.sql`.
Its SHA-256 is
`d95eeb56126bae8c64d3112b45072d773ae16b00bd5c7fcc572efdc3c4368e89`.
The `20261022-workspace-lock` wave follows the exact 119-source predecessor.
Applied SQL and earlier review files are unchanged.

A real PostgreSQL 17 before/after function-definition comparison found exactly
four removals of `NOWAIT`. Function owners, ACLs, settings, other definition bytes
and lock order are unchanged. Existing one-second lock and five-second statement
timeouts bound the wait. This adds no role, table, grant, provider access, consent
or privacy policy. The four functions are:

- `creator.generation_agent_inputs(uuid,uuid)`;
- `creator.generation_begin_agent_attempt(uuid,uuid,text,text,bigint,text)`;
- `creator.generation_open_provider_usage(uuid,uuid,text,text,text,text)`;
- `creator.generation_agent_journal_receipt(uuid,uuid)`.

Owner-side preparation now accepts only each exact registered source, signature,
owner and definition checksum in the new review. The original 0188 seal/helper
and 0181 usage-finish receipt remain pinned. Fixed predecessor metadata supports
the migration operator; it does not authorize runtime work on an old database.

## Observed qualification

All databases and model traffic below used task-owned disposable local resources
and synthetic accounts. The model was the local Anthropic-compatible fake; no
real-model quality, price or latency claim follows from these results.

| Check                                                                    | Observed result                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh full host                                                          | 120 migrations installed from nothing; six original seed rows preserved                                                                                                                            |
| Independent canonical bootstrap                                          | `migrate-trust` installed exactly the canonical 61 versions and checksums; 0252 remained unapplied                                                                                                 |
| Reviewed operator on independently restored, traffic-closed 119 database | Applied only 0252; ledger 119 → 120; all prior history, six business rows across 189 tables, roles, sequence and backup security preserved; 17,476 security records checked; `releaseReady: false` |
| Before/after catalogue diff                                              | No relations added, removed or changed; no purpose role gained/lost direct relation access; four of 45 digest groups changed                                                                       |
| Pin generation                                                           | Actual fresh and independently restored database profiles collected, with and without the incoming Growth login; four purpose profiles updated                                                     |
| Fresh/restored catalogue check without Growth                            | Both 45/45, exit 0; original and populated purpose variants match                                                                                                                                  |
| Fresh/restored catalogue check with Growth                               | Both 44/45, exit 1; sole difference is the known single family pin; incoming runtime family profile matches                                                                                        |
| A6 repeated replies with Growth                                          | Five short/2,000-character replies delivered under unchanged $5 cap; no unknown usage; total observed daily spend 58,992 micros; three adversarial rounding cases passed                           |
| Full backend regression                                                  | Nine files, 157 tests passed, including existing money, PostgreSQL, shadow-evidence and worker-lifetime suites                                                                                     |
| Full-host startup after owner receipt fixes                              | All 14 smoke checks passed; first sentence at about four seconds and completion about four seconds later; default $5 cap retained                                                                  |

The four changed digest groups are `purposeProfiles`,
`outputCatalogueChecksum`, `runtimeCatalogues.financial` and
`runtimeCatalogues.output`. The catalogue-diff tool now correctly describes
direct relation privileges only: unchanged relation reach is not proof that a
function-body change is harmless.

The existing diagnostic limitation remains: a Growth-enabled database matches
44 of 45 single-value pin groups because `runtimeCatalogues.family` records the
no-Growth digest. The runtime's reviewed family profiles contain both variants.
Do not represent that diagnostic as 45 of 45 or remove the failed row. The
new review retains the no-Growth single pin instead of replacing it with whichever
profile was measured last.

## Reproduction and limits

Use an owned fresh lane and unused port range:

```sh
node infra/local/stack.mjs up --lane qualified-1022 --base-port 56620 --growth --provider anthropic --require-reply
node infra/local/stack.mjs catalogues check --lane qualified-1022 --base-port 56620
```

For an existing database, use the reviewed operator with
`W8_MIGRATION_WAVE=20261022-workspace-lock`, its separate migration connection,
verified private backup and independent restore, and closed traffic. The fresh
installer is not an upgrade tool. Backups and detailed operator manifests remain
private local evidence; they are not committed.

The memory and context-exclusion proposals remain unregistered and inactive.
This wave does not fix every possible contention path: the W4 allowance receipt
still has its existing workspace share lock. Production provider integration,
whole-account deletion and hosting selection remain separate work.

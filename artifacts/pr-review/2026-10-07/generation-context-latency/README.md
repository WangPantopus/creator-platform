# Context budget repair and generation latency continuation

Continuation of draft [#335](https://github.com/WangPantopus/creator-platform/pull/335),
after the [revision 13 grounding work](../generation-performance-grounding/README.md).
Revision 14 fixes a demonstrated source-retention bug and reduces repeated
authorization work. **The latency targets and existing-version upgrade path
remain unqualified.**

## Source retention

The architecture specifies a hard **2,500-token** uncached context budget, but
the assembler counted UTF-8 bytes. In the actual saved copy 43 conversation,
the fifth request lost its only approved passage although the complete context
needed just 589 model tokens. Subsequent answerable questions received refusals.
The [saved-row reproduction](saved-context-reproduction.json) compares the same
assembler, messages and whole authorized passage with the old and corrected
counters; all seven requests now retain the passage within the original cap.

The configured model now supplies a model-specific BPE count using pinned
`js-tiktoken@1.0.21`. The two configured GPT-4.1 model snapshots use `o200k_base`;
unknown model mappings refuse startup instead of guessing. Literal text that
resembles a special token stays ordinary text. Model and pipeline fingerprints
include this behavior, invalidating prior evaluation approval. Context priority,
whole-chunk selection and the final serialized-context cap are unchanged.

This counts the uncached plain text described by the product contract, not the
entire provider request or financial usage. Actual provider receipts still
determine settlement. OpenAI distinguishes local text tokenization from full
request accounting in its [token-counting guide](https://developers.openai.com/api/docs/guides/token-counting).
The existing conservative run-cost bound and provider admission are unchanged.

## Current-authority work

- Metadata bookends reuse only the original, privately issued, already licensed
  inputs on the same held scope/client. They call the input owner's full fresh
  authorization, including current stored licence expiry and exact input hash,
  instead of recursively obtaining another licence. This uses the existing
  licensed-input contract; no result survives into a new purpose.
- Conversation context retains W1 authorization before and after its consumer
  checks. Its factory explicitly checks W1 before preparation. The duplicate
  nested W1 catalogue read is removed.
- W1's current SQL statement scans each non-null system-catalogue ownership set
  once, rather than performing correlated scans for every consumer role. All
  predicates and current reads remain. [Thirty paired PostgreSQL reads and ten
  actual transactional drifts](owner-scan-equivalence.json) return identical
  results and refuse every drift; median time is 6.406 ms before, 4.998 ms after.
  All drift changes were rolled back.

[Negative object probes](object-boundaries.json) against actual issued source-host
objects reject copied facts, metadata and scope, a forged replacement client,
and inputs retained from a previous purpose. These are bounded forgery checks,
not exhaustive concurrency or production policy qualification. No applied SQL,
role permissions, five-second purposes, worker leases or settlement rules changed.

A baseline diagnostic generation made 5,479 worker queries, including 822 W1
catalogue statements. Its query-duration sum includes overlapping/background
work and instrumentation, so it is not an additive wall-time attribution. An
analogous Agent consumer ownership rewrite showed no measured benefit and was
discarded. The private traces and failed/usefulness observations are retained.

## Actual compiled browser operation

Copy 45 was restored from closed, pre-publication copy 42; copy 46 independently
restored its complete backup before the already reviewed 0238 operator wave.
No publication fingerprint or old run was rewritten. This qualifies **first
publication**, not the blocked existing-version shadow comparison. The labelled
fictional identity prerequisite and synthetic licence are not external identity,
passkey, counsel or production-provider acceptance.

The creator browser configured the same Maya source and rules, completed
ingestion and all six boundary evaluations, and published revision 14. A separate
fan browser completed disclosure and three requests. [Actual operation](operation.json):

| Request                                            | Accepted to first stored sentence | Accepted to terminal | Known cost (microdollars) | Settled units |
| -------------------------------------------------- | --------------------------------: | -------------------: | ------------------------: | ------------: |
| Short sourced drying question                      |                          19.372 s |             22.566 s |                     3,178 |             4 |
| Longer request that previously excluded its source |                          19.995 s |             23.489 s |                     4,080 |             5 |
| Missing guarantee and mechanism                    |                          20.339 s |             23.437 s |                     4,196 |             5 |

All three deliver one complete sentence. Twelve real provider calls complete
with known total cost **11,454 microdollars**, settled to 14 allowance units;
all three reservations are consumed. The last reply explicitly says the source
neither guarantees no cracking nor explains moisture loss, then faithfully
lists its recommendations. Citation navigation opens the exact 545-character
approved passage. Restart preserves the exact usage records and operation with
no provider replay; both compiled idle shutdowns exit zero.

For the longer request, [browser measurement](browser-timing.json) records
**1.101 s HTTP acknowledgement and 22.512 s until the useful answer is fully
visible**, above the composer (bubble bottom 463px, textarea top 536px, viewport
720px). Its [actual saved context](live-context-reproduction.json) needs 696
tokens; the old byte counter drops the passage, while revision 14 includes it.

These individual development observations do not meet the 300ms acknowledgement,
2.5s warm/4s cold useful-sentence or 8s completion targets. They are not a
controlled A/B or p95/p99 result. The first request's browser timing observer
missed the click; no browser latency is claimed for it. The second observer's
action-link marker was not a valid terminal signal and is explicitly excluded;
terminal timing above comes only from PostgreSQL. Earlier copy 43 fallback
refusals are not counted as useful-answer successes.

Screenshots and raw traces remain outside Git at
`/Users/yingpengwang/.codex/visualizations/2026/10/07/01a11784-60b1-7fe3-8855-82bddf4675b6/generation-latency-335/`.
Operator scripts, backups and detailed receipts are in its sibling
`conversation-commerce-completion/` directory. Credentials and provider receipts
remain in the private subdirectory.

## Validation, preservation and next gate

[Validation](validation.json): backend typecheck/standalone build, scoped lint
and formatting pass; 17 existing backend tests pass and nine existing PostgreSQL
suite cases remain skipped. Real database/browser operations above are separate.
[Final custody](final-custody.json) verifies 27 closed copies 19–46 (excluding
unused 30), all 658 original usage rows, the original archive's ledger/schema/
sequences/data and pre-existing roles. Earlier unknown-cost holds and failed runs
remain intact. Owned processes and Docker container are stopped; temporary
passwords/login, browser observers and test tabs are removed. Web source is unchanged.

PR #335 remains draft. The next performance work is to reduce recursive current
checks and row-lock windows through reviewed owner contracts, then qualify useful
streaming under defined cold/warm load. Existing creators additionally need the
real privacy-safe shadow feed and version-upgrade qualification; current code
correctly refuses stale pipeline fingerprints. This patch is not permission to
roll out the new fingerprint to existing published creators. Full in-flight
takeover/revocation, memory consent, uncertain-send retry and broader adversarial
grounding acceptance remain in the [project checkpoint](../../../../docs/operations/project-continuation-2026-10-07.md).

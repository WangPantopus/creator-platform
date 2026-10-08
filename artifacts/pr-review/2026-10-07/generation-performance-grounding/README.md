# Generation grounding and privilege-scan improvement

Continuation after #334 merged at `d165d3116f4534b0de25def09dc5160657a76294`.
This is an incremental grounding repair and measured database optimization.
**End-to-end latency remains outside the design targets.**

## Implementation

The output classifier now partitions the entire proposed sentence into exact
contiguous spans. Factual spans requiring evidence identify exact quotations from
the sentence's authorized citations and distinguish explicit support, faithful
paraphrase and unsupported inference. The server rejects incomplete sentence
coverage, missing required evidence, invented quotations, non-cited passage IDs
and unsupported relations. A plausible mechanism, benefit or stronger guarantee
is not support. Non-factual disclosures and refusals, including an acknowledgement
that no sourced answer is available, remain allowed. Existing companion-mode
policy remains in force. This strengthens the guard; semantic classification
still depends on the model and is not a proof of universal grounding.

Reply instructions preserve the same source limits and request a short first
sentence. Pipeline revision advances from 12 to 13 so earlier evaluation and
publication fingerprints cannot approve changed behavior.

Three Conversation custody queries first materialize relations with any effective
column access, then expand only their columns. They retain the same exact-column
allowlist and all other custody checks. Prepared plans are reused, never authority
results. Agent executable checks hash the same UTF-8 function definitions inside
PostgreSQL, avoiding full-body transfer. Existing migrations, role permissions,
call sites, five-second purposes, worker leases, journal and settlement rules are
unchanged.

## Actual operation

Separate creator and fan browsers used the approved fictional Maya scenario on
restored copy 39. Actual UI setup, source approval/indexing, style/rules, six-case
evaluation, first publication, processor disclosure and fan submission completed.
The labelled fictional identity prerequisite is the existing development setup;
external identity proof, passkeys and production licensing are not qualified.

[Operation receipt](operation.json): all six boundary cases pass. Two fan replies
complete with nine known provider calls, **7,473 microdollars total**. The first
settles 4,005 microdollars to five allowance units; the second settles 3,468 to
four. Both reservations are consumed; neither retains an unknown hold. Restart
preserves the exact provider records without replay.

The positive reply faithfully lists the source's plastic covering, periodic
turning and similar drying pace. The second reply explicitly says the source
neither guarantees no cracking nor explains plastic's effect on moisture loss.
The citation opens the exact approved 545-character passage. A separate Studio
probe also distinguishes the recommendation from the missing explanation and
guarantee: first approved 4,412 ms, pipeline 6,384 ms, 4,641 microdollars. Studio
preview timing is not full fan delivery timing.

An earlier six-case operation on copy 37 failed the unsupported-opinion case:
the first guard revision rejected a valid statement that the sources do not
provide the creator's opinion. The revised instructions explicitly recognize
that absence-of-source refusal. The failed operation remains in copy 37; it was
not rewritten as a pass.

Existing v1-to-v2 publication correctly remains blocked by the unconnected
privacy-safe shadow sample feed. Copy 39 was restored from the original
pre-publication copy 14 to qualify **first publication**, not to bypass that
upgrade gate. Reviewed 0235–0238 were applied by their original operator after
independent pre-wave backups/restores 40–42. No new migration is introduced here.

## Measurements

[Column-scan equivalence](column-scan-equivalence.json) uses 20 paired actual
PostgreSQL reads for each affected role. Mean times:

| Consumer | Original | Materialized relation filter |
| --- | ---: | ---: |
| Context | 7.64 ms | 3.33 ms |
| Output | 6.47 ms | 2.86 ms |
| Terminal output | 6.84 ms | 3.05 ms |

Returned effective privileges match exactly. Transactional direct-column,
table-wide, PUBLIC and inherited-grant probes produce the same changed results;
rollback restores the baseline. The SQL/Node definition hashes also match for
all 132 existing functions inspected. Earlier comparison-object and per-column
prefilter experiments were slower and were discarded.

These [first](fan39-timing.json) and [second](fan39b-timing.json) full fan runs use a
compiled backend, Next development mode, loopback PostgreSQL, real approved
provider calls and a 390×844 browser viewport. They are individual development
observations, not controlled A/B, p95/p99 or confirmed prefix-cache strata.

| Measurement | Sourced advice | Missing-explanation refusal | Design target |
| --- | ---: | ---: | ---: |
| HTTP acknowledgement | 1.158 s | 1.028 s | 0.300 s |
| Accepted state visible | 1.321 s | 1.189 s | — |
| First approved text fully visible | 28.575 s | 28.240 s | 2.5 s warm / 4 s cold |
| First useful answer fully visible | 39.087 s | 28.240 s | 2.5 s warm / 4 s cold |
| Terminal text visible | 45.232 s | 34.279 s | 8 s |

The first run initially displays only an AI disclosure; it must not be counted
as useful advice. Both replies remain above the composer (bubble bottom 587px,
input-row top 660px) without horizontal overflow. Brief connection/conceal
transitions still occur while authorization transactions hold rows. This is a
failed latency qualification despite the isolated column-scan improvement.

![Actual refusal to invent the missing source explanation](fan39b-grounding-refusal.png)

## Validation and custody

[Validation](validation.json): backend typecheck/standalone build, scoped lint
and formatting pass. All 17 existing backend tests pass; nine existing database
integration tests remain skipped. Real PostgreSQL and browser observations above
are separate from that suite. The final compiled host qualifies the current
catalogue, starts its owned worker, preserves provider records across restart and
exits zero on idle SIGTERM. No web implementation changed.

[Final custody](final-custody.json) verifies all 23 preserved copies 19–42
(excluding unused 30) are traffic-closed and keep the original 658 usage rows.
Original archive ledger/schema/sequences/data and pre-existing roles match the
baseline. Earlier unknown-cost holds remain reserved. Temporary passwords and
the temporary Growth login are removed. Browser observers and viewport overrides
were removed; private credentials, full dumps and traces remain outside Git.

## Next acceptance work

Reduce repeated current-catalogue work and the row-lock duration in the full
worker path, retaining fresh authority checks at each protected effect. The
observed Studio/full-path difference is a diagnostic lead, not an attribution of
every millisecond to SQL. Qualify continuous live delivery and a first useful
sentence, then measure defined cold/warm p95 and p99. Broader adversarial
grounding coverage and the real privacy-safe shadow feed are still needed before
upgrading published creators. All other release gates remain in the
[project checkpoint](../../../../docs/operations/project-continuation-2026-10-07.md).

# W3 context metadata custody — source repair, development

After personally auditing the actual current factory, W3 corrected its repeated rollback and discarded-cause paths in `generation-context.ts`. The actual checked-out source gets an error listener before BEGIN. A failed review, including a wrapped uncertain client response, closes that exact read-only source without further transaction SQL. A successful review attempts one awaited rollback; a failed rollback is never retried and the source is closed before release. Original review, transport, end and release failures stay in the private AggregateError under a bounded public 503. The in-transaction catalogue guard retains its original private cause for W1's actual transaction custody.

The fixed projection, original source hash, identity ownership, consumer registry, original task/authority checks and SQL are unchanged. No current readback creates a catalogue approval.

Actual shipping backend build, scoped ESLint, Prettier and whitespace checks pass. No new test code was written. Genuine factory/task execution remains unavailable until the actual reviewed worker graph, separate non-owner pool and combined metadata pins are provided; no stand-in issuer or borrowed owner probe qualifies this repair. No SQL/role/database, purpose, provider, export/delete or app success is claimed here.

At 2026-10-03 04:52 UTC, local main and all 22 active W3 branches were normally updated through actual fetched main `f6a2f39c0010918d6d2395cfd48c68bb75112268`; working refs were pushed without force. Frozen review bases and historical recovery refs retain their immutable pins. CI on each new head is a separate pending gate. Detailed branch receipts stay private.

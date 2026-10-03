# Held-client current-license rechecks

Studio read, publish, rollback and activation facts now pass their actual transaction client into the current-license verifier. This avoids a nested pool acquisition while retaining the stored-license lock and scope qualification.

A real creator_runtime pool limited to one connection failed the populated fictional Studio read before the fix (345 ms, acquisition timeout), then returned revision15 after the fix (39 ms). These are single samples, not p95. No provider calls or durable writes occurred. Existing backend checks passed18/18; T-11 kept10,000 pairs/30,000 queries/300,000 ms and completed in101,881 ms. Type, scoped lint and formatting pass. [Sanitized receipt](receipt.json).

Provider publish/rollback and genuine activation delivery remain unverified. The labeled development license is unreviewed; no production license or processor/retention approval is inferred.

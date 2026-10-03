# W1 personally operated publication transport — October3 UTC

Source: original publication pool/issuer cleanup following main integration
`c3742ab02df0a8228eb3d90a1cc9a5f705a0f763`. The implementation commit containing
this receipt is the source receipt. No publication worker or held purpose was
activated. No Actor, worker credential, signature, consent, business fixture or
provider outcome was created for these checks.

The primary personally operated the real owned PostgreSQL17 service and actual
`publicationTransaction`, with read-only work and bounded private response
relays. Thirteen recorded scenarios cover:

- In-flight SQL cancellation and settled rollback on the same reusable PID.
- Abort between statements, observed-source termination and already-aborted
  refusal; none reaches COMMIT.
- Unaffected read-only COMMIT with its actual receipt.
- Delayed actual BEGIN and COMMIT responses: no later rollback SQL, source
  discarded.
- Delayed discovery ROLLBACK response: one attempted rollback, no second
  rollback or later SQL, source discarded and no result returned.
- Delayed actual catalogue search-path response: neither savepoint restore nor
  release follows the read timeout; the private cause survives.
- Abort during delayed PID observation: original socket closes before any
  purpose callback, with no guessed backend.
- A delayed metadata read wrapped through DomainError/AggregateError/Error.cause:
  no later rollback or COMMIT; the public error's cause is non-enumerable.
- Real read-only catalogue preflight, successful discovery rollback receipt,
  and a real SQL error whose original cause survives one settled rollback.
- Occupied one-connection pool: queued abort settles its finite acquisition
  timeout, removes only its waiting checkout and preserves the original holder.

All scenarios pass. The first private run's assertion did not recognize the
nested catalogue cause; the assertion was corrected to inspect the actual
bounded cause graph, then the complete operation was rerun successfully.
Backend types, scoped lint and nine existing backend contracts also pass.

The closed source-review database retained connection limit0. Schema, business
data, roles, migration ledger, security/RLS and sequences were fingerprinted
before and after and remained identical. Relays and operator connections closed
normally. Private commands/logs/configuration remain outside Git.

This qualifies transport/cleanup mechanics. It does not qualify the genuine
208/213 whole owner graph, final signed publication, restoration/C10, or release
readiness. Owner callbacks that lose a transport cause still require correction.

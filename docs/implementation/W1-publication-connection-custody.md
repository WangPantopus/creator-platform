# Original publication connection custody

The separate publication issuer owns its original one-connection pool. It does
not use the interactive, generation or terminal pool. Acquisition and query
response budgets must each be finite, positive and at most five seconds;
pipelining is refused. The actual worker configures those budgets explicitly.

`publicationTransaction` installs the source error listener and optional abort
listener before observing the PID. An early abort closes that exact source;
it never guesses a PID. Later cancellation uses a separate bounded connection
with the original pool configuration and the observed PID. The source remains
checked out until cancellation settles. Cancellation grants no purpose right.

The helper owns BEGIN and one fixed settlement. Preflight and discovery return
only after a real ROLLBACK receipt. Each discovery candidate has its own
transaction, so unrelated original-family negative locks do not accumulate.
Only an ordinary denied candidate whose rollback settled can be skipped.
Preparation is never committed by discovery.

Publication retains the genuine208 client, private nonce/token, PID/full XID,
original task/command and earliest deadline. All actual restoration, catalogue,
owner and signature bookends still precede `finish_prepared_publication`.
The JS binding is invalidated before that finalizer and on every exit. After
successful finalization the helper submits only COMMIT and checks its receipt.

An uncertain PID, BEGIN, settlement, source error or private nested query read
timeout closes the original non-pipelined source without later SQL. Ordinary
work errors receive one rollback; rollback failure never triggers another.
Closing is awaited before discard/release, which occurs once. Private causes
and cleanup failures are retained through standard non-enumerable Error.cause.
The catalogue helper restores/releases its savepoint only after a successful
read; its failure escapes to this original custodian.

This is connection cleanup, not reviewed purpose activation, whole publication
graph qualification or positive signed publication acceptance. Owner callbacks
must also retain their real transport causes. Actual213/current combined
catalogue and C10 gates remain separate. See the [operated transport receipt](../../artifacts/workstreams/W1/resume/2026-10-03-publication-custody/run.md).

# Original ingestion client settlement — October 3, 2026

Personally read the complete0062 worker SQL, actual discovery/wakeup family
contracts, Trust media_worker_denial callback and shipping ingestion pool.
The worker's original transaction unconditionally queued ROLLBACK/released its
client after any failure, including an unknown query or commit. The thread
worker also retained an optional interactive ThreadScope fallback. These are
source findings; no fault invocation is claimed during the Docker outage.

MediaWorkerDatabase now reuses unchanged main ContentHeldClient and exact W5
28c133d7 wrapped-cancellation classifier (file SHA256
`344f5ed6a840adce8ccca6382e91883dc83ccee23dcdcd9b6644f95b5a2f4a69`).
The actual pool must have finite positive checkout at most5seconds/no pipeline.
Original received BEGIN, shorter existing statement/lock/idle timeouts, original
family GUC/Trust denial and directly awaited work precede sole received COMMIT.
Unknown response/cancellation closes/discards that same client and retains
private causes; known refusals retain rollback. The45second transport budget
does not issue authority, extend a job lease, bound arbitrary external callbacks
or prove immediate server cancellation. Work is never abandoned by a whole-
callback timeout race.

Thread MediaWorker requires the dedicated ingestion transaction and original
discovery family. Its production composition passes that mandatory callback;
there is no interactive ThreadScope path. Creator processing, scanner/parser/
credential code, row claims/tokens/leases and actual revocation/deletion rules
are unchanged. No Actor, customer session, publication scope, task shape,
retention policy, SQL, role membership or registry activation is invented.

Current backend types, four-path lint/format/diff checks and nine unchanged
backend contracts pass. Nine PostgreSQL integration cases skip because their
actual database is absent; skipped is not pass. No new tests or coverage work.
Shipping compilation, real ingestion/cancellation/unknown-settlement, retry,
scan/processing/revoke/deletion and privacy/C10 acceptance remain pending.
No W6 runtime/device/browser/DB transaction started; canonical61 and the closed
upgrade target remain preserved. W8 owns coordinated Docker recovery.

The separate browser discard branch da4d13e3 follows305 and has its own exact
successful shipping build; none of that evidence qualifies this backend path.
All W6 packages remain incomplete.

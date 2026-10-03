# Original Content export client settlement

Personally implemented source `643d1257990619e6f19251491f7b05934cbf8863`
and actual transaction-command receipt correction
`76a7d63523f48104e3db845ae77487e1373ead12`, including captured main
`67cb1ec0f8e0c9c3963334cfe10e79c2ba7caa09`. Backend types, scoped lint,
Prettier and diff checks pass. The initial inline query configuration was
rejected by installed pg's declaration; its supported per-query read deadline
is now expressed as a structural QueryConfig extension. The repeated checks
pass. No new tests, SQL source/checksum, role grant, task or activation.

Content export formerly released an aborted client immediately, queued rollback
after uncertain transaction controls and swallowed cleanup failures. The
original pool must now have a bounded1–5000ms checkout. Original non-pipelined
client custody retains error/abort listeners until settlement; rollback or
socket close is awaited before release. BEGIN, COMMIT and rollback responses
have1500ms deadlines. Preparation has a6s metadata deadline; the real supplied
task signal remains mandatory and an internal45s operation bound cannot issue
authority. An uncertain BEGIN/COMMIT or privately wrapped transport/read failure
closes/discards without later SQL. The actual command receipts are required;
a server ROLLBACK response cannot attest COMMIT. Cleanup failure retains the
original and cleanup causes; catalogue refusals keep nonenumerable private
causes. No public error transport exposes them.

The genuine W8 supplied authority still receives the original input and exact
held client before body reads and before the separate COMMIT. Original0198
catalogue/custody, job/lease/idempotency/ownership checks, bounded projections
and the final deferred Content/W8 gates remain. No replacement actor, task,
owned-ID list, fake callback, signature or export receipt was introduced.

## Personal real PostgreSQL operations

At exact final source76a7d635, W5 personally ran ordinary transaction/transport
primitives on its actual owned canonical61 database as creator_runtime. No
business rows, private scope, marker table, task or purpose were manufactured.
The operator calls the actual production helper; its wrappers observe actual
queries/end/release without substituting results. Transparent owned loopback
relays forward real PostgreSQL authentication and queries and withhold selected
actual server replies. No database response is fabricated.

- A confirmed BEGIN/SELECT1/COMMIT reused the healthy original client.
- An actual22012 server error awaited ROLLBACK before healthy reuse.
- An actual aborted transaction returned ROLLBACK to COMMIT; the helper refused
  content_privacy_commit_unavailable and discarded that client.
- An actual2ms driver read timeout and actual signal abort during pg_sleep
  awaited source close before discard; fresh checkouts had different healthy
  backend PIDs. The old backends were still present immediately after local
  close and absent on a later independent read. This does not attest immediate
  server cancellation or any completed privacy effect.
- Actual withheld BEGIN/COMMIT/ROLLBACK replies timed out at about1500ms. No
  later original source SQL ran. Close settled before discard/release and the
  fresh clients were healthy. Rollback failure retained both22012 and the real
  read timeout. Only ordinary primitive transactions committed.
- Withholding99 bytes of the actual first export-catalogue reply produced the
  bounded503 refusal with its real Query read timeout cause, nonenumerable.
  The source closed before release; a fresh client was healthy.
- Ordinary ContentPrivacyExport.prepare on unactivated canonical61 refused
  content_privacy_purpose_unavailable. No export object/task/receipt was issued.

Earlier643d1257 operations and a repeat atd95c6b50 remain separately private.
The final routine JSON/traces and operator source are0600 under /private/tmp/
as w5-content-cleanup-final._, w5-content-cleanup-643d1257_ and
w5-content-cleanup-operator.mts. Initial root pg import failure ran no operation;
the corrected workspace dependency supplied the actual runs. Relays and pools
were normally closed. The ledger remains61;0198/0214/0219 are absent.

Implemented/runnable: original-client settlement and existing source checks.
Integrated: Content export's original guarded source path; the unactivated
purpose correctly refuses on the owned backend database.
Verified: named real cleanup/transport primitives and catalogue refusal only.
Genuine complete export, task/lease/recovery races, actual source retraction,
finite C10 detachment, all owner composition and three-client private acceptance
remain open. No later source inherits these observations. Release-ready: false;
all nine original W5 packages remain assigned.

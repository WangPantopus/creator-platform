# W3 complete conversation privacy cursor

The original streaming exporter used REPEATABLE READ while the real W8
`0087` task fence and held restoration require READ COMMITTED. Replacing its
isolation level alone would give independently changing pages and families.
No reviewed one-family coordinator decomposition exists.

W8 reserved the distinct held `0206_w3_privacy_cursor_export` for
`apps/backend/src/modules/conversation/migrations/pending_w3_privacy_cursor_export.sql`.
It creates isolated NOLOGIN/NOINHERIT `creator_w3_privacy_export`, fixed export
functions and a private transaction binding. Original pair/runtime policies,
the immutable0087 functions and their private ACL remain unchanged. This is
export-only source; it grants no deletion, provider, signing or interactive
authority and is not registered or applied by W3.

The purpose reads the real verified export job and original running conversation
task/token/lease. It independently selects all families from the current fan
identity and the original verified account's immutable creator-ownership
snapshot. It locks the actual job/task, ownership and existing thread rows.
The private scope binds caller login, actual backendPID/fullXID, original job,
token, verification/ownership and complete family set. A changed identity,
family, lease, database marker or role refuses further work. The coordinator's
actual held restoration/0087 checks remain mandatory around every operation;
knowing IDs never creates a job, receipt or scope.

One `NO SCROLL CURSOR WITHOUT HOLD` SELECT covers each family header and all17
original collections: five W2 accounting collections, two lineage collections,
recording associations, and nine existing W3 collections. The source is STABLE
SECURITY DEFINER with a fixed search path and projections; no per-row pair-GUC
authorization or optimizer ordering is used. PostgreSQL documents
[insensitive cursors](https://www.postgresql.org/docs/17/sql-declare.html) and
[STABLE function snapshots](https://www.postgresql.org/docs/17/xfunc-volatility.html).
The runtime contract requires live owner review and a genuine leased-job
operation to qualify this composition; parsing or these references alone do
not prove its positive result.

The prepared reader requires real prepared W2 journal/usage-retention and W3
lineage/recording instances on the canonical pool. Independently reviewed
SQL, function-definition and effective catalogue hashes are mandatory. It
rechecks current roles, ACL, columns, visibility, schemas, executables and
owner installations on the same held client. Factory qualification opens and
rolls back a bounded read-only transaction; it never manufactures a task.
W8's actual `createPrivacyConsumers` supplies its own conversation authority,
then prepares the reader from real owner ports. The host carries only those
prepared owner inputs and review metadata; no database-derived self-approval
or fallback adapter is supplied.

The stream uses READ COMMITTED and fetches16 source rows at a time. Actual
W8 restoration/task checks and the isolated purpose's current binding bookend
each FETCH, including a mandatory empty EOF fetch after any short page.
The complete schema2 shape preserves empty arrays, original source counts,
accounting hash/bytes and canonical nine-authorship labels. It verifies every
original family header and strict collection/key order. One pending64KiB
chunk provides backpressure to W8's protected encrypted storage; no plaintext
artifact sink is added.

Source JSON is read as text, preserving64-bit accounting and nested event
numbers without JavaScript rounding. Only the fixed32-bit message projection
is parsed to add its canonical authorship label; source text/authority is never
invented.

After genuine EOF, the cursor closes, current custody is checked again and the
actual W8 final fence immediately precedes a separate COMMIT. The purpose's
deferred trigger independently checks current original job/lease/family binding
at that COMMIT and removes its private scope. Cancellation destroys the held
client once. Failed rollback never returns uncertain custody to the pool.
Only fully consumed chunks, actual successful COMMIT and a current task permit
`finish()` to attest source exhaustion.

The existing100-family,1GiB and45-second bounds refuse oversized/slow work;
they do not truncate or invent coordinator subjobs. A SQL set-returning function
and sort may use PostgreSQL executor memory/temporary storage;16-row FETCH
bounds application pages, not total database working storage. W2's complete
accounting projection rejects future unreviewed columns. Changes require a
new owner review.

Held source remains unavailable until W8/W2 closed review, registered actual
prerequisites, independent install/catalogue receipts, real current owner
composition and personally operated positive/negative leased-job verification.
No real export, retention, deletion, native acceptance or completion of W3 is
inferred from this implementation. No new test code is included.

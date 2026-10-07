# Content export source and private-scope ownership

The original Content export preparation checked installed ledger metadata but
did not require executable source registration. It also rejected every relation
owned by its private role except the scope table. PostgreSQL automatically gives
that role the scope's primary-key index, TOAST table and TOAST index, so the exact
source-created catalogue could not pass that ownership check.

The runtime now requires the exact reviewed W5 owner, SQL path, source checksum
and executable version at preparation and both export bookends. A reserved or
hand-installed migration cannot activate it. The ownership predicate admits only
the original private scope, its exact primary key, and its attached TOAST storage
and single unique index. Primary and TOAST index shape/validity are checked;
unrelated owned tables/indexes remain forbidden. The unchanged metadata checker
is also available through an explicit operator-only static review method, which
issues no exporter or task authority. No SQL, migration reservation or grant
changed.

Actual closed review executed the immutable 0198 source and its matching ledger
entry only inside rolled-back transactions on the recovered original100 copy
and its independent restore. The earlier ownership failure was reproduced and
attributed to the exact automatic index/TOAST objects. The repaired complete
catalogue passed. On the restored copy, eighteen actual metadata changes each
refused, then passed again after restoring the original state:

- Purpose LOGIN, INHERIT and membership.
- Extra owned table and extra owned index.
- Core access to the private scope or private trigger function; an extra private
  usage-column grant; a missing required Content-column grant.
- Disabled RLS, removed FORCE RLS, missing primary key, extra private-scope column
  or constraint, and a disabled deferred commit trigger.
- Changed executable COST, an unknown source column and interactive session
  context.

Both full review transactions rolled back with all six original custody digests
unchanged. No exporter, lease or privacy result was manufactured. Installing the
extra source also changes the complete generation catalogue's relation list;
its existing pins remain unchanged and do not accept this unregistered addition.
Full composed-source review and activation are still required.

A separate real core-role password connection refused reserved executable source
registration before any catalogue SQL. The actual pool remained usable. The
owner-controlled restored marker stayed closed, the bounded connection window
was reclosed, the original null password was restored, and all six custodies
remained identical. The backend shipping build under the shared W2 lock, scoped
ESLint/Prettier and seventeen existing contract/worker tests passed. No new test
code was added. Raw diagnostics and records remain private.

## Independent main review

Main-based source `a6f70276` was separately operated against the retained
canonical61 backup restore. Its exact immutable source catalogue passed; all
eighteen metadata drifts refused and restored, and the full review transaction
rolled back with all six original custodies equal. A separate actual core-role
password pool refused unregistered source preparation before catalogue reads
and remained usable. The original null password and closed connection limit
were restored. The main shipping build, nine existing contract tests, scoped
lint/format and diff checks passed. No migration activation or export result
is claimed. Exact-head CI and normal merge disposition are recorded in the PR.

# W6 verification of W8's first migration wave

Personally executed on W6's owned PostgreSQL17 cluster. This is labelled synthetic local migration verification, not original production recovery or application acceptance.

All57 SQL hashes match W8's exact `58b59fa0` packet. The40 baseline files were actually applied to a new owned database and the labelled administrative W6 creator/fan/proof/thread seed was committed. A private custom-format backup (535211bytes) was independently restored into another owned database. Actual ledger, catalog and business-data digests matched before rollout.

W8's unchanged `activate-wave.ts` was then run on the named baseline target, with its actual closure comment, connection limit0, no other clients and fresh private restore manifest. Its one-transaction upgrade preserved all40 original version/checksum/timestamp records, four actual stored synthetic seed rows across145 original tables, and old role attributes/memberships. It applied17 new canonical entries through0062, for57 total.

A separate empty database was installed with the actual default `migrate-trust.ts` runner. Catalog capture repeated **inside actual transactions** on both databases produced the same SHA256 `fc7b456d1b7d45cf6b11d67e26b1e446feb86c01a19f8eacc53cbf2ec1649b97`. The adjacent receipt contains hashes and counts only; private backups/manifests/credentials and raw row content remain outside Git with0600/0700 permissions.

The previous human-media database was separately preserved in a private784837-byte snapshot. Its manually applied, unregistered reserved history is not adopted or rewritten. This fresh baseline upgrade does not establish that historical database's migration custody.

The upgraded target remains traffic closed with connection limit0. The independently fresh database will be used for subsequent actual app verification after explicit local configuration. Publication-purpose0071/0073/0074/0075/0076 remain outside this wave, so background media publication is not accepted. All18 existing backend checks passed (nine real PostgreSQL integration cases and nine authority/delivery cases), including10,000 scoped isolation pairs. They used a separate owned disposable fixture cluster, preserving the retained W6 runtime credential; that fixture container was stopped immediately afterward. No new unit tests were written.

The newer W8 `a71994f5` metadata-only role guard was personally executed inside held transactions on both candidate databases while the W6 API was stopped. Both passed: three purpose roles, seven pinned SECURITY DEFINER functions and82 allowed grants. No migration was replayed and no ledger history changed. The upgraded target remains closed.

Actual web owner sign-in and two repeated-DST window saves ran against the independently fresh57 database (availability version1). During the API stop, Studio concealed private controls and offered reconnection. On restart at source `598eec6c`, it automatically restored both saved windows, including09:30Z; the reconnect button had already disappeared, so no successful button click is claimed. Adjacent screenshots preserve actual saved/recovered UI.

The separate purpose publication worker was launched against that real57 database and refused `publication_schema_unconfigured`. Actual administrative readback found57 ledger rows, none of the five future publication entries and zero published content rows. This is an honest unavailable path, not successful publication.

W8's exact `064fa55e` PUBLIC-capability guard was then personally run inside held transactions on both fresh57 and the traffic-closed upgrade. Both passed:3roles,7pinned functions,82direct grants,327allowed PUBLIC capabilities and23pinned PUBLIC functions. `public-role-audit.json` preserves the metadata-only receipt. No SQL replay or ledger rewrite occurred. All18 original backend checks were repeated successfully in73.14seconds, including the unchanged10,000-pair/1,000-thread isolation case. The initial repeat pointed at a nonexistent fixture database and failed setup; the corrected actual fixture database passed. The separate fixture container was stopped afterward.

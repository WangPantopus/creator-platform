# W6 verification of W8's first migration wave

Personally executed on W6's owned PostgreSQL17 cluster. This is labelled synthetic local migration verification, not original production recovery or application acceptance.

All57 SQL hashes match W8's exact `58b59fa0` packet. The40 baseline files were actually applied to a new owned database and the labelled administrative W6 creator/fan/proof/thread seed was committed. A private custom-format backup (535211bytes) was independently restored into another owned database. Actual ledger, catalog and business-data digests matched before rollout.

W8's unchanged `activate-wave.ts` was then run on the named baseline target, with its actual closure comment, connection limit0, no other clients and fresh private restore manifest. Its one-transaction upgrade preserved all40 original version/checksum/timestamp records, four actual stored synthetic seed rows across145 original tables, and old role attributes/memberships. It applied17 new canonical entries through0062, for57 total.

A separate empty database was installed with the actual default `migrate-trust.ts` runner. Catalog capture repeated **inside actual transactions** on both databases produced the same SHA256 `fc7b456d1b7d45cf6b11d67e26b1e446feb86c01a19f8eacc53cbf2ec1649b97`. The adjacent receipt contains hashes and counts only; private backups/manifests/credentials and raw row content remain outside Git with0600/0700 permissions.

The previous human-media database was separately preserved in a private784837-byte snapshot. Its manually applied, unregistered reserved history is not adopted or rewritten. This fresh baseline upgrade does not establish that historical database's migration custody.

The upgraded target remains traffic closed with connection limit0. The independently fresh database will be used for subsequent actual app verification after explicit local configuration. Publication-purpose0071/0073/0074/0075/0076 remain outside this wave, so background media publication is not accepted. All18 existing backend checks passed (nine real PostgreSQL integration cases and nine authority/delivery cases), including10,000 scoped isolation pairs. They used a separate owned disposable fixture cluster, preserving the retained W6 runtime credential; that fixture container was stopped immediately afterward. No new unit tests were written.

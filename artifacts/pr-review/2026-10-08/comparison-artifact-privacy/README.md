# Comparison artifact privacy — October 8, 2026

This pending source increment includes saved-artifact provenance in Trust's own
privacy lifecycle and repairs the interaction between export completion and
account deletion. It remains unregistered and uncomposed. No original app
migration, request, clock, publication or provider receipt was changed. No new
unit tests were added.

## Behavior

The original held Agent/Conversation export capture derives private source-family
metadata before reading its stream. Conversation includes all of its original
families; Agent includes the original comparison-source families. Creator ownership
also finds derived artifacts in another account's export. NULL provenance means
unreviewed legacy data; it is never backfilled with an invented empty source set.

Trust uses its original 0103 current-client/transaction task scope. Export projects
only the requester's source-family identifiers and own request IDs, excluding other
fans, private file references and lease/purge tokens. Deletion waits for the actual
Agent and Conversation deletion tasks to finish, revokes matching captures, exhausts
a fresh private-file inventory, recovers original attempts under their own task
locks, and removes exact sealed artifacts before erasing their private mappings.
The bounded background inventory cannot supply EOF. Cancellation does not count
as exhaustion. A current or unreviewed attempt remains pending; no success is
acknowledged. Pending batches commit only their removal progress and retry under
an original new lease. Each page deletes at most 20 provenance records; inventory
and inline export refuse more than 2,000 records pending a larger subjob design.

Clearing an already-completed export's data now requires the genuine held account
deletion, completed source dependencies and finished artifact deletion. An immediate
guard sees the private scope before 0103's deferred trigger erases it. Positive
export completion retains its original deferred exact-manifest check. Actual
COMMIT still rechecks the original wall-clock task lease.

The original 0103 SQL bytes remain unchanged. Its reader extension is allowed only
with the additive registered source, exact scope policy/ACL and independently
captured complete artifact catalogue. Growth reads that catalogue through public
PostgreSQL metadata, without new source schema/data privileges.

New pending SQL SHA-256:
`3633aace4fec87335582f8cb85b3cd1b87a4d03d526427612821769970eb3e01`.
All four preceding pending source files remain unchanged.

## Operated evidence

[Schema application](schema-application-09.json) creates fresh isolated database
`creator_comparison_artifact09_20261008` from the preserved 105-entry schema-only
baseline. Databases 05–08, all applied source copies and earlier failures remain
preserved. This graph contains synthetic actors and source/dependency records;
it is not the active app database and does not prove mature deletion.

All six [SQL/filesystem cases](privacy-operation-09.json) pass: private derived
mapping, own-only projection, refused unheld clearing/incomplete dependency,
actual file and mapping removal with original COMMIT clearing, expired original
lease refusal, and cancelled scan followed by a fresh full inventory. Original
source EOF/COMMIT, actual file bytes and real elapsed time were used; dependency
completion rows are explicitly synthetic source-review fixtures.

[Trust metadata preparation](preparation-operation-09.json) captures 18 functions,
one provenance table, nine relevant triggers and 68 dependencies. Three search
paths yield the same digest and are restored. Runtime preparation correctly
refuses unregistered sources. The initial Growth metadata inspection failed with
42501 because name resolution required schema usage. The lookup was corrected
to read PostgreSQL catalogue names; [Growth's fresh inspection](growth-preparation-operation-09.json)
now yields the identical digest with no new data privileges. The failed script
and database state remain preserved outside the repository.

Complete catalogue digest:
`058a0dcdc52b7e6b969e6b27074a632173332ec45630a3a49c5e7af09153d175`.
Private scripts, full catalogues and synthetic file markers remain at
`/Users/yingpengwang/.codex/visualizations/2026/10/08/01a11aa9-c32c-7821-bcaf-6675731d1ad9/comparison-artifact-review`.
Backend TypeScript, scoped lint/format, diff checks and the shipping build pass.

## Preserved actual app and remaining work

The actual backend remains compiled `5bd6b6215` on copy43/57304; web remains3119.
No host or original database was restarted for this source-only operation. The
original creator export61e07c91 and fan exportf6a7410b, their actual downloads,
18 generations and69 usage rows retain the preceding milestone's custody evidence.
Both native devices remain stopped with state preserved. This increment adds no
new browser/iOS/Android acceptance claim.

PR342 merged at `d89a2ef024bf96ec6ea8af08d9688364a41a2c6f` with all11 reviewed-head
checks passing. PR343 now targets main; refresh its remaining check before merging.
PR341's separate main workflow37791912750 passed. PR340's main workflow37790196313
was cancelled after the next main update; its11 reviewed-head checks passed, but
it has no completed independent main result. PR342 main workflow37795287433 was
still queued at this observation.

Before activation, finish original comparison read/provider admission and genuine
consent/sanitization, review legacy exports and the complete executable/restore
graph, compose the prepared owners and verify compiled end-to-end cancellation,
recovery and deletion. The original missing-feed and Agent comparison-export gates
remain. All ten milestones in the complete product finish plan remain open.

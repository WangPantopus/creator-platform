# Comparison export scope and legacy expiry — October 8, 2026

Privacy deletion previously waited on every unfinished export in the protected
store, including unrelated live exports. The original held Trust task can now
exclude a known, immutable source capture outside its own deletion scope. Unknown
or missing mapping remains relevant; callers cannot manufacture an empty source
set. Full inventory, source-domain completion and the original COMMIT fence remain
required.

A completed pre-activation export without comparison mapping may be removed only
when its exact original task manifest proves that its finite expiry has passed.
The worker retains the original task lock through physical file removal and
acknowledgment. An unexpired legacy stream stays pending. File age, caller-supplied
cutoffs and review time are not expiry authority. The task receipt and durable
removal marker survive idempotent cleanup.

## Operated evidence

- [Six isolated cases](scope-operation-21.json) use real PostgreSQL scopes and
  actual protected files. They cover unrelated live capture, unknown mapping,
  wrong purpose/actor, unexpired legacy preservation, real elapsed expiry,
  physical removal/retry and mismatched manifest refusal. Actors, manifests and
  source-domain completion receipts are explicitly synthetic; no original clock
  or original user file was edited. No mature deletion or provider acceptance is
  claimed.
- [Reserved numbered graph22](schema-application-22.json) adds0246 to the seven
  preserved copies. [Full catalogue review](combined-catalogue-observation-22.json)
  retains every old purpose's permissions on existing relations. Reader/privacy
  and all seven original runtime profiles are unchanged. The complete schema and
  artifact profiles change for the intended function addition/replacement. The
  Conversation cursor's metadata adds exactly the new non-executable function;
  every old function entry and other cursor field is unchanged.
- [Full dump/restore23](combined-restore-23.json) passes [complete metadata
  equality](combined-catalogue-restore-observation-23.json), both without and with
  the isolated incoming Growth role. [All six operations also pass on the actual
  restored graph](scope-operation-23.json). [Full source hashes](metadata-evidence-index.json).
- [Build, existing suite and source checks](validation.json) pass. No new unit
  tests were added. PostgreSQL cases in the existing suite lack their separate
  configured database and are skipped; the isolated operations above are separate.

## Preserved application and next work

The actual database remains at106 executable sources; all eight comparison copies
are reserved only. The compiled application still runs b93e5d7c2 with the existing
web flow and original18 generations/69 usage records. No live export, consent,
publication fingerprint or historical clock was changed by this increment.
Legacy downloads remain denied after future comparison activation until a new
source-bound export is made; live unmapped attempts can still delay deletion.
There is no positive provenance backfill and no claim that denied reads erase data.

A [read-only actual baseline comparison](actual-baseline43-purpose-comparison.json)
found ten explicit private-owner ACL representations and the actual incoming
Growth role name that differ from the schema-only isolated review. All other
metadata and existing purpose permissions match. These observations are preserved,
not accepted automatically as new execution profiles. The next step is the exact
migration wave and independent closed, populated original restore review, including
owner ACL/membership representation and old runtime preparation. Then operate
actual comparison choice, sanitization, withdrawal/export and the preserved
revision13 upgrade in web, iOS and Android. All ten product finish milestones remain.

PR346 merged at6e2201f64 with all eleven exact-head checks passing. PR347 now targets
main atf9a25ba09 and remains in validation. PR345's main Android job lost hosted-runner
communication; its failed job was rerun. That rerun superseded/cancelled PR346's
separate main run37819217990; neither cancelled run is recorded as a pass.

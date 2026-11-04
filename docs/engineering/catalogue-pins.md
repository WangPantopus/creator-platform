# Lane 2: the pinned catalogues (WP 2.9)

Moved here in Wave 5. The procedure and the commands still apply, for whoever registers a migration
([migrations](migrations.md#registering-a-file-today)); the measurements, the counts, the scenario
results and the tickets are from 2026-10-09. Three details have changed since:

- for a new wave, the pin script `apps/backend/scripts/wave-pins.ts` (#538) runs most of
  [the procedure](#the-procedure-when-a-migration-adds-removes-or-changes-a-relation), which says
  which steps are still by hand;
- the tool reads the newest review file, which on 2026-11-03 is `20261103-ops-console.json`, not
  `20261008-comparison.json`;
- CI does not run `check` yet ([what CI checks](migrations.md#what-ci-checks)).

Updated: 2026-10-09, by the lane 2 session
Pull request: `lane-2/catalogue-pins`, stacked on `lane-2/production-root` (which is stacked on `lane-2/stack-from-scratch`)
Scenario: E2.9 ★, re-run with `node infra/local/stack.mjs up --lane 2 --no-web --no-smoke` and then
`node tests/scenarios/lane-2/e2-9-catalogue-regeneration.mjs`

## In plain words

Before the product exports a fan's data, lets the AI reply, or lets the migration operator run, it checks
that what its database roles can reach is exactly what was reviewed. The reviewed state is written down as
fingerprints in one file. Every fingerprint covers a list of **every table in the database**, so adding any
table, even one nothing uses, changes all of them. Until they are regenerated and reviewed the product refuses.

This adds a tool that recomputes the fingerprints from a real database, a check that fails loudly when someone
forgot, a way to see what a migration changed before accepting new fingerprints, and the checklist below.

## What I measured

All on a real PostgreSQL 17 stack built from nothing by `infra/local/stack.mjs`, with one empty unrelated table
added by hand to stand in for a migration (a registered migration that adds a relation has the same effect).

| Question                                         | Answer                                                                                                                                                                                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the tool compute what the product computes? | Yes. On the freshly built database **45 of 45 pin groups (50 pinned digests) reproduce exactly**, so the tool is validated against the reviewers' own values before it is trusted to write any                                                |
| What does one new table do?                      | **0 of 45 pin groups match.** Export: commerce, content, identity and media are blocked (`privacy_original_family_unavailable`), trust retries. The reply worker reports `generation_terminal_discovery_unconfigured`, so AI replies stop too |
| Does the running backend notice?                 | Yes, within about a minute (the usage-expiry worker idles 60 s between checks): every fan message then gets **403 `privacy_consumers_unregistered`** until the backend is restarted                                                           |
| Does a restart fix it?                           | No. A backend started against that database with the committed pins **does not start**: `comparison_artifact_custody_changed` ("Current comparison artifact custody must match independent review.")                                          |
| Does regenerating fix it?                        | Yes. `write` changes exactly one tracked file, 45 lines; after a restart the five export domains that can complete here complete again in about 20 to 30 seconds, and fan messages are accepted                                               |

## The procedure when a migration adds, removes or changes a relation

Nothing here edits `infra/migrations.json`. For a new wave, `apps/backend/scripts/wave-pins.ts` runs the
mechanical steps on a marked scratch database ([migrations, step 4](migrations.md#registering-a-file-today)):
`wave-pins apply` does steps 1 and 2 and prints the diff in step 3, and `wave-pins write` does step 4 and ends
with the comparison in step 5. Still by hand: the reach review in step 3, the backend checks in step 5, and step 6.

1. **Before applying**, on a database at the current head: `snapshot --out before.json`. `wave-pins apply` takes
   it against the previous head's review and keeps it in its `--out` folder.
2. Apply the migration to that same database (a scratch one; never a shared or preserved one). `wave-pins apply`
   applies the wave's sources in one transaction, as `activate-wave` does. It refuses a URL that isn't a plain
   loopback one, a database without the scratch marker, and a database that doesn't hold exactly the wave's
   baseline.
3. `check` fails and names the groups. `diff --base before.json` says what changed (`wave-pins apply` prints it):
   - _Only relations were added or removed and no purpose role's reach changed_: regenerating is mechanical.
   - _A purpose role gained or lost access to something_: **stop and review each line against the migration.**
     The pins exist to make exactly this visible. Do not regenerate over a reach change nobody intended.
4. `write --base before.json` rewrites only the digests that changed, in place, keeping the file's formatting:
   one changed line per digest in `git diff`. For a new wave, `wave-pins write` first creates the wave's review
   from the previous one, with the new sources, the previous packet's checksum and the scope sentence, and keeps
   any pin that didn't match the database before the wave (with Growth, `runtimeCatalogues.family`). Review it
   with `git diff --no-index <previous review> <new review>`: besides those three, one changed line per digest.
5. Restart a backend on the new file (the product reads the file when it starts). Run an export (E2.9 does) and
   send a message. Run `check`: it must exit 0. `wave-pins write` ends with the same comparison on its database;
   only a pin that didn't match before the wave may still differ there.
6. Commit the regenerated review file in the same pull request as the migration, and pin it in
   `infra/migrations/reviewed.json`. In CI, run `check` against a database built from the branch
   (`infra/local/stack.mjs up --db-only` builds one); a forgotten regeneration then fails the build instead of a
   deploy.

Two things to know before merging a migration:

- **Deploy the migration and the new pins together.** A backend that is already running keeps working until the
  next catalogue read, then refuses (export, replies) and stops accepting fan messages until it is restarted. A
  backend that is _started_ against a database whose relations are newer than its pins does not start at all.
- **The other reviewed variants are not regenerated.** `purposeProfiles` lists four reviewed forms of the same
  graph (fresh, restored populated, each with and without the Growth API login), and `originalFamilyProfiles` and the
  provenance-purge pin list two. The tool replaces only the variant that applies to the database it ran on (the one
  that matched in the snapshot). The others describe databases that must be qualified on their own, with the restore
  ceremony, before they can be trusted again; until then a restored populated database will refuse.
  `wave-pins write --variant` measures a populated variant on a restored copy
  ([migrations](migrations.md#registering-a-file-today)).

## The commands

`cd apps/backend && node --import tsx src/operations/catalogues/catalogue-pins.ts <command> --database-url URL`
(or `node infra/local/stack.mjs catalogues <command> --lane N` for a local stack). Read-only against the database.

| Command                           | What it does                                                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check`                           | Recomputes every pinned digest and compares. Exit 0 if all match, 1 if any differ or any pin is unknown to the tool, 3 if the database is unreachable or not at the state the review describes |
| `snapshot --out FILE`             | Writes what every purpose role reaches, relation by relation, and which pinned alternative each group matched (under 1 MB). Keep it outside git                                                |
| `diff --base FILE`                | Says which relations came and went, which purpose roles' reach changed, and which pin groups changed                                                                                           |
| `write [--base FILE] [--dry-run]` | Puts the live digests into the review file. Refuses if a pin cannot be recomputed or if it cannot tell which alternative to replace (`--variant LABEL` decides)                                |

## What it covers

It reads the **newest review file** (`infra/migrations/reviews/20261008-comparison.json`, the head profile) and
calls the product's own exported "operator metadata" functions, so it cannot drift from what the product checks:
28 per-role catalogues, the export role, seven runtime catalogues (detached usage, accounting boundary, expiry,
original privacy family, safety terminal, output cursor, terminal discovery), the public reader, the output writer,
the conversation cursor, the provenance purge (both forms), three comparison catalogues, and the two lists of
reviewed alternatives. Digests of immutable text (SQL source checksums, function definitions) are known and left alone.

An unknown pinned digest makes `check` fail, so a future review key cannot be silently skipped.

**Not covered:**

- Older review files. They pin older states and apply only to databases still at those states.
- Catalogue digests written as constants in feature modules rather than in the review file, such as the commerce
  fulfillment ones (`fulfillment-publication-catalogue.ts`, `fulfillment-view-authority.ts`,
  `fulfillment-original-hash-catalogue.ts`). They belong to the publication path, which cannot start on `main`
  (see the WP 2.1 findings), and are already stale at the head state.
- Delete. See the next section.

## What else this turned up

None of these are caused by a migration.

1. **Delete (erasure) is not finished in any domain.** The identity, content, media and commerce privacy hooks refuse
   every delete with `*_retention_unconfigured`, by design, until the retention policies are decided. A delete request
   closes the fan's relationship with the creator at once (`immediateDeny`) and then cannot complete, so on the
   development stack the fan is locked out of that creator until the stack is rebuilt. So E2.9 shows export, not delete.
2. **A full export (8 of 8 domains) is not reachable on the development stack.** Five domains complete. `conversation`
   needs the recording-association adapter (the schema has the column, `server.ts` does not compose the adapter),
   `growth` needs `--growth`, and `agent` retries until conversation completes. PR #351 is a separate fix for the agent
   export.
3. **A catalogue mismatch latches the running backend.** Within about a minute of the table appearing, fan messages are
   refused (403 `privacy_consumers_unregistered`) and stay refused even if the table is dropped again, until the
   backend restarts (E2.9 shows both). `usage-accounting-host.ts` keeps `failed` and `invalidated` flags that nothing
   clears.

## Scenario results (E2.9 ★)

`node infra/local/stack.mjs up --lane 2 --no-web --no-smoke`, then
`node tests/scenarios/lane-2/e2-9-catalogue-regeneration.mjs` (about 4 to 5 minutes). It edits one tracked file and
restores it byte for byte, restarts the stack's backend, and refuses to start if that file already differs from the
committed one. **19 of 19 steps pass** in the last full run of the final script:

1. Preconditions: the backend answers; two of fan one, fan two and Maya have room under the product's limit of 5 data
   requests per account per hour.
2. Baseline: `check` reproduces 45 of 45; an export completes commerce, content, identity, media and trust; `snapshot`.
3. One table is added: `check` fails loudly (0 of 45, exit 1); the export is refused in those five domains; the running
   backend refuses fan messages (403 `privacy_consumers_unregistered`); the reply worker reports generation
   unconfigured; `diff` says 2 relations added (the table and its key), no purpose role's reach changed.
4. A restart alone does not repair it: the backend refuses to start.
5. `write --base`: exactly one tracked file changes, +45 −45; `check` passes; the backend restarts; the export completes
   the five domains again.
6. Put back: the file is byte for byte the committed one; with the committed pins and the new table `check` fails again
   (a forgotten regeneration is caught); the table is dropped, the backend restarted, `check` passes, a fan's message is
   accepted again.

Earlier full runs found and fixed three defects in the scenario itself (it dropped the table before checking the
forgotten-regeneration case; it spent the product's 5-requests-an-hour limit on one fan; an immediate message probe
raced the expiry worker). Not shown: delete (see below) and the other three export domains.

## Recommendation: make the pins ignore relations a role cannot reach

`core/purpose-catalogue.ts` lists every relation in the database for each role, including the ones the role has no
privilege on and does not own. That is why an unrelated table changes the digest. Keeping only the rows where the
role has a privilege, a column grant, a policy or ownership would leave what the pins protect intact: a new relation
the role _can_ reach still changes the digest.

I measured it without touching the repository: the same tool, with a copy of that one function that applies the
filter (swapped in through a module hook), then one new empty table. **43 of the 45 pin groups did not change.** The two
that still do are `runtimeCatalogues.financial` (the safety-terminal catalogue enumerates every role against every
relation in its own query) and `purposeProfiles` (the operator's fingerprint of the whole application schema, which is
meant to change with any schema change). So most migrations would need no regeneration at all, and the ones that do
would be the ones that touch a purpose role or the application schema.

It would change every digest once (this tool regenerates them). It is a safety-posture change in a file I do not own,
so it is a ticket for the integrator and the founder, not something I did.

## Tickets

| To                  | File                                                                           | Change                                                                                                                                     | Why                                                                                  |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Integrator, founder | `apps/backend/src/core/purpose-catalogue.ts`                                   | Decide whether to drop rows a role cannot reach from the catalogue it hashes (see the recommendation), then regenerate once with this tool | One unrelated table stops export and replies and keeps the backend from starting     |
| Integrator          | `.github/workflows` (CI)                                                       | Run `catalogue-pins check` against a database built from the branch                                                                        | A forgotten regeneration then fails the pull request                                 |
| Integrator          | `docs/archive/lanes/01-working-agreement.md` section 5                         | Point the migration procedure at this note                                                                                                 | Step 3 there says the integrator regenerates and reviews the catalogues; this is how |
| Lane 1, integrator  | `trust/*-privacy-hook.ts`, `content/privacy.ts`, `commerce/privacy-purpose.ts` | Decide and build the retention policies erasure waits for                                                                                  | Delete cannot complete; a requested delete locks the fan out                         |
| Lane 3              | `modules/trust/usage-accounting-host.ts`                                       | Let the `failed` and `invalidated` latches clear when the catalogue is whole again, or document that a restart is required                 | A transient mismatch makes the host refuse every fan message until it is restarted   |
| Integrator          | `apps/backend/src/server.ts`                                                   | Compose the recording-association adapter so conversation export can complete on the development stack                                     | `conversation_recordings_unavailable` blocks it, and the agent export waits for it   |

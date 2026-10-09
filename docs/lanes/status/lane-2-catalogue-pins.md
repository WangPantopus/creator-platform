# Lane 2: the pinned catalogues (WP 2.9)

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

| Question                                         | Answer                                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the tool compute what the product computes? | Yes. On the freshly built database **45 of 45 pin groups (50 pinned digests) reproduce exactly**, so the tool is validated against the reviewers' own values before it is trusted to write any                                                                                |
| What does one new table do?                      | **0 of 45 pin groups match.** Export: commerce, content, identity and media are blocked (`privacy_original_family_unavailable`), trust retries. The reply worker reports `generation_terminal_discovery_unconfigured`, so AI replies stop too. See the scenario results below |
| Does a restart fix it?                           | No. A backend started against that database with the committed pins **does not start**: `comparison_artifact_custody_changed`                                                                                                                                                 |
| Does regenerating fix it?                        | See the scenario results below                                                                                                                                                                                                                                                |

## The procedure when a migration adds, removes or changes a relation

The integrator owns the migration queue, so this is for them. Nothing here edits `infra/migrations.json`.

1. **Before applying**, on a database at the current head: `snapshot --out before.json`.
2. Apply the migration to that same database (a scratch one; never a shared or preserved one).
3. `check` fails and names the groups. `diff --base before.json` says what changed:
   - _Only relations were added or removed and no purpose role's reach changed_: regenerating is mechanical.
   - _A purpose role gained or lost access to something_: **stop and review each line against the migration.**
     The pins exist to make exactly this visible. Do not regenerate over a reach change nobody intended.
4. `write --base before.json` rewrites only the digests that changed, in place, keeping the file's formatting.
   Review `git diff` for the review file: one changed line per digest.
5. Restart a backend on the new file (the product reads the file when it starts). Run an export (E2.9 does) and
   send a message. Run `check`: it must exit 0.
6. Commit the regenerated review file in the same pull request as the migration. In CI, run `check` against a
   database built from the branch (`infra/local/stack.mjs up --db-only` builds one); a forgotten regeneration then
   fails the build instead of a deploy.

Two things to know before merging a migration:

- **Deploy the migration and the new pins together.** A backend that is already running keeps working until the
  next catalogue read, then refuses (export, replies) and stops accepting fan messages until it is restarted. A
  backend that is _started_ against a database whose relations are newer than its pins does not start at all.
- **The other reviewed variants are not regenerated.** `purposeProfiles` lists four reviewed forms of the same
  graph (fresh, restored populated, each with and without the Growth API login), and `originalFamilyProfiles` and the
  provenance-purge pin list two. The tool replaces only the variant that applies to the database it ran on (the one
  that matched in the snapshot). The others describe databases that must be qualified on their own, with the restore
  ceremony, before they can be trusted again; until then a restored populated database will refuse.

## The commands

`cd apps/backend && node --import tsx src/operations/catalogues/catalogue-pins.ts <command> --database-url URL`
(or `node infra/local/stack.mjs catalogues <command> --lane N` for a local stack). Read-only against the database.

| Command                           | What it does                                                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check`                           | Recomputes every pinned digest and compares. Exit 0 if all match, 1 if any differ or any pin is unknown to the tool, 3 if the database is unreachable or not at the state the review describes |
| `snapshot --out FILE`             | Writes what every purpose role reaches, relation by relation, and which pinned alternative each group matched (about 0.3 MB). Keep it outside git                                              |
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
3. **A catalogue mismatch latches the running backend.** After the table was added and removed again without a
   restart, fan messages were refused (403 `privacy_consumers_unregistered`) until the stack was rebuilt.
   `usage-accounting-host.ts` keeps `failed` and `invalidated` flags that nothing clears.

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
| Integrator          | `docs/lanes/01-working-agreement.md` section 5                                 | Point the migration procedure at this note                                                                                                 | Step 3 there says the integrator regenerates and reviews the catalogues; this is how |
| Lane 1, integrator  | `trust/*-privacy-hook.ts`, `content/privacy.ts`, `commerce/privacy-purpose.ts` | Decide and build the retention policies erasure waits for                                                                                  | Delete cannot complete; a requested delete locks the fan out                         |
| Lane 3              | `modules/trust/usage-accounting-host.ts`                                       | Let the `failed` and `invalidated` latches clear when the catalogue is whole again, or document that a restart is required                 | A transient mismatch makes the host refuse every fan message until it is restarted   |
| Integrator          | `apps/backend/src/server.ts`                                                   | Compose the recording-association adapter so conversation export can complete on the development stack                                     | `conversation_recordings_unavailable` blocks it, and the agent export waits for it   |

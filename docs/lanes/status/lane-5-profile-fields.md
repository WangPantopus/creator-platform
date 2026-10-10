# Q2 default: public profile words — 2026-10-09

## Handoff publication update — 2026-10-09

The founder requested that all work have open PRs. This concern is therefore
published as a **draft for review**, overriding the earlier hold on opening it.
It is **not ready to merge or register**: #385 remains first in the migration
queue, and integrator review/registration stays serial. No migration registry,
custody checksum, production secret or shared composition file was edited.

Main `21b3d4836` was brought forward with an ordinary merge for this
handoff. The workflow evidence below predates that merge; it was **not rerun**
for this publication pass. Existing passes and failures are preserved as dated
evidence, not presented as a new integrated run. No product change was added.

The current global status and kickoff prompt live on
`lane-5/reaction-withdrawal` under `docs/lanes/status/lane-5*.md`. Read those
before relying on older status snapshots carried by this independent branch.

Branch `lane-5/profile-fields`, **draft review authorized; registration queued behind #385**. The founder's
recorded Q2 default is taken: Growth stores biography, category and photo
caption; lane 6 builds the form. This is incomplete and not ready to merge.

Implemented, but not proved end to end:

- `GET` and `PUT /v1/growth/profile` resolve the creator from the current real
  actor, never a client-supplied creator ID. Optional words use the existing
  C8 limits (600/60/100 JavaScript string units); NUL is refused. Empty strings
  clear the fields.
- Version zero creates. Identical immediate retries return the same version;
  different edits at the same version conflict. Actor/session/erasure fences
  remain in the existing Growth transaction path.
- The canonical public projection reads these fields. Erasure and export
  include the new collection. Identity, AI state, capacity and reliability
  remain with their existing owners.
- Added API schemas and ran `pnpm generate`; generated OpenAPI, Swift and
  Kotlin changes were produced by the generator, not edited by hand.

## Migration and startup blocker

`apps/backend/src/modules/growth/migrations/pending_w7_creator_profile_fields.sql`
creates one Growth-owned table, forced row security, creator writes and worker
export/erasure access. The words are intended to be public, with no private
draft state. SQL applied successfully **only** to the lane 5 disposable
`creator_stack` database. No registry or numbered migration was edited.

The stock server then refused startup:

```text
DomainError: Current comparison artifact custody must match independent review.
code: 'comparison_artifact_custody_changed'
status: 403
```

`generationConsumerCatalogue` includes every non-system relation even when the
reviewed role has no privilege on it. Adding this table therefore changes the
independently reviewed catalogue. This is not a flaky scenario or an engine
change; resetting the database would not approve the new shape. No checksum,
review, guard, credential, owner callback or server composition was changed to
bypass it.

Ticket: integrator / lane 1 safety owner — register and independently review
this migration after the earlier migration PR, including the catalogue consumed
by `apps/backend/src/modules/trust/comparison-artifacts.ts` and its reviewed
registry metadata. Then rerun the stock-server scenario. The migration cannot
be claimed complete just because its SQL applied.

Ticket: lane 6 / integrator — creator form and GET/PUT admission in
`apps/web/app/api/growth/[...path]/route.ts`, preserving actual session,
expected account/session headers, same-origin mutation and no-store handling.
The form must explain that these are public words; copy needs founder approval.

## Results

| ID                    | Steps                                                                           | Expected                        | Observed                                        | Result      | Evidence                                                               |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------------- | ----------- | ---------------------------------------------------------------------- |
| SQL                   | Apply pending SQL to own PostgreSQL                                             | Table/policies/grants created   | BEGIN through COMMIT succeeded                  | pass        | tool transcript                                                        |
| Startup               | Restart the stock server                                                        | Server ready                    | Independent catalogue refusal above             | **fail**    | `/tmp/qelvora-lane5-profile-start.log`                                 |
| E5.5 profile scenario | Owner, wrong person, repeat/race, boundary, clearing, browser plain text, pause | Actual user workflow            | Sign-in could not connect after startup refused | **not run** | `/tmp/qelvora-lane5-profile-proof.log`: `ECONNREFUSED 127.0.0.1:56451` |
| Restart / privacy     | Persisted words; real W8 export and erasure                                     | Survive restart / fully removed | Blocked by startup and pending migration        | **not run** | same blocker                                                           |

Seven typecheck tasks passed. Compilation is not evidence that these workflows
work. No new unit tests. No field data was written by the aborted scenario.
The draft scenario uses the development identity/license/model edges only.

After the integrator's review, use Codex Node/fallback PATH and
`npm_config_manage_package_manager_versions=false`, start the stock stack,
then `node tests/scenarios/lane-5/e5-5-profile-fields.mjs`. After a real stop/up,
run the same script with `--after-restart`. The Studio form and full account
privacy checks must also pass before this package is considered complete.

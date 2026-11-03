# Migrations

How a SQL migration becomes part of the product: what is generated, what is measured, and what still
needs a person. The rules that never bend: applied SQL never changes, checksums stay, and a used
database is never reset.

## What exists

- **SQL files** live with their module, for example `apps/backend/migrations/0001_foundation.sql` or
  `apps/backend/src/modules/identity/pending-passkey-retirement.sql`. A file keeps its name and its
  bytes when it is registered.
- **The registry**, `infra/migrations.json`: 126 registered migrations, `0001_foundation` to
  `0258_w4_provider_inbox_worker`. Each entry has a version, the file's path and owner, and for wave
  migrations the file's SHA-256 and its wave. `reserved` holds version numbers set aside for files
  not yet registered. It is the only migration file a registration edits by hand.
- **Waves**, `infra/migrations/waves/<id>.json`: the unit of registration. Each packet lists its
  `baseline` (every source registered before it, with its checksum) and its `wave` (the new
  sources). The newest is `20261101-pilot-columns` (#527): a baseline of 123 sources and a wave of
  three. [The generator](#the-generator) writes them. The four other files in that folder
  (`20261002-roles.json`, `20261002-public.json`, `20261002-privacy-roles.json` and
  `20261002-privacy-held.json`) are October's role and held-mapping reviews, not packets.
- **The chain**, `infra/migrations/chain.json`, generated with the packets: the wave order with each
  packet's checksum and size, the waves the local installer applies after the canonical bootstrap,
  and the head. The pin script reads it, and `migrate-trust.ts` and the local installer read it
  through one module, `apps/backend/scripts/migration-chain.ts`, which also holds the table of
  reviewed waves. `activate-wave.ts` and the runtime don't read it yet
  ([the plan](#wave-6-the-plan)).
- **Reviews**, `infra/migrations/reviews/<id>.json`: the reviewed head for each wave, mainly the
  catalogue pins (who can reach which tables, columns and functions) that the product checks at
  startup and that the operator checks before it applies anything.
- **The pinned records**, `infra/migrations/reviewed.json`, edited by hand: the SHA-256 of every
  reviewed record here that the generator doesn't write. That is the four frozen packets, the four
  other October files in `waves/`, every review, the adoption, the recoveries and the 0045 history
  copy. A registration adds its review to it; nothing writes it for you.
- **The operator**, in `apps/backend/scripts/`: `activate-wave.ts` applies one reviewed wave to a
  database that holds data (with a private backup and a closed restore), and `migrate-trust.ts`
  verifies a database and bootstraps the base schema. Of the two, only `migrate-trust` reads the
  chain. It applies file by file only the canonical bootstrap: the 61 sources before
  `20261007-generation`, a line fixed in its code rather than read from the chain. Every source of
  a wave in the chain's `fresh` list is activation-only: it is verified once its wave is installed,
  and never applied on its own. Before it applies anything, `migrate-trust` refuses a chain that
  doesn't match its packets or that line, a registry the chain doesn't match, a registered wave
  that has no matching review in the table of reviewed waves, and a canonical file whose bytes
  differ from the checksum its packet holds. The role checks (`migration-*-roles.ts`) are beside
  them.
- **The local installer**, `apps/backend/src/operations/local/fresh-install.ts`: for a new, empty
  database only. It applies the waves in the chain's `fresh` list, in that order and in one
  transaction, each from the packet whose bytes match the chain's checksum. Before any SQL runs, it
  refuses a chain wave that has no matching review in the table of reviewed waves, with
  `migrate-trust`'s message. It checks every pinned checksum, then the final role-safety and
  privacy-catalogue assertions for the head wave, which its code still names
  (`20261101-pilot-columns`). It refuses any database that holds a business row. The
  [local stack](local-stack.md) uses it.

## The generator

`pnpm generate` runs `scripts/generate-migrations.mjs`, and `pnpm generate:check` runs it with
`--check`. From the registry and the SQL bytes it derives every packet:

- a wave's sources are the entries whose `wave` names it, in registry order, and the waves come in
  the order their first source appears;
- its `baseline` is every source of the waves before it, in that order, after the entries that come
  before the first wave (0001 to 0043);
- every checksum is the SHA-256 of the file's bytes; every source in a wave must have a
  `sourceSha256` (all 86 from 0044 on do), and it must match;
- a new wave's versions rise in registry order, above every version before the wave, because the
  operator refuses to apply a version below one already applied;
- `outOfOrderException`, the W5 adoption record (0045 applied before 0044), carries over unchanged
  from the wave before, since every later baseline holds that history.

The chain's `fresh` list starts at `20261007-generation`, fixed in the generator: the canonical
bootstrap is the 61 sources before it, whichever registry entries carry an explicit `wave`.

Each packet from `20261007-generation` on must list exactly the sources its review names (the
review's `source`, or else its `sources`; the reviews of the generation, content and output waves
have other names). Each review is pinned in `reviewed.json`, and each review after the first must
pin the packet of the wave before its own as its `baselineWave`, so every packet but the newest is
pinned by a reviewed record. The newest is anchored by its review's sources instead. A review
that pins a packet must be the review of a wave in the chain, so a reviewed wave can't leave the
registry while its review stays: dropping one also means deleting its review and its line in
`reviewed.json` by hand, where a reviewer sees it.

It stops, and writes nothing, when:

- the registry, `reviewed.json` or a frozen packet is missing or malformed, or a review isn't valid
  JSON (one line, no stack trace);
- a registered file's bytes changed, or a source in a wave has no `sourceSha256`;
- an existing packet would come out different, or a packet doesn't list its review's sources;
- a new wave's versions don't rise above the ones before it;
- an entry without a wave follows the first wave, or two entries share a version, a number or a
  path;
- a review after the first has no `baselineWave`, or pins anything but the packet of the wave
  before its own with that packet's checksum;
- a review that pins a packet is the review of no wave in the chain;
- a pinned record's bytes changed or it is missing, or a file here is neither generated, registered
  nor pinned. Dotfiles, such as a Finder `.DS_Store`, are ignored;
- `reviewed.json` pins anything the generator doesn't compare: a file it writes, a registered
  source, or a path that isn't a reviewed record under `infra/migrations`. The count it prints is
  the number of pins it compared.

`--check` also refuses a wave without a review, and a review that isn't pinned yet; `pnpm generate`
only prints those, so a registration can write its packet before its review exists.

**Frozen packets.** Four reviewed packets can't be reproduced from the registry. `reviewed.json` pins
their bytes; the generator checks their place in the chain (their baseline and their sources) and
never writes them:

| Packet | Why |
| --- | --- |
| `20261002` | Its 17 sources have no `wave` in the registry, and it records two held versions and the traffic marker |
| `20261002-privacy` | Its 4 sources have no `wave` in the registry |
| `20261007-content` | It records the reviewed baseline-ordering exception for 0198 |
| `20261007-public-ai` | Its 2 sources, 0235 and 0236, have no `wave` in the registry |

The other 12 come out byte for byte as reviewed. Giving the frozen ones' sources a `wave` would
change the registry, so they stay frozen.

## Registering a file today

**`migrate-trust` and the local installer read the chain**, the first two steps of
[the plan](#wave-6-the-plan). `migrate-trust` never applies a registered wave's files one by one,
which it used to do on a fresh database for a wave it didn't know, and the installer takes its
waves from the chain, not from a list in its code. Before any SQL runs, both refuse a chain wave
without a matching row in the table of reviewed waves:
`Registered wave <id> has no matching review in this revision; no migration was applied.`
`activate-wave` doesn't read the chain yet, so a registration still teaches it the wave by hand
(step 6).

An incomplete registration fails closed, which is why the earlier rule, to register no new wave
until `migrate-trust` read the chain, is lifted:

- CI catches only a registration that misses its row in the table of reviewed waves: CI's backend
  suite bootstraps its fixture databases with `migrate-trust`.
- A registration that adds the row but misses the rest of step 6 passes CI. `activate-wave`
  refuses it with `Active registry differs from the reviewed packet.` `stack up` applies its wave
  with the others, in one transaction. The installer's final role checks still select the
  `20261101-pilot-columns` pins, so they refuse a wave that changes what those pins cover, as a
  new table does (`Generation-purpose wave catalogue changed.`), and the install rolls back to the
  canonical 61. A wave that changes nothing they cover stays installed on that stack. That is why
  step 7's fresh install on a new stack stays required.

A registration is one pull request: a registry edit, the generated packet and chain, a review file
measured on scratch databases and pinned, the code that knows the wave, and the proof. Steps 2 to 5
are mechanical apart from the reach review in step 4; the table below says what isn't.

1. **Before any edit, build scratch databases at the current head:** two local stacks, one of them
   with `--growth` (`node infra/local/stack.mjs up --lane N --base-port P --no-web`). The stack
   marks the database it creates as scratch, with the comment `creator-platform:local-scratch`.
   For the populated alternatives, also restore a copy of each stack's database (`pg_dump -Fc`,
   then `pg_restore` into a new database in the same container), and mark it by hand:
   `COMMENT ON DATABASE <copy> IS 'creator-platform:local-scratch'`. A restore turns the explicit
   owner-only grant on the isolated-owner tables (seven at 0258) into the implicit default; after
   proving that is the only difference, replay each owner's grant on its own table, as the archived
   [runbook](../archive/operations/W8-runbook.md) says, until `catalogue-pins check` on the copy
   matches its original. Build them first, with the registry as it is.
2. **Edit the registry.** Append one entry per file: `version` (the next free number; no reservation
   can be used as a version, see [reserved numbers](migration-queue.md#reserved-numbers)), `path`
   (the file as it is), `owner`, `sourceSha256` and a new `wave` id, `YYYYMMDD-name`.
3. **Generate:** `pnpm generate` writes `infra/migrations/waves/<wave>.json` and updates
   `infra/migrations/chain.json`.
4. **Measure the pins** on each scratch database, from `apps/backend`:

   ```sh
   node --import tsx scripts/wave-pins.ts apply --wave <wave> --database-url <url> --out <dir>
   ```

   `<dir>` is a private folder outside Git. The script refuses a URL with a query string or a
   host other than `localhost` or `127.0.0.1`, a database without the scratch marker (its refusal
   doesn't print the statement that sets it), a database that doesn't hold exactly the wave's
   baseline, and a wave whose versions don't rise above it. It takes a catalogue snapshot
   against the previous head's review, applies the wave's sources in one transaction as
   `activate-wave` does, and prints the catalogue diff. **A person reviews every changed reach
   against the SQL** ([catalogue pins](catalogue-pins.md)). Then:

   ```sh
   node --import tsx scripts/wave-pins.ts write --wave <wave> --database-url <url> --out <dir> --scope "<sentence>"
   ```

   The first `write` creates `infra/migrations/reviews/<wave>.json` from the previous review, with
   the new sources, the previous packet's checksum and the scope sentence. The catalogue tool then
   puts in the digests that changed; every other pin carries over. A pin that didn't match the
   database before the wave is left as it was: with Growth that is `runtimeCatalogues.family`, which
   stays the no-Growth diagnostic. On a restored copy add `--variant populated-original`, or
   `--variant populated-original-incoming` with Growth. `write` refuses a review that is already
   pinned in `reviewed.json` unless you pass `--replace`: re-measuring a reviewed wave is a review
   of its own, in its own pull request, and its new checksum goes into `reviewed.json` by hand.
5. **Pin the review** once its pins are reviewed: add its line to `infra/migrations/reviewed.json`.
   `pnpm generate:check` prints the line, with the checksum.
6. **Teach the operator and the runtime the wave**, by hand until they read the chain: the table of
   reviewed waves in `scripts/migration-chain.ts` (a row with the wave's review, for `migrate-trust`
   and the local installer), `migrate-trust.ts`'s per-wave checks, `activate-wave.ts`, the
   generation and privacy role checks, the head profile (`src/db/comparison-profile.ts`) and the
   three trust catalogue modules (a database at the previous head is checked against that head's
   fixed pins).
7. **Prove it:** a fresh install on a new stack, then
   `node infra/local/stack.mjs catalogues check --lane N`, which must match every group without
   Growth and every group but `runtimeCatalogues.family` with it; the scenarios that use the new
   schema; and a restored populated copy of the previous head moved forward by `activate-wave`, as
   `tests/scenarios/integrator/pilot-columns-upgrade.mjs` does.

What still needs a person, and why:

| Part | Why it isn't mechanical |
| --- | --- |
| Which files go together, the wave's name, each file's number and owner | A choice about the feature and its order |
| A renumbered copy of a file whose SQL names its own reserved version | Someone writes new SQL; the original bytes stay (precedents: 0233, and 0239 to 0246) |
| The reach review between `apply` and `write`, and the scope sentence | A changed reach is what the pins exist to show; only a person can say it was meant |
| A pin for something new that the catalogue tool can't recompute, such as a new role's own catalogue (0254, 0255) | Its reader, its review key and its entry in `operations/catalogues/pins.ts` are new code |
| A check for a new login or role, and the stack's setting for it (0258: `assertCommerceInboxLogin`, `COMMERCE_INBOX_DATABASE_URL`) | What a new role may do is a decision |
| Step 6 | The operator and the runtime still name each wave in code |
| The populated copies | A restore, and the judgment that its grant change is the only difference |
| Test support (`apps/backend/tests/support/registered-source.ts`) and the scenarios | Which tests need the new schema, and what the feature must do |

A file that is not registered is never installed anywhere. Code that reads its tables or columns
must not ship before it is registered, or it fails on every real database.

## What CI checks

CI's `web-and-backend` job runs `pnpm check`. Its `generate:check` fails when a wave packet or the
chain differs from what the registry gives, when a registered file's bytes changed, when a packet
doesn't list its review's sources, when a wave has no pinned review, or when any reviewed record
differs from its checksum in `reviewed.json`. The job runs the backend suite on a fresh PostgreSQL 17 with
pgvector: each fixture database is bootstrapped by `migrate-trust.ts`, which refuses a registered
wave it has no matching review for, and tests that need a wave's schema install its registered
bytes. The full install of every wave and the catalogue check run on the local stack and in the
integrator scenarios, not in CI today. Restore and update drills are deferred until a production
database exists.

## Wave 6: the plan

From [STATUS](../STATUS.md#next) and the [consolidation plan](../CONSOLIDATION_PLAN.md):

1. **Triage the unregistered SQL files.** Done in the [migration queue](migration-queue.md) (#533).
2. **Make registration data-driven.** The generator and the pin script are in; four packets are
   frozen. Left: the operator and the runtime still name each wave (step 6 above). The plan:
   - done: `migrate-trust` treats every source of a chain wave after the canonical bootstrap as
     activation-only, so a registry edit can never bootstrap a wave's files one by one, and
     refuses a registered wave it has no review for;
   - done: the local installer takes its waves from the chain instead of `FRESH_WAVES`, through the
     reader and the table of reviewed waves it shares with `migrate-trust`, and refuses a chain wave
     it has no review for;
   - the wave lists and the chain checks in `activate-wave`, and the head profile: read the chain
     and loop over the reviews from `20261008-comparison` on, keeping each existing refusal and its
     message;
   - the role checks and the trust catalogue modules: select the head review and the fixed
     predecessor by wave id instead of a ternary per wave;
   - prove each step on a fresh stack and on a restored copy moved forward by `activate-wave`.
3. **Register files only as features need them**, one wave per feature.
4. Keep the fresh install and the catalogue check, and automate restore drills once a production
   database exists.

The detailed operator procedure from October, including restores, is in the archived
[Trust operation and recovery runbook](../archive/operations/W8-runbook.md).

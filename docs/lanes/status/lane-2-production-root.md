# Lane 2: the production host (WP 2.2) and proposed contract C2

Updated: 2026-10-08, by the lane 2 session
Pull request: `lane-2/production-root`, stacked on `lane-2/stack-from-scratch` (merge that one first)
Scenario: E2.2 ★, re-run with `node infra/local/stack.mjs up --lane 2 --db-only` and then
`node tests/scenarios/lane-2/e2-2-fail-closed.mjs`

## In plain words

Until now the only backend that could be started was the development host: it lets anyone sign in with a
made-up account and runs on test settings. This adds the host a real environment runs. It starts serving only
when every real piece it depends on is present. When something is missing it stays up, says exactly what, and
answers nothing else. When it is told to do something unsafe (a development setting, a development sign-in, a
database login that could read or change everything) it refuses to start at all.

Nothing in `server.ts`, `integration.ts`, `config.ts`, `app.ts` or `features.ts` changed. The new host calls the
same `createConfiguredBackend` that the development host calls.

## The three states

| State       | When                                                                                                                                                                                                                                               | What it serves                                                                                                                                                                                                                                                                                                    | The process                                                                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **open**    | Settings valid, every adapter slot present, database login safe and migrated, composition succeeded                                                                                                                                                | The whole backend                                                                                                                                                                                                                                                                                                 | Runs. A complete, healthy host goes straight to open and never serves the closed shell                                                         |
| **closed**  | A slot is missing, or the database cannot be used yet (unreachable, wrong password, no such database, not migrated)                                                                                                                                | `/health/live` (200). `/health/ready` (503, `mode: "closed"`, one row each for the database, the seven slots and `host_open`). `/health`. `/v1/identity/capabilities` (`signInAvailable: false`). **Every other path and method answers 503 `host_closed`** with `Retry-After: 30`. Realtime upgrades are refused | Runs. Asks the database again every 5 seconds and opens by itself once nothing is missing. A missing slot cannot heal without a new release    |
| **refused** | A development setting or identity; a missing, invalid or conflicting setting; an unusable adapter module; an unsafe database login; an adapter set that cannot be composed (a defect, not an outage); a login that turns unsafe while still closed | Nothing: it never listens                                                                                                                                                                                                                                                                                         | Exit code 1 after one `production_refused` log line that lists every reason as a fixed code and the setting or slot it is about, never a value |

## Files

- `apps/backend/src/operations/production-server.ts`: the entry point (`node` runs it), JSON log lines on stdout,
  exit codes, SIGTERM/SIGINT handling with a 30 second deadline.
- `production.ts`: `startProductionHost`, the closed shell, adapter loading, composition, the 5 second retry.
- `production-config.ts`: every setting, and every refusal about one.
- `production-database.ts`: what the host asks about its own database login.

## Settings

Each is named in a refusal by name and code only. A secret is given as `NAME` or as `NAME_FILE` (the absolute
path of a mounted file of at most 8 KB), never both.

| Setting                                             | Rule                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                          | Must be `production`                                                                                                                                                                                                                                       |
| `DEPLOYMENT_ENVIRONMENT`                            | `review`, `staging` or `production`. Unbuilt source may only be a `review` environment                                                                                                                                                                     |
| `RELEASE_REVISION`                                  | 40 hexadecimal digits. In a built bundle it must equal the revision baked in at build time (`__QELVORA_BUILD_REVISION__`)                                                                                                                                  |
| `PORT`, `HOST`                                      | 1024 to 65535 (default 4100); default host `0.0.0.0`                                                                                                                                                                                                       |
| `WEB_ORIGIN`                                        | One exact HTTPS origin (no path, no credentials)                                                                                                                                                                                                           |
| `PASSKEY_RP_ID`, `PASSKEY_ORIGINS`                  | The relying-party id must be the origin's host or a parent of it. `PASSKEY_ORIGINS` is optional, comma separated, each an exact HTTPS origin covered by the id                                                                                             |
| `DATABASE_URL` or `_FILE`                           | A Postgres URL with a login. Outside `review` it must carry `sslmode=require`, `verify-ca` or `verify-full`                                                                                                                                                |
| `IDENTITY_SESSION_KEY` or `_FILE`                   | Base64 of exactly 32 bytes                                                                                                                                                                                                                                 |
| `PRODUCTION_ADAPTER_MODULE`                         | A plain `*.mjs` file name. Optional: without it every slot is missing and the host stays closed                                                                                                                                                            |
| `PRODUCTION_ADAPTER_DIR`                            | Absolute path of the only directory the module may live in (default `./integrations`). A link that leads out of it is refused                                                                                                                              |
| Must be **absent** (even set to `false` is refused) | `W8_LOCAL_*`, `TRUST_LOCAL_DEVELOPMENT`, `TRUST_DEVELOPMENT_*`, `W2_DEVELOPMENT_*`, `W3_DEVELOPMENT_*`, `W3_FAN_GENERATION`, `W3_SYNTHETIC_*`, `W2_SYNTHETIC_*`, `QELVORA_FAKE_*`, `QELVORA_GROWTH_DEVELOPMENT`; `IDENTITY_ADAPTER` may only be `pantopus` |

## The adapter module: proposed contract C2

`PRODUCTION_ADAPTER_MODULE` is reviewed code that ships with the release, not configuration. It exports
`configure(env)` (async), which receives the process environment and returns the slots below. The host reduces
anything `configure` throws to the fixed code `configure_failed`, because an adapter's own error may carry a
credential. Adapters read their own settings from the same `env` and should follow the same `NAME` or `NAME_FILE`
convention.

```ts
type ProductionAdapters = {
  identity: PantopusIdentityAdapter; // never a development adapter
  trust: TrustConfiguration | ((runtime) => Promise<TrustConfiguration>);
  registerFeatures: (runtime, onClose) => Promise<Features>; // the integrator's wiring
  signedSubjectPolicies?: SignedSubjectPolicies;
  providers: {
    model: { guardrails: GuardrailProvider; probe: Probe["run"] };
    license: { probe: Probe["run"] };
    payments: {
      stripeNotifications: Router; // verified processor ingress
      storeNotifications?: Router;
      probe: Probe["run"];
    };
    push: { probe: Probe["run"] };
  };
};
```

| Slot       | Provided by                 | Counts as present when                               |
| ---------- | --------------------------- | ---------------------------------------------------- |
| `identity` | Lane 1                      | `beginSession` and `resolveSession` are functions    |
| `trust`    | Lane 1, with the integrator | An object or a function                              |
| `features` | The integrator              | `registerFeatures` is a function                     |
| `model`    | Lane 3                      | `guardrails.checkSentence` and `probe` are functions |
| `license`  | Lanes 1 and 3               | `probe` is a function                                |
| `payments` | Lane 4                      | `stripeNotifications` and `probe` are functions      |
| `push`     | Lane 5                      | `probe` is a function                                |

Rules the host enforces:

1. **Any slot missing: closed.** Never partly open. Readiness names the slot (`adapter_missing`) and the log says so.
2. **A development identity is a refusal, not a closed host** (`mode` other than `pantopus`, or a
   `developmentActors` list).
3. **The Trust configuration must agree with the host.** Its `environment` and `release` must equal the host's and
   its `identityMode` must not be `development`; otherwise `unusable_adapter` on `trust`.
4. **Provider health is merged into Trust's own readiness as required rows.** `model`, `payments` and `push` become
   Trust's provider rows; `license` is an extra row. A name the Trust configuration already supplies is left alone.
5. **A set that cannot be composed is a refusal** (`composition_failed`), not a retry. Only a database that went away
   during composition is retried.

## What this host does not run

It serves the API and runs the Trust runtime (`trust.start()`, as `createConfiguredBackend` does). The generation,
ingestion, publication, commerce-recovery and Growth workers are separate deployment units (WP 2.4), so the
production `registerFeatures` should not start them in process the way the development host does. WP 2.4 decides.

## Readiness

- `GET /health/live`: `{"alive": true}` while the process runs, in every state.
- `GET /health/ready`: 200 only when open and every required row is available. Closed: 503 with
  `{ready: false, mode: "closed", environment, release, capabilities: [...]}`. Rows: `database`, `identity`, `trust`,
  `features`, `model`, `license`, `payments`, `push`, `host_open`, each with a fixed `code`.
- The closed `database` row's codes: `non_owner_role_verified`, `database_unavailable`,
  `database_authentication_failed`, `database_missing`, `database_not_migrated`.
- Open: Trust's own `/health/ready` and `/v1/trust/status`, which require six provider rows: `identity`, `model`,
  `payments`, `calls`, `voice`, `push`. The host supplies `model`, `payments` and `push`. **`identity`, `calls` and
  `voice` must come from the Trust configuration's `probes`; any that does not reads `probe_unconfigured` and
  readiness stays red** (see the decisions below).

## The database login

Checked at start, and again every 5 seconds while closed. Not re-checked once open (the database's own grants and
row security remain the control). The host refuses a login that, through itself or **any role it can reach through
any membership, including `NOINHERIT` ones it could `SET ROLE` into**, is a superuser, bypasses row security, can
create databases or roles, can replicate, belongs to `creator_owner`, `creator_trust_owner` or `growth_owner`, or
owns anything in the `creator`, `creator_trust` or `growth` schemas. It then runs the existing
`Database.assertRuntimeRole` too. Reasons: `superuser`, `bypass_row_security`, `can_create_databases`,
`can_create_roles`, `replication`, `member_of_an_owner_role`, `owns_product_objects`.

## Logs and exit codes

One JSON line per event on stdout. Events: `production_starting` (non-secret summary: environment, release, bind
address, origin, database host, port, name and login name), `production_closed`, `production_open`,
`production_refused`, `production_failed`, `production_crashed`, `production_composition_failed`,
`production_composition_deferred`, `production_database_unavailable`, `production_database_recovered`,
`production_stopped`, `production_stop_failed`.

Exit 0: stopped by SIGTERM or SIGINT. Exit 1: refused, failed (for example the port is taken), crashed, or found
it must stop (an unsafe login, a composition defect). An orchestrator that restarts it will see the same line until
the cause is fixed.

## What was run (E2.2)

See the pull request for the results table. The script starts the real host as a process against the stack's
PostgreSQL 17 and checks each condition in the lane charter: a missing identity, trust, features, model, license,
payments or push adapter; every development setting; a development identity; a superuser, bypass-row-security,
create-database, create-role, replication, owner-member, object-owning and `NOINHERIT`-reachable login; invalid,
missing and conflicting settings; unusable adapter modules; trust for the wrong environment, release or identity
mode; a taken port; a login that turns unsafe while closed; the database stopped and started while the host runs and
before it starts. Every check also searches the host's whole log for the test credentials and for a secret placed in
an adapter's error message.

Fakes: the adapter module (placeholders; the real adapters do not exist yet) and nothing else. The database is a real
PostgreSQL 17 with pgvector and the real migrated schema.

## Not run, and limits

- **The positive path.** No test has every adapter present and the host open, because no real `identity`, `trust`,
  `features`, `model`, `license`, `payments` or `push` adapter exists yet. A placeholder Trust configuration cannot be
  composed (the scenario proves the host then refuses). The open host's behavior is the existing
  `createConfiguredBackend`'s, which the development host runs, but it has not been run through this entry.
- **Build-revision binding.** The check that a bundle runs only as the commit it was built from exists, but there is no
  bundle yet (see the ticket), so only the unbuilt-source branch ran.
- **TLS to the database.** The stack's PostgreSQL has no TLS. The setting is checked (`tls_required`); a TLS connection
  has not been made.
- **A login that turns unsafe after the host is open** is not noticed (see above).
- A host refused at start can never be told apart from a crash by an orchestrator except by its log line; both exit 1.

## Decisions for the founder

1. **Calls and voice in the pilot.** Trust's readiness requires all six provider rows, and nothing can declare a
   capability "not offered". If the pilot has no calls or voice, readiness would stay red forever and nothing would
   route traffic to the host. Proposed default: lane 1 adds a per-environment declaration of capabilities not offered
   (listed in `infra/environments.json`, which I own, so it is visible and reviewed) and Trust reports those rows as
   `not_offered` and not required. That changes what "ready" means, so it is not made here.
2. **Order of merge:** `lane-2/stack-from-scratch` first, then this pull request.

## Tickets to other lanes

| To                             | File                                                                | Change                                                                                                                                                                                                                             | Why                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Integrator                     | `apps/backend/src/server.ts` (`registerFeatures`) and `features.ts` | A production `registerFeatures`. The development one is a closure in `server.ts` that mixes real composition with development parts (development feedback, synthetic licensing, a development generation host, in-process workers) | The production host takes `registerFeatures` as a slot. This is the largest piece still missing for a real host |
| Integrator                     | A new `integrations/` module for the release                        | The adapter module: `configure(env)` returning the seven slots from each lane's own module                                                                                                                                         | Lanes 1, 3, 4 and 5 each provide their slot; the host asks for one file                                         |
| Lane 1                         | Its adapter and Trust configuration                                 | Provide `identity` (`mode: "pantopus"`), `trust` (with `environment`, `release` equal to the host's, and the probes `identity`, `calls`, `voice`)                                                                                  | Without them the host stays closed or red                                                                       |
| Lanes 3, 4, 5                  | Their provider modules                                              | Export `providers.model`, `providers.payments`, `providers.push` (each with a `probe`)                                                                                                                                             | Their health becomes a required readiness row                                                                   |
| Lane 6                         | `apps/web` (where it handles API errors)                            | Treat a 503 `host_closed` like `restoration_pending`: a plain "try again" state                                                                                                                                                    | A closed host answers every page's data request with it                                                         |
| Integrator                     | `docs/lanes/02-contracts.md` (C2 row), root `package.json`          | Mark C2 as proposed in this note; add a script that runs `production-server.ts` and, later, the build                                                                                                                              | They are the integrator's files                                                                                 |
| Lane 2 (WP 2.4 and 2.7), later | `infra/containers/*`, a bundle step                                 | A bundle of `production-server.ts` with `__QELVORA_BUILD_REVISION__` defined, a container that runs it with `integrations/` beside it                                                                                              | Needed before the build-revision check can run                                                                  |

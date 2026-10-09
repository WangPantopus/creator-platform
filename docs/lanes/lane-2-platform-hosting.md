# Lane 2: Platform and hosting

## Mission

Make the product run somewhere real and reliably, and make the whole stack easy for every lane
and for the founder to bring up from scratch. Today only a development host runs the product,
and nobody can operate it end to end without a preserved database.

**What a person should feel.** Nothing, which is the point: the app is up, fast and recovers.
For the team: one script brings up a full stack, and a staging address with HTTPS exists.

## What great looks like

- A fresh machine reaches a running full stack (database, backend, workers, web) in under 30
  minutes with one documented command, using the development identity locally only.
- A staging environment on a real domain with HTTPS; background workers run, restart and report
  health; deploys come from CI.
- Backups exist and a restore has been drilled against the architecture's targets (recovery
  point 5 minutes, recovery time 1 hour).
- Latency (acknowledgment and first sentence), queue depth and errors are visible, with alerts.
- A production host that is missing an adapter **fails closed** instead of serving a degraded
  server.

## Scope

**In:** the operable-from-scratch stack, the production composition root, hosting and
infrastructure as code, worker deployment units, observability, backups and restore drills,
CI/CD for deploys, load and soak tests, and tooling to regenerate the pinned catalogues after
migrations.

**Out:** the identity adapter itself (lane 1), feature code in any module, path filters in the
main CI workflow (integrator).

## You own and do not touch

Own: `apps/backend/src/operations`, new files for the production composition (additive), `infra/*`
except `migrations.json`, deployment configuration, container files, `infra/alerts.json`,
`infra/environments.json`.

Do not touch: feature modules, `server.ts` beyond the wiring the integrator approves, the
preserved databases and containers, secrets.

## Read first

1. `apps/backend/src/server.ts` (the comment above `readConfig`, and `registerFeatures`),
   `integration.ts`, `config.ts`, `workers/*`, `db/*`.
2. `scripts/migrate-trust.ts`, `apps/backend/scripts/{activate-wave,migration-wave-*,
   migration-custody}.ts`, `docs/workstreams/coordination/W8-contracts.md`.
3. `docs/operations/W8-runbook.md`, `W8-release.md`, `W8-pilot.md`, `W8-required-inputs.md`.
4. System Architecture: runtime pools, deployment, SLOs and the latency budget.
5. Launch review sections 3 and 12.

## Work packages

| WP | Work | Size | Gate |
| --- | --- | --- | --- |
| 2.1 | **Operable from scratch.** Find out how a fresh database reaches the full-host state (the trust migration, wave activation, seeds), script it, document it, and prove it by starting backend, workers and web locally on the development identity. Do not read credentials from other tools' folders. **First, because every other lane's operated verification depends on it** | L | none |
| 2.2 | **Production composition root**: a new file using the same `createConfiguredBackend` seam with injected adapters; a config schema; fail closed; a readiness endpoint | M to L | C2 with lane 1 |
| 2.3 | **Hosting design and infrastructure as code**: options with monthly cost for managed PostgreSQL 17 with pgvector, object storage, secrets, domain and TLS, rate limits; then build staging | L | founder's hosting choice, domain, budget |
| 2.4 | **Worker deployment units**: generation, ingestion, publication, commerce recovery, growth; health checks, restart policy, separate pools and roles | M | 2.3 |
| 2.5 | **Observability**: structured logs, metrics for acknowledgment and first-sentence latency, queue depth and errors, alerts, uptime check, error reporting | M | 2.3 |
| 2.6 | **Backups and restore drills**; schedule the day-30 retention purge; measure recovery | M | 2.3 |
| 2.7 | **CI/CD for deploys**, environment promotion, build caching | M | 2.3 |
| 2.8 | **Load and soak** of the public creator read path, the WebSocket gateway and worker concurrency, with lane 3 | M | 2.1 |
| 2.9 | **Catalogue regeneration tooling and checklist** so a migration does not leave export and delete broken | M | with the integrator |

## Contracts

Provides the environment to every lane. Co-owns **C2** with lane 1. Consumes C1 for readiness
checks, C7 (the domain files served).

## Rules that bite

The runtime refuses a superuser, BYPASSRLS or owner database role; keep that. Three runtime pools
and separate worker logins exist for a reason (isolation); do not merge them for convenience.
Infrastructure is code; secrets never enter git; nothing deploys without the integrator.
Never run a command against `creator-w2-original-archive-20261007` or other preserved data.

## Verification and exit demo

Operate everything you build. **Exit demo:** on a clean checkout, one command produces a
running stack and a smoke script passes (sign in with the development identity, send a message,
see the acknowledgment); a staging environment serves HTTPS; killing a worker is recovered; a
backup restores into a scratch database and the counts match.

## Known risks

- The full stack has never been started from nothing by anyone but the earlier sessions, whose
  scripts live outside git. Expect surprises in the wave activation and in "closed" database
  semantics.
- Single serial generation worker (pool of one) and fixed 60-second lease are hazards under load.

## Decisions needed

Hosting provider and region; domain; budget; where secrets live; whether staging may use the
development identity behind an allow-list for the first alpha (**recommended: no, wait for lane
1**).

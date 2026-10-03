# PR40 idle-pool recovery: operated outage and restart

October 1, 2026, 20:26–20:37 UTC. W2 Claude session on a different host from the earlier Codex continuation. This receipt records only what was operated here.

## Host and the missing private inputs

- Host `Yingpengs-Mac-Studio.local`: Apple M2 Max, 32 GB, macOS 27.0 (26A428), Node 24.13.0, pnpm 12.5.1, Docker Desktop 29.8.0, Xcode 27.0 (27A266a).
- The earlier W2 work ran on `Yingpengs-iMac.local`. On this host, `~/.config/creator-platform/` did not exist, so these were all absent:
  - the validated `w2-creator_w2_resume.pgdump` (650,776 bytes, SHA256 `a021c261…`);
  - the older SQL gzip, `w2-receipt.json`, `w2-runtime.env` and `w2-provider.env`;
  - `w2-debug.keystore` and `secrets/openai.env`.
- Following the handoff, no other location was searched for credentials. The archive restore, its 123/105/20/658 checkpoint and every real-provider path (ingestion embeddings, evaluations, previews, known/unknown provider accounting) stay blocked on this host until the owner copies those files here. Nothing was reconstructed from receipts.

## Fresh isolated canonical runtime

- Container `creator-platform-w2-20261001`:
  - image `pgvector/pgvector:pg17` (`sha256:ac08538c…`, arm64);
  - named volume `creator-platform-w2-pg-20261001`, bound to `127.0.0.1:55442`;
  - database `creator_w2`;
  - superuser password supplied as a mounted file, never as an environment value.
- Migrations: `apps/backend/scripts/migrate-trust.ts` applied the 40 registered migrations, `0001_foundation`…`0043_w8_relationship_backfill`. Reserved `0048_w2_usage_lineage` was neither registered nor applied.
- Roles:
  - `creator_runtime` is LOGIN, NOSUPERUSER, NOBYPASSRLS and NOINHERIT;
  - `creator_owner` is NOLOGIN;
  - W2 tables have enabled and forced RLS.
- This is a new canonical database, not a restoration of lost state. Every W2 row in it was created through product actions in this session.
- Private runtime secrets (database passwords and a 32-byte session key) are in `~/.config/creator-platform/w2-mac-studio-20261001/` (0700). They are not committed.
- API: `apps/backend/src/modules/agent/development-server.ts` on `127.0.0.1:4102`. Web: Next 16.3.7 `next dev --webpack` on `127.0.0.1:3002`, using the canonical W1 cookie session. No OpenAI key exists here, so `modelFromEnvironment()` returned null and generation stays unconfigured.

Canonical sign-in data:

- Synthetic development actor one, with fan handle `w2_studio_creator`.
- Pending creator "Maya" / `kilnfire_w2` (`97152450-4093-4b15-9148-b12c16053956`), created through the Studio setup form.
- One manual text source, "Firing notes: cone 6 glaze schedule", saved as a candidate with rights evidence and a public audience.

## Before the fix (main's `integration.ts`, no pool listener)

Same runtime. A Studio reload left four idle `creator_runtime` connections in `pg_stat_activity`. A normal `docker stop` (the image's `STOPSIGNAL SIGINT` is PostgreSQL fast shutdown; the volume was retained) then terminated the API with exit 1:

- `Unhandled 'error' event`;
- `57P01 terminating connection due to administrator command`.

The raw dump printed connection identifiers (database user and name, 4 occurrences); the runtime password did not appear in it. The raw dump is kept privately and is not committed.

## After the fix (PR40 head `003669b2`, main `d6ea70e4` integrated)

1. Four idle `creator_runtime` clients existed after a Studio reload. `docker stop` returned in 0.18 s.
2. The API process stayed alive and logged exactly four lines of `An idle database connection failed and was discarded.`, one per discarded idle client. No error object, client or connection identifier was printed. `/health` returned 200.
3. During the outage:
   - `/v1/identity/session` and `/v1/identity/capabilities` returned 503 `service_unavailable` in about 1 ms;
   - the Studio BFF `/api/studio/ai/state` returned 503 `identity_unavailable`;
   - a source approval attempted in Studio showed "Action needs attention: Pantopus sign-in is temporarily unavailable. Try again." The source stayed a revision-1 candidate, and the review checkbox stayed selected.
4. `docker start` reported healthy after 6.0 s.
   - The same API process (pid 70840, no restart) answered an invalid-token session probe with 401.
   - The canonical session cookie still resolved, so the persisted creator and source were shown again (`pool-restart-sources-recovered.jpg`).
   - The approval then saved: "Source action saved", processing 20%, revision 1 (`pool-restart-approve-saved.jpg`).
5. A second stop/start cycle while Studio was open added two more fixed diagnostics, six in total. The API survived again (`pool-outage-approve-unavailable.jpg`).

Durable counts afterwards: 1 source, 0 usage, 0 evaluations, 1 identity session.

Publication gates were still closed (`publication-gates-pending.jpg`). The Test page listed all of these:

- pending creator verification;
- no active reviewed license;
- zero daily cost cap;
- no approved provider;
- missing criteria;
- no indexed source;
- source processing still running;
- no passing evaluations.

Without a provider, the draft preview returned "Connect an approved model provider before evaluating or generating."

## Defects observed, not fixed by PR40

- **Shared W1 helper:** during the outage, a server-rendered reload of `/studio/ai/sources` showed the signed-out Welcome instead of an unavailable state. `currentSession()` in `apps/web/lib/session.ts` returns null for a 503 or a fetch failure. Reported to W1 with a reproduction. The session was not lost, and the same cookie worked after the restart.
- **W2 Studio:** a failed preview shows its notice only at the top of the page, out of view of the Test form that triggered it. This is tracked for the next W2 increment.

## Limits

These outcomes are not established by this receipt:

- known/unknown provider accounting, cost holds and real cited previews, because there is no provider or archive on this host;
- licensed fan delivery;
- native clients;
- p95 measurements.

The receipt verifies PR40's narrow behavior only: an idle-client failure no longer terminates the API or prints connection internals, active requests report unavailability truthfully, and the same process resumes persisted canonical work after a normal database restart.

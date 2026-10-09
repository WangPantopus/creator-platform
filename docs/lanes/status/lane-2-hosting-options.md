# Lane 2: where to host the pilot (WP 2.3), options and monthly cost

Updated: 2026-10-09, by the lane 2 session
Status: **options only. Nothing is built or bought.** Staging starts after the founder chooses a provider, a region,
a domain and a budget (questions at the end).

## In plain words

The pilot is small (5 creators, about 500 people connected at once, about 2 AI replies started per second). Any of
these hosts can carry it. What decides the choice is not size or price, it is one rule in our own migration tool:
**it will only run as a true PostgreSQL superuser**, and the biggest managed databases (Amazon RDS, Google Cloud SQL,
and most others) do not give out a true superuser. I tested this here: the reviewed migration tool refuses the admin
account a managed database gives you. So there are two honest roads:

1. Pick a database host that does give a real superuser (one managed vendor says it does; we must check) or run
   PostgreSQL ourselves. The reviewed code stays exactly as it is.
2. Pick any managed database and change the reviewed migration tool to work without a superuser. That is a safety
   change to code that guards every fan's data, so it is a decision for you and the integrator, not something I will do.

My default is road 1, with Fly.io running the app and Crunchy Bridge running the database, at about **$195 to $260 a
month**, after a one-minute check that Bridge really gives a superuser. If that check fails, or the budget is under
about $150, I would run PostgreSQL myself on two small servers for about **$126 a month** and accept the extra work.
The big clouds cost **$263 to $443 a month** and need road 2.

## What the product needs from a host (read from the code and tested)

| Need                                                             | Why, and what I checked                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL 17 with pgvector                                      | One database, a `creator` schema, vectors for retrieval. The `vector` extension is not "trusted" in stock PostgreSQL, so the host must allow it for the admin                                                                                                                                                                                                                                                                                                                                                          |
| **A true superuser for the migration operator**                  | `migrate-trust` and `activate-wave` refuse any other admin. Run on a PostgreSQL 17 with an admin that can create roles and databases but is not a superuser (what RDS and Cloud SQL give), `migrate-trust` stopped at once: "Unsafe privacy-wave custody: separate migration administrator required" (`scripts/migration-privacy-roles.ts:52`). The operator also uses `SET SESSION AUTHORIZATION`, which PostgreSQL allows only to a superuser. Only the migrations need it; the running app uses non-superuser roles |
| Direct database connections, no transaction-mode pooler          | Realtime delivery uses `LISTEN`/`NOTIFY` on a dedicated session per API instance (`realtime/frame-notifications.ts`), and some catalogue queries are named prepared statements. Both break behind a transaction-mode pooler such as PgBouncer. Pilot connection budget is small (about 16 for the API, 4 for the Trust worker)                                                                                                                                                                                         |
| Long-lived WebSockets                                            | 500 at the pilot, 50,000 as the design target. The host must allow idle connections for minutes and drain them on deploy                                                                                                                                                                                                                                                                                                                                                                                               |
| A shared, private place for data exports                         | Exports are written to a local directory (`PrivateFileArtifacts`, the only implementation of `PrivacyArtifactStore`). With two API replicas a download can reach a machine that does not have the file. Needs an S3-compatible adapter or a single replica with a disk. See the tickets                                                                                                                                                                                                                                |
| Secrets as files or environment variables                        | The production host reads `NAME` or `NAME_FILE` (WP 2.2). Any host's secret store works                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Backups: recovery point 5 minutes, recovery time 1 hour          | `infra/environments.json` and the System Architecture. Needs continuous WAL archiving and a restore drill before the pilot (E2.6)                                                                                                                                                                                                                                                                                                                                                                                      |
| Public HTTPS, WebSocket upgrade, Stripe webhooks, outbound calls | To the model, Stripe, push gateways. No inbound database access from the internet                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## The pilot sized for pricing

From the architecture's pilot profile and `infra/environments.json`: API 2 copies at 0.5 vCPU and 1 GB; web (Next.js)
2 copies at 0.5 vCPU and 1 GB; four small workers (generation, Trust, usage expiry, Growth) at 0.25 vCPU and 0.5 GB;
the ingestion and publication workers are not started at the pilot (media is frozen; the publication worker cannot
start on `main`). Database 2 vCPU and 8 GB with 100 GB of disk. About 20 GB of object storage, 15 secrets, 10 GB of
logs and 100 GB of outbound traffic a month.

## The options (US dollars a month, one US region, pilot size)

Excluded everywhere: model usage (about $0.0075 for an uncached message, per the architecture), Stripe fees, calls
(out of pilot), push, Apple and Google developer accounts, the domain (about $1), and your time. Error bars are about
25 percent. Confidence: **[V]** from the vendor's own page this session, **[S]** from a dated third-party source,
**[K]** the standard list price as I know it, to confirm in the vendor's calculator before spending.

| Option                                                | Monthly                                       | Runs the reviewed migration tool unchanged                                     | Database backups and recovery                            | What we run ourselves                                        |
| ----------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------ |
| **A. Fly.io app + Crunchy Bridge database (default)** | **$195 lean, $261 comfortable**               | **Yes, if Bridge's `postgres` is a real superuser (their claim; check first)** | Managed, continuous, point-in-time by the vendor         | Nothing below the app                                        |
| **B. Two servers we run (DigitalOcean)**              | **$126**                                      | **Yes**                                                                        | Ours: WAL archiving to object storage plus weekly images | PostgreSQL patching, backups, disk, failover (none at pilot) |
| C. AWS: RDS, Fargate, load balancer                   | $263 (one zone), $368 (database in two zones) | **No**                                                                         | Managed, 5 minute point-in-time                          | Nothing below the app                                        |
| D. Google Cloud: Cloud SQL, Cloud Run                 | $325 (one zone), $443 (database in two zones) | **No**                                                                         | Managed, point-in-time                                   | Nothing below the app                                        |

How each line is made:

- **A.** Fly Machines **[V]**: API 2 at $6.70 (lean, shared CPU, 1 GB) or $33.00 (comfortable, dedicated CPU, 2 GB), web 2 at
  $6.70 or $13.39, workers 4 at $3.69; a dedicated address $2 **[K]**. Crunchy Bridge Standard-8 (2 cores, 8 GB) $140 **[S]**
  plus about $10 of disk (unconfirmed). Cloudflare Free in front for DNS and certificates. High availability on Bridge is
  extra and its price by tier is not published on the page I could read. Crunchy Data's own site now says it is joining
  Snowflake; ask what that means for Bridge's price and roadmap before committing.
- **B.** Two DigitalOcean Basic droplets, 4 vCPU and 8 GB each, $48 **[V]** (one for the database, one for the app);
  weekly backups 20 percent **[V]**; a 100 GB disk about $10 **[K]**; WAL archive and exports in Cloudflare R2 at
  $0.015 per GB, 10 GB free **[V]**. Cloudflare Free in front. A single 8 vCPU, 16 GB server is the same price and one
  fewer thing to run, with no second machine to fail over to.
- **Not priced:** Hetzner Cloud, the usual cheap choice, raised prices about 30 percent in April 2026 and again in June, and has
  reported limited availability since late June, so I used DigitalOcean for the servers we run ourselves **[S]**.
- **C.** RDS PostgreSQL db.t4g.large $94 **[S]** (two zones $188), 100 GB gp3 $11.50 **[S]**; Fargate $108 **[V]**
  (2 API, 2 web, 4 workers, at $0.040478 per vCPU-hour and $0.004446 per GB-hour); load balancer about $22, firewall
  about $11, Secrets Manager 15 secrets at $0.40 **[V]**, logs and metrics about $8, DNS and object storage about $2 **[K]**.
- **D.** Cloud SQL Enterprise 2 vCPU and 8 GB at $0.0413 per vCPU-hour and $0.007 per GB-hour **[S]** is $101, 100 GB SSD
  $17 (both double in two zones); Cloud Run with the CPU always on, about $173 **[K]**; load balancer about $18, firewall,
  secrets, logs and DNS about $14 **[K]**.

Managed databases that share C and D's superuser problem, for completeness (database only): DigitalOcean Managed
PostgreSQL 4 GiB $60.90 plus disk **[V]**; Supabase Pro $25 plus a Large compute add-on $110 plus point-in-time recovery
$100 **[V]**; Fly Managed Postgres Launch (8 GB) $282 plus $0.28 per GB **[V]**, with pgvector included and the admin role
and version 17 unconfirmed on the page. RDS says it outright: the `postgres` user "specifically disallows PostgreSQL
`superuser` permissions" and "you can't connect using the PostgreSQL `superuser` account". Cloud SQL: customers "cannot
create or have access to users with superuser attributes".

## Things that matter whichever you pick

- **Run the superuser check on any candidate before paying for it.** On a scratch database from the provider, as its
  admin: `select rolsuper from pg_roles where rolname = current_user` must say `t`. Then
  `cd apps/backend && DATABASE_MIGRATION_URL=<admin url> W8_LEGACY_ROOT_MIGRATIONS=false node --import tsx scripts/migrate-trust.ts`
  must finish. Two minutes, and it answers the question this document turns on.
- **Rate limits and the edge** are cheap in front of any option: Cloudflare Free covers DNS, certificates and basic
  protection; its rate-limit rules on the free plan are few, and the paid plan starts around $25 a month (**[K]**, not
  confirmed this session). Without it, the cloud firewalls above cost $5 to $11 a month plus rules.
- **Infrastructure as code.** Everything here has a Terraform or OpenTofu provider (Fly, Cloudflare, DigitalOcean, AWS,
  Google). I would write the staging environment as one OpenTofu root per provider under `infra/`, secrets kept in the
  provider's store and never in git, and nothing applied without the integrator.
- **High availability is not in the pilot's numbers.** The stated goal (99.9 percent a month, five minute recovery point,
  one hour recovery time) is met on paper by one database with continuous archiving and a restore drill; two zones only
  shorten the outage. Money paid to double the database is the first thing to cut if the budget is tight.

## What I need you to decide

1. **Road 1 or road 2?** Run the reviewed migration tool as it is (options A or B), or authorise changing it so a managed
   database without a superuser works (options C or D, and any managed database). I recommend road 1.
2. **Provider and region.** My default: Option A, Fly.io Ashburn (`iad`) with Bridge in AWS `us-east-1`; fallback B.
3. **A monthly ceiling.** The lean A is about $195; I would not start below about $126.
4. **The domain** the web app and API will live on (and who owns its registrar account).
5. **Whose cloud account** holds the infrastructure (a Pantopus account, so it stays the shared account).

## What I will do after the choice, and what stays blocked

- Write the staging environment as code, bring it up, and run scenarios E2.3 (HTTPS valid, HTTP redirects, HSTS, CORS,
  rate limits answer 429) and E2.6 (backup, restore into a scratch database with matching counts, measured recovery).
- Container files and a build that bakes the commit into the bundle, so the production host's release check can run.
- Not before: workers as separate units (WP 2.4) wait on this choice, and **nothing deploys without the integrator**.

## Tickets

| To                  | File                                                                              | Change                                                                           | Why                                                            |
| ------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Lane 1, integrator  | `modules/trust/private-file-artifacts.ts` and a new adapter                       | An S3-compatible `PrivacyArtifactStore`                                          | Exports on local disk cannot be downloaded across API replicas |
| Integrator, founder | `apps/backend/scripts/migration-privacy-roles.ts:52` and the other custody checks | Only if road 2 is chosen: a reviewed way to run the operator without a superuser | RDS, Cloud SQL and most managed databases cannot run it today  |

## Sources

[RDS: the `rds_superuser` role](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.Roles.rds_superuser.html) ·
[Cloud SQL: users and roles](https://docs.cloud.google.com/sql/docs/postgres/users) ·
[Fargate pricing](https://aws.amazon.com/fargate/pricing/) ·
[Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/) ·
[Fly.io pricing](https://docs.fly.io/about/pricing) ·
[Fly Managed Postgres](https://docs.fly.io/mpg) ·
[DigitalOcean managed databases](https://www.digitalocean.com/pricing/managed-databases) ·
[DigitalOcean droplets](https://www.digitalocean.com/pricing/droplets) ·
[Supabase pricing](https://supabase.com/pricing) ·
[Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) ·
[Bytebase: RDS db.t4g.large](https://www.bytebase.com/dbcost/rds/instance/db.t4g.large/) ·
[Bytebase: Cloud SQL pricing](https://www.bytebase.com/dbcost/cloudsql-pricing/) ·
[Crunchy Bridge plans (CostBench)](https://costbench.com/software/database-as-service/crunchy-bridge/).

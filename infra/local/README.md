# The local stack: one command

Brings up a complete Qelvora stack on your Mac, from nothing, on the synthetic
development identity. Local use only: nothing here is a deployment, a secret or a
production setting.

```
node infra/local/stack.mjs up --lane 2
```

(Lane N uses `--lane N`. A second stack, or a label such as `3a`, needs
`--base-port`.) `up` is safe to repeat. It ends by running the smoke check:
a fan signs in, opens a conversation with the fictional creator Maya, sends a
message and must see the acknowledgment (and be refused as a signed-out visitor or another
fan); then the AI's first sentence should arrive. That last part only warns, because it
depends on the machine's load (see "Things to know"); `smoke --require-reply` makes it fail.

| Command                            | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `up`                               | Everything below, then the smoke check. `--no-web`, `--no-ai`, `--no-smoke`, `--ack-only` skip parts. `--db-only` brings up just the database, its roles and the seed, for work that runs its own host (the production host's scenario, E2.2). `--growth` also composes the Growth module (see below). `--env KEY=VALUE` adds backend settings, `--web-env KEY=VALUE` adds web settings. Options are not remembered: pass them every time, and a changed option restarts only the backend |
| `status`                           | What is running and healthy (exit 0 only if all of it is)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `smoke`                            | Sign in, send a message, see the acknowledgment                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `env`                              | The addresses, and `CREATOR_TEST_DATABASE_URL` for the existing test suites                                                                                                                                                                                                                                                                                                                                                                                                               |
| `logs backend\|web\|model [-n 80]` | The tail of a service log                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `stop`                             | Stop everything and keep the data; `up` brings it back                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `down`                             | Remove everything this stack created: processes, container, volume, files                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `reset`                            | `down`, then `up`: a stack rebuilt from nothing                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## What you get

| Part                        | Address (lane 2)         | Notes                                                                                                                                             |
| --------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL 17 with pgvector | `127.0.0.1:56420`        | Container `qelvora-lane2-postgres`, volume `qelvora-lane2-pgdata`. All 114 registered migrations, the seed, a password on every login role        |
| Backend                     | `http://127.0.0.1:56421` | The real `server.ts`, development identity, trust runtime, Maya's AI live. The generation, trust and usage-expiry workers run inside this process |
| Web                         | `http://localhost:56422` | `next dev`, pointed at that backend                                                                                                               |
| Model fake                  | `127.0.0.1:56423`        | Stands in for the model provider (see below)                                                                                                      |
| Ports 56424 to 56429        | yours                    | Free for your own use                                                                                                                             |

Lane N uses `564N0` to `564N9`; `--base-port` moves the range, and `QELVORA_LANE`
can stand in for `--lane`. Names always start with `qelvora-laneN-`, and the container
and volume also carry the label `qelvora.stack=laneN`. Only objects with that name and
label are ever reused or removed: a foreign container or volume with the same name makes
`up` stop and `down` leave it alone. The preserved databases and containers are never
involved.

**Sign in** with the development accounts: fans 1 and 2, Maya (the creator) is 3,
the Ops supervisor is 4. Maya is `20000000-0000-4000-8000-000000000001`. Fans create
their profile through the product; nothing about a fan, consent, grant, payment or
message is seeded. Maya's AI is published through the real Studio API (draft,
development license, six-case evaluation, publish), not written into tables.

## Before the first run

- Docker Desktop running, and the image `pgvector/pgvector:pg17` on this Mac. If it
  is missing the command stops and says so: pulling it is a download that needs the
  founder's yes.
- The toolchain from the working agreement (section 3.7) and `pnpm install
--frozen-lockfile --offline` done once in the worktree.
- Ten free ports. A taken port stops the command before anything is created, and the
  message names the port and the process holding it.

## The model fake

The backend's calls to the model provider are sent to a local fake
(`infra/local/fake-edge/model.mjs`) by a Node preload that refuses to load outside
`NODE_ENV=development` on loopback. It is deliberately permissive: every guard and
judge call approves, replies are two fixed sentences, embeddings are hashed words.
It proves plumbing, not model quality or guard strictness. A scenario about the guard
needs the real provider. Failure injection, for "provider down, slow or rejecting":

```
curl -s -XPOST http://127.0.0.1:56423/__control -d '{"mode":"error500"}'   # ok | error500 | error429 | hang | garbage
curl -s http://127.0.0.1:56423/__stats                                      # calls per purpose, recent requests
```

## Running the existing test suites against it

The database container is also the disposable test database the working agreement
describes (the `postgres` and `creator_runtime` passwords are the repository's
documented loopback-only test constant, `foundation-test-only`):

```
eval "$(node infra/local/stack.mjs env --lane 2 | sed 's/^/export /')"
(cd apps/backend && pnpm exec vitest run tests/commerce-money-limits.test.ts)
```

## Things to know

- **Replies need a quiet machine.** The acknowledgment is fast and steady (about
  230 to 900 ms, even at load average 30). The AI's reply is generated by a worker
  that re-verifies its database catalogue about 60 times inside one transaction with a
  fixed 5 second window. In one run at load average 12 the first sentence arrived after
  7 s and the reply finished 4 s later; at load 17 to 30 replies failed or stalled in most
  runs, and the creator's budget then refuses further replies ("uncertain provider cost")
  until `reset`. The smoke prints the host load when this happens, `up` prints it at the
  end, and `--ack-only` skips the reply for work that only needs the acknowledgment. This is a
  product limit, reported to lane 3, not something the stack can tune away.
- **The web thread screen** (`/threads/<creator>/<fan>`) stayed on "Loading your
  messages…" in my run at load average 30, while the page's own thread request returned
  200 and its `/offline` probe returned 503 (offline reading needs a verified provider
  policy, which a development stack never has). The page also polled the session
  endpoint hundreds of times; the launch review already records the identity heartbeat
  re-keying screens, and that is my hypothesis for the stall, not something I proved.
  Sign-in, Home and the chat entry page (`/creators/maya/chat`) work.
- **`--growth`** adds the Growth module: a login `growth_api` that inherits only the two
  request roles (what `db/growth-api-pool.ts` requires), the Growth worker URL and a
  generated key. The public creator page then answers. The reviewed generation-purpose
  catalogue treats that extra login as drift, so once all 114 migrations are applied the
  stack no longer repeats the migration checks on later runs. No HTTPS origin exists
  locally, so `GROWTH_PUBLIC_ORIGIN` is left unset (pass one with `--env` if you need it).
  Notifications, shares and the senders are not exercised by the stack.
- **`apps/web/next-env.d.ts`** is a tracked file that `next dev` rewrites. While the web
  app runs the stack hides it from git (`skip-worktree`); `stop` and `down` restore the
  original and undo that.
- **Cookies are per host, not per port.** Two stacks on `localhost` share a browser's
  cookies; use a private window per stack.
- **Not started:** the publication worker (needs held migrations 0073 and 0201 and its
  login role, none of which is in the registered graph) and the ingestion worker (needs
  ffmpeg and clamd, and media is frozen).
- **Migrations.** `scripts/activate-wave.ts` is the reviewed operator for databases that
  hold data, and at the current registry it cannot walk a fresh database past the
  content wave. For a database this stack has just created and that holds no rows,
  `apps/backend/src/operations/local/fresh-install.ts` applies the same checksum-pinned
  SQL in the same wave order in one transaction, and finishes with the repository's own
  final role-safety and privacy-catalogue assertions. It refuses any database that holds
  a business row. Never point it at anything else.

## Where things live

Per-stack files (logs, the generated settings, secrets, process records) are under
`qelvora-stack/laneN/` in the system temporary directory, mode 0700, outside Git.
`down` removes them. Nothing here contains, or should ever contain, a real secret.

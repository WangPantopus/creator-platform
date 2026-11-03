# The local stack

`infra/local/stack.mjs` brings up a complete Qelvora stack on a Mac from nothing, on the synthetic
development identity: PostgreSQL 17 with pgvector, the backend with its workers, the web app and a
model fake. It is for local use only: nothing in it is a deployment, a secret or a production
setting. The full reference, with every command, option and address, is
[infra/local/README.md](../../infra/local/README.md).

## Use it

```sh
node infra/local/stack.mjs up --lane N --base-port P [--growth] [--no-web] [--no-smoke]
```

- `up` is safe to repeat. It ends with a smoke check: a fan signs in, opens a conversation with the
  development creator Maya and must see the acknowledgment; the AI's first sentence only warns,
  because it depends on the machine's load (`smoke --require-reply` makes it fail).
- `status`, `smoke`, `env` (the addresses and `CREATOR_TEST_DATABASE_URL`), `logs`, `stop` (keeps
  the data), `down` (removes everything the stack created) and `reset` (`down`, then `up`).
- `catalogues check|snapshot|diff|write` compares the database with the reviewed catalogue pins.
  A new migration changes them, and the product refuses to start until they are regenerated
  ([the procedure](../lanes/status/lane-2-catalogue-pins.md)).
- `--growth` also composes the Growth module, which the public creator page needs.
- Each stack takes its own block of ten ports, chosen by `--lane` or `--base-port`. Only containers,
  volumes and files that carry the stack's own name and label are ever reused or removed.

## What to know

- **Use a fresh stack for evidence.** A reused stack fails scenarios on leftover state. Reset only a
  stack your task created; never reset a database or device someone else uses.
- **API URLs take no trailing slash.**
- **The lane 6 output folder needs mode 0700.**
- **Replies need a quiet machine.** The acknowledgment is fast and steady, but the AI's reply runs
  in a worker with a fixed 5-second window. On a busy Mac replies stall, and the creator's budget
  then refuses further replies until `reset`. `--ack-only` skips the reply.
- **The model fake** approves every guard and judge call and answers with two fixed sentences. It
  proves plumbing, not model quality or guard strictness. It can also inject provider failures.
- **Claude instead of the fake:** `--provider anthropic` speaks Claude's protocol to the same fake
  at no cost. The real model goes through the founder's capped gateway, the only process that holds
  the key ([Claude as the generation provider](../operations/anthropic-provider.md)).
- **Sign-in** on the stack uses the development accounts: fans 1 and 2, Maya (the creator) 3, the
  ops supervisor 4. Nothing about a fan, consent, grant, payment or message is seeded; Maya's AI is
  published through the real Studio API.
- **Migrations** on a new, empty stack database are applied by the local installer
  (`apps/backend/src/operations/local/fresh-install.ts`), which refuses any database that holds a
  business row. Databases that hold data go through the reviewed operator ([migrations](migrations.md)).
- **Not started:** the publication worker (its migrations and login are not registered) and the
  ingestion worker (media is frozen).
- Two stacks on `localhost` share a browser's cookies; use a private window for each.

## The existing test suites

The stack's database doubles as the disposable test database:

```sh
eval "$(node infra/local/stack.mjs env --lane N | sed 's/^/export /')"
(cd apps/backend && pnpm exec vitest run tests/commerce-money-limits.test.ts)
```

The end-to-end scenarios live under `tests/scenarios/`, one folder per lane plus `integrator/`.
Each says at its top which stack options it needs. They run by hand today, not in CI
([ci.md](ci.md)).

/** Ops reviewers (WP 1.6, O2, founder 2026-10-16): the founder adds, changes
 * and removes them. Run with the migration login, never the runtime one:
 *
 *   DATABASE_MIGRATION_URL=… pnpm --filter @qelvora/backend exec tsx \
 *     src/modules/trust/ops-members.ts <list|add|remove> [options]
 *
 *   add     --account ID --queues safety,support [--supervisor]
 *           --expires YYYY-MM-DD --operator NAME --reason TEXT
 *           (adds a reviewer, or replaces an existing one's queues, role and
 *           expiry)
 *   remove  --account ID --operator NAME --reason TEXT
 *   list    [--changes]
 *
 * A reviewer is an active Qelvora account. Every change ends the reviewer's
 * open case leases and is logged with the operator and the reason. Output is
 * one JSON object per line; the database address is never printed. */
import { parseArgs } from "node:util";
import pg from "pg";
import { z } from "zod";

const QUEUES = [
  "safety",
  "disputes",
  "verification",
  "pauses",
  "support",
] as const;
const Who = z.object({
  account: z.uuid(),
  operator: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(4).max(500),
});
const Member = Who.extend({
  queues: z
    .string()
    .transform((value) => [
      ...new Set(value.split(",").map((queue) => queue.trim())),
    ])
    .pipe(z.array(z.enum(QUEUES)).min(1)),
  supervisor: z.boolean(),
  // A date, ending at its last second in UTC: in the future, at most a year on.
  expires: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u)
    .transform((value) => new Date(`${value}T23:59:59Z`))
    .refine(
      (date) =>
        !Number.isNaN(date.getTime()) &&
        date.getTime() > Date.now() &&
        date.getTime() <= Date.now() + 366 * 24 * 3600_000,
      "The expiry must be a real date, in the future and at most a year away.",
    ),
});

class Refused extends Error {}

async function transaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
/** Only an active Qelvora account can review cases. */
async function assertAccount(client: pg.PoolClient, account: string) {
  await client.query("SET LOCAL ROLE creator_owner");
  const state = (
    await client.query<{ state: string }>(
      "SELECT state FROM creator.account WHERE id=$1",
      [account],
    )
  ).rows[0]?.state;
  if (state !== "active")
    throw new Refused(
      state
        ? `Account ${account} is ${state}.`
        : `Account ${account} is not a Qelvora account.`,
    );
  await client.query("SET LOCAL ROLE creator_trust_owner");
}
const endLeases = async (client: pg.PoolClient, account: string) =>
  (
    await client.query(
      "UPDATE creator_trust.case_access SET expires_at=now() WHERE account_id=$1 AND expires_at>now()",
      [account],
    )
  ).rowCount ?? 0;

async function add(pool: pg.Pool, input: z.infer<typeof Member>) {
  return transaction(pool, async (client) => {
    await assertAccount(client, input.account);
    const saved = (
      await client.query<{ inserted: boolean }>(
        `INSERT INTO creator_trust.ops_member(account_id,queues,supervisor,expires_at) VALUES($1,$2,$3,$4)
         ON CONFLICT(account_id) DO UPDATE SET queues=excluded.queues,supervisor=excluded.supervisor,expires_at=excluded.expires_at,revoked_at=NULL
         RETURNING xmax=0 AS inserted`,
        [input.account, input.queues, input.supervisor, input.expires],
      )
    ).rows[0]!;
    const change = saved.inserted ? "added" : "updated";
    const leasesEnded = saved.inserted
      ? 0
      : await endLeases(client, input.account);
    await client.query(
      "INSERT INTO creator_trust.ops_member_change(account_id,change,queues,supervisor,expires_at,operator,reason) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        input.account,
        change,
        input.queues,
        input.supervisor,
        input.expires,
        input.operator,
        input.reason,
      ],
    );
    return {
      change,
      account: input.account,
      queues: input.queues,
      supervisor: input.supervisor,
      expiresAt: input.expires.toISOString(),
      leasesEnded,
    };
  });
}
async function remove(pool: pg.Pool, input: z.infer<typeof Who>) {
  return transaction(pool, async (client) => {
    await client.query("SET LOCAL ROLE creator_trust_owner");
    const removed = await client.query(
      "UPDATE creator_trust.ops_member SET revoked_at=now() WHERE account_id=$1 AND revoked_at IS NULL",
      [input.account],
    );
    if (!removed.rowCount)
      throw new Refused(`Account ${input.account} is not an active reviewer.`);
    const leasesEnded = await endLeases(client, input.account);
    await client.query(
      "INSERT INTO creator_trust.ops_member_change(account_id,change,operator,reason) VALUES($1,'removed',$2,$3)",
      [input.account, input.operator, input.reason],
    );
    return { change: "removed", account: input.account, leasesEnded };
  });
}
async function list(pool: pg.Pool, changes: boolean) {
  return transaction(pool, async (client) => {
    await client.query("SET LOCAL ROLE creator_trust_owner");
    return (
      await client.query(
        changes
          ? 'SELECT account_id AS "account",change,queues,supervisor,expires_at AS "expiresAt",operator,reason,created_at AS "createdAt" FROM creator_trust.ops_member_change ORDER BY created_at DESC,id DESC LIMIT 200'
          : 'SELECT account_id AS "account",queues,supervisor,expires_at AS "expiresAt",revoked_at AS "revokedAt",(revoked_at IS NULL AND expires_at>now()) AS active FROM creator_trust.ops_member ORDER BY active DESC,account_id',
      )
    ).rows;
  });
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      account: { type: "string" },
      queues: { type: "string" },
      supervisor: { type: "boolean", default: false },
      expires: { type: "string" },
      operator: { type: "string" },
      reason: { type: "string" },
      changes: { type: "boolean", default: false },
    },
  });
  const command = positionals[0];
  if (!["list", "add", "remove"].includes(command ?? ""))
    throw new Refused("Use list, add or remove (see the top of this file).");
  if (!process.env.DATABASE_MIGRATION_URL)
    throw new Refused(
      "Set DATABASE_MIGRATION_URL to the migration login; the runtime login cannot change reviewers.",
    );
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_MIGRATION_URL,
    max: 1,
  });
  try {
    if (command === "list")
      for (const row of await list(pool, values.changes))
        console.log(JSON.stringify(row));
    else if (command === "add")
      console.log(JSON.stringify(await add(pool, Member.parse(values))));
    else console.log(JSON.stringify(await remove(pool, Who.parse(values))));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Refused
      ? error.message
      : error instanceof z.ZodError
        ? error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")
        : `Failed: ${(error as { code?: string }).code ?? "error"} ${(error as Error).message}`;
  console.error(JSON.stringify({ refused: message }));
  process.exit(1);
});

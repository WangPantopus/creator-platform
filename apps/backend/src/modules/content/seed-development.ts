/** Synthetic profile prerequisites only. No signed acts, provider outcomes or payments. */
import pg from "pg";
const connectionString = process.env.DATABASE_MIGRATION_URL;
if (
  process.env.NODE_ENV !== "development" ||
  !connectionString ||
  new URL(connectionString).hostname !== "127.0.0.1" ||
  new URL(connectionString).port !== "55435" ||
  new URL(connectionString).pathname !== "/creator_w5"
)
  throw new Error("Only the isolated W5 development database may be seeded.");
const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(
    "INSERT INTO creator.creator_profile(id,account_id,handle,display_name,verification) VALUES('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','w5_development','W5 development creator','verified') ON CONFLICT(id) DO NOTHING",
  );
  for (let n = 1; n <= 4; n++)
    await client.query(
      "INSERT INTO creator.fan_profile(id,account_id,handle) VALUES($1,$2,$3) ON CONFLICT(account_id) DO NOTHING",
      [
        `60000000-0000-4000-8000-00000000000${n}`,
        `10000000-0000-4000-8000-00000000000${n}`,
        `w5_actor_${n}`,
      ],
    );
  await client.query(
    "INSERT INTO creator.team_membership(creator_id,account_id,roles) VALUES('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004',ARRAY['triage','drafter','publisher']) ON CONFLICT DO NOTHING",
  );
  await client.query("COMMIT");
  process.stdout.write(
    "Seeded four synthetic profiles and one synthetic creator/team role. No provider, signing, payment, membership or delivery evidence was seeded.\n",
  );
} catch (failure) {
  await client.query("ROLLBACK");
  throw failure;
} finally {
  client.release();
  await pool.end();
}

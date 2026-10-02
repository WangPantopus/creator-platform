import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

export type DataTables = { schema: string; name: string; columns: string[] }[];
/** Private in-process snapshot. FETCH stays bounded; no raw row is logged or
 * returned. Original columns distinguish preservation from additive backfills. */
export async function waveDataTables(client: PoolClient): Promise<DataTables> {
  return (
    await client.query<{ schema: string; name: string; columns: string[] }>(
      `SELECT n.nspname AS schema,c.relname AS name,array_agg(a.attname::text ORDER BY a.attnum) AS columns
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
     WHERE n.nspname IN('creator','creator_trust','growth') AND c.relkind IN('r','p')
       AND a.attnum>0 AND NOT a.attisdropped AND NOT (n.nspname='creator' AND c.relname='schema_migration')
     GROUP BY n.nspname,c.relname ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"`,
    )
  ).rows;
}
export async function waveDataDigest(client: PoolClient, tables: DataTables) {
  await client.query("SET LOCAL timezone='UTC'");
  const hash = createHash("sha256");
  let rows = 0;
  for (const table of tables) {
    const identifier = `${client.escapeIdentifier(table.schema)}.${client.escapeIdentifier(table.name)}`;
    hash.update(JSON.stringify(table) + "\n");
    await client.query(
      `DECLARE w8_wave_rows NO SCROLL CURSOR FOR SELECT to_jsonb(r)::text AS document FROM (SELECT ${table.columns.map((c) => client.escapeIdentifier(c)).join(",")} FROM ${identifier}) r ORDER BY (to_jsonb(r)::text) COLLATE "C"`,
    );
    try {
      for (;;) {
        const batch = (
          await client.query<{ document: string }>(
            "FETCH FORWARD 100 FROM w8_wave_rows",
          )
        ).rows;
        if (!batch.length) break;
        for (const row of batch) {
          if (Buffer.byteLength(row.document) > 8 * 1024 * 1024)
            throw new Error("wave_snapshot_row_bound");
          hash.update(row.document + "\n");
          rows++;
          if (!Number.isSafeInteger(rows))
            throw new Error("wave_snapshot_count_bound");
        }
      }
    } finally {
      await client.query("CLOSE w8_wave_rows");
    }
  }
  return { rows, tables: tables.length, sha256: hash.digest("hex") };
}
export async function waveRoleCustody(client: PoolClient) {
  return (
    await client.query<{
      role: string;
      attributes: unknown;
      memberships: unknown;
    }>(
      `SELECT r.rolname AS role,jsonb_build_object('super',r.rolsuper,'inherit',r.rolinherit,'login',r.rolcanlogin,
      'createDb',r.rolcreatedb,'createRole',r.rolcreaterole,'replication',r.rolreplication,'bypassRls',r.rolbypassrls,
      'connections',r.rolconnlimit,'validUntil',r.rolvaliduntil,'configuration',r.rolconfig) AS attributes,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('role',p.rolname,'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option) ORDER BY p.rolname),'[]'::jsonb)
       FROM pg_auth_members m JOIN pg_roles p ON p.oid=m.roleid WHERE m.member=r.oid) AS memberships
      FROM pg_roles r ORDER BY r.rolname COLLATE "C"`,
    )
  ).rows;
}

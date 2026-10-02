import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { canonical, sha256 } from "./migration-custody.js";

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

/** Backup/restore supplement: every role's effective default/PUBLIC/direct ACL,
 * including column, database, sequence, type, language and foreign capabilities.
 * Secret-bearing role/foreign options are hashed inside PostgreSQL. Only a
 * count/hash escapes this helper; table policies/definitions remain in the
 * existing schema custody snapshot. Normalize the restored database name and
 * physical TOAST names to their logical parent; preserve every owner and ACL.
 */
export async function waveSecurityCustody(client: PoolClient) {
  await client.query("SET LOCAL search_path=pg_catalog");
  const rows = (
    await client.query(
      `WITH objects(kind,target,owner,acl) AS (
       SELECT 'database','<target>',datdba,coalesce(datacl,acldefault('d',datdba)) FROM pg_database WHERE datname=current_database()
       UNION ALL SELECT 'schema',nspname,nspowner,coalesce(nspacl,acldefault('n',nspowner)) FROM pg_namespace WHERE nspname !~ '^pg_(temp|toast_temp)_'
       UNION ALL SELECT 'relation',CASE WHEN parent.oid IS NOT NULL THEN format('%I.%I.<toast>',pn.nspname,parent.relname) ELSE format('%I.%I',n.nspname,c.relname) END,c.relowner,coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S' ELSE 'r' END::"char",c.relowner))
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_class parent ON parent.reltoastrelid=c.oid LEFT JOIN pg_namespace pn ON pn.oid=parent.relnamespace
        WHERE c.relkind IN('r','p','v','m','f','S','t') AND n.nspname !~ '^pg_(temp|toast_temp)_'
       UNION ALL SELECT 'column',format('%I.%I.%I',n.nspname,c.relname,a.attname),c.relowner,a.attacl
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL AND n.nspname !~ '^pg_(temp|toast_temp)_'
       UNION ALL SELECT 'function',format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),p.proowner,coalesce(p.proacl,acldefault('f',p.proowner))
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_(temp|toast_temp)_'
       UNION ALL SELECT 'type',CASE WHEN parent.oid IS NOT NULL THEN format('%I.%I.<toast-type>',pn.nspname,parent.relname) ELSE format('%I.%I',n.nspname,t.typname) END,t.typowner,coalesce(t.typacl,acldefault('T',t.typowner))
        FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_class toast ON toast.reltype=t.oid LEFT JOIN pg_class parent ON parent.reltoastrelid=toast.oid LEFT JOIN pg_namespace pn ON pn.oid=parent.relnamespace
        WHERE n.nspname !~ '^pg_(temp|toast_temp)_'
       UNION ALL SELECT 'language',lanname,lanowner,coalesce(lanacl,acldefault('l',lanowner)) FROM pg_language
       UNION ALL SELECT 'foreignWrapper',fdwname,fdwowner,coalesce(fdwacl,acldefault('F',fdwowner)) FROM pg_foreign_data_wrapper
       UNION ALL SELECT 'foreignServer',srvname,srvowner,coalesce(srvacl,acldefault('s',srvowner)) FROM pg_foreign_server
       UNION ALL SELECT 'largeObject',oid::text,lomowner,coalesce(lomacl,acldefault('L',lomowner)) FROM pg_largeobject_metadata
       UNION ALL SELECT 'tablespace',spcname,spcowner,coalesce(spcacl,acldefault('t',spcowner)) FROM pg_tablespace
       UNION ALL SELECT 'default',format('%s:%s:%s',r.rolname,coalesce(n.nspname,'<global>'),d.defaclobjtype),d.defaclrole,d.defaclacl
        FROM pg_default_acl d JOIN pg_roles r ON r.oid=d.defaclrole LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
       UNION ALL SELECT 'parameter',parname,NULL,paracl FROM pg_parameter_acl
      ), records AS (
       SELECT kind,target,coalesce(r.rolname,'<none>') AS owner,jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) AS detail
        FROM objects o LEFT JOIN pg_roles r ON r.oid=o.owner LEFT JOIN LATERAL aclexplode(o.acl) a ON true
       UNION ALL SELECT 'role',rolname,rolname,jsonb_build_object('super',rolsuper,'inherit',rolinherit,'login',rolcanlogin,'createDb',rolcreatedb,'createRole',rolcreaterole,'replication',rolreplication,'bypassRls',rolbypassrls,'connections',rolconnlimit,'validUntil',rolvaliduntil,'configHash',encode(sha256(convert_to(coalesce(rolconfig::text,''),'UTF8')),'hex')) FROM pg_roles
       UNION ALL SELECT 'membership',format('%s:%s',r.rolname,u.rolname),pg_get_userbyid(m.grantor),jsonb_build_object('admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
        FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid JOIN pg_roles u ON u.oid=m.member
       UNION ALL SELECT 'foreignOptions',srvname,pg_get_userbyid(srvowner),jsonb_build_object('hash',encode(sha256(convert_to(coalesce(srvoptions::text,''),'UTF8')),'hex')) FROM pg_foreign_server
       UNION ALL SELECT 'foreignMapping',format('%s:%s',s.srvname,CASE WHEN u.umuser=0 THEN 'PUBLIC' ELSE pg_get_userbyid(u.umuser) END),pg_get_userbyid(s.srvowner),jsonb_build_object('hash',encode(sha256(convert_to(coalesce(u.umoptions::text,''),'UTF8')),'hex')) FROM pg_user_mapping u JOIN pg_foreign_server s ON s.oid=u.umserver
      ) SELECT * FROM records ORDER BY kind COLLATE "C",target COLLATE "C",owner COLLATE "C",(detail::text) COLLATE "C"`,
    )
  ).rows;
  return { records: rows.length, sha256: sha256(canonical(rows)) };
}

export type SequenceState = {
  schema: string;
  name: string;
  lastValue: string;
  called: boolean;
};
/** Private values remain in-process. Original sequences must survive a wave;
 * new wave-created sequences are checked in final fresh-install custody. */
export async function waveSequenceCustody(
  client: PoolClient,
  original?: readonly Pick<SequenceState, "schema" | "name">[],
) {
  const names =
    original ??
    (
      await client.query<{ schema: string; name: string }>(
        `SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE c.relkind='S' AND n.nspname IN('creator','creator_trust','growth') ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"`,
      )
    ).rows;
  const values: SequenceState[] = [];
  for (const name of names) {
    const row = (
      await client.query<{ lastValue: string; called: boolean }>(
        `SELECT last_value::text AS "lastValue",is_called AS called FROM ${client.escapeIdentifier(name.schema)}.${client.escapeIdentifier(name.name)}`,
      )
    ).rows[0];
    if (!row) throw new Error("sequence_custody_unavailable");
    values.push({ ...name, ...row });
  }
  return {
    sequences: values.length,
    sha256: sha256(canonical(values)),
    values,
  };
}

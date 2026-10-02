import type { Pool } from "pg";
import type { Database } from "../../db/database.js";
import { DomainError } from "../../core/errors.js";
import {
  createSignatureReadFence,
  SIGNATURE_READ_FENCE_MIGRATION,
} from "../identity/signature-read-fence.js";
import {
  createCommercePublicPacketReader,
  PUBLIC_PACKET_READ_MIGRATION,
  type PublicPacketNegativeAuthority,
} from "./public-packet-read.js";

type Migration = Readonly<{ version: string; checksum: string }>;
export type CommercePublicPacketConfiguration = Readonly<{
  migrations: Readonly<{
    packet: Migration;
    denial: Migration;
    signature: Migration;
  }>;
  /** The canonical host's actual W8 negative/restore authority, on the caller's
   * held transaction. No outside-client check or creator Actor is a substitute.
   */
  holdNegativeAuthority: PublicPacketNegativeAuthority;
}>;
type Reader = Awaited<ReturnType<typeof createCommercePublicPacketReader>>;
export type CommercePublicPacketHost = Readonly<
  Pick<Reader, "prepare" | "preparePositive" | "read">
>;
const prepared = new WeakMap<CommercePublicPacketHost, Pool>();

export function assertCommercePublicPacketHost(
  host: CommercePublicPacketHost,
  pool: Pool,
) {
  if (prepared.get(host) !== pool)
    throw new DomainError(
      "public_packet_host_mismatch",
      "Public request reads require the prepared host on this runtime pool.",
      503,
    );
}

/** One read-only graph: W8 negatives first, W5 positives for the whole bounded
 * creator page, W4 mode/packet fences, then W1 actual source signatures last.
 * This does not register SQL, enable publication or authorize a mutation.
 */
export async function createCommercePublicPacketHost(
  input: CommercePublicPacketConfiguration & { database: Database },
): Promise<CommercePublicPacketHost> {
  const migrations = [
    [input.migrations.packet, PUBLIC_PACKET_READ_MIGRATION],
    [input.migrations.denial, "0076_w8_public_packet_denial"],
    [input.migrations.signature, SIGNATURE_READ_FENCE_MIGRATION],
  ] as const;
  if (
    typeof input.holdNegativeAuthority !== "function" ||
    migrations.some(
      ([migration, version]) =>
        migration.version !== version ||
        !/^[a-f0-9]{64}$/u.test(migration.checksum),
    )
  )
    throw new DomainError(
      "public_packet_host_unconfigured",
      "Public request viewing requires its exact registered authority graph.",
      503,
    );
  await input.database.assertRuntimeRole();
  const pool = input.database.pool;
  const ready = (
    await pool.query<{ ready: boolean }>(
      `SELECT (SELECT count(*)=3 FROM creator.schema_migration m
        JOIN jsonb_to_recordset($1::jsonb) wanted(version text,checksum text)
         ON m.version=wanted.version AND m.checksum=wanted.checksum)
       AND (SELECT count(*)=2 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
        JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='creator_trust' AND (
         (p.proname='runtime_packet_denial' AND p.proargtypes='2950 2950 2950 23 3802'::oidvector)
         OR (p.proname='packet_denial_projection' AND p.proargtypes='2950 2950 2950 23 3802 2950 16'::oidvector))
        AND p.prosecdef AND p.provolatile='v' AND p.prorettype='text'::regtype
        AND 'search_path=pg_catalog'=ANY(p.proconfig)
        AND r.rolname='creator_trust_denial' AND NOT r.rolcanlogin AND NOT r.rolsuper
        AND NOT r.rolinherit AND NOT r.rolbypassrls AND NOT r.rolcreatedb
        AND NOT r.rolcreaterole AND NOT r.rolreplication AND r.rolconfig IS NULL
        AND NOT pg_has_role(current_user,r.oid,'MEMBER')
        AND NOT has_schema_privilege(r.oid,'creator','CREATE')
        AND NOT has_schema_privilege(r.oid,'creator_trust','CREATE')
        AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
        AND NOT EXISTS(SELECT 1 FROM pg_db_role_setting WHERE setrole=r.oid)
        AND NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspowner=r.oid)
        AND NOT EXISTS(SELECT 1 FROM pg_class WHERE relowner=r.oid)
        AND NOT has_column_privilege(r.oid,'creator.identity_session','token_hash','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.identity_session','upstream_cipher','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.passkey_credential','public_key','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.signed_act','assertion','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.signed_act','challenge','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.commerce_packet','disclosure','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.commerce_packet','snapshot','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.commerce_packet','intent_ref','SELECT')
        AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
         WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'))
       AND EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='creator_trust' AND p.proname='runtime_packet_denial'
         AND p.proargtypes='2950 2950 2950 23 3802'::oidvector
         AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS ready`,
      [JSON.stringify(migrations.map(([migration]) => migration))],
    )
  ).rows[0]?.ready;
  if (ready !== true)
    throw new DomainError(
      "public_packet_host_unconfigured",
      "The complete current public request authority is not activated.",
      503,
    );
  const holdSignatureAuthority = await createSignatureReadFence({
    pool,
    migration: input.migrations.signature,
  });
  const reader = await createCommercePublicPacketReader({
    pool,
    migration: input.migrations.packet,
    holdNegativeAuthority: input.holdNegativeAuthority,
    holdSignatureAuthority,
  });
  const host = Object.freeze({
    prepare: reader.prepare,
    preparePositive: reader.preparePositive,
    read: reader.read,
  });
  prepared.set(host, pool);
  return host;
}

import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { ContentAudience } from "../../../../../packages/api/src/content.js";
import type { Actor } from "../identity/adapter.js";
import { assertCurrentSession } from "../identity/request-authority.js";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";

const Tuple = z.strictObject({
  creatorId: z.uuid(),
  packetId: z.uuid(),
  contentId: z.uuid(),
  contentVersion: z.int().positive(),
  audience: ContentAudience,
});
export type PublicPacketReadTuple = z.infer<typeof Tuple>;
export const PUBLIC_PACKET_READ_MIGRATION = "0070_w4_public_packet_read";

/** W8 resolves original participants privately and holds all current negative
 * keys BEFORE W5 takes its content object lock. No participant is constructed
 * from a database ID and no private packet or participant is returned. */
export type PublicPacketNegativeAuthority = (
  client: PoolClient,
  actor: Actor,
  tuple: PublicPacketReadTuple,
) => Promise<boolean>;

/** W1 holds the actual stored keys/signature withdrawal state through commit.
 * This runs LAST, after audience/profile/content/mode/packet locks. The host
 * must not take another identity/domain row lock after it returns. */
export type PublicPacketSignatureAuthority = (
  client: PoolClient,
  actor: Actor,
  input: PublicPacketReadTuple & { signedActIds: readonly string[] },
) => Promise<boolean>;

/** Viewer permission, separate from the owner publication validator. The early
 * binding cannot cross clients, transactions, actual actors or content tuples.
 * All reads after the packet/signature fences are metadata-only MVCC reads;
 * acquiring packet row locks here would invert a waiting BEFORE-write trigger.
 */
export async function createCommercePublicPacketReader(input: {
  pool: Pool;
  migration: { version: string; checksum: string };
  holdNegativeAuthority: PublicPacketNegativeAuthority;
  holdSignatureAuthority: PublicPacketSignatureAuthority;
}) {
  invariant(
    input.migration.version === PUBLIC_PACKET_READ_MIGRATION &&
      /^[a-f0-9]{64}$/u.test(input.migration.checksum) &&
      typeof input.holdNegativeAuthority === "function" &&
      typeof input.holdSignatureAuthority === "function",
    "public_packet_read_unconfigured",
    "Public request viewing requires canonical metadata and held current authorities.",
  );
  const ready = (
    await input.pool.query<{ ready: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
       AND (SELECT count(*)=2 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
        WHERE n.nspname='creator' AND p.proname IN('commerce_public_packet_mode','commerce_public_packet_evidence')
        AND p.prosecdef AND r.rolname='creator_commerce_public_read' AND NOT r.rolcanlogin AND NOT r.rolsuper
        AND NOT r.rolinherit AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole
        AND 'search_path=pg_catalog'=ANY(p.proconfig) AND NOT pg_has_role(current_user,r.oid,'MEMBER')
        AND has_function_privilege(current_user,p.oid,'EXECUTE')
        AND NOT has_schema_privilege(r.oid,'creator','CREATE'))
       AND (SELECT count(*)=6 FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid
        WHERE NOT t.tgisinternal AND t.tgenabled='O' AND pg_get_userbyid(f.proowner)='creator_owner'
         AND ((t.tgname='fence_public_mode_write' AND t.tgrelid='creator.commerce_mode'::regclass)
          OR (t.tgname='fence_public_packet_write' AND t.tgrelid=ANY(ARRAY[
           'creator.commerce_packet'::regclass,'creator.commerce_commitment'::regclass,
           'creator.commerce_share_grant'::regclass,'creator.commerce_ledger'::regclass,
           'creator.commerce_effect'::regclass])))) AS ready`,
      [input.migration.version, input.migration.checksum],
    )
  ).rows[0]?.ready;
  invariant(
    ready,
    "public_packet_read_unconfigured",
    "The exact bounded public-request metadata projection is not installed.",
  );
  const leases = new WeakMap<
    PoolClient,
    Map<string, { transactionId: string; accountId: string; heldMode?: string }>
  >();
  const finalizing = new WeakMap<PoolClient, string>();
  async function context(
    client: PoolClient,
    actor: Actor,
    holdSession: boolean,
  ) {
    if (!actor.adultEligible) return null;
    const value = (
      await client.query<{
        account: string | null;
        transaction: string | null;
      }>(
        "SELECT nullif(current_setting('app.account_id',true),'') AS account,pg_current_xact_id_if_assigned()::text AS transaction",
      )
    ).rows[0];
    if (value?.account !== actor.accountId) return null;
    if (!holdSession) return value.transaction;
    invariant(
      !value.transaction || finalizing.get(client) !== value.transaction,
      "public_packet_read_order_invalid",
      "Prepare every public request before checking its source signatures.",
    );
    await assertCurrentSession(client, actor.accountId);
    // Assigning an xid is not an authorization. It prevents an old weak-map
    // entry from being reused by a later transaction on this pooled client.
    return (
      await client.query<{ transaction: string }>(
        "SELECT pg_current_xact_id()::text AS transaction",
      )
    ).rows[0]?.transaction;
  }
  async function prepareTuple(
    client: PoolClient,
    actor: Actor,
    raw: PublicPacketReadTuple,
  ): Promise<boolean> {
    const tuple = Tuple.parse(raw);
    const transactionId = await context(client, actor, true);
    if (!transactionId) return false;
    const key = contentHash(tuple);
    const bindings = leases.get(client) ?? new Map();
    leases.set(client, bindings);
    const first = bindings.values().next().value;
    if (
      first &&
      (first.transactionId !== transactionId ||
        first.accountId !== actor.accountId)
    )
      bindings.clear();
    bindings.delete(key);
    invariant(
      bindings.size < 100,
      "public_packet_read_bound_exceeded",
      "Read a bounded page of public requests before continuing.",
    );
    if (!(await input.holdNegativeAuthority(client, actor, tuple)))
      return false;
    if ((await context(client, actor, true)) !== transactionId) return false;
    bindings.set(key, { transactionId, accountId: actor.accountId });
    return true;
  }
  /** W5 calls this metadata-only entry before any content/positive domain lock.
   * A changed row cannot reuse its preparation: read requires the exact tuple.
   */
  async function prepare(
    client: PoolClient,
    actor: Actor,
    raw: { creatorId: string; contentId: string },
  ): Promise<void> {
    const pointer = z
      .strictObject({ creatorId: z.uuid(), contentId: z.uuid() })
      .parse(raw);
    if (!(await context(client, actor, true))) return;
    const row = (
      await client.query<{
        creator_id: string;
        id: string;
        packet_id: string | null;
        version: number;
        audience: unknown;
      }>(
        "SELECT creator_id,id,packet_id,version,audience FROM creator.content_index WHERE id=$1 AND creator_id=$2 AND state='published' AND kind='public_answer' AND withdrawn_at IS NULL",
        [pointer.contentId, pointer.creatorId],
      )
    ).rows[0];
    if (!row?.packet_id) return;
    await prepareTuple(
      client,
      actor,
      Tuple.parse({
        creatorId: row.creator_id,
        packetId: row.packet_id,
        contentId: row.id,
        contentVersion: row.version,
        audience: row.audience,
      }),
    );
  }
  /** W5 calls this for EVERY candidate after all page content/quote/audience
   * checks and BEFORE its first final reader. It holds only mode/packet fences;
   * no source signature is acquired here. */
  async function preparePositive(
    client: PoolClient,
    actor: Actor,
    raw: PublicPacketReadTuple,
  ): Promise<boolean> {
    const tuple = Tuple.parse(raw);
    const binding = leases.get(client)?.get(contentHash(tuple));
    const transactionId = await context(client, actor, true);
    if (
      !transactionId ||
      binding?.transactionId !== transactionId ||
      binding.accountId !== actor.accountId
    )
      return false;
    const parameters = [
      tuple.creatorId,
      tuple.packetId,
      tuple.contentId,
      tuple.contentVersion,
      JSON.stringify(tuple.audience),
    ];
    const mode = (
      await client.query<{ mode: string | null }>(
        "SELECT creator.commerce_public_packet_mode($1,$2,$3,$4,$5::jsonb) AS mode",
        parameters,
      )
    ).rows[0]?.mode;
    if (!mode) return false;
    await client.query(
      "SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",
      [`commerce.mode:${mode}`],
    );
    await client.query(
      "SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",
      [`commerce.public-packet:${tuple.packetId}`],
    );
    const heldMode = (
      await client.query<{ mode: string | null }>(
        "SELECT creator.commerce_public_packet_mode($1,$2,$3,$4,$5::jsonb) AS mode",
        parameters,
      )
    ).rows[0]?.mode;
    if (heldMode !== mode) return false;
    if ((await context(client, actor, true)) !== transactionId) return false;
    binding.heldMode = mode;
    return true;
  }
  async function read(
    client: PoolClient,
    actor: Actor,
    raw: PublicPacketReadTuple,
  ): Promise<boolean> {
    const tuple = Tuple.parse(raw);
    const binding = leases.get(client)?.get(contentHash(tuple));
    // No session row or domain/advisory lock may be acquired after another
    // candidate's source lease. The early preparation already held the session.
    const transactionId = await context(client, actor, false);
    if (
      !transactionId ||
      binding?.transactionId !== transactionId ||
      binding.accountId !== actor.accountId ||
      !binding.heldMode
    )
      return false;
    const parameters = [
      tuple.creatorId,
      tuple.packetId,
      tuple.contentId,
      tuple.contentVersion,
      JSON.stringify(tuple.audience),
    ];
    const mode = (
      await client.query<{ mode: string | null }>(
        "SELECT creator.commerce_public_packet_mode($1,$2,$3,$4,$5::jsonb) AS mode",
        parameters,
      )
    ).rows[0]?.mode;
    if (mode !== binding.heldMode) return false;
    async function evidence() {
      return (
        await client.query<{ eligible: boolean; signed_act_ids: string[] }>(
          "SELECT * FROM creator.commerce_public_packet_evidence($1,$2,$3,$4,$5::jsonb)",
          parameters,
        )
      ).rows[0];
    }
    const before = await evidence();
    if (!before?.eligible || !before.signed_act_ids.length) return false;
    const signedActIds = [...new Set(before.signed_act_ids)].sort();
    finalizing.set(client, transactionId);
    if (
      !(await input.holdSignatureAuthority(client, actor, {
        ...tuple,
        signedActIds,
      }))
    )
      return false;
    const retained = (
      await client.query<{ account: string | null; transaction: string }>(
        "SELECT nullif(current_setting('app.account_id',true),'') AS account,pg_current_xact_id_if_assigned()::text AS transaction",
      )
    ).rows[0];
    if (
      retained?.account !== actor.accountId ||
      retained.transaction !== transactionId
    )
      return false;
    const after = await evidence();
    return Boolean(
      after?.eligible &&
        contentHash([...new Set(after.signed_act_ids)].sort()) ===
          contentHash(signedActIds),
    );
  }
  return { prepare, prepareTuple, preparePositive, read };
}

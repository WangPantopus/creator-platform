import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { ContentAudience } from "../../../../../packages/api/src/content.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { Actor } from "./adapter.js";
import { requestAuthority } from "./request-authority.js";

export const SIGNATURE_READ_FENCE_MIGRATION = "0081_w1_signature_read_fence";
const Input = z.strictObject({
  creatorId: z.uuid(),
  packetId: z.uuid(),
  contentId: z.uuid(),
  contentVersion: z.int().positive(),
  audience: ContentAudience,
  signedActIds: z.array(z.uuid()).min(1).max(3).readonly(),
});
export type SignatureReadInput = z.infer<typeof Input>;

/** LAST gate in an already authorized W4 public-request read. Earlier gates
 * must hold the actual session, negative/audience/content and mode/packet
 * fences. This takes no identity/domain row lock, creates no scope and returns
 * no signer, key, assertion or private source. After it, only metadata reads
 * and COMMIT/ROLLBACK are permitted. One creator family per transaction.
 */
export async function createSignatureReadFence(input: {
  pool: Pool;
  migration: { version: string; checksum: string };
}) {
  if (
    input.migration.version !== SIGNATURE_READ_FENCE_MIGRATION ||
    !/^[a-f0-9]{64}$/u.test(input.migration.checksum)
  )
    throw new DomainError(
      "signature_read_unconfigured",
      "Public Signed reads require the exact activated signature fence.",
      503,
    );
  const ready = (
    await input.pool.query<{ ready: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
       AND EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
        WHERE n.nspname='creator' AND p.proname='hold_public_packet_signature_read'
        AND p.prosecdef AND p.provolatile='v' AND r.rolname='creator_signature_read_authority'
        AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolinherit AND NOT r.rolbypassrls
        AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND 'search_path=pg_catalog'=ANY(p.proconfig)
        AND NOT pg_has_role(current_user,r.oid,'MEMBER') AND has_function_privilege(current_user,p.oid,'EXECUTE')
        AND NOT has_schema_privilege(r.oid,'creator','CREATE')
        AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
        AND NOT has_column_privilege(r.oid,'creator.identity_session','token_hash','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.identity_session','upstream_cipher','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.passkey_credential','public_key','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.signed_act','assertion','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.signed_act','challenge','SELECT')
        AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['creator.thread'::regclass,'creator.message'::regclass,
         'creator.generation'::regclass,'creator.memory'::regclass,'creator.fan_profile'::regclass,
         'creator.access_grant'::regclass]) private_relation
         WHERE has_any_column_privilege(r.oid,private_relation,'SELECT,INSERT,UPDATE,REFERENCES')
          OR has_table_privilege(r.oid,private_relation,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')))
       AND (SELECT count(*)=6 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
        WHERE NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=25
        AND t.tgname='fence_signature_metadata_write' AND pg_get_userbyid(p.proowner)='creator_owner'
        AND t.tgrelid=ANY(ARRAY['creator.creator_profile'::regclass,'creator.passkey_credential'::regclass,
         'creator.signed_act'::regclass,'creator.signed_act_consumption'::regclass,
         'creator.signed_publication'::regclass,'creator.signed_verification'::regclass])) AS ready`,
      [input.migration.version, input.migration.checksum],
    )
  ).rows[0]?.ready;
  if (ready !== true)
    throw new DomainError(
      "signature_read_unconfigured",
      "The current bounded signature-read authority is not installed.",
      503,
    );
  const finalizing = new WeakMap<
    PoolClient,
    {
      transaction: string;
      creatorId: string;
      accountId: string;
      sessionId: string;
    }
  >();
  return async (
    client: PoolClient,
    actor: Actor,
    raw: SignatureReadInput,
  ): Promise<boolean> => {
    const tuple = Input.parse(raw);
    const authority = requestAuthority.getStore();
    if (!actor.adultEligible || authority?.accountId !== actor.accountId)
      return false;
    // Never reacquire assertCurrentSession here: W4 already held it before
    // domain/packet locks. Require its genuine transaction-local binding.
    const context = (
      await client.query<{
        account: string | null;
        session: string | null;
        transaction: string | null;
        isolation: string;
      }>(
        `SELECT nullif(current_setting('app.account_id',true),'') AS account,
         nullif(current_setting('app.identity_session_id',true),'') AS session,
         pg_current_xact_id_if_assigned()::text AS transaction,
         current_setting('transaction_isolation') AS isolation`,
      )
    ).rows[0];
    if (
      !context?.transaction ||
      context.isolation !== "read committed" ||
      context.account !== actor.accountId ||
      context.session !== authority.sessionId
    )
      return false;
    const held = finalizing.get(client);
    invariant(
      !held ||
        held.transaction !== context.transaction ||
        (held.creatorId === tuple.creatorId &&
          held.accountId === actor.accountId &&
          held.sessionId === authority.sessionId),
      "signature_read_order_invalid",
      "Finish one creator's public request page before reading another.",
    );
    await client.query("SAVEPOINT w1_signature_read_client");
    await client.query("RELEASE SAVEPOINT w1_signature_read_client");
    finalizing.set(client, {
      transaction: context.transaction,
      creatorId: tuple.creatorId,
      accountId: actor.accountId,
      sessionId: authority.sessionId,
    });
    const result = await client.query<{ allowed: boolean }>(
      "SELECT creator.hold_public_packet_signature_read($1,$2,$3,$4,$5::jsonb,$6::uuid[]) AS allowed",
      [
        tuple.creatorId,
        tuple.packetId,
        tuple.contentId,
        tuple.contentVersion,
        JSON.stringify(tuple.audience),
        [...new Set(tuple.signedActIds)].sort(),
      ],
    );
    return result.rows[0]?.allowed === true;
  };
}

import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { Database } from "../../db/database.js";
import type { AccessService, ThreadScope } from "../access/scope.js";
import { deliveredTextCommand } from "../conversation/signed-preview.js";
import type { GrowthOwners, ShareSource } from "../growth/contracts.js";
import type { Actor } from "../identity/adapter.js";
import type { SignedActService } from "../identity/signed-acts.js";
import type { CommerceService } from "./service.js";

type Message = {
  id: string;
  author_kind: string;
  author_account_id: string;
  text: string;
  delivery_state: string;
  version: number;
  signed_act_id: string | null;
  signed_content_hash: string | null;
  signed_command: unknown;
  corrects_message_id: string | null;
  recording_asset_id: string | null;
  approval_id: string | null;
};
const columns =
  "id,author_kind,author_account_id,text,delivery_state,version,signed_act_id,signed_content_hash,signed_command,corrects_message_id,recording_asset_id,approval_id";

/**
 * The share card's two owner answers for growth (`shareSource` and
 * `shareStatus`), from commerce, which holds the share grant: the fan's choice
 * and the creator's permission over one delivered reply.
 *
 * The source is read in the fan's own session, under the conversation's scope,
 * with lane 3's signed-message check (`deliveredTextCommand`) and lane 1's
 * signature check (`matchesThreadAct`), and the grant held while it is read.
 * Its status is read with no session at all, through one narrow function
 * (schema-share-status.sql) that says only whether the grant still shares that
 * exact signed reply. A shared reply has no correction: a creator's own signed
 * reply cannot be corrected (lane 3 corrects AI originals only).
 *
 * Only the creator's own signed written reply can be shared for now. An
 * approved AI draft or a voice reply answers "unavailable".
 */
export function createCommerceShareOwners(input: {
  service: CommerceService;
  access: AccessService;
  database: Database;
  signing: Pick<SignedActService, "matchesThreadAct">;
  pool: Pool;
}): Pick<GrowthOwners, "shareSource" | "shareStatus"> {
  /** A message that is exactly what the creator signed, and still signed. */
  async function signed(client: PoolClient, scope: ThreadScope, m: Message) {
    const command = deliveredTextCommand(
      scope,
      m as unknown as Record<string, unknown>,
    );
    return Boolean(
      command &&
        m.signed_act_id &&
        (await input.signing.matchesThreadAct(
          client,
          scope,
          m.signed_act_id,
          command,
        )),
    );
  }
  return {
    async shareSource(actor: Actor, grantId: string) {
      if (!z.uuid().safeParse(grantId).success) return null;
      // Which conversation the grant belongs to, read as this account; only
      // the fan who chose to share may make a card from it.
      const pair = await input.service.account(
        actor,
        async (client) =>
          (
            await client.query<{
              creator_id: string;
              fan_id: string;
              account_id: string;
            }>(
              `SELECT g.creator_id,g.fan_id,f.account_id FROM creator.commerce_share_grant g
               JOIN creator.fan_profile f ON f.id=g.fan_id WHERE g.id=$1`,
              [grantId],
            )
          ).rows[0],
      );
      if (!pair || pair.account_id !== actor.accountId) return null;
      const scope = await input.access.openThread(
        actor,
        pair.creator_id,
        pair.fan_id,
        false,
      );
      return input.database.withThread(scope, async (client) => {
        // The grant is held while the source is read: the fan's choice and the
        // creator's permission cannot change underneath this answer.
        const grant = (
          await client.query<{
            fan_choice: boolean;
            creator_permission: boolean;
            revoked_at: Date | null;
            handle_display: string;
            delivered_at: Date | null;
            delivered_message_id: string | null;
            snapshot_shareable: boolean | null;
            mode_shareable: boolean;
            handle: string;
          }>(
            `SELECT g.fan_choice,g.creator_permission,g.revoked_at,g.handle_display,
              c.delivered_at,c.delivered_message_id,(p.snapshot->>'shareable')::boolean AS snapshot_shareable,
              m.shareable AS mode_shareable,f.handle
             FROM creator.commerce_share_grant g
             JOIN creator.commerce_commitment c ON c.id=g.commitment_id AND c.creator_id=g.creator_id AND c.fan_id=g.fan_id
             JOIN creator.commerce_packet p ON p.id=c.packet_id AND p.creator_id=g.creator_id AND p.fan_id=g.fan_id
             JOIN creator.commerce_mode m ON m.id=p.mode_id
             JOIN creator.fan_profile f ON f.id=g.fan_id
             WHERE g.id=$1 AND g.creator_id=$2 AND g.fan_id=$3 AND p.thread_id=$4
             FOR SHARE OF g`,
            [grantId, scope.creatorId, scope.fanId, scope.threadId],
          )
        ).rows[0];
        if (
          !grant?.fan_choice ||
          !grant.creator_permission ||
          grant.revoked_at ||
          !grant.delivered_at ||
          !grant.delivered_message_id ||
          grant.snapshot_shareable !== true ||
          !grant.mode_shareable
        )
          return null;
        const reply = (
          await client.query<Message>(
            `SELECT ${columns} FROM creator.message WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4`,
            [
              grant.delivered_message_id,
              scope.threadId,
              scope.creatorId,
              scope.fanId,
            ],
          )
        ).rows[0];
        if (
          !reply ||
          reply.author_kind !== "human_creator" ||
          reply.delivery_state !== "delivered" ||
          reply.corrects_message_id ||
          !reply.signed_act_id ||
          !reply.signed_content_hash ||
          !(await signed(client, scope, reply))
        )
          return null;
        const signature = (
          await client.query<{ verified_at: Date }>(
            "SELECT verified_at FROM creator.signed_verification WHERE id=$1 AND creator_id=$2",
            [reply.signed_act_id, scope.creatorId],
          )
        ).rows[0];
        if (!signature) return null;
        const source: ShareSource = {
          id: reply.id,
          creatorId: scope.creatorId,
          creatorName: scope.creatorName,
          version: reply.version,
          text: reply.text,
          authorKind: "human_creator",
          signedActId: reply.signed_act_id,
          signedAt: signature.verified_at.toISOString(),
          contentHash: reply.signed_content_hash,
          handle: grant.handle_display === "handle" ? grant.handle : null,
          // A creator's own signed reply cannot be corrected: lane 3 corrects
          // AI originals only.
          correction: null,
        };
        return source;
      });
    },

    async shareStatus(grantId: string, source: ShareSource) {
      const known = z
        .strictObject({
          grantId: z.uuid(),
          creatorId: z.uuid(),
          id: z.uuid(),
          version: z.int().positive(),
          signedActId: z.uuid(),
          contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
        })
        .safeParse({
          grantId,
          creatorId: source.creatorId,
          id: source.id,
          version: source.version,
          signedActId: source.signedActId,
          contentHash: source.contentHash,
        });
      if (!known.success) return { valid: false, correction: null };
      const row = (
        await input.pool.query<{ valid: boolean; correction: string | null }>(
          "SELECT valid,correction FROM creator.commerce_share_status($1,$2,$3,$4,$5,$6,$7)",
          [
            grantId,
            source.creatorId,
            source.id,
            source.version,
            source.signedActId,
            source.contentHash,
            source.handle !== null,
          ],
        )
      ).rows[0];
      return row?.valid === true
        ? { valid: true, correction: row.correction }
        : { valid: false, correction: null };
    },
  };
}

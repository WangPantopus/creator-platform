import type { PoolClient } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";

/** Internal original-record projection, never an audience or delivery license. */
export type OriginalCommerceService = {
  packet_id: string;
  commitment_id: string;
  creator_id: string;
  fan_id: string;
  thread_id: string;
  creator_account: string;
  fan_account: string;
  packet_version: number;
  commitment_version: number;
  mode_id: string;
  mode_version: number;
  mode: "group_answer" | "guaranteed_review";
  state: string;
  due_at: Date;
  acceptance_id: string;
  acceptance_hash: string;
  acceptance_command: unknown;
  accepted_action: string;
  snapshot: unknown;
  request_hash: string;
  consent_hash: string;
  capture_id: string;
  capture_hash: string;
};

export function fulfillmentChanged() {
  return new DomainError(
    "fulfillment_source_changed",
    "The original request, consent or signing authority changed. Refresh and review it again.",
    503,
  );
}

export function originalCommerceServiceHash(source: OriginalCommerceService) {
  // Canonical signing accepts JSON, not Date objects. Keep the actual deadline
  // in this private fingerprint rather than silently hashing Date as {}.
  return contentHash({ ...source, due_at: source.due_at.toISOString() });
}

export const ORIGINAL_SERVICE_QUERY = `SELECT
 p.id AS packet_id,c.id AS commitment_id,p.creator_id,p.fan_id,p.thread_id,
 cp.account_id AS creator_account,fp.account_id AS fan_account,
 p.version AS packet_version,c.version AS commitment_version,p.mode_id,
 (p.snapshot->>'modeVersion')::integer AS mode_version,c.mode,c.state,c.due_at,
 sa.id AS acceptance_id,sa.content_hash AS acceptance_hash,sp.command AS acceptance_command,
 p.accepted_action,p.snapshot,
 encode(sha256(convert_to(jsonb_build_object('snapshot',p.snapshot,'disclosure',p.disclosure,'question',p.question,'fanAnswer',p.fan_answer,'createdAt',p.created_at,'submittedAt',p.submitted_at,
  'authorizationAttempt',p.authorization_attempt,'visibility',p.visibility,'threadId',p.thread_id,
  'acceptedAct',p.accepted_act_id,'acceptedAt',p.accepted_at)::text,'UTF8')),'hex') AS request_hash,
 encode(sha256(convert_to(jsonb_build_object('visibility',p.visibility,'sharing',to_jsonb(share))::text,'UTF8')),'hex') AS consent_hash,
 capture.id AS capture_id,encode(sha256(convert_to(to_jsonb(capture)::text,'UTF8')),'hex') AS capture_hash
 FROM creator.commerce_packet p
 JOIN creator.commerce_commitment c ON c.packet_id=p.id AND c.creator_id=p.creator_id AND c.fan_id=p.fan_id
 JOIN creator.creator_profile cp ON cp.id=p.creator_id AND cp.account_id=$3 AND cp.verification='verified' AND NOT cp.recovery_required
 JOIN creator.fan_profile fp ON fp.id=p.fan_id
 JOIN creator.commerce_mode mode ON mode.id=p.mode_id AND mode.creator_id=p.creator_id
 JOIN creator.commerce_effect effect ON effect.packet_id=p.id AND effect.creator_id=p.creator_id AND effect.fan_id=p.fan_id
  AND effect.operation='capture' AND effect.state='done'
  AND effect.provider_key=p.id::text||':capture:'||p.authorization_attempt::text AND effect.provider_ref=p.intent_ref
  AND effect.request=jsonb_build_object('intentId',p.intent_ref,'amount',(p.snapshot->>'amount')::bigint,'currency',p.snapshot->>'currency')
 JOIN creator.commerce_ledger capture ON capture.packet_id=p.id AND capture.creator_id=p.creator_id AND capture.fan_id=p.fan_id
  AND capture.kind='capture' AND capture.cause=effect.provider_key AND capture.provider_ref=effect.provider_ref
  AND capture.amount=(p.snapshot->>'amount')::bigint AND capture.currency=p.snapshot->>'currency'
 JOIN creator.signed_act sa ON sa.id=p.accepted_act_id AND sa.creator_id=p.creator_id AND sa.account_id=cp.account_id
  AND sa.subject_id=p.thread_id AND sa.act_type='accept'
 JOIN creator.signed_act_consumption used ON used.signed_act_id=sa.id AND used.account_id=sa.account_id
 JOIN creator.signed_publication sp ON sp.signed_act_id=sa.id AND sp.account_id=sa.account_id AND sp.withdrawn_at IS NULL
 JOIN creator.signed_verification proof ON proof.id=sa.id AND proof.creator_id=sa.creator_id AND proof.account_id=sa.account_id
  AND proof.content_hash=sa.content_hash AND NOT proof.key_revoked AND NOT proof.creator_revoked AND NOT proof.withdrawn
 JOIN creator.passkey_credential key ON key.id=sa.credential_id AND key.account_id=sa.account_id AND key.revoked_at IS NULL
 LEFT JOIN creator.commerce_share_grant share ON share.commitment_id=c.id AND share.creator_id=p.creator_id AND share.fan_id=p.fan_id
 WHERE p.id=$1 AND p.creator_id=$2 AND c.mode=$4 AND p.snapshot->>'mode'=c.mode
 AND p.state='accepted' AND p.payment_state='captured' AND p.accepted_at IS NOT NULL AND NOT c.dispute_open
 AND c.state=ANY($5::text[]) AND (c.state='delivered' OR c.due_at>clock_timestamp())
 AND (c.mode='guaranteed_review' OR (p.visibility='public' AND p.snapshot->>'shareable'='true' AND mode.shareable
  AND (share.commitment_id IS NULL OR (share.fan_choice AND share.creator_permission AND share.revoked_at IS NULL))))
 AND NOT EXISTS(SELECT FROM creator.commerce_ledger refund WHERE refund.packet_id=p.id AND refund.kind='refund')
 AND NOT EXISTS(SELECT FROM creator.commerce_effect refund WHERE refund.packet_id=p.id AND refund.operation='refund' AND refund.state<>'failed')`;

export async function readOriginalCommerceService(
  client: PoolClient,
  accountId: string,
  creatorId: string,
  packetId: string,
  mode: OriginalCommerceService["mode"],
  states: readonly string[] = ["due", "in_progress"],
) {
  const result = await client.query<OriginalCommerceService>(
    ORIGINAL_SERVICE_QUERY,
    [packetId, creatorId, accountId, mode, states],
  );
  if (result.rowCount !== 1) throw fulfillmentChanged();
  const row = result.rows[0]!;
  const command = z
    .strictObject({
      actType: z.literal("accept"),
      subjectId: z.uuid(),
      content: z.strictObject({
        packetId: z.uuid(),
        packetVersion: z.int().positive(),
        snapshot: z.unknown(),
        action: z.literal("reply_myself"),
      }),
    })
    .safeParse(row.acceptance_command);
  if (
    !command.success ||
    contentHash(command.data) !== row.acceptance_hash ||
    command.data.subjectId !== row.thread_id ||
    command.data.content.packetId !== row.packet_id ||
    command.data.content.packetVersion >= row.packet_version ||
    row.accepted_action !== command.data.content.action ||
    contentHash(command.data.content.snapshot) !== contentHash(row.snapshot)
  )
    throw fulfillmentChanged();
  return row;
}

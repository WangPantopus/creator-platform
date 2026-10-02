import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  ContentAudience,
  ContentDocument,
} from "../../../../../packages/api/src/content.js";
import type { Database } from "../../db/database.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { ScopeRestrictionInTransaction } from "../access/scope.js";
import type { Actor } from "../identity/adapter.js";
import {
  assertCurrentSession,
  requestAuthority,
} from "../identity/request-authority.js";
import {
  createSignatureReadFence,
  SIGNATURE_READ_FENCE_MIGRATION,
} from "../identity/signature-read-fence.js";
import { PUBLIC_PACKET_READ_MIGRATION } from "./public-packet-read.js";
import {
  holdCommercePublicationPermission,
  readCommercePublicationPermission,
} from "./publication.js";

const Key = z.strictObject({ creatorId: z.uuid(), contentId: z.uuid() });
const Final = z.strictObject({
  stage: z.enum(["signing_challenge", "publication", "review"]),
  creatorId: z.uuid(),
  packetId: z.uuid(),
  contentId: z.uuid(),
  contentVersion: z.int().positive(),
  audience: ContentAudience,
  publicationSignedActId: z.uuid().nullable(),
  challengeId: z.uuid().optional(),
});
export type CommercePublicationSourceInput = z.infer<typeof Final>;
type Stored = {
  id: string;
  creator_id: string;
  version: number;
  state: string;
  audience: unknown;
  document: unknown;
  publication_signed_act_id: string | null;
  media_evidence: unknown;
};
type Binding = {
  transaction: string;
  pid: number;
  request: NonNullable<ReturnType<typeof requestAuthority.getStore>>;
  actor: Actor;
  creatorId: string;
  contentId: string;
  version: number;
  documentHash: string;
  audienceHash: string;
  packetId: string;
  modeId: string;
  commitmentId: string;
  acceptanceId: string;
  state: string;
  publicationId: string | null;
  positive: boolean;
};
export type CommercePublicationSource = Readonly<{
  prepare(
    client: PoolClient,
    actor: Actor,
    input: z.infer<typeof Key>,
  ): Promise<void>;
  permission(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    packetId: string,
  ): Promise<boolean>;
  finalize(
    client: PoolClient,
    actor: Actor,
    input: CommercePublicationSourceInput,
  ): Promise<boolean>;
}>;
const issued = new WeakMap<CommercePublicationSource, Pool>();
export function assertCommercePublicationSource(
  value: CommercePublicationSource,
  pool: Pool,
) {
  if (issued.get(value) !== pool) throw unavailable();
}
function unavailable() {
  return new DomainError(
    "packet_publication_source_unconfigured",
    "Current request publication authority is unavailable.",
    503,
  );
}
function changed() {
  return new DomainError(
    "packet_publication_source_changed",
    "This request or signing source changed. Refresh and review it again.",
    503,
  );
}

/** Actual owner authority. This is separate from delivered viewer evidence.
 * Prepare original negatives before Content's locks; take packet positives
 * before media/domain writes; finalize AFTER every domain/idempotency write.
 * The late signer lease is TRY-only, followed solely by MVCC metadata reads.
 */
export async function createCommercePublicationSource(input: {
  database: Database;
  assertScopeAllowedInTransaction: ScopeRestrictionInTransaction;
  migrations: {
    packet: { version: string; checksum: string };
    signature: { version: string; checksum: string };
  };
}): Promise<CommercePublicationSource> {
  if (
    !input.database.threadScopeInTransactionAvailable ||
    typeof input.assertScopeAllowedInTransaction !== "function" ||
    input.migrations.packet.version !== PUBLIC_PACKET_READ_MIGRATION ||
    input.migrations.signature.version !== SIGNATURE_READ_FENCE_MIGRATION ||
    [input.migrations.packet, input.migrations.signature].some(
      (m) => !/^[a-f0-9]{64}$/u.test(m.checksum),
    )
  )
    throw unavailable();
  await input.database.assertRuntimeRole();
  const pool = input.database.pool;
  const ready = (
    await pool.query<{ ready: boolean }>(
      `SELECT (SELECT count(*)=2 FROM creator.schema_migration m
      JOIN jsonb_to_recordset($1::jsonb) wanted(version text,checksum text)
       ON m.version=wanted.version AND m.checksum=wanted.checksum)
     AND (SELECT count(*)=6 FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid
      WHERE NOT t.tgisinternal AND t.tgenabled='O' AND pg_get_userbyid(f.proowner)='creator_owner'
       AND ((t.tgname='fence_public_mode_write' AND t.tgrelid='creator.commerce_mode'::regclass)
        OR (t.tgname='fence_public_packet_write' AND t.tgrelid=ANY(ARRAY[
         'creator.commerce_packet'::regclass,'creator.commerce_commitment'::regclass,
         'creator.commerce_share_grant'::regclass,'creator.commerce_ledger'::regclass,
         'creator.commerce_effect'::regclass])))) AS ready`,
      [JSON.stringify([input.migrations.packet, input.migrations.signature])],
    )
  ).rows[0]?.ready;
  if (ready !== true) throw unavailable();
  // W1 owns the catalogue/role/writer-fence validation. Do not invoke the
  // returned delivered-viewer function for an undelivered owner challenge.
  await createSignatureReadFence({
    pool,
    migration: input.migrations.signature,
  });
  const bindings = new WeakMap<PoolClient, Map<string, Binding>>();
  const finalized = new WeakMap<PoolClient, string>();
  async function context(client: PoolClient, actor: Actor, assign: boolean) {
    const request = requestAuthority.getStore();
    if (
      !request ||
      request.accountId !== actor.accountId ||
      !actor.adultEligible
    )
      throw changed();
    const value = (
      await client.query<{
        transaction: string | null;
        pid: number;
        account: string;
        session: string;
        isolation: string;
      }>(`SELECT ${assign ? "pg_current_xact_id()" : "pg_current_xact_id_if_assigned()"}::text AS transaction,
      pg_backend_pid() AS pid,current_setting('app.account_id',true) AS account,
      current_setting('app.identity_session_id',true) AS session,current_setting('transaction_isolation') AS isolation`)
    ).rows[0];
    if (
      !value?.transaction ||
      value.account !== actor.accountId ||
      value.session !== request.sessionId ||
      value.isolation !== "read committed"
    )
      throw changed();
    return { ...value, transaction: value.transaction, request };
  }
  async function stored(
    client: PoolClient,
    creatorId: string,
    contentId: string,
  ) {
    return (
      await client.query<Stored>(
        `SELECT i.id,i.creator_id,i.version,i.state,i.audience,r.document,
       pub.signed_act_id AS publication_signed_act_id,pub.media_evidence
       FROM creator.content_index i JOIN creator.content_revision r ON r.content_id=i.id
        AND r.creator_id=i.creator_id AND r.version=i.version
       LEFT JOIN creator.content_publication pub ON pub.content_id=i.id AND pub.creator_id=i.creator_id AND pub.version=i.version
       WHERE i.id=$1 AND i.creator_id=$2`,
        [contentId, creatorId],
      )
    ).rows[0];
  }
  async function bound(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    contentId: string,
  ) {
    const current = await context(client, actor, false);
    const value = bindings.get(client)?.get(contentId);
    if (
      !value ||
      value.creatorId !== creatorId ||
      value.actor !== actor ||
      value.request !== current.request ||
      value.transaction !== current.transaction ||
      value.pid !== current.pid ||
      finalized.get(client) === current.transaction
    )
      throw changed();
    return value;
  }
  const host: CommercePublicationSource = Object.freeze({
    async prepare(client, actor, raw) {
      const key = Key.parse(raw);
      const request = requestAuthority.getStore();
      if (
        !request ||
        request.accountId !== actor.accountId ||
        !actor.adultEligible
      )
        throw changed();
      await assertCurrentSession(client, actor.accountId);
      const current = await context(client, actor, true);
      if (finalized.get(client) === current.transaction) throw changed();
      let map = bindings.get(client);
      const first = map?.values().next().value;
      if (!map || (first && first.transaction !== current.transaction)) {
        map = new Map();
        bindings.set(client, map);
      }
      if (map.size !== 0) throw changed(); // One owner publication command per transaction.
      const row = await stored(client, key.creatorId, key.contentId);
      if (!row) throw changed();
      const document = ContentDocument.parse(row.document);
      if (!document.packetId) return;
      // Scalar packet metadata has no exact group destination. Group plans
      // require the separate immutable original-service producer, never a
      // guessed audience or a public permission interpreted as fulfillment.
      if (
        document.audience.kind !== "public" ||
        contentHash(document.audience) !== contentHash(row.audience)
      )
        throw unavailable();
      const pointer = (
        await client.query<{
          mode_id: string;
          commitment_id: string;
          accepted_act_id: string;
          thread_id: string;
          fan_account: string;
          creator_account: string;
        }>(
          `SELECT p.mode_id,p.accepted_act_id,p.thread_id,c.id AS commitment_id,
         cp.account_id AS creator_account,fp.account_id AS fan_account
         FROM creator.commerce_packet p JOIN creator.commerce_commitment c ON c.packet_id=p.id AND c.creator_id=p.creator_id AND c.fan_id=p.fan_id
         JOIN creator.creator_profile cp ON cp.id=p.creator_id AND cp.account_id=$3
         JOIN creator.fan_profile fp ON fp.id=p.fan_id
         WHERE p.id=$1 AND p.creator_id=$2 AND p.accepted_act_id IS NOT NULL`,
          [document.packetId, key.creatorId, actor.accountId],
        )
      ).rows[0];
      if (!pointer) throw changed();
      await input.assertScopeAllowedInTransaction(
        actor,
        key.creatorId,
        pointer.thread_id,
        {
          fanAccountId: pointer.fan_account,
          creatorAccountId: pointer.creator_account,
        },
        client,
      );
      if (
        (await context(client, actor, false)).transaction !==
        current.transaction
      )
        throw changed();
      map.set(key.contentId, {
        transaction: current.transaction,
        pid: current.pid,
        request,
        actor,
        creatorId: key.creatorId,
        contentId: key.contentId,
        version: row.version,
        documentHash: contentHash(document),
        audienceHash: contentHash(document.audience),
        packetId: document.packetId,
        modeId: pointer.mode_id,
        commitmentId: pointer.commitment_id,
        acceptanceId: pointer.accepted_act_id,
        state: row.state,
        publicationId: row.publication_signed_act_id,
        positive: false,
      });
    },
    async permission(client, actor, creatorId, packetId) {
      const map = bindings.get(client);
      const binding = map?.values().next().value;
      if (!binding || binding.packetId !== packetId) throw changed();
      const value = await bound(client, actor, creatorId, binding.contentId);
      if (!value.positive)
        value.positive = await holdCommercePublicationPermission(
          client,
          actor,
          creatorId,
          packetId,
          value.modeId,
        );
      return value.positive;
    },
    async finalize(client, actor, raw) {
      const tuple = Final.parse(raw);
      const binding = await bound(
        client,
        actor,
        tuple.creatorId,
        tuple.contentId,
      );
      if (
        !binding.positive ||
        tuple.packetId !== binding.packetId ||
        tuple.contentVersion !== binding.version ||
        contentHash(tuple.audience) !== binding.audienceHash ||
        (tuple.stage === "signing_challenge") !==
          (tuple.challengeId !== undefined) ||
        (tuple.stage === "signing_challenge" &&
          tuple.publicationSignedActId !== null) ||
        (tuple.stage === "publication" &&
          tuple.publicationSignedActId === null) ||
        (tuple.stage !== "publication" &&
          binding.publicationId !== tuple.publicationSignedActId)
      )
        throw changed();
      // No identity/domain lock or write may follow this point. TRY avoids
      // waiting below Content/media writes or a writer's metadata row lock.
      const held = (
        await client.query<{ held: boolean }>(
          "SELECT pg_try_advisory_xact_lock_shared(hashtextextended($1,0)) AS held",
          [`identity.signature-account:${actor.accountId}`],
        )
      ).rows[0]?.held;
      if (held !== true) throw changed();
      finalized.set(client, binding.transaction);
      const live = (
        await client.query<{ live: boolean }>(
          `SELECT EXISTS(SELECT 1 FROM creator.identity_session WHERE id=$1 AND account_id=$2
          AND revoked_at IS NULL AND expires_at>clock_timestamp()) AS live`,
          [binding.request.sessionId, actor.accountId],
        )
      ).rows[0]?.live;
      if (
        live !== true ||
        !(await readCommercePublicationPermission(
          client,
          actor,
          binding.creatorId,
          binding.packetId,
          binding.modeId,
        ))
      )
        return false;
      const lineage = (
        await client.query(
          `SELECT p.id FROM creator.commerce_packet p JOIN creator.commerce_commitment c ON c.packet_id=p.id AND c.creator_id=p.creator_id AND c.fan_id=p.fan_id
         WHERE p.id=$1 AND p.creator_id=$2 AND p.mode_id=$3 AND p.accepted_act_id=$4 AND c.id=$5`,
          [
            binding.packetId,
            binding.creatorId,
            binding.modeId,
            binding.acceptanceId,
            binding.commitmentId,
          ],
        )
      ).rowCount;
      if (lineage !== 1) return false;
      const row = await stored(client, binding.creatorId, binding.contentId);
      if (
        !row ||
        row.version !== binding.version ||
        contentHash(ContentDocument.parse(row.document)) !==
          binding.documentHash ||
        contentHash(row.audience) !== binding.audienceHash
      )
        return false;
      if (tuple.stage === "publication") {
        if (
          !["published", "scheduled", "media_pending"].includes(row.state) ||
          row.publication_signed_act_id !== tuple.publicationSignedActId ||
          (binding.publicationId !== null &&
            binding.publicationId !== tuple.publicationSignedActId)
        )
          return false;
      } else if (
        row.state !== binding.state ||
        row.publication_signed_act_id !== binding.publicationId ||
        (tuple.stage === "signing_challenge" && row.state !== "draft")
      )
        return false;
      const document = ContentDocument.parse(row.document);
      if (tuple.stage === "review" && tuple.publicationSignedActId === null)
        return row.state === "draft";
      const command =
        tuple.stage === "signing_challenge"
          ? (
              await client.query<{ command: unknown; content_hash: string }>(
                `SELECT command,content_hash FROM creator.signed_challenge WHERE id=$1 AND account_id=$2 AND creator_id=$3
           AND subject_id=$4 AND act_type=$5 AND used_at IS NULL AND expires_at>clock_timestamp()`,
                [
                  tuple.challengeId,
                  actor.accountId,
                  binding.creatorId,
                  binding.contentId,
                  document.kind === "note" ? "broadcast" : "reply",
                ],
              )
            ).rows[0]
          : (
              await client.query<{ command: unknown; content_hash: string }>(
                `SELECT pub.command,sa.content_hash FROM creator.signed_act sa
           JOIN creator.signed_act_consumption consumed ON consumed.signed_act_id=sa.id AND consumed.account_id=sa.account_id
           JOIN creator.signed_publication pub ON pub.signed_act_id=sa.id AND pub.account_id=sa.account_id AND pub.withdrawn_at IS NULL
           JOIN creator.signed_verification proof ON proof.id=sa.id AND proof.account_id=sa.account_id AND proof.creator_id=sa.creator_id
            AND proof.content_hash=sa.content_hash AND NOT proof.key_revoked AND NOT proof.creator_revoked AND NOT proof.withdrawn
           JOIN creator.passkey_credential key ON key.id=sa.credential_id AND key.account_id=sa.account_id AND key.revoked_at IS NULL
           WHERE sa.id=$1 AND sa.account_id=$2 AND sa.creator_id=$3 AND sa.subject_id=$4 AND sa.act_type=$5
            AND (SELECT author_account_id FROM creator.content_publication WHERE content_id=$4 AND creator_id=$3 AND version=$6)=$2`,
                [
                  tuple.publicationSignedActId,
                  actor.accountId,
                  binding.creatorId,
                  binding.contentId,
                  document.kind === "note" ? "broadcast" : "reply",
                  binding.version,
                ],
              )
            ).rows[0];
      if (!command || contentHash(command.command) !== command.content_hash)
        return false;
      const shape = z
        .strictObject({
          actType: z.string(),
          subjectId: z.uuid(),
          content: z.strictObject({
            kind: z.literal("content_publication"),
            creatorId: z.uuid(),
            version: z.int().positive(),
            document: ContentDocument,
            mediaEvidence: z.array(z.unknown()).optional(),
          }),
        })
        .safeParse(command.command);
      if (
        !shape.success ||
        shape.data.subjectId !== binding.contentId ||
        shape.data.content.creatorId !== binding.creatorId ||
        shape.data.content.version !== binding.version ||
        contentHash(shape.data.content.document) !== binding.documentHash
      )
        return false;
      if (
        tuple.stage !== "signing_challenge" &&
        contentHash(shape.data.content.mediaEvidence ?? []) !==
          contentHash(row.media_evidence ?? [])
      )
        return false;
      invariant(
        requestAuthority.getStore() === binding.request,
        "packet_publication_session_changed",
        "The original creator session changed.",
      );
      return true;
    },
  });
  issued.set(host, pool);
  return host;
}

import type { PoolClient } from "pg";
import { z } from "zod";
import type { ContentBody } from "../../../../../packages/api/src/content.js";
import {
  ProcessedMediaEvidenceSchema,
  type ProcessedMediaEvidence,
} from "../../../../../packages/api/src/media.js";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
import type {
  PublicationIdentityAuthority,
  PublicationTaskScope,
} from "../identity/publication-scope.js";
import { readMediaFile } from "./files.js";
import { verifiedCreatorMediaProvenance } from "./provenance.js";
import type { PrivateMediaStorage } from "./storage.js";

const snapshotSchema = z.strictObject({
  id: z.uuid(),
  creatorId: z.uuid(),
  objectId: z.uuid(),
  ownerAccountId: z.uuid(),
  purpose: z.enum(["human_note", "post_audio", "post_photo"]),
  state: z.literal("ready"),
  version: z.number().int().positive(),
  mimeType: z.enum(["audio/mp4", "image/png"]),
  bytes: z.number().int().positive().max(268435456),
  durationMs: z.number().int().positive().max(3600000).nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  signedActId: z.uuid(),
  expiresAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  maxBytes: z.number().int().positive().max(268435456),
  provenance: z.record(z.string(), z.json()).nullable(),
  manifestPending: z.boolean(),
  deletePending: z.boolean(),
  originalAssociation: z.boolean(),
  currentAssociation: z.boolean(),
});
type Snapshot = z.infer<typeof snapshotSchema>;
const sources = Object.freeze([
  {
    path: "apps/backend/src/modules/identity/schema-publication-scope.sql",
    owner: "W1",
    name: "w1_publication_worker_scope",
    checksum:
      "100e319216568ee1ed27081be0520dbfdb3b7019659946c2c5de1f6859d32cc1",
  },
  {
    path: "apps/backend/migrations/0073_w8_publication_worker_denial.sql",
    owner: "W8",
    name: "w8_publication_worker_denial",
    checksum:
      "87f8766331b59a174e0cf7e837e3a3a9cdfd9d9a1662aa2b39ed9aa2dc308d80",
  },
  {
    path: "apps/backend/src/modules/media/publication-scope.sql",
    owner: "W6",
    name: "w6_publication_media_scope",
    checksum:
      "86fa7a8b8de890490ae9fc735d58b3581f1e7d158e3c51baa4ffa51ec33cc1df",
  },
  {
    path: "apps/backend/migrations/0201_w8_worker_migration_metadata.sql",
    owner: "W8",
    name: "w8_worker_migration_metadata",
    checksum:
      "2fce1ce5aa6c9f571067d999e2a62ac8d71b8e147b97393e7e87091227159e6f",
  },
]);

export interface PublicationMedia {
  prepare(
    client: PoolClient,
    taskAuthority: PublicationTaskScope,
  ): Promise<void>;
  evidence(
    client: PoolClient,
    taskAuthority: PublicationTaskScope,
    attachment: ContentBody["media"][number],
  ): Promise<ProcessedMediaEvidence>;
  ready(
    client: PoolClient,
    taskAuthority: PublicationTaskScope,
    evidence: ProcessedMediaEvidence,
  ): Promise<boolean>;
  finalize(
    client: PoolClient,
    taskAuthority: PublicationTaskScope,
  ): Promise<void>;
}

/** Joins W1's actual sealed publication transaction. No request Actor,
 * interactive CreatorScope, account GUC or background signing is constructed.
 * W8 holds the original0071/0073/0075 sources as0158/0160/0161.
 * The actual approved minimum worker metadata purpose0201 is also required.
 */
export function createPublicationMedia(input: {
  identity: PublicationIdentityAuthority;
  storage: PrivateMediaStorage;
}): PublicationMedia {
  const prepared = new WeakMap<
    PublicationTaskScope,
    {
      client: PoolClient;
      transaction: string;
      pid: number;
      originalHash: string;
      attachments: Map<string, ContentBody["media"][number]>;
      evidence: Map<string, ProcessedMediaEvidence>;
      ready: Map<string, string>;
      finalized: boolean;
    }
  >();
  const current = async (client: PoolClient, scope: PublicationTaskScope) => {
    const held = prepared.get(scope);
    invariant(
      held?.client === client && !held.finalized,
      "media_publication_preparation_required",
      "Prepare media on its original publication task and client.",
    );
    const original = await input.identity.originalInTransaction(scope, client);
    invariant(
      held.transaction === original.transaction &&
        held.pid === original.pid &&
        held.originalHash === contentHash(original),
      "media_publication_transaction_changed",
      "The original publication transaction or content changed.",
    );
    return held;
  };
  const assertPurpose = async (client: PoolClient) => {
    for (const source of sources)
      await assertRegisteredMigration(client, source);
    const result = await client.query<{ ready: boolean }>(
      `SELECT current_user=session_user AND current_user='creator_publication_worker'
       AND current_setting('transaction_isolation')='read committed'
       AND r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolcreatedb
       AND NOT r.rolcreaterole AND NOT r.rolreplication AND NOT r.rolbypassrls AND r.rolconfig IS NULL
       AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
       AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
       AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
       AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
       AND NOT EXISTS(SELECT FROM pg_proc WHERE proowner=r.oid)
       AND NOT EXISTS(SELECT FROM pg_database WHERE datdba=r.oid)
       AND EXISTS(SELECT FROM pg_proc p JOIN pg_roles a ON a.oid=p.proowner
         WHERE p.oid=to_regprocedure('creator.publication_media_snapshot(uuid,uuid,integer,uuid)')
           AND a.rolname='creator_publication_authority' AND NOT a.rolcanlogin AND NOT a.rolinherit AND NOT a.rolsuper
           AND NOT a.rolcreatedb AND NOT a.rolcreaterole AND NOT a.rolreplication AND NOT a.rolbypassrls AND a.rolconfig IS NULL
           AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=a.oid OR roleid=a.oid)
           AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=a.oid)
           AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog','statement_timeout=5s']::text[]
           AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='d501aa36c5a02bca5ceda22670a1e7779dca8a80032ae1a62d9c2ed775cc980f'
           AND has_function_privilege(current_user,p.oid,'EXECUTE')
           AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
             WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'))
       AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='creator' AND c.relname IN('creator_media_asset','creator_media_publication')
           AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR pg_get_userbyid(c.relowner)<>'creator_owner'
             OR has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
             OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
       AS ready FROM pg_roles r WHERE r.rolname=current_user`,
    );
    invariant(
      result.rows[0]?.ready === true,
      "media_publication_unconfigured",
      "Reviewed media publication authority is unavailable.",
    );
  };
  const snapshot = async (
    client: PoolClient,
    scope: PublicationTaskScope,
    id: string,
  ) => {
    const held = await current(client, scope);
    invariant(
      held.evidence.has(id),
      "media_version_changed",
      "Use only this original signed publication's media.",
    );
    await assertPurpose(client);
    invariant(
      scope.signedActId,
      "media_signature_required",
      "This media requires its exact signed publication.",
    );
    const result = await client.query<{ snapshot: unknown }>(
      "SELECT creator.publication_media_snapshot($1,$2,$3,$4) AS snapshot",
      [scope.creatorId, scope.contentId, scope.version, z.uuid().parse(id)],
    );
    const value = snapshotSchema.parse(result.rows[0]?.snapshot);
    invariant(
      value.creatorId === scope.creatorId &&
        value.objectId === scope.contentId &&
        value.ownerAccountId === scope.publisherAccountId &&
        value.id === id &&
        value.currentAssociation &&
        value.originalAssociation &&
        !value.deletePending &&
        Date.parse(value.expiresAt) > Date.now(),
      "media_publication_unavailable",
      "This publication's exact media is unavailable.",
    );
    return value;
  };
  const evidenceOf = (row: Snapshot) =>
    ProcessedMediaEvidenceSchema.parse({
      assetId: row.id,
      version: row.version,
      sha256: row.sha256,
      bytes: row.bytes,
      mimeType: row.mimeType,
      durationMs: row.durationMs,
    });
  const verifiedBytes = async (
    row: Snapshot,
    proof: ProcessedMediaEvidence,
  ) => {
    if (
      contentHash(evidenceOf(row)) !== contentHash(proof) ||
      row.manifestPending ||
      !verifiedCreatorMediaProvenance({
        id: row.id,
        version: row.version,
        purpose: row.purpose,
        creator_id: row.creatorId,
        object_id: row.objectId,
        owner_account_id: row.ownerAccountId,
        signed_act_id: row.signedActId,
        output_sha256: row.sha256,
        bytes: row.bytes,
        mime_type: row.mimeType,
        duration_ms: row.durationMs,
        max_bytes: row.maxBytes,
        provenance: row.provenance,
      })
    )
      return false;
    await readMediaFile(
      input.storage.file(row.id, "processed"),
      row.maxBytes,
      { bytes: row.bytes, sha256: row.sha256 },
      false,
    );
    await readMediaFile(
      input.storage.file(row.id, "output"),
      row.maxBytes,
      {
        bytes: row.provenance!.fileBytes as number,
        sha256: row.provenance!.fileSha256 as string,
      },
      false,
    );
    return Date.parse(row.expiresAt) > Date.now();
  };
  return Object.freeze<PublicationMedia>({
    async prepare(client, scope) {
      const original = await input.identity.originalInTransaction(
        scope,
        client,
      );
      await assertPurpose(client);
      invariant(
        !prepared.has(scope),
        "media_publication_preparation_required",
        "Prepare each original publication task only once.",
      );
      const attachments = new Map(
        original.document.media.map((item) => [item.assetId, item]),
      );
      const evidence = new Map(
        original.mediaEvidence.map((item) => [item.assetId, item]),
      );
      invariant(
        attachments.size === original.document.media.length &&
          evidence.size === original.mediaEvidence.length &&
          attachments.size === evidence.size &&
          [...attachments].every(([id, attachment]) => {
            const item = evidence.get(id);
            return (
              item &&
              item.version === attachment.version &&
              item.sha256 === attachment.sha256
            );
          }),
        "media_version_changed",
        "The complete original signed media and attachments are required.",
      );
      prepared.set(scope, {
        client,
        transaction: original.transaction,
        pid: original.pid,
        originalHash: contentHash(original),
        attachments,
        evidence,
        ready: new Map(),
        finalized: false,
      });
    },
    async evidence(client, scope, attachment) {
      const held = await current(client, scope);
      const original = held.attachments.get(attachment.assetId);
      invariant(
        original && contentHash(original) === contentHash(attachment),
        "media_version_changed",
        "The complete original attachment is required.",
      );
      const row = await snapshot(client, scope, attachment.assetId);
      invariant(
        row.version === attachment.version &&
          row.sha256 === attachment.sha256 &&
          (attachment.kind === "photo"
            ? row.purpose === "post_photo" && row.mimeType === "image/png"
            : attachment.kind === "voice" &&
              ["human_note", "post_audio"].includes(row.purpose) &&
              row.mimeType === "audio/mp4") &&
          (row.purpose !== "human_note" ||
            (row.durationMs !== null && row.durationMs <= 60000)),
        "media_version_changed",
        "This publication's exact media changed.",
      );
      const proof = evidenceOf(row);
      invariant(
        contentHash(proof) === contentHash(held.evidence.get(row.id)),
        "media_version_changed",
        "The original signed processed media is required.",
      );
      return proof;
    },
    async ready(client, scope, expected) {
      const held = await current(client, scope);
      const proof = ProcessedMediaEvidenceSchema.parse(expected);
      const original = held.evidence.get(proof.assetId);
      invariant(
        original && contentHash(original) === contentHash(proof),
        "media_version_changed",
        "Use the complete original signed media evidence.",
      );
      held.ready.delete(proof.assetId);
      const row = await snapshot(client, scope, proof.assetId);
      // Share-locks from the projection hold the actual asset through commit.
      // Verify both immutable processed bytes and the distinct served variant;
      // no credential tool, signer, repair or alternate file is run here.
      if (!(await verifiedBytes(row, proof))) return false;
      await input.identity.authorizeInTransaction(scope, client);
      await assertPurpose(client);
      if (Date.parse(row.expiresAt) <= Date.now()) return false;
      held.ready.set(row.id, contentHash(row));
      return true;
    },
    async finalize(client, scope) {
      const held = await current(client, scope);
      invariant(
        held.ready.size === held.evidence.size,
        "media_publication_unavailable",
        "Every original publication asset requires its real positive check.",
      );
      // This is the last media/file bookend, after W5's writes/effects and
      // restoration callback, before W1's cleanup and LAST signature read.
      let earliestExpiry = Infinity;
      for (const [id, proof] of [...held.evidence].sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        const row = await snapshot(client, scope, id);
        earliestExpiry = Math.min(earliestExpiry, Date.parse(row.expiresAt));
        invariant(
          contentHash(row) === held.ready.get(id) &&
            (await verifiedBytes(row, proof)),
          "media_publication_unavailable",
          "The actual media metadata, provenance or bytes changed before commit.",
        );
      }
      invariant(
        earliestExpiry > Date.now(),
        "media_publication_unavailable",
        "The publication media expired before the final signature check.",
      );
      held.finalized = true;
    },
  });
}

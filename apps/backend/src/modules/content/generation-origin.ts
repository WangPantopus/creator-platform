import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { AgentAudience } from "../../../../../packages/api/src/agent/contracts.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import {
  GenerationIdentityAuthority,
  type GenerationPurposeConsumer,
  type GenerationTaskScope,
} from "../identity/generation-scope.js";
import { SIGNATURE_READ_FENCE_MIGRATION } from "../identity/signature-read-fence.js";
import { ContentHeldClient } from "./held-client-cleanup.js";
import {
  assertOriginProfileFence,
  originUnavailable,
} from "./generation-origin-profile.js";

export const GENERATION_CONTENT_ORIGIN_MIGRATION =
  "0186_w5_generation_content_origin";
export const GENERATION_CONTENT_ORIGIN_SIGNATURE =
  "creator.generation_content_origins(uuid,uuid,jsonb)";
const owner = "creator_w5_generation_origin";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Source = z.strictObject({
  id: z.uuid(),
  revision: z.int().positive(),
  hash: Hash,
  origin: z.enum([
    "manual_text",
    "manual_upload",
    "interview",
    "youtube_caption",
    "platform_export",
  ]),
  originReference: z.string().max(500).nullable(),
  audience: AgentAudience,
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
});
type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
export type GenerationContentOriginSource = DeepReadonly<
  z.infer<typeof Source>
>;
const Origin = z.strictObject({
  creatorId: z.uuid(),
  contentId: z.uuid(),
  version: z.int().positive().max(2147483647),
  audience: z.strictObject({ kind: z.literal("public") }),
  sourceHash: Hash,
  commandHash: Hash,
  signedActId: z.uuid(),
});

/** W2 compares these current origins with its own stored approved sources and
 * licence. This reader supplies neither source approval nor generation/fan
 * permission, and exposes no document, original command or identity secret. */
export class PreparedContentGenerationOrigins {
  private readonly finalized = new WeakMap<
    GenerationTaskScope,
    { client: PoolClient; tupleHash: string }
  >();
  private constructor(
    private readonly identity: GenerationIdentityAuthority,
    private readonly profileFenceDefinitionChecksum: string,
    private readonly catalogueChecksum: string,
  ) {}

  static async prepare(input: {
    identity: GenerationIdentityAuthority;
    workerPool: Pool;
    /** W8/W1 source-reviewed receipts, never self-attested database hashes. */
    consumer: GenerationPurposeConsumer;
    signatureMigration: { version: string; checksum: string };
    metadataDefinitionChecksum: string;
    signatureFenceDefinitionChecksum: string;
    /** Independently qualified pg_get_expr of the separately registered fence. */
    profileFenceDefinitionChecksum: string;
    /** Independently reviewed effective schema/table/column/RLS permissions. */
    catalogueChecksum: string;
    /** The caller's original cancellation; supplies no task or authority. */
    signal?: AbortSignal;
  }): Promise<PreparedContentGenerationOrigins> {
    invariant(
      input.identity instanceof GenerationIdentityAuthority,
      "generation_content_origin_unconfigured",
      "Use the genuine generation purpose issuer.",
    );
    input.identity.assertPool(input.workerPool);
    invariant(
      input.consumer.signature === GENERATION_CONTENT_ORIGIN_SIGNATURE &&
        input.consumer.owner === owner &&
        input.consumer.migration.version ===
          GENERATION_CONTENT_ORIGIN_MIGRATION &&
        Hash.safeParse(input.consumer.migration.checksum).success &&
        Hash.safeParse(input.consumer.definitionChecksum).success &&
        input.signatureMigration.version === SIGNATURE_READ_FENCE_MIGRATION &&
        Hash.safeParse(input.signatureMigration.checksum).success &&
        Hash.safeParse(input.metadataDefinitionChecksum).success &&
        Hash.safeParse(input.signatureFenceDefinitionChecksum).success &&
        Hash.safeParse(input.profileFenceDefinitionChecksum).success &&
        Hash.safeParse(input.catalogueChecksum).success &&
        Number.isFinite(input.workerPool.options.connectionTimeoutMillis) &&
        (input.workerPool.options.connectionTimeoutMillis ?? 0) > 0 &&
        (input.workerPool.options.connectionTimeoutMillis ?? 0) <= 5000,
      "generation_content_origin_unconfigured",
      "Exact reviewed origin and signature writer receipts are required.",
    );
    input.identity.assertConsumerRegistered(input.consumer);
    input.signal?.throwIfAborted();
    const client = await input.workerPool.connect().catch((error: unknown) => {
      throw originUnavailable(error);
    });
    const signal = AbortSignal.any([
      ...(input.signal ? [input.signal] : []),
      AbortSignal.timeout(6000),
    ]);
    const held = new ContentHeldClient(client, signal);
    let failure: unknown;
    try {
      await held.begin();
      await held.run(() =>
        client.query(
          "SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'; SET LOCAL idle_in_transaction_session_timeout='5s'",
        ),
      );
      await held.run(() =>
        assertOriginProfileFence(
          client,
          input.profileFenceDefinitionChecksum,
          input.catalogueChecksum,
          signal,
        ),
      );
      const proof = (
        await held.run(() =>
          client.query<{
            ready: boolean;
            definition: string;
            metadata_definition: string;
            fence_definition: string;
          }>(
            `SELECT session_user='creator_generation_worker' AND current_user=session_user
           AND (SELECT count(*)=2 FROM creator.schema_migration WHERE
            (version=$2 AND checksum=$3) OR (version=$5 AND checksum=$6))
           AND p.prokind='f' AND p.prosecdef AND p.provolatile='v'
           AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)=$4
           AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit
           AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
           AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
           AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
           AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
           AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
           AND (SELECT count(*)=1 FROM pg_proc WHERE proowner=r.oid)
           AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
            WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
           AND NOT EXISTS(SELECT FROM aclexplode(p.proacl) a LEFT JOIN pg_roles recipient ON recipient.oid=a.grantee
            WHERE a.privilege_type<>'EXECUTE' OR recipient.rolname IS NULL
             OR recipient.rolname NOT IN('creator_w5_generation_origin','creator_generation_worker',
              'creator_w2_generation_input','creator_w2_generation_retrieval')
             OR (a.grantee<>p.proowner AND a.is_grantable))
           AND NOT EXISTS(SELECT FROM pg_roles recipient WHERE recipient.rolname='creator_w2_generation_retrieval'
            AND (recipient.rolcanlogin OR recipient.rolsuper OR recipient.rolbypassrls OR recipient.rolinherit
             OR recipient.rolcreatedb OR recipient.rolcreaterole OR recipient.rolreplication
             OR (recipient.rolconfig IS NOT NULL AND cardinality(recipient.rolconfig)<>0)
             OR EXISTS(SELECT FROM pg_auth_members WHERE member=recipient.oid OR roleid=recipient.oid)
             OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=recipient.oid)
             OR EXISTS(SELECT FROM pg_class WHERE relowner=recipient.oid)))
           AND EXISTS(SELECT FROM aclexplode(p.proacl) a JOIN pg_roles worker ON worker.oid=a.grantee
            WHERE worker.rolname=session_user AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
           AND has_function_privilege(current_user,p.oid,'EXECUTE')
           AND has_function_privilege($4,to_regprocedure('creator.generation_scope_matches(uuid,uuid)'),'EXECUTE')
           AND has_function_privilege('creator_w2_generation_input',p.oid,'EXECUTE')
           AND NOT has_column_privilege($4,'creator.content_revision','document','SELECT')
           AND NOT has_column_privilege($4,'creator.signed_publication','command','SELECT')
           AND NOT has_column_privilege($4,'creator.signed_verification','public_command','SELECT')
           AND NOT has_column_privilege($4,'creator.signed_act','assertion','SELECT')
           AND NOT has_column_privilege($4,'creator.passkey_credential','public_key','SELECT')
           AND NOT EXISTS(SELECT FROM unnest(ARRAY['creator.thread'::regclass,'creator.message'::regclass,
            'creator.memory'::regclass,'creator.fan_profile'::regclass,'creator.access_grant'::regclass,
            'creator.commerce_packet'::regclass,'creator.commerce_commitment'::regclass,
            'creator.commerce_ledger'::regclass,'creator.commerce_membership'::regclass,
            'creator.commerce_allowance_reservation'::regclass,'creator.commerce_share_grant'::regclass,
            'creator.commerce_payout_account'::regclass,'creator.identity_session'::regclass,
            'creator.signed_challenge'::regclass,'creator.ai_source'::regclass,
            'creator.ai_version'::regclass,'creator.ai_workspace'::regclass]) private_relation
            WHERE has_any_column_privilege($4,private_relation,'SELECT,INSERT,UPDATE,REFERENCES')
             OR has_table_privilege($4,private_relation,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
           AND (SELECT count(*)=5 FROM pg_class WHERE oid=ANY(ARRAY[
            'creator.content_index'::regclass,'creator.content_revision'::regclass,
            'creator.content_publication'::regclass,'creator.generation_worker_scope'::regclass,
            'creator.creator_profile'::regclass])
            AND relrowsecurity AND relforcerowsecurity AND pg_get_userbyid(relowner)='creator_owner')
           AND (SELECT count(*)=3 FROM pg_attribute WHERE attrelid='creator.content_revision'::regclass
            AND NOT attisdropped AND ((attname='ai_reuse_public_text' AND atttypid='boolean'::regtype)
             OR (attname IN('ai_reuse_source_hash','ai_reuse_command_hash') AND atttypid='text'::regtype)))
           AND EXISTS(SELECT FROM pg_trigger t JOIN pg_proc meta ON meta.oid=t.tgfoid
            WHERE t.tgname='derive_content_origin_metadata' AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=23
             AND t.tgrelid='creator.content_revision'::regclass
             AND t.tgfoid=to_regprocedure('creator.derive_content_origin_metadata()')
             AND pg_get_userbyid(meta.proowner)='creator_owner' AND NOT meta.prosecdef
             AND meta.provolatile='v' AND meta.proconfig=ARRAY['search_path=pg_catalog'])
           AND (SELECT count(*)=6 FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid
            WHERE t.tgname='fence_signature_metadata_write' AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=25
             AND t.tgfoid=to_regprocedure('creator.fence_signature_metadata_write()')
             AND pg_get_userbyid(f.proowner)='creator_owner' AND NOT f.prosecdef
             AND f.provolatile='v' AND f.proconfig=ARRAY['search_path=pg_catalog']
             AND t.tgrelid=ANY(ARRAY['creator.creator_profile'::regclass,'creator.passkey_credential'::regclass,
              'creator.signed_act'::regclass,'creator.signed_act_consumption'::regclass,
              'creator.signed_publication'::regclass,'creator.signed_verification'::regclass]))
           AS ready,pg_get_functiondef(p.oid) AS definition,
           pg_get_functiondef(to_regprocedure('creator.derive_content_origin_metadata()')) AS metadata_definition,
           pg_get_functiondef(to_regprocedure('creator.fence_signature_metadata_write()')) AS fence_definition
           FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=to_regprocedure($1)`,
            [
              input.consumer.signature,
              input.consumer.migration.version,
              input.consumer.migration.checksum,
              owner,
              input.signatureMigration.version,
              input.signatureMigration.checksum,
            ],
          ),
        )
      ).rows[0];
      const hash = (text: string) =>
        createHash("sha256").update(text).digest("hex");
      if (
        proof?.ready !== true ||
        hash(proof.definition) !== input.consumer.definitionChecksum ||
        hash(proof.metadata_definition) !== input.metadataDefinitionChecksum ||
        hash(proof.fence_definition) !== input.signatureFenceDefinitionChecksum
      )
        throw new Error("Origin custody differs from reviewed source");
    } catch (error) {
      failure = error;
      throw originUnavailable(error);
    } finally {
      await held.settle(failure);
    }
    return new PreparedContentGenerationOrigins(
      input.identity,
      input.profileFenceDefinitionChecksum,
      input.catalogueChecksum,
    );
  }

  async assertCurrent(
    client: PoolClient,
    scope: GenerationTaskScope,
    sources: readonly GenerationContentOriginSource[],
    signal?: AbortSignal,
  ): Promise<void> {
    signal?.throwIfAborted();
    await this.identity.authorizeInTransaction(scope, client);
    signal?.throwIfAborted();
    await assertOriginProfileFence(
      client,
      this.profileFenceDefinitionChecksum,
      this.catalogueChecksum,
      signal,
    );
    const selected = z.array(Source).min(1).max(1000).parse(sources);
    invariant(
      new Set(selected.map((source) => source.id)).size === selected.length,
      "generation_content_origin_changed",
      "Use the exact distinct stored source revisions.",
    );
    const tuples = selected.map((source) => {
      const reference = source.originReference?.match(
        /^content:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}):([1-9][0-9]*)$/u,
      );
      invariant(
        reference &&
          source.origin === "manual_text" &&
          source.audience.kind === "public",
        "generation_content_origin_unavailable",
        "Only exact current public creator text has this origin authority.",
      );
      return {
        contentId: z.uuid().parse(reference[1]),
        version: z.int().positive().max(2147483647).parse(Number(reference[2])),
      };
    });
    const distinct = [
      ...new Map(
        tuples.map((tuple) => [`${tuple.contentId}:${tuple.version}`, tuple]),
      ).values(),
    ].sort(
      (a, b) => a.contentId.localeCompare(b.contentId) || a.version - b.version,
    );
    const tupleHash = contentHash(distinct);
    const previous = this.finalized.get(scope);
    invariant(
      !previous ||
        (previous.client === client && previous.tupleHash === tupleHash),
      "generation_content_origin_order_changed",
      "Do not introduce another document after the final origin fence.",
    );
    let current: z.infer<typeof Origin>[];
    try {
      signal?.throwIfAborted();
      const raw = (
        await client.query<{ origins: unknown }>(
          "SELECT creator.generation_content_origins($1,$2,$3::jsonb) AS origins",
          [scope.generationId, scope.workerToken, JSON.stringify(distinct)],
        )
      ).rows[0]?.origins;
      signal?.throwIfAborted();
      current = z.array(Origin).min(1).max(1000).parse(raw);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        String(error.code) === "42501"
      ) {
        const denied = new DomainError(
          "generation_content_origin_denied",
          "This content origin is unavailable.",
          403,
        );
        Object.defineProperty(denied, "cause", {
          value: error,
          configurable: true,
        });
        throw denied;
      }
      throw originUnavailable(error);
    }
    const byTuple = new Map(
      current.map((origin) => [
        `${origin.contentId}:${origin.version}`,
        origin,
      ]),
    );
    const currentTime = (
      await client.query<{ epoch_seconds: number }>(
        "SELECT extract(epoch FROM clock_timestamp())::double precision AS epoch_seconds",
      )
    ).rows[0]?.epoch_seconds;
    signal?.throwIfAborted();
    invariant(
      typeof currentTime === "number" &&
        Number.isFinite(currentTime) &&
        current.length === distinct.length &&
        byTuple.size === current.length &&
        current.every((origin) => origin.creatorId === scope.creatorId) &&
        selected.every(
          (source, index) =>
            (source.expiresAt === null ||
              Date.parse(source.expiresAt) / 1000 > currentTime) &&
            byTuple.get(`${tuples[index]!.contentId}:${tuples[index]!.version}`)
              ?.sourceHash === source.hash,
        ),
      "generation_content_origin_changed",
      "An approved source no longer matches its current public publication.",
    );
    this.finalized.set(scope, { client, tupleHash });
    await assertOriginProfileFence(
      client,
      this.profileFenceDefinitionChecksum,
      this.catalogueChecksum,
      signal,
    );
    await this.identity.authorizeInTransaction(scope, client);
    signal?.throwIfAborted();
  }
}

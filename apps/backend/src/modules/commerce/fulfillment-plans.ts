import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  CommerceFulfillmentPlanRef,
  CreateCommerceFulfillmentPlan,
  CommerceReviewAttestationCommand,
  SubmitCommerceReviewAttestation,
  type CommerceFulfillmentPlanReference,
} from "../../../../../packages/api/src/commerce/fulfillment.js";
import { ContentDocument } from "../../../../../packages/api/src/content.js";
import type { SignedActCommand } from "@qelvora/api";
import type { Database } from "../../db/database.js";
import { contentHash } from "../../core/canonical.js";
import { idempotent } from "../../core/idempotency.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { Actor } from "../identity/adapter.js";
import { identityTransaction } from "../identity/transaction.js";
import {
  requestAuthority,
  holdCurrentRequestSession,
  type HeldCurrentRequestSession,
} from "../identity/request-authority.js";
import {
  consumeCreatorSignedAct,
  type SignedSubjectPolicy,
} from "../identity/subjects.js";
import {
  createSignatureReadFence,
  SIGNATURE_READ_FENCE_MIGRATION,
} from "../identity/signature-read-fence.js";
import {
  assertThreadScope,
  type AccessService,
  type ScopeRestrictionInTransaction,
  type ThreadScope,
} from "../access/scope.js";
import { holdCommercePublicationPermission } from "./publication.js";
import {
  fulfillmentChanged,
  readOriginalCommerceService,
  originalCommerceServiceHash,
  type OriginalCommerceService,
} from "./original-service.js";
import {
  FULFILLMENT_CATALOGUE_QUERY,
  FULFILLMENT_CATALOGUE_SHA256,
} from "./fulfillment-catalogue.js";
import { CommerceFulfillmentViewAuthority } from "./fulfillment-view-authority.js";

export const FULFILLMENT_PLAN_MIGRATION = "0178_w4_fulfillment_plan_custody";
// Updated only from the reviewed owned proposal; W8 registers this exact file.
export const FULFILLMENT_PLAN_SCHEMA_SHA256 =
  "d728ec3d71f3b9fd11c49b3f2faf91624e7b03868d5ab4b462b0730fddae4aa1";
const PlanDocument = ContentDocument.safeExtend({
  planRef: CommerceFulfillmentPlanRef.nullable().optional(),
});
const ReviewReceipt = z.strictObject({
  attestationId: z.uuid(),
  packetId: z.uuid(),
  commitmentId: z.uuid(),
  signedActId: z.uuid(),
});
const SIGNATURE_SCHEMA_SHA256 =
  "157640de84f22d6d638d788dfe04314fd193efaed80a829f288bec7cbcb815b5";
const SIGNATURE_WRITER_BODY_SHA256 =
  "5de9abf23bd5ee2f09022dd4cbde046d0408df384aaffb4c63215f6a377f2c97";
type Context = {
  transaction: string;
  pid: number;
  request: NonNullable<ReturnType<typeof requestAuthority.getStore>>;
  actor: Actor;
  session: HeldCurrentRequestSession;
};
type Header = {
  id: string;
  revision: number;
  creator_id: string;
  content_id: string;
  content_version: number;
  audience: unknown;
  minimum_recipients: number;
  recipient_count: number;
  source_hash: string;
  created_by: string;
};
type Member = {
  plan_id: string;
  plan_revision: number;
  packet_id: string;
  commitment_id: string;
  creator_id: string;
  fan_id: string;
  thread_id: string;
  packet_version: number;
  commitment_version: number;
  mode_id: string;
  mode_version: number;
  acceptance_id: string;
  acceptance_hash: string;
  request_hash: string;
  consent_hash: string;
  capture_id: string;
  capture_hash: string;
};
const recipientBrand: unique symbol = Symbol("CommerceGroupRecipient");
/** Process-issued only. It contains no serialized fan list or scalar license. */
export type CommerceGroupRecipient = Readonly<{ [recipientBrand]: true }>;
const draftReadBatchBrand: unique symbol = Symbol(
  "CommerceFulfillmentDraftReadBatch",
);
export type CommerceFulfillmentDraftReadBatch = Readonly<{
  [draftReadBatchBrand]: true;
}>;
type Recipient = {
  proof: CommerceGroupRecipient;
  member: Member;
  source: OriginalCommerceService;
  scope: ThreadScope;
  messageId?: string;
};
type Held = Context & {
  intent: "draft" | "committed";
  header: Header;
  reference: CommerceFulfillmentPlanReference;
  documentHash: string;
  recipients: Recipient[];
  positive: boolean;
  finalized: boolean;
  readOnly?: true;
};
type PublicationInput = {
  creatorId: string;
  contentId: string;
  planRef: CommerceFulfillmentPlanReference;
};
type PublicationMetadata = {
  context: Context;
  ref: CommerceFulfillmentPlanReference;
  header: Header;
  members: Member[];
};
type DraftReadBatch = {
  client: PoolClient;
  context: Context;
  plans: Held[];
  originals: { source: OriginalCommerceService; scope: ThreadScope }[];
  positive: boolean;
  finalized: boolean;
};
const issued = new WeakSet<CommerceFulfillmentPlans>();

/** Genuine original Commerce records and canonical existing-thread scopes.
 * The class cannot be constructed from callbacks, packet JSON or booleans.
 * W5 prepares before its document locks, supplies its final publication writes,
 * and W3 consumes the private same-client recipient before inserting a System
 * message/frame. Finalize is last: only COMMIT may follow its signer fence.
 */
export class CommerceFulfillmentPlans {
  private readonly held = new WeakMap<PoolClient, Held>();
  private readonly readBatches = new WeakMap<
    CommerceFulfillmentDraftReadBatch,
    DraftReadBatch
  >();
  private readonly activeReadBatches = new WeakMap<
    PoolClient,
    DraftReadBatch
  >();
  private readonly recipients = new WeakMap<
    CommerceGroupRecipient,
    { client: PoolClient; held: Held; recipient: Recipient }
  >();
  private readonly reviews = new WeakMap<
    PoolClient,
    {
      context: Context;
      source: OriginalCommerceService;
      scope: ThreadScope;
      command: SignedActCommand;
    }
  >();
  private constructor(
    private readonly database: Database,
    private readonly access: AccessService,
    private readonly assertAllowed: ScopeRestrictionInTransaction,
    private readonly minimumRecipients: number,
    private readonly viewAuthority?: CommerceFulfillmentViewAuthority,
  ) {
    issued.add(this);
  }

  static async prepare(input: {
    database: Database;
    access: AccessService;
    assertScopeAllowedInTransaction: ScopeRestrictionInTransaction;
    minimumRecipients: number;
    migration: { version: string; checksum: string };
    signatureMigration: Parameters<
      typeof createSignatureReadFence
    >[0]["migration"];
    viewAuthority?: CommerceFulfillmentViewAuthority;
  }) {
    if (
      !input.access.isForPool(input.database.pool) ||
      !input.database.threadScopeInTransactionAvailable ||
      !input.access.threadScopeInTransactionAvailable ||
      typeof input.assertScopeAllowedInTransaction !== "function" ||
      input.migration.version !== FULFILLMENT_PLAN_MIGRATION ||
      input.migration.checksum !== FULFILLMENT_PLAN_SCHEMA_SHA256 ||
      input.signatureMigration.version !== SIGNATURE_READ_FENCE_MIGRATION ||
      input.signatureMigration.checksum !== SIGNATURE_SCHEMA_SHA256 ||
      !Number.isSafeInteger(input.minimumRecipients) ||
      input.minimumRecipients < 2 ||
      input.minimumRecipients > 100
    )
      throw unavailable();
    await input.database.assertRuntimeRole();
    if (input.viewAuthority)
      CommerceFulfillmentViewAuthority.assertRuntime(
        input.viewAuthority,
        input.database,
      );
    await createSignatureReadFence({
      pool: input.database.pool,
      migration: input.signatureMigration,
    });
    const plans = new CommerceFulfillmentPlans(
      input.database,
      input.access,
      input.assertScopeAllowedInTransaction,
      input.minimumRecipients,
      input.viewAuthority,
    );
    const client = await input.database.pool.connect();
    try {
      await plans.assertCatalogue(client);
    } finally {
      client.release();
    }
    return plans;
  }

  assertRuntime(database: Database, access: AccessService) {
    invariant(
      issued.has(this) &&
        database === this.database &&
        access === this.access &&
        access.isForPool(database.pool),
      "fulfillment_graph_mismatch",
      "Fulfillment requires the same canonical Commerce and conversation services.",
    );
  }
  static assertRuntime(
    value: CommerceFulfillmentPlans,
    database: Database,
    access: AccessService,
  ) {
    if (!issued.has(value)) throw unavailable();
    CommerceFulfillmentPlans.prototype.assertRuntime.call(
      value,
      database,
      access,
    );
  }

  private async assertCatalogue(client: PoolClient) {
    const catalogue = (
      await client.query<{ checksum: string }>(FULFILLMENT_CATALOGUE_QUERY)
    ).rows[0]?.checksum;
    if (this.viewAuthority)
      await CommerceFulfillmentViewAuthority.assertCurrentCatalogue(
        this.viewAuthority,
        this.database,
        client,
      );
    else if (catalogue !== FULFILLMENT_CATALOGUE_SHA256) throw unavailable();
    const ready = (
      await client.query<{ ready: boolean }>(
        `SELECT
     EXISTS(SELECT FROM pg_roles r WHERE r.rolname=current_user AND current_user='creator_runtime' AND session_user=current_user
      AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
      AND NOT pg_has_role(current_user,'creator_owner','MEMBER'))
     AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
     AND EXISTS(SELECT FROM creator.schema_migration WHERE version='0167_w1_signature_read_fence' AND checksum=$3)
     AND (SELECT count(*)=6 FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid
      WHERE NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=25
       AND t.tgname='fence_signature_metadata_write' AND f.proname='fence_signature_metadata_write'
       AND pg_get_userbyid(f.proowner)='creator_owner' AND NOT f.prosecdef AND f.provolatile='v'
       AND f.proconfig=ARRAY['search_path=pg_catalog']::text[]
       AND encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')=$4
       AND t.tgrelid=ANY(ARRAY['creator.creator_profile'::regclass,'creator.passkey_credential'::regclass,
        'creator.signed_act'::regclass,'creator.signed_act_consumption'::regclass,
        'creator.signed_publication'::regclass,'creator.signed_verification'::regclass]))
     AND (SELECT count(*)=4 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='creator_owner'
      AND has_table_privilege(current_user,c.oid,'SELECT') AND has_table_privilege(current_user,c.oid,'INSERT')
      AND NOT has_any_column_privilege(current_user,c.oid,'UPDATE') AND NOT has_table_privilege(current_user,c.oid,'DELETE')
      AND NOT EXISTS(SELECT FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee=0 AND a.privilege_type IN('SELECT','INSERT','UPDATE','DELETE')))
      FROM pg_class c WHERE c.oid=ANY(ARRAY['creator.commerce_fulfillment_plan'::regclass,'creator.commerce_fulfillment_member'::regclass,
       'creator.commerce_group_delivery'::regclass,'creator.commerce_review_attestation'::regclass]))
     AND (SELECT count(*)=8 FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid
      WHERE NOT t.tgisinternal AND t.tgenabled='O' AND pg_get_userbyid(f.proowner)='creator_owner'
      AND t.tgname IN('fulfillment_plan_complete','fulfillment_original_member','fulfillment_group_delivery_exact','fulfillment_review_attestation_exact','fulfillment_immutable')
      AND t.tgrelid=ANY(ARRAY['creator.commerce_fulfillment_plan'::regclass,'creator.commerce_fulfillment_member'::regclass,
       'creator.commerce_group_delivery'::regclass,'creator.commerce_review_attestation'::regclass]))
     AND (SELECT count(*)=6 FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid
      WHERE NOT t.tgisinternal AND t.tgenabled='O' AND pg_get_userbyid(f.proowner)='creator_owner'
       AND ((t.tgname='fence_public_mode_write' AND t.tgrelid='creator.commerce_mode'::regclass)
        OR (t.tgname='fence_public_packet_write' AND t.tgrelid=ANY(ARRAY['creator.commerce_packet'::regclass,'creator.commerce_commitment'::regclass,
         'creator.commerce_share_grant'::regclass,'creator.commerce_ledger'::regclass,'creator.commerce_effect'::regclass])))) AS ready`,
        [
          FULFILLMENT_PLAN_MIGRATION,
          FULFILLMENT_PLAN_SCHEMA_SHA256,
          SIGNATURE_SCHEMA_SHA256,
          SIGNATURE_WRITER_BODY_SHA256,
        ],
      )
    ).rows[0]?.ready;
    if (ready !== true) throw unavailable();
  }

  /** Current metadata only. W3 still requires its actual scoped transaction;
   * this permits historical association projection, never destination access. */
  async assertCurrentCatalogueInTransaction(client: PoolClient): Promise<void> {
    await this.assertCatalogue(client);
  }

  private async context(
    client: PoolClient,
    actor: Actor,
  ): Promise<Omit<Context, "session">> {
    const request = requestAuthority.getStore();
    if (
      !request ||
      request.accountId !== actor.accountId ||
      request.actor !== actor ||
      !actor.adultEligible
    )
      throw fulfillmentChanged();
    const row = (
      await client.query<{
        transaction: string | null;
        pid: number;
        account: string;
        session: string;
        isolation: string;
      }>(
        `SELECT pg_current_xact_id()::text AS transaction,pg_backend_pid() AS pid,current_setting('app.account_id',true) AS account,
       current_setting('app.identity_session_id',true) AS session,current_setting('transaction_isolation') AS isolation`,
      )
    ).rows[0];
    if (
      !row?.transaction ||
      row.account !== actor.accountId ||
      row.session !== request.sessionId ||
      row.isolation !== "read committed"
    )
      throw fulfillmentChanged();
    return { transaction: row.transaction, pid: row.pid, request, actor };
  }
  private async initializeContext(client: PoolClient, actor: Actor) {
    const request = requestAuthority.getStore();
    if (
      !request ||
      request.accountId !== actor.accountId ||
      !actor.adultEligible
    )
      throw fulfillmentChanged();
    const session = await holdCurrentRequestSession(client, actor.accountId);
    if (session.actor !== actor) throw fulfillmentChanged();
    return { ...(await this.context(client, actor)), session };
  }
  private async sameContext(client: PoolClient, context: Context) {
    const live = await this.context(client, context.actor);
    if (
      live.transaction !== context.transaction ||
      live.pid !== context.pid ||
      live.request !== context.request ||
      live.request.actor !== context.session.actor ||
      live.request.sessionId !== context.session.sessionId
    )
      throw fulfillmentChanged();
  }

  /** Resolve all original participants, hold all their negatives first, then
   * issue actual canonical scopes. A 1ms lock timeout refuses row contention
   * below a caller's existing owner locks; it never waits there for a writer.
   * The prior timeout is restored before any domain work or final signer lease.
   */
  private async prepareOriginals(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    packetIds: readonly string[],
    mode: OriginalCommerceService["mode"],
    states: readonly string[] = ["due", "in_progress"],
    sharedThreads = false,
    purpose: "read" | "write" = "write",
  ) {
    const pointers = (
      await client.query<{
        packet_id: string;
        thread_id: string;
        fan_id: string;
        fan_account: string;
        creator_account: string;
      }>(
        `SELECT p.id AS packet_id,p.thread_id,p.fan_id,fp.account_id AS fan_account,cp.account_id AS creator_account
       FROM creator.commerce_packet p JOIN creator.creator_profile cp ON cp.id=p.creator_id AND cp.account_id=$3
       JOIN creator.fan_profile fp ON fp.id=p.fan_id WHERE p.id=ANY($1::uuid[]) AND p.creator_id=$2 ORDER BY p.thread_id,p.id`,
        [packetIds, creatorId, actor.accountId],
      )
    ).rows;
    if (
      pointers.length !== packetIds.length ||
      (!sharedThreads &&
        new Set(pointers.map((p) => p.thread_id)).size !== packetIds.length)
    )
      throw fulfillmentChanged();
    for (const p of pointers) {
      await this.assertAllowed(
        actor,
        creatorId,
        p.thread_id,
        { fanAccountId: p.fan_account, creatorAccountId: p.creator_account },
        client,
      );
      await client.query(
        "SELECT set_config('app.account_id',$1,true),set_config('app.creator_id',$2,true)",
        [actor.accountId, creatorId],
      );
    }
    const timeout = (
      await client.query<{ value: string }>(
        "SELECT current_setting('lock_timeout') AS value",
      )
    ).rows[0]!.value;
    await client.query("SELECT set_config('lock_timeout','1ms',true)");
    const result: { source: OriginalCommerceService; scope: ThreadScope }[] =
      [];
    try {
      for (const p of pointers) {
        const scope = await this.access.openThreadInTransaction(
          client,
          actor,
          creatorId,
          p.fan_id,
          false,
          purpose,
        );
        assertThreadScope(scope);
        if (
          scope.authority !== "creator" ||
          scope.threadId !== p.thread_id ||
          scope.creatorAccountId !== actor.accountId ||
          scope.fanAccountId !== p.fan_account
        )
          throw fulfillmentChanged();
        const source = await readOriginalCommerceService(
          client,
          actor.accountId,
          creatorId,
          p.packet_id,
          mode,
          states,
        );
        result.push({ source, scope });
      }
      await client.query("SELECT set_config('lock_timeout',$1,true)", [
        timeout,
      ]);
      return result;
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "55P03"
      )
        throw fulfillmentChanged();
      throw error;
    }
  }

  private async lockOriginal(
    client: PoolClient,
    actor: Actor,
    source: OriginalCommerceService,
  ) {
    if (source.mode === "group_answer") {
      if (
        !(await holdCommercePublicationPermission(
          client,
          actor,
          source.creator_id,
          source.packet_id,
          source.mode_id,
        ))
      )
        throw fulfillmentChanged();
    } else {
      try {
        await client.query(
          "SELECT id FROM creator.commerce_packet WHERE id=$1 AND creator_id=$2 FOR UPDATE NOWAIT",
          [source.packet_id, source.creator_id],
        );
        await client.query(
          "SELECT id FROM creator.commerce_commitment WHERE id=$1 AND packet_id=$2 FOR UPDATE NOWAIT",
          [source.commitment_id, source.packet_id],
        );
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "55P03"
        )
          throw fulfillmentChanged();
        throw error;
      }
    }
    const current = await readOriginalCommerceService(
      client,
      actor.accountId,
      source.creator_id,
      source.packet_id,
      source.mode,
      source.state === "delivered" ? ["delivered"] : ["due", "in_progress"],
    );
    if (
      originalCommerceServiceHash(current) !==
      originalCommerceServiceHash(source)
    )
      throw fulfillmentChanged();
  }

  private member(planId: string, source: OriginalCommerceService): Member {
    return {
      plan_id: planId,
      plan_revision: 1,
      packet_id: source.packet_id,
      commitment_id: source.commitment_id,
      creator_id: source.creator_id,
      fan_id: source.fan_id,
      thread_id: source.thread_id,
      packet_version: source.packet_version,
      commitment_version: source.commitment_version,
      mode_id: source.mode_id,
      mode_version: source.mode_version,
      acceptance_id: source.acceptance_id,
      acceptance_hash: source.acceptance_hash,
      request_hash: source.request_hash,
      consent_hash: source.consent_hash,
      capture_id: source.capture_id,
      capture_hash: source.capture_hash,
    };
  }

  async create(
    actor: Actor,
    creatorId: string,
    raw: unknown,
  ): Promise<CommerceFulfillmentPlanReference> {
    const input = CreateCommerceFulfillmentPlan.parse(raw);
    z.uuid().parse(creatorId);
    if (input.requests.length < this.minimumRecipients)
      throw new DomainError(
        "group_threshold_required",
        "Choose enough original group requests for this service.",
        422,
      );
    return identityTransaction(
      this.database.pool,
      actor.accountId,
      async (client) => {
        await this.assertCatalogue(client);
        const context = await this.initializeContext(client, actor);
        const originals = await this.prepareOriginals(
          client,
          actor,
          creatorId,
          input.requests.map((r) => r.packetId),
          "group_answer",
        );
        const content = (
          await client.query<{ version: number; state: string }>(
            "SELECT version,state FROM creator.content_index WHERE id=$1 AND creator_id=$2 FOR UPDATE NOWAIT",
            [input.contentId, creatorId],
          )
        ).rows[0];
        if (
          !content ||
          content.state !== "draft" ||
          content.version !== input.contentVersion
        )
          throw fulfillmentChanged();
        for (const { source } of originals) {
          const requested = input.requests.find(
            (r) => r.packetId === source.packet_id,
          )!;
          if (
            source.packet_version !== requested.packetVersion ||
            source.commitment_version !== requested.commitmentVersion
          )
            throw fulfillmentChanged();
          await this.lockOriginal(client, actor, source);
        }
        const reference = await idempotent(
          client,
          { actorAccountId: actor.accountId, threadId: null },
          "commerce.fulfillment_plan",
          input.idempotencyKey,
          { creatorId, ...input },
          async () => {
            const id = randomUUID(),
              revision = 1,
              contentVersion = input.contentVersion + 1;
            if (!Number.isSafeInteger(contentVersion))
              throw fulfillmentChanged();
            const audience =
              input.audience === "public"
                ? { kind: "public" }
                : { kind: "groups", ids: [id] };
            const members = originals.map(({ source }) =>
              this.member(id, source),
            );
            const hash = (
              await client.query<{ hash: string }>(
                `SELECT encode(sha256(convert_to(jsonb_build_object('id',$1::uuid,'revision',$2::integer,'creatorId',$3::uuid,
         'contentId',$4::uuid,'contentVersion',$5::integer,'audience',$6::jsonb,'minimumRecipients',$7::integer,
         'members',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.packet_id) FROM jsonb_populate_recordset(NULL::creator.commerce_fulfillment_member,$8::jsonb) m))::text,'UTF8')),'hex') AS hash`,
                [
                  id,
                  revision,
                  creatorId,
                  input.contentId,
                  contentVersion,
                  JSON.stringify(audience),
                  this.minimumRecipients,
                  JSON.stringify(members),
                ],
              )
            ).rows[0]!.hash;
            await client.query(
              `INSERT INTO creator.commerce_fulfillment_plan(id,revision,creator_id,content_id,content_version,audience,minimum_recipients,recipient_count,source_hash,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [
                id,
                revision,
                creatorId,
                input.contentId,
                contentVersion,
                JSON.stringify(audience),
                this.minimumRecipients,
                members.length,
                hash,
                actor.accountId,
              ],
            );
            await client.query(
              `INSERT INTO creator.commerce_fulfillment_member SELECT * FROM jsonb_populate_recordset(NULL::creator.commerce_fulfillment_member,$1::jsonb)`,
              [JSON.stringify(members)],
            );
            // Fire the immutable completeness constraint before the last fence.
            // Otherwise deferred trigger work would run after that fence in COMMIT.
            await client.query(
              "SET CONSTRAINTS creator.fulfillment_plan_complete IMMEDIATE",
            );
            return CommerceFulfillmentPlanRef.parse({ id, revision, hash });
          },
        );
        await this.sameContext(client, context);
        await this.finalSigner(client, context);
        for (const { source } of originals) {
          const current = await readOriginalCommerceService(
            client,
            actor.accountId,
            creatorId,
            source.packet_id,
            "group_answer",
          );
          if (
            originalCommerceServiceHash(current) !==
            originalCommerceServiceHash(source)
          )
            throw fulfillmentChanged();
        }
        return Object.freeze(reference);
      },
    );
  }

  async preparePublication(
    client: PoolClient,
    actor: Actor,
    input: {
      creatorId: string;
      contentId: string;
      planRef: CommerceFulfillmentPlanReference;
    },
  ) {
    return this.preparePublicationWithIntent(client, actor, input, "draft");
  }

  /** Creator-owned saved draft read, including an empty draft. It cannot issue
   * publication recipients or become a save, challenge or publication gate. */
  async prepareDraftRead(
    client: PoolClient,
    actor: Actor,
    input: PublicationInput,
  ) {
    return this.preparePublicationWithIntent(
      client,
      actor,
      input,
      "draft",
      undefined,
      true,
    );
  }

  /** The immutable plan binds the next saved revision. Resolve its original
   * recipients before W5 takes document/media owner locks; its actual save must
   * precede finalizeDraftPublication, and only COMMIT may follow that gate. */
  async prepareDraft(
    client: PoolClient,
    actor: Actor,
    input: {
      creatorId: string;
      contentId: string;
      planRef: CommerceFulfillmentPlanReference;
      expectedVersion: number;
      document: unknown;
    },
  ) {
    const version = z.int().positive().parse(input.expectedVersion);
    if (!Number.isSafeInteger(version + 1)) throw fulfillmentChanged();
    return this.preparePublicationWithIntent(client, actor, input, "draft", {
      expectedVersion: version,
      document: PlanDocument.parse(input.document),
    });
  }

  /** Reconcile an already-saved draft under W5's actual idempotency receipt.
   * Empty draft text is valid, but the saved next revision must match every
   * submitted field. This path consumes no signature and issues no delivery. */
  async prepareDraftRetry(
    client: PoolClient,
    actor: Actor,
    input: {
      creatorId: string;
      contentId: string;
      planRef: CommerceFulfillmentPlanReference;
      expectedVersion: number;
      document: unknown;
    },
  ) {
    const version = z.int().positive().parse(input.expectedVersion);
    if (!Number.isSafeInteger(version + 1)) throw fulfillmentChanged();
    return this.preparePublicationWithIntent(client, actor, input, "draft", {
      expectedVersion: version,
      document: PlanDocument.parse(input.document),
      saved: true,
    });
  }

  /** Current committed receipt only; no signature reconsume or new recipient
   * delivery can be issued from this path. */
  async preparePublicationRetry(
    client: PoolClient,
    actor: Actor,
    input: {
      creatorId: string;
      contentId: string;
      planRef: CommerceFulfillmentPlanReference;
    },
  ) {
    return this.preparePublicationWithIntent(client, actor, input, "committed");
  }

  private async preparePublicationWithIntent(
    client: PoolClient,
    actor: Actor,
    input: {
      creatorId: string;
      contentId: string;
      planRef: CommerceFulfillmentPlanReference;
    },
    intent: "draft" | "committed",
    staged?: {
      expectedVersion: number;
      document: z.infer<typeof PlanDocument>;
      saved?: true;
    },
    readOnly = false,
  ) {
    const metadata = await this.publicationMetadata(
      client,
      actor,
      input,
      staged?.expectedVersion,
    );
    const originals = await this.prepareOriginals(
      client,
      actor,
      input.creatorId,
      metadata.members.map((m) => m.packet_id),
      "group_answer",
      intent === "committed" ? ["delivered"] : ["due", "in_progress"],
      false,
      readOnly ? "read" : "write",
    );
    const value = await this.publicationValue(
      client,
      actor,
      metadata,
      originals,
      intent,
      staged,
      readOnly,
    );
    if (!readOnly)
      for (const recipient of value.recipients)
        this.recipients.set(recipient.proof, {
          client,
          held: value,
          recipient,
        });
    this.held.set(client, value);
  }

  private async publicationMetadata(
    client: PoolClient,
    actor: Actor,
    input: PublicationInput,
    expectedVersion?: number,
  ): Promise<PublicationMetadata> {
    await this.assertCatalogue(client);
    const context = await this.initializeContext(client, actor),
      ref = CommerceFulfillmentPlanRef.parse(input.planRef);
    if (
      this.held.get(client)?.transaction === context.transaction ||
      this.activeReadBatches.get(client)?.context.transaction ===
        context.transaction
    )
      throw fulfillmentChanged();
    const header = (
      await client.query<Header>(
        "SELECT * FROM creator.commerce_fulfillment_plan WHERE id=$1 AND revision=$2 AND creator_id=$3 AND content_id=$4",
        [ref.id, ref.revision, input.creatorId, input.contentId],
      )
    ).rows[0];
    if (
      !header ||
      header.created_by !== actor.accountId ||
      header.source_hash !== ref.hash ||
      header.minimum_recipients !== this.minimumRecipients ||
      (expectedVersion !== undefined &&
        header.content_version !== expectedVersion + 1)
    )
      throw fulfillmentChanged();
    const members = (
      await client.query<Member>(
        "SELECT * FROM creator.commerce_fulfillment_member WHERE plan_id=$1 AND plan_revision=$2 ORDER BY thread_id,packet_id",
        [ref.id, ref.revision],
      )
    ).rows;
    if (
      members.length !== header.recipient_count ||
      members.length < this.minimumRecipients
    )
      throw fulfillmentChanged();
    return { context, ref, header, members };
  }

  private async publicationValue(
    client: PoolClient,
    actor: Actor,
    metadata: PublicationMetadata,
    originals: { source: OriginalCommerceService; scope: ThreadScope }[],
    intent: "draft" | "committed",
    staged?: {
      expectedVersion: number;
      document: z.infer<typeof PlanDocument>;
      saved?: true;
    },
    readOnly = false,
  ): Promise<Held> {
    const { context, ref, header, members } = metadata;
    const stored = await this.document(
      client,
      staged && !staged.saved
        ? { ...header, content_version: staged.expectedVersion }
        : header,
    );
    const document = staged?.document ?? PlanDocument.parse(stored.document);
    if (
      stored.state !== (intent === "draft" ? "draft" : "published") ||
      (intent === "draft"
        ? stored.signed_act_id !== null
        : !stored.signed_act_id ||
          stored.author_account_id !== actor.accountId) ||
      document.scheduledAt !== null ||
      contentHash(document.planRef) !== contentHash(ref) ||
      document.packetId !== null ||
      document.kind !== "public_answer" ||
      document.quote !== null ||
      document.live != null ||
      (staged?.saved &&
        contentHash(PlanDocument.parse(stored.document)) !==
          contentHash(document)) ||
      contentHash(document.audience) !== contentHash(header.audience) ||
      (!staged &&
        (!readOnly || intent === "committed") &&
        !document.text.trim() &&
        !document.media.some((m) => m.kind === "voice"))
    )
      throw fulfillmentChanged();
    const value: Held = {
      ...context,
      intent,
      header,
      reference: Object.freeze(ref),
      documentHash: contentHash(document),
      recipients: [],
      positive: false,
      finalized: false,
      ...(readOnly ? { readOnly: true as const } : {}),
    };
    for (const member of members) {
      const original = originals.find(
        (o) => o.source.packet_id === member.packet_id,
      );
      if (
        !original ||
        !(
          intent === "committed" ? ["delivered"] : ["due", "in_progress"]
        ).includes(original.source.state)
      )
        throw fulfillmentChanged();
      if (
        contentHash(
          this.member(
            member.plan_id,
            intent === "draft"
              ? original.source
              : {
                  ...original.source,
                  packet_version: original.source.packet_version - 1,
                  commitment_version: original.source.commitment_version - 1,
                },
          ),
        ) !== contentHash(member)
      )
        throw fulfillmentChanged();
      const proof = Object.freeze({ [recipientBrand]: true as const });
      const recipient: Recipient = {
        proof,
        member,
        source: original.source,
        scope: original.scope,
      };
      if (intent === "committed") {
        const delivery = await this.existingDelivery(
          client,
          value,
          recipient,
          stored.signed_act_id!,
          true,
        );
        recipient.messageId = delivery;
      }
      value.recipients.push(recipient);
    }
    return value;
  }

  private async publication(client: PoolClient, actor: Actor) {
    const value = this.held.get(client);
    if (!value || value.actor !== actor || value.finalized)
      throw fulfillmentChanged();
    await this.sameContext(client, value);
    return value;
  }
  /** Hold every original's negatives for one bounded creator page before
   * reading any planned document. Single-held recipients are never cloned. */
  async prepareDraftReadBatch(
    client: PoolClient,
    actor: Actor,
    input: {
      creatorId: string;
      answers: readonly {
        contentId: string;
        planRef: CommerceFulfillmentPlanReference;
      }[];
    },
  ): Promise<CommerceFulfillmentDraftReadBatch> {
    const creatorId = z.uuid().parse(input.creatorId);
    const answers = z
      .array(
        z.strictObject({
          contentId: z.uuid(),
          planRef: CommerceFulfillmentPlanRef,
        }),
      )
      .min(1)
      .max(100)
      .parse(input.answers);
    if (
      new Set(answers.map((a) => a.contentId)).size !== answers.length ||
      new Set(answers.map((a) => a.planRef.id)).size !== answers.length
    )
      throw fulfillmentChanged();
    const metadata: {
      value: PublicationMetadata;
      intent: "draft" | "committed";
    }[] = [];
    for (const answer of [...answers].sort((a, b) =>
      a.contentId.localeCompare(b.contentId),
    )) {
      const value = await this.publicationMetadata(client, actor, {
        creatorId,
        ...answer,
      });
      const state = (
        await client.query<{ state: string }>(
          "SELECT state FROM creator.content_index WHERE id=$1 AND creator_id=$2 AND version=$3",
          [value.header.content_id, creatorId, value.header.content_version],
        )
      ).rows[0]?.state;
      if (state !== "draft" && state !== "published")
        throw fulfillmentChanged();
      metadata.push({
        value,
        intent: state === "draft" ? "draft" : "committed",
      });
    }
    const context = metadata[0]!.value.context;
    for (const m of metadata) await this.sameContext(client, m.value.context);
    const packetIds = [
      ...new Set(
        metadata.flatMap((m) => m.value.members.map((r) => r.packet_id)),
      ),
    ];
    //100 plans have at most100 members each. Over-bound pages refuse whole,
    // rather than silently omitting an answer or participant.
    if (!packetIds.length || packetIds.length > 10000)
      throw fulfillmentChanged();
    const originals = await this.prepareOriginals(
      client,
      actor,
      creatorId,
      packetIds,
      "group_answer",
      ["due", "in_progress", "delivered"],
      true,
      "read",
    );
    const plans: Held[] = [];
    for (const m of metadata)
      plans.push(
        await this.publicationValue(
          client,
          actor,
          m.value,
          originals,
          m.intent,
          undefined,
          true,
        ),
      );
    const value: DraftReadBatch = {
      client,
      context,
      plans,
      originals,
      positive: false,
      finalized: false,
    };
    const proof = Object.freeze({ [draftReadBatchBrand]: true as const });
    this.readBatches.set(proof, value);
    this.activeReadBatches.set(client, value);
    return proof;
  }

  private async draftReadBatch(
    client: PoolClient,
    actor: Actor,
    proof: CommerceFulfillmentDraftReadBatch,
  ): Promise<DraftReadBatch> {
    const value = this.readBatches.get(proof);
    if (
      !value ||
      value.client !== client ||
      value.context.actor !== actor ||
      value.finalized ||
      this.activeReadBatches.get(client) !== value
    )
      throw fulfillmentChanged();
    await this.sameContext(client, value.context);
    await this.assertCatalogue(client);
    return value;
  }

  /** After all W5 page document/media/creator/audience positives. No recipient
   * proof or delivery permission leaves this read-only batch. */
  async prepareDraftReadBatchPositive(
    client: PoolClient,
    actor: Actor,
    proof: CommerceFulfillmentDraftReadBatch,
  ): Promise<void> {
    const value = await this.draftReadBatch(client, actor, proof);
    if (value.positive) throw fulfillmentChanged();
    for (const original of value.originals)
      await this.lockOriginal(client, actor, original.source);
    for (const plan of value.plans) {
      const hash = (
        await client.query<{ hash: string }>(
          "SELECT creator.commerce_fulfillment_plan_hash($1,$2) AS hash",
          [plan.reference.id, plan.reference.revision],
        )
      ).rows[0]?.hash;
      if (hash !== plan.reference.hash) throw fulfillmentChanged();
    }
    value.positive = true;
  }

  /** Final page gate. W5 has completed actual positive reads and its response.
   * No row lock, identity change or domain write follows this final signer
   * fence and metadata checks. Only COMMIT may follow. */
  async finalizeDraftReadBatch(
    client: PoolClient,
    actor: Actor,
    proof: CommerceFulfillmentDraftReadBatch,
  ): Promise<void> {
    const value = await this.draftReadBatch(client, actor, proof);
    if (!value.positive) throw fulfillmentChanged();
    await this.finalSigner(client, value.context);
    for (const plan of value.plans) {
      const stored = await this.document(client, plan.header);
      if (
        stored.state !== (plan.intent === "draft" ? "draft" : "published") ||
        contentHash(PlanDocument.parse(stored.document)) !==
          plan.documentHash ||
        (plan.intent === "draft"
          ? stored.signed_act_id !== null
          : !stored.signed_act_id ||
            stored.author_account_id !== actor.accountId)
      )
        throw fulfillmentChanged();
      if (plan.intent === "committed") {
        const command = await this.signedCommand(
          client,
          actor.accountId,
          plan.header.creator_id,
          stored.signed_act_id!,
        );
        if (
          !this.matchesPublicationCommand(plan, command) ||
          contentHash(
            (
              (command as SignedActCommand).content as {
                mediaEvidence?: unknown[];
              }
            ).mediaEvidence ?? [],
          ) !== contentHash(stored.media_evidence ?? [])
        )
          throw fulfillmentChanged();
        for (const recipient of plan.recipients)
          if (
            (await this.existingDelivery(
              client,
              plan,
              recipient,
              stored.signed_act_id!,
            )) !== recipient.messageId
          )
            throw fulfillmentChanged();
      }
    }
    for (const original of value.originals) {
      const current = await readOriginalCommerceService(
        client,
        actor.accountId,
        original.source.creator_id,
        original.source.packet_id,
        "group_answer",
        original.source.state === "delivered"
          ? ["delivered"]
          : ["due", "in_progress"],
      );
      if (
        originalCommerceServiceHash(current) !==
        originalCommerceServiceHash(original.source)
      )
        throw fulfillmentChanged();
    }
    value.finalized = true;
    await this.assertCatalogue(client);
    await this.currentSigner(client, value.context);
    this.readBatches.delete(proof);
  }

  private async document(client: PoolClient, header: Header) {
    const row = (
      await client.query<{
        state: string;
        document: unknown;
        signed_act_id: string | null;
        author_account_id: string | null;
        media_evidence: unknown;
      }>(
        `SELECT i.state,r.document,p.signed_act_id,p.author_account_id,p.media_evidence FROM creator.content_index i
       JOIN creator.content_revision r ON r.content_id=i.id AND r.creator_id=i.creator_id AND r.version=i.version
       LEFT JOIN creator.content_publication p ON p.content_id=i.id AND p.creator_id=i.creator_id AND p.version=i.version
       WHERE i.id=$1 AND i.creator_id=$2 AND i.version=$3`,
        [header.content_id, header.creator_id, header.content_version],
      )
    ).rows[0];
    if (!row) throw fulfillmentChanged();
    return row;
  }

  async preparePublicationPositive(client: PoolClient, actor: Actor) {
    const value = await this.publication(client, actor);
    if (value.positive) throw fulfillmentChanged();
    for (const r of value.recipients)
      await this.lockOriginal(client, actor, r.source);
    const hash = (
      await client.query<{ hash: string }>(
        "SELECT creator.commerce_fulfillment_plan_hash($1,$2) AS hash",
        [value.reference.id, value.reference.revision],
      )
    ).rows[0]?.hash;
    if (hash !== value.reference.hash) throw fulfillmentChanged();
    value.positive = true;
    return Object.freeze(
      value.intent === "draft" && !value.readOnly
        ? value.recipients.map((r) => r.proof)
        : [],
    );
  }

  /** W3 must qualify the genuine owner and consume this method on its actual
   * held client. The scope is the exact Access-issued object, never rebuilt.
   * Each recipient is writable once; source/header/client mutations refuse.
   */
  async recipientScope(
    client: PoolClient,
    proof: CommerceGroupRecipient,
  ): Promise<ThreadScope> {
    const binding = this.recipients.get(proof);
    if (
      !binding ||
      binding.client !== client ||
      !binding.held.positive ||
      binding.recipient.messageId ||
      binding.held.finalized
    )
      throw fulfillmentChanged();
    await this.sameContext(client, binding.held);
    assertThreadScope(binding.recipient.scope);
    return binding.recipient.scope;
  }
  async recipientLink(client: PoolClient, proof: CommerceGroupRecipient) {
    await this.recipientScope(client, proof);
    const value = this.recipients.get(proof)!.held;
    return Object.freeze({
      planRef: value.reference,
      contentId: value.header.content_id,
      contentVersion: value.header.content_version,
      text: "Answered publicly." as const,
    });
  }

  /** W3 calls after its actual System message and durable frame writes. No
   * arbitrary message/body can become delivery: the database checks the exact
   * original family, neutral author, current signed publication and timestamp.
   */
  async recordDelivery(
    client: PoolClient,
    proof: CommerceGroupRecipient,
    messageId: string,
  ) {
    await this.recipientScope(client, proof);
    z.uuid().parse(messageId);
    const { held, recipient } = this.recipients.get(proof)!;
    const publication = await this.document(client, held.header);
    if (
      publication.state !== "published" ||
      !publication.signed_act_id ||
      publication.author_account_id !== held.actor.accountId ||
      contentHash(PlanDocument.parse(publication.document)) !==
        held.documentHash
    )
      throw fulfillmentChanged();
    const m = recipient.member;
    await client.query(
      `INSERT INTO creator.commerce_group_delivery(plan_id,plan_revision,packet_id,creator_id,fan_id,thread_id,message_id,content_id,content_version,publication_signed_act_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        m.plan_id,
        m.plan_revision,
        m.packet_id,
        m.creator_id,
        m.fan_id,
        m.thread_id,
        messageId,
        held.header.content_id,
        held.header.content_version,
        publication.signed_act_id,
      ],
    );
    const result = await client.query(
      `UPDATE creator.commerce_commitment SET state='delivered',delivered_at=clock_timestamp(),delivered_message_id=$2,
     evidence=$3,outcome='group_answer',payout_release_at=clock_timestamp()+interval '7 days',version=version+1
     WHERE id=$1 AND packet_id=$4 AND version=$5 AND state IN('due','in_progress') AND due_at>clock_timestamp() RETURNING id`,
      [
        m.commitment_id,
        messageId,
        JSON.stringify({
          kind: "group_answer",
          planRef: held.reference,
          contentId: held.header.content_id,
          contentVersion: held.header.content_version,
          messageId,
          publicationSignedActId: publication.signed_act_id,
          authorKind: "system",
        }),
        m.packet_id,
        m.commitment_version,
      ],
    );
    if (result.rowCount !== 1) throw fulfillmentChanged();
    const packet = await client.query(
      "UPDATE creator.commerce_packet SET version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND version=$2 RETURNING version",
      [m.packet_id, m.packet_version],
    );
    if (packet.rowCount !== 1) throw fulfillmentChanged();
    await this.event(client, m, "commitment_delivered", {
      kind: "group_answer",
      planRef: held.reference,
      contentId: held.header.content_id,
      contentVersion: held.header.content_version,
      messageId,
    });
    recipient.messageId = messageId;
  }

  async finalizePublication(
    client: PoolClient,
    actor: Actor,
    publicationSignedActId: string,
  ) {
    const value = await this.publication(client, actor);
    if (
      value.intent !== "draft" ||
      !value.positive ||
      value.recipients.some((r) => !r.messageId)
    )
      throw fulfillmentChanged();
    await this.assertCatalogue(client);
    // All domain, frame, outbox, idempotency and constraint work precedes this.
    await this.finalSigner(client, value);
    value.finalized = true;
    const document = await this.document(client, value.header);
    if (
      document.state !== "published" ||
      document.signed_act_id !== publicationSignedActId ||
      document.author_account_id !== actor.accountId ||
      contentHash(PlanDocument.parse(document.document)) !== value.documentHash
    )
      throw fulfillmentChanged();
    const command = await this.signedCommand(
      client,
      actor.accountId,
      value.header.creator_id,
      publicationSignedActId,
    );
    const shape = z
      .strictObject({
        actType: z.literal("reply"),
        subjectId: z.uuid(),
        content: z.strictObject({
          kind: z.literal("content_publication"),
          creatorId: z.uuid(),
          version: z.int().positive(),
          document: PlanDocument,
          mediaEvidence: z.array(z.unknown()).optional(),
        }),
      })
      .safeParse(command);
    if (
      !shape.success ||
      shape.data.subjectId !== value.header.content_id ||
      shape.data.content.creatorId !== value.header.creator_id ||
      shape.data.content.version !== value.header.content_version ||
      contentHash(shape.data.content.document) !== value.documentHash ||
      contentHash(shape.data.content.mediaEvidence ?? []) !==
        contentHash(document.media_evidence ?? [])
    )
      throw fulfillmentChanged();
    for (const r of value.recipients) {
      const current = await readOriginalCommerceService(
        client,
        actor.accountId,
        value.header.creator_id,
        r.member.packet_id,
        "group_answer",
        ["delivered"],
      );
      const original = {
        ...current,
        packet_version: current.packet_version - 1,
        commitment_version: current.commitment_version - 1,
        state: r.source.state,
      };
      if (
        originalCommerceServiceHash(original) !==
        originalCommerceServiceHash(r.source)
      )
        throw fulfillmentChanged();
      const link = await client.query(
        `SELECT FROM creator.commerce_group_delivery d JOIN creator.commerce_commitment c
       ON c.id=$4 AND c.packet_id=d.packet_id AND c.delivered_message_id=d.message_id AND c.state='delivered'
       WHERE d.plan_id=$1 AND d.plan_revision=$2 AND d.packet_id=$3 AND d.message_id=$5 AND d.publication_signed_act_id=$6`,
        [
          value.reference.id,
          value.reference.revision,
          r.member.packet_id,
          r.member.commitment_id,
          r.messageId,
          publicationSignedActId,
        ],
      );
      if (link.rowCount !== 1) throw fulfillmentChanged();
    }
  }

  /** W5 review has no challenge, consumption or delivery. All its positive
   * document/media/audience work precedes this last original-source gate. */
  async finalizePublicationReview(client: PoolClient, actor: Actor) {
    await this.finalizePreparedDraft(client, actor);
  }

  async finalizeDraftPublication(client: PoolClient, actor: Actor) {
    if ((await this.publication(client, actor)).readOnly)
      throw fulfillmentChanged();
    await this.finalizePreparedDraft(client, actor);
  }

  /** W1 has already written this actual challenge. Only COMMIT may follow. */
  async finalizePublicationChallenge(
    client: PoolClient,
    actor: Actor,
    challengeId: string,
  ) {
    await this.finalizePreparedDraft(
      client,
      actor,
      z.uuid().parse(challengeId),
    );
  }

  private async finalizePreparedDraft(
    client: PoolClient,
    actor: Actor,
    challengeId?: string,
  ) {
    const value = await this.publication(client, actor);
    if (
      value.intent !== "draft" ||
      (value.readOnly && challengeId !== undefined) ||
      !value.positive ||
      value.recipients.some((r) => r.messageId)
    )
      throw fulfillmentChanged();
    await this.assertCatalogue(client);
    await this.finalSigner(client, value);
    value.finalized = true;
    const document = await this.document(client, value.header);
    if (
      document.state !== "draft" ||
      document.signed_act_id !== null ||
      contentHash(PlanDocument.parse(document.document)) !== value.documentHash
    )
      throw fulfillmentChanged();
    for (const r of value.recipients) {
      const current = await readOriginalCommerceService(
        client,
        actor.accountId,
        value.header.creator_id,
        r.member.packet_id,
        "group_answer",
      );
      if (
        originalCommerceServiceHash(current) !==
        originalCommerceServiceHash(r.source)
      )
        throw fulfillmentChanged();
    }
    if (challengeId) {
      const row = (
        await client.query<{ command: unknown; content_hash: string }>(
          `SELECT command,content_hash FROM creator.signed_challenge WHERE id=$1
         AND account_id=$2 AND creator_id=$3 AND subject_id=$4 AND act_type='reply'
         AND used_at IS NULL AND expires_at>clock_timestamp()`,
          [
            challengeId,
            actor.accountId,
            value.header.creator_id,
            value.header.content_id,
          ],
        )
      ).rows[0];
      if (
        !row ||
        contentHash(row.command) !== row.content_hash ||
        !this.matchesPublicationCommand(value, row.command)
      )
        throw fulfillmentChanged();
    }
  }

  private matchesPublicationCommand(value: Held, command: unknown) {
    const parsed = z
      .strictObject({
        actType: z.literal("reply"),
        subjectId: z.uuid(),
        content: z.strictObject({
          kind: z.literal("content_publication"),
          creatorId: z.uuid(),
          version: z.int().positive(),
          document: PlanDocument,
          mediaEvidence: z.array(z.unknown()).optional(),
        }),
      })
      .safeParse(command);
    return (
      parsed.success &&
      parsed.data.subjectId === value.header.content_id &&
      parsed.data.content.creatorId === value.header.creator_id &&
      parsed.data.content.version === value.header.content_version &&
      contentHash(parsed.data.content.document) === value.documentHash
    );
  }

  private async existingDelivery(
    client: PoolClient,
    value: Held,
    recipient: Recipient,
    signedActId: string,
    holdMessage = false,
  ) {
    // Before the last signer only: restore this genuine recipient's RLS family
    // and retain its neutral message row. The late check below is MVCC metadata
    // over creator-owned immutable associations; it performs no caller change.
    if (holdMessage) {
      assertThreadScope(recipient.scope);
      await client.query(
        "SELECT set_config('app.account_id',$1,true),set_config('app.creator_id',$2,true),set_config('app.fan_id',$3,true)",
        [
          recipient.scope.actorAccountId,
          recipient.scope.creatorId,
          recipient.scope.fanId,
        ],
      );
      const neutral = await client
        .query(
          `SELECT m.id FROM creator.message m JOIN creator.commerce_group_delivery d
         ON d.message_id=m.id AND d.thread_id=m.thread_id
          AND d.creator_id=m.creator_id AND d.fan_id=m.fan_id
         WHERE d.plan_id=$1 AND d.plan_revision=$2 AND d.packet_id=$3
          AND d.publication_signed_act_id=$4 AND d.content_id=$5 AND d.content_version=$6
          AND d.creator_id=$7 AND d.fan_id=$8 AND d.thread_id=$9
          AND m.author_kind='system' AND m.author_account_id IS NULL
          AND m.signed_act_id IS NULL AND m.signed_content_hash IS NULL
          AND m.text='Answered publicly.' AND m.delivery_state='delivered'
         FOR SHARE OF m NOWAIT`,
          [
            value.reference.id,
            value.reference.revision,
            recipient.member.packet_id,
            signedActId,
            value.header.content_id,
            value.header.content_version,
            value.header.creator_id,
            recipient.member.fan_id,
            recipient.member.thread_id,
          ],
        )
        .catch((error: unknown) => {
          if ((error as { code?: string }).code === "55P03")
            throw fulfillmentChanged();
          throw error;
        });
      if (neutral.rowCount !== 1) throw fulfillmentChanged();
    }
    const row = (
      await client.query<{ message_id: string }>(
        `SELECT d.message_id FROM creator.commerce_group_delivery d
       JOIN creator.commerce_commitment c ON c.id=$4 AND c.packet_id=d.packet_id
        AND c.creator_id=d.creator_id AND c.fan_id=d.fan_id
        AND c.delivered_message_id=d.message_id AND c.state='delivered'
       WHERE d.plan_id=$1 AND d.plan_revision=$2 AND d.packet_id=$3
        AND d.publication_signed_act_id=$5 AND d.content_id=$6 AND d.content_version=$7
        AND d.creator_id=$8 AND d.fan_id=$9 AND d.thread_id=$10`,
        [
          value.reference.id,
          value.reference.revision,
          recipient.member.packet_id,
          recipient.member.commitment_id,
          signedActId,
          value.header.content_id,
          value.header.content_version,
          value.header.creator_id,
          recipient.member.fan_id,
          recipient.member.thread_id,
        ],
      )
    ).rows[0];
    if (!row) throw fulfillmentChanged();
    return row.message_id;
  }

  /** W5's already committed response is fenced again, without consuming a
   * signature, generating a System message or rewriting financial delivery. */
  async finalizePublicationRetry(
    client: PoolClient,
    actor: Actor,
    publicationSignedActId: string,
  ) {
    const value = await this.publication(client, actor);
    if (
      value.intent !== "committed" ||
      !value.positive ||
      value.recipients.some((r) => !r.messageId)
    )
      throw fulfillmentChanged();
    await this.assertCatalogue(client);
    await this.finalSigner(client, value);
    value.finalized = true;
    const document = await this.document(client, value.header);
    if (
      document.state !== "published" ||
      document.signed_act_id !== publicationSignedActId ||
      document.author_account_id !== actor.accountId ||
      contentHash(PlanDocument.parse(document.document)) !== value.documentHash
    )
      throw fulfillmentChanged();
    const command = await this.signedCommand(
      client,
      actor.accountId,
      value.header.creator_id,
      publicationSignedActId,
    );
    if (!this.matchesPublicationCommand(value, command))
      throw fulfillmentChanged();
    const media = (command as SignedActCommand).content as {
      mediaEvidence?: unknown[];
    };
    if (
      contentHash(media.mediaEvidence ?? []) !==
      contentHash(document.media_evidence ?? [])
    )
      throw fulfillmentChanged();
    for (const r of value.recipients) {
      const current = await readOriginalCommerceService(
        client,
        actor.accountId,
        value.header.creator_id,
        r.member.packet_id,
        "group_answer",
        ["delivered"],
      );
      if (
        originalCommerceServiceHash(current) !==
          originalCommerceServiceHash(r.source) ||
        (await this.existingDelivery(
          client,
          value,
          r,
          publicationSignedActId,
        )) !== r.messageId
      )
        throw fulfillmentChanged();
    }
  }

  private async finalSigner(client: PoolClient, context: Context) {
    await this.sameContext(client, context);
    const held = (
      await client.query<{ held: boolean }>(
        "SELECT pg_try_advisory_xact_lock_shared(hashtextextended($1,0)) AS held",
        [`identity.signature-account:${context.actor.accountId}`],
      )
    ).rows[0]?.held;
    if (held !== true) throw fulfillmentChanged();
    await this.currentSigner(client, context);
  }
  private async currentSigner(client: PoolClient, context: Context) {
    await this.sameContext(client, context);
    const live = (
      await client.query(
        "SELECT FROM creator.identity_session WHERE id=$1 AND account_id=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp()",
        [context.request.sessionId, context.actor.accountId],
      )
    ).rowCount;
    if (live !== 1 || requestAuthority.getStore() !== context.request)
      throw fulfillmentChanged();
  }
  private async signedCommand(
    client: PoolClient,
    accountId: string,
    creatorId: string,
    id: string,
  ) {
    const row = (
      await client.query<{ command: unknown; content_hash: string }>(
        `SELECT pub.command,sa.content_hash FROM creator.signed_act sa
     JOIN creator.signed_act_consumption used ON used.signed_act_id=sa.id AND used.account_id=sa.account_id
     JOIN creator.signed_publication pub ON pub.signed_act_id=sa.id AND pub.account_id=sa.account_id AND pub.withdrawn_at IS NULL
     JOIN creator.signed_verification proof ON proof.id=sa.id AND proof.account_id=sa.account_id AND proof.creator_id=sa.creator_id
      AND proof.content_hash=sa.content_hash AND NOT proof.key_revoked AND NOT proof.creator_revoked AND NOT proof.withdrawn
     JOIN creator.passkey_credential key ON key.id=sa.credential_id AND key.account_id=sa.account_id AND key.revoked_at IS NULL
     JOIN creator.creator_profile cp ON cp.id=sa.creator_id AND cp.account_id=sa.account_id AND cp.verification='verified' AND NOT cp.recovery_required
     WHERE sa.id=$1 AND sa.account_id=$2 AND sa.creator_id=$3`,
        [id, accountId, creatorId],
      )
    ).rows[0];
    if (!row || contentHash(row.command) !== row.content_hash)
      throw fulfillmentChanged();
    return row.command;
  }
  private event(
    client: PoolClient,
    source: Pick<
      Member,
      | "creator_id"
      | "fan_id"
      | "commitment_id"
      | "commitment_version"
      | "packet_id"
    >,
    type: string,
    payload: unknown,
  ) {
    return client.query(
      "INSERT INTO creator.commerce_event(creator_id,fan_id,aggregate_id,aggregate_version,type,payload) VALUES($1,$2,$3,$4,$5,$6)",
      [
        source.creator_id,
        source.fan_id,
        source.commitment_id,
        source.commitment_version + 1,
        type,
        JSON.stringify({
          packetId: source.packet_id,
          ...(payload as Record<string, unknown>),
        }),
      ],
    );
  }

  private reviewCommand(source: OriginalCommerceService) {
    return CommerceReviewAttestationCommand.parse({
      actType: "reply",
      subjectId: source.thread_id,
      content: {
        kind: "commerce_review_attestation",
        packetId: source.packet_id,
        packetVersion: source.packet_version,
        commitmentId: source.commitment_id,
        commitmentVersion: source.commitment_version,
        requestHash: source.request_hash,
        acceptanceId: source.acceptance_id,
        captureId: source.capture_id,
        captureHash: source.capture_hash,
        statement: "I reviewed the submitted request.",
      },
    });
  }
  async prepareReview(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    packetId: string,
  ) {
    await this.assertCatalogue(client);
    const context = await this.initializeContext(client, actor);
    const originals = await this.prepareOriginals(
      client,
      actor,
      creatorId,
      [z.uuid().parse(packetId)],
      "guaranteed_review",
    );
    const original = originals[0];
    if (!original) throw fulfillmentChanged();
    const { source, scope } = original;
    await this.lockOriginal(client, actor, source);
    const command = this.reviewCommand(source);
    this.reviews.set(client, {
      context,
      source,
      scope,
      command,
    });
    return command;
  }
  async reviewQuote(actor: Actor, creatorId: string, packetId: string) {
    return identityTransaction(
      this.database.pool,
      actor.accountId,
      async (client) => {
        const command = await this.prepareReview(
            client,
            actor,
            creatorId,
            packetId,
          ),
          held = this.reviews.get(client)!;
        await this.finalSigner(client, held.context);
        const current = await readOriginalCommerceService(
          client,
          actor.accountId,
          creatorId,
          packetId,
          "guaranteed_review",
        );
        if (
          originalCommerceServiceHash(current) !==
          originalCommerceServiceHash(held.source)
        )
          throw fulfillmentChanged();
        this.reviews.delete(client);
        return command;
      },
    );
  }
  readonly signedSubjects: SignedSubjectPolicy = {
    name: "commerce_review_attestation",
    requiresFinalization: true,
    prepare: async (client, actor, creatorId, requested) => {
      const command = CommerceReviewAttestationCommand.safeParse(requested);
      if (!command.success) return null;
      return this.prepareReview(
        client,
        actor,
        creatorId,
        command.data.content.packetId,
      );
    },
    finalizeBeforeCommit: async (
      client,
      actor,
      creatorId,
      command,
      { challengeId },
    ) => {
      const held = this.reviews.get(client);
      if (
        !held ||
        held.context.actor !== actor ||
        held.source.creator_id !== creatorId ||
        contentHash(held.command) !== contentHash(command)
      )
        throw fulfillmentChanged();
      await this.finalSigner(client, held.context);
      const source = await readOriginalCommerceService(
        client,
        actor.accountId,
        creatorId,
        held.source.packet_id,
        "guaranteed_review",
      );
      if (
        originalCommerceServiceHash(source) !==
        originalCommerceServiceHash(held.source)
      )
        throw fulfillmentChanged();
      const challenge = await client.query(
        `SELECT FROM creator.signed_challenge WHERE id=$1 AND account_id=$2 AND creator_id=$3
       AND subject_id=$4 AND act_type='reply' AND command=$5::jsonb AND content_hash=$6 AND used_at IS NULL AND expires_at>clock_timestamp()`,
        [
          challengeId,
          actor.accountId,
          creatorId,
          command.subjectId,
          JSON.stringify(command),
          contentHash(command),
        ],
      );
      if (challenge.rowCount !== 1) throw fulfillmentChanged();
      this.reviews.delete(client);
    },
  };

  /** A committed retry reads the actual receipt and current original records.
   * It never re-consumes a signature or turns a delivered request back to due.
   * Current denials and original signing/capture facts still apply.
   */
  private async replayReview(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    packetId: string,
    input: z.infer<typeof SubmitCommerceReviewAttestation>,
  ) {
    await this.assertCatalogue(client);
    const context = await this.initializeContext(client, actor);
    const prior = (
      await client.query<{ request_hash: string; response: unknown }>(
        `SELECT request_hash,response FROM creator.idempotency_key
         WHERE actor_account_id=$1 AND operation='commerce.review_attestation' AND key=$2`,
        [actor.accountId, input.idempotencyKey],
      )
    ).rows[0];
    if (!prior) return null;
    const receipt = ReviewReceipt.parse(prior.response);
    const original = (
      await this.prepareOriginals(
        client,
        actor,
        creatorId,
        [z.uuid().parse(packetId)],
        "guaranteed_review",
        ["delivered"],
      )
    )[0];
    if (!original) throw fulfillmentChanged();
    const source = original.source;
    invariant(
      prior.request_hash ===
        contentHash({
          operation: "commerce.review_attestation",
          threadId: source.thread_id,
          request: { creatorId, packetId, ...input },
        }),
      "idempotency_conflict",
      "This retry key was already used for a different request.",
    );
    const command = this.reviewCommand({
      ...source,
      packet_version: input.packetVersion,
      commitment_version: input.commitmentVersion,
    });
    if (
      receipt.packetId !== packetId ||
      receipt.commitmentId !== source.commitment_id ||
      receipt.signedActId !== input.signedActId ||
      source.packet_version !== input.packetVersion + 1 ||
      source.commitment_version !== input.commitmentVersion + 1
    )
      throw fulfillmentChanged();
    const exact = await client.query(
      `SELECT FROM creator.commerce_review_attestation a JOIN creator.commerce_commitment c
       ON c.id=a.commitment_id AND c.packet_id=a.packet_id AND c.state='delivered'
        AND c.outcome='guaranteed_review' AND c.evidence->>'attestationId'=a.id::text
       WHERE a.id=$1 AND a.packet_id=$2 AND a.commitment_id=$3 AND a.creator_id=$4
        AND a.fan_id=$5 AND a.thread_id=$6 AND a.reviewer_account_id=$7 AND a.signed_act_id=$8
        AND a.packet_version=$9 AND a.commitment_version=$10 AND a.request_hash=$11
        AND a.acceptance_id=$12 AND a.capture_id=$13 AND a.capture_hash=$14
        AND a.command_hash=$15 AND a.statement='I reviewed the submitted request.'`,
      [
        receipt.attestationId,
        packetId,
        source.commitment_id,
        creatorId,
        source.fan_id,
        source.thread_id,
        actor.accountId,
        input.signedActId,
        input.packetVersion,
        input.commitmentVersion,
        source.request_hash,
        source.acceptance_id,
        source.capture_id,
        source.capture_hash,
        contentHash(command),
      ],
    );
    if (exact.rowCount !== 1) throw fulfillmentChanged();
    await this.assertCatalogue(client);
    await this.finalSigner(client, context);
    const current = await readOriginalCommerceService(
      client,
      actor.accountId,
      creatorId,
      packetId,
      "guaranteed_review",
      ["delivered"],
    );
    if (
      originalCommerceServiceHash(current) !==
        originalCommerceServiceHash(source) ||
      contentHash(
        await this.signedCommand(
          client,
          actor.accountId,
          creatorId,
          input.signedActId,
        ),
      ) !== contentHash(command)
    )
      throw fulfillmentChanged();
    return receipt;
  }

  async attestReview(
    actor: Actor,
    creatorId: string,
    packetId: string,
    raw: unknown,
  ) {
    const input = SubmitCommerceReviewAttestation.parse(raw);
    return identityTransaction(
      this.database.pool,
      actor.accountId,
      async (client) => {
        const replay = await this.replayReview(
          client,
          actor,
          creatorId,
          packetId,
          input,
        );
        if (replay) return replay;
        const command = await this.prepareReview(
          client,
          actor,
          creatorId,
          packetId,
        );
        const held = this.reviews.get(client)!;
        if (
          command.content.packetVersion !== input.packetVersion ||
          command.content.commitmentVersion !== input.commitmentVersion
        )
          throw fulfillmentChanged();
        const result = await idempotent(
          client,
          { actorAccountId: actor.accountId, threadId: held.source.thread_id },
          "commerce.review_attestation",
          input.idempotencyKey,
          { creatorId, packetId, ...input },
          async () => {
            const hash = await consumeCreatorSignedAct(
              client,
              actor,
              creatorId,
              input.signedActId,
              command,
            );
            const id = randomUUID(),
              s = held.source;
            await client.query(
              `INSERT INTO creator.commerce_review_attestation(id,packet_id,commitment_id,creator_id,fan_id,thread_id,packet_version,commitment_version,
         request_hash,acceptance_id,capture_id,capture_hash,reviewer_account_id,signed_act_id,command_hash,statement)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
              [
                id,
                s.packet_id,
                s.commitment_id,
                s.creator_id,
                s.fan_id,
                s.thread_id,
                s.packet_version,
                s.commitment_version,
                s.request_hash,
                s.acceptance_id,
                s.capture_id,
                s.capture_hash,
                actor.accountId,
                input.signedActId,
                hash,
                command.content.statement,
              ],
            );
            const delivered = await client.query(
              `UPDATE creator.commerce_commitment SET state='delivered',delivered_at=clock_timestamp(),
         evidence=$2,outcome='guaranteed_review',payout_release_at=clock_timestamp()+interval '7 days',version=version+1
         WHERE id=$1 AND packet_id=$3 AND version=$4 AND state IN('due','in_progress') AND due_at>clock_timestamp() RETURNING id`,
              [
                s.commitment_id,
                JSON.stringify({
                  kind: "guaranteed_review",
                  attestationId: id,
                  signedActId: input.signedActId,
                  requestHash: s.request_hash,
                  authorKind: "human_creator",
                  statement: command.content.statement,
                }),
                s.packet_id,
                s.commitment_version,
              ],
            );
            if (delivered.rowCount !== 1) throw fulfillmentChanged();
            const packet = await client.query(
              "UPDATE creator.commerce_packet SET version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND version=$2 RETURNING id",
              [s.packet_id, s.packet_version],
            );
            if (packet.rowCount !== 1) throw fulfillmentChanged();
            await this.event(client, s, "commitment_delivered", {
              kind: "guaranteed_review",
              attestationId: id,
              signedActId: input.signedActId,
            });
            return {
              attestationId: id,
              packetId: s.packet_id,
              commitmentId: s.commitment_id,
              signedActId: input.signedActId,
            };
          },
        );
        await this.finalSigner(client, held.context);
        const current = await readOriginalCommerceService(
          client,
          actor.accountId,
          creatorId,
          packetId,
          "guaranteed_review",
          ["delivered"],
        );
        if (
          originalCommerceServiceHash({
            ...current,
            packet_version: current.packet_version - 1,
            commitment_version: current.commitment_version - 1,
            state: held.source.state,
          }) !== originalCommerceServiceHash(held.source) ||
          contentHash(
            await this.signedCommand(
              client,
              actor.accountId,
              creatorId,
              input.signedActId,
            ),
          ) !== contentHash(command)
        )
          throw fulfillmentChanged();
        this.reviews.delete(client);
        return result;
      },
    );
  }
}

function unavailable() {
  return new DomainError(
    "fulfillment_plans_unconfigured",
    "Group fulfillment and signed review need their complete activated original-record authority.",
    503,
  );
}

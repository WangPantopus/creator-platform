import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { Database } from "../../db/database.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import type { Actor } from "../identity/adapter.js";
import {
  assertCurrentSession,
  requestAuthority,
} from "../identity/request-authority.js";
import { ContentAudience } from "../../../../../packages/api/src/content.js";
import { CommerceFulfillmentPlanRef } from "../../../../../packages/api/src/commerce/fulfillment.js";
import {
  FULFILLMENT_VIEW_CATALOGUE_QUERY,
  FULFILLMENT_VIEW_CATALOGUE_SHA256,
} from "./fulfillment-view-catalogue.js";
import { FULFILLMENT_CATALOGUE_QUERY } from "./fulfillment-catalogue.js";
import {
  assertFulfillmentOriginalHashCatalogue,
  FULFILLMENT_ORIGINAL_HASH_MIGRATION,
  FULFILLMENT_ORIGINAL_HASH_SCHEMA_SHA256,
} from "./fulfillment-original-hash-catalogue.js";

export const FULFILLMENT_VIEW_MIGRATION = "0199_w4_fulfillment_plan_read";
export const FULFILLMENT_VIEW_SCHEMA_SHA256 =
  "534f5c36b3d58eb2099f9a9a12452a60b287e4f1f3040c4ebeba99a3c8e96684";
const Owner = "creator_fulfillment_view_authority";
const Catalogue =
  "f870ee07b5d12f65ac3abe45864a55ce9011af6967fc63cac91fff78f8a88d8e";
export const FULFILLMENT_VIEW_PLAN_CATALOGUE_SHA256 =
  "12cda15c2b2078940e44cc667dfb0cac85284a34d846f6d0e0cb6a2defc763e7";
const OriginalHashScopeCatalogue =
  "5a13261bde3339d7bca347ec0689ecfbf6abc1629817354f6122ff25ad15cd50";
const OriginalHashPlanCatalogue =
  "4c8564303cc95803a61db1e23eee05da4f4bb2a7149ade12a2742cf0e190a121";
const Definitions = Object.freeze({
  "creator.begin_commerce_fulfillment_view(uuid,uuid,integer,uuid,integer,text,jsonb)":
    "90b1bc70d66c2f3b716640f6492a9c45cb46ea6e0197608d72d75f7805052d4b",
  "creator.commerce_fulfillment_view_matches(uuid)":
    "88b41c43b673f2e41aeadf60252e1579aec6ef4e2cdaccc82c9b04a294350380",
  "creator.commerce_fulfillment_view_originals(uuid)":
    "7f2296ce4f132165d3852ad52b32de253e0e7b990cfe1d083f179ab325eb258a",
  "creator.end_commerce_fulfillment_view(uuid)":
    "92bb6999329cb5b862a61e284a4bba95171c9e929d6e907dc0fef20566ba72e3",
  "creator.require_fulfillment_view_cleanup()":
    "7be123b8176d77f2b519a5256d3f67df92739e73b6c3d70fbce74e54717d9a22",
});
const Tuple = z
  .strictObject({
    creatorId: z.uuid(),
    contentId: z.uuid(),
    contentVersion: z.int().positive(),
    planRef: CommerceFulfillmentPlanRef,
    audience: ContentAudience,
  })
  .refine(
    (t) =>
      t.audience.kind === "public" ||
      (t.audience.kind === "groups" &&
        t.audience.ids.length === 1 &&
        t.audience.ids[0] === t.planRef.id),
  );
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Original = z.strictObject({
  packet_id: z.uuid(),
  commitment_id: z.uuid(),
  thread_id: z.uuid(),
  fan_id: z.uuid(),
  fan_account_id: z.uuid(),
  creator_id: z.uuid(),
  creator_account_id: z.uuid(),
  packet_version: z.int().positive(),
  commitment_version: z.int().positive(),
  mode_id: z.uuid(),
  mode_version: z.int().positive(),
  acceptance_id: z.uuid(),
  acceptance_hash: Hash,
  request_hash: Hash,
  consent_hash: Hash,
  capture_id: z.uuid(),
  capture_hash: Hash,
});
export type CommerceFulfillmentViewTuple = z.infer<typeof Tuple>;
const scopeBrand: unique symbol = Symbol("CommerceFulfillmentViewScope");
export type CommerceFulfillmentViewScope = Readonly<{ [scopeBrand]: true }>;
type Held = {
  client: PoolClient;
  actor: Actor;
  request: NonNullable<ReturnType<typeof requestAuthority.getStore>>;
  transaction: string;
  pid: number;
  nonce: string;
  tuple: CommerceFulfillmentViewTuple;
  originalHash?: string;
};
const issued = new WeakSet<CommerceFulfillmentViewAuthority>();
function unavailable(): never {
  throw new DomainError(
    "fulfillment_view_unavailable",
    "Current access to this answer is unavailable. Refresh and try again.",
    503,
  );
}

/** Actual current interactive issuer for W8's distinct all-original negatives.
 * It issues metadata custody only: no answer, positive scope, worker permission
 * or view licence is inferred from a plan ID, scope or successful callback. */
export class CommerceFulfillmentViewAuthority {
  private readonly scopes = new WeakMap<CommerceFulfillmentViewScope, Held>();
  private constructor(private readonly database: Database) {
    issued.add(this);
  }
  static async prepare(input: {
    database: Database;
    migration: { version: string; checksum: string };
  }): Promise<CommerceFulfillmentViewAuthority> {
    if (
      input.migration.version !== FULFILLMENT_VIEW_MIGRATION ||
      input.migration.checksum !== FULFILLMENT_VIEW_SCHEMA_SHA256
    )
      unavailable();
    await input.database.assertRuntimeRole();
    const authority = new CommerceFulfillmentViewAuthority(input.database);
    const client = await input.database.pool.connect();
    try {
      await authority.assertCatalogue(client);
    } finally {
      client.release();
    }
    return authority;
  }
  static assertRuntime(
    authority: CommerceFulfillmentViewAuthority,
    database: Database,
  ): void {
    if (!issued.has(authority) || authority.database !== database)
      unavailable();
  }
  static async assertCurrentCatalogue(
    authority: CommerceFulfillmentViewAuthority,
    database: Database,
    client: PoolClient,
  ): Promise<void> {
    CommerceFulfillmentViewAuthority.assertRuntime(authority, database);
    await authority.assertCatalogue(client);
  }
  private async assertCatalogue(client: PoolClient): Promise<void> {
    try {
      // A distinct reviewed consumer may add only its exact fixed matcher ACL
      // and bounded RLS policies. Unregistered DDL or a changed checksum cannot
      // select the extended catalogue; the consumer's actual source is checked.
      const originalHash = (
        await client.query<{ checksum: string }>(
          "SELECT checksum FROM creator.schema_migration WHERE version=$1",
          [FULFILLMENT_ORIGINAL_HASH_MIGRATION],
        )
      ).rows[0];
      if (originalHash) {
        if (originalHash.checksum !== FULFILLMENT_ORIGINAL_HASH_SCHEMA_SHA256)
          unavailable();
        await assertFulfillmentOriginalHashCatalogue(client);
      }
      const ready = (
        await client.query<{ ready: boolean }>(
          `SELECT
       session_user='creator_runtime' AND current_user=session_user
       AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
       AND EXISTS(SELECT FROM creator.schema_migration WHERE version='0178_w4_fulfillment_plan_custody'
        AND checksum='d728ec3d71f3b9fd11c49b3f2faf91624e7b03868d5ab4b462b0730fddae4aa1')
       AND EXISTS(SELECT FROM pg_roles r WHERE r.rolname=$3 AND NOT r.rolcanlogin
        AND NOT r.rolsuper AND NOT r.rolinherit AND NOT r.rolbypassrls AND NOT r.rolcreatedb
        AND NOT r.rolcreaterole AND NOT r.rolreplication AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
        AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
        AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
        AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
        AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid))
       AND (SELECT count(*)=5 FROM pg_proc WHERE proowner=(SELECT oid FROM pg_roles WHERE rolname=$3))
       AND EXISTS(SELECT FROM pg_class WHERE oid=to_regclass('creator.commerce_fulfillment_view_scope')
        AND relrowsecurity AND relforcerowsecurity AND pg_get_userbyid(relowner)='creator_owner')
       AND NOT has_any_column_privilege(current_user,'creator.commerce_fulfillment_view_scope','SELECT,INSERT,UPDATE,REFERENCES')
       AND NOT has_table_privilege(current_user,'creator.commerce_fulfillment_view_scope','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       AND NOT has_column_privilege($3,'creator.commerce_packet','question','SELECT')
       AND NOT has_column_privilege($3,'creator.commerce_packet','fan_answer','SELECT')
       AND NOT has_column_privilege($3,'creator.content_revision','document','SELECT')
       AND NOT has_column_privilege($3,'creator.identity_session','token_hash','SELECT')
       AND NOT has_column_privilege($3,'creator.identity_session','upstream_cipher','SELECT')
       AND NOT has_column_privilege($3,'creator.passkey_credential','public_key','SELECT')
       AND NOT has_column_privilege($3,'creator.signed_act','assertion','SELECT') AS ready`,
          [FULFILLMENT_VIEW_MIGRATION, FULFILLMENT_VIEW_SCHEMA_SHA256, Owner],
        )
      ).rows[0]?.ready;
      if (
        ready !== true ||
        contentHash(await generationConsumerCatalogue(client, Owner)) !==
          Catalogue
      )
        unavailable();
      if (
        (
          await client.query<{ checksum: string }>(
            FULFILLMENT_VIEW_CATALOGUE_QUERY,
          )
        ).rows[0]?.checksum !==
          (originalHash
            ? OriginalHashScopeCatalogue
            : FULFILLMENT_VIEW_CATALOGUE_SHA256) ||
        (await client.query<{ checksum: string }>(FULFILLMENT_CATALOGUE_QUERY))
          .rows[0]?.checksum !==
          (originalHash
            ? OriginalHashPlanCatalogue
            : FULFILLMENT_VIEW_PLAN_CATALOGUE_SHA256)
      )
        unavailable();
      for (const [signature, checksum] of Object.entries(Definitions)) {
        const row = (
          await client.query<{ ready: boolean; definition: string }>(
            `SELECT p.prosecdef AND p.provolatile='v'
         AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)=$2
         AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS ready,
         pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.oid=to_regprocedure($1)`,
            [signature, Owner],
          )
        ).rows[0];
        if (
          row?.ready !== true ||
          createHash("sha256").update(row.definition).digest("hex") !== checksum
        )
          unavailable();
      }
    } catch {
      unavailable();
    }
  }
  private async context(client: PoolClient, actor: Actor) {
    const request = requestAuthority.getStore();
    if (
      !actor.adultEligible ||
      !request ||
      request.accountId !== actor.accountId
    )
      unavailable();
    await client.query("SAVEPOINT w4_fulfillment_view_client");
    await client.query("RELEASE SAVEPOINT w4_fulfillment_view_client");
    const row = (
      await client.query<{
        transaction: string;
        pid: number;
        account: string;
        session: string;
        isolation: string;
      }>(`SELECT pg_current_xact_id()::text AS transaction,pg_backend_pid() AS pid,
     current_setting('app.account_id',true) AS account,current_setting('app.identity_session_id',true) AS session,
     current_setting('transaction_isolation') AS isolation`)
    ).rows[0];
    if (
      !row ||
      row.isolation !== "read committed" ||
      row.account !== actor.accountId ||
      row.session !== request.sessionId
    )
      unavailable();
    return { request, transaction: row.transaction, pid: row.pid };
  }
  async beginInTransaction(
    client: PoolClient,
    actor: Actor,
    raw: CommerceFulfillmentViewTuple,
  ): Promise<CommerceFulfillmentViewScope> {
    await this.assertCatalogue(client);
    const tuple = Tuple.parse(raw),
      request = requestAuthority.getStore();
    if (
      !request ||
      request.accountId !== actor.accountId ||
      !actor.adultEligible
    )
      unavailable();
    // The actual interactive owner holds the original session before positives.
    await assertCurrentSession(client, actor.accountId);
    const existing = (
      await client.query<{ session: string | null }>(
        "SELECT nullif(current_setting('app.identity_session_id',true),'') AS session",
      )
    ).rows[0]?.session;
    if (existing && existing !== request.sessionId) unavailable();
    await client.query("SELECT set_config('app.identity_session_id',$1,true)", [
      request.sessionId,
    ]);
    const context = await this.context(client, actor);
    const nonce = (
      await client.query<{ nonce: string | null }>(
        "SELECT creator.begin_commerce_fulfillment_view($1,$2,$3,$4,$5,$6,$7::jsonb) AS nonce",
        [
          tuple.creatorId,
          tuple.contentId,
          tuple.contentVersion,
          tuple.planRef.id,
          tuple.planRef.revision,
          tuple.planRef.hash,
          JSON.stringify(tuple.audience),
        ],
      )
    ).rows[0]?.nonce;
    if (!nonce) unavailable();
    const scope = Object.freeze({ [scopeBrand]: true as const });
    this.scopes.set(scope, {
      client,
      actor,
      ...context,
      nonce,
      tuple: Tuple.parse(tuple),
    });
    await this.assertCurrentInTransaction(client, scope);
    return scope;
  }
  /** Actual W8 consumer gets only the private SQL binding after current issuer
   * proof; a serialized tuple/nonce cannot recreate this process-issued scope. */
  async assertCurrentInTransaction(
    client: PoolClient,
    scope: CommerceFulfillmentViewScope,
  ): Promise<Readonly<{ nonce: string; tuple: CommerceFulfillmentViewTuple }>> {
    const held = this.scopes.get(scope);
    if (!held || held.client !== client) unavailable();
    await this.assertCatalogue(client);
    const current = await this.context(client, held.actor);
    if (
      current.request !== held.request ||
      current.pid !== held.pid ||
      current.transaction !== held.transaction
    )
      unavailable();
    const allowed = (
      await client.query<{ allowed: boolean }>(
        "SELECT creator.commerce_fulfillment_view_matches($1) AS allowed",
        [held.nonce],
      )
    ).rows[0]?.allowed;
    if (allowed !== true) unavailable();
    return Object.freeze({ nonce: held.nonce, tuple: Tuple.parse(held.tuple) });
  }
  async originalsInTransaction(
    client: PoolClient,
    scope: CommerceFulfillmentViewScope,
  ) {
    const binding = await this.assertCurrentInTransaction(client, scope),
      held = this.scopes.get(scope)!;
    const rows = z
      .array(Original)
      .min(2)
      .max(100)
      .parse(
        (
          await client.query(
            "SELECT * FROM creator.commerce_fulfillment_view_originals($1)",
            [binding.nonce],
          )
        ).rows,
      );
    if (
      rows.some((r) => r.creator_id !== binding.tuple.creatorId) ||
      new Set(rows.map((r) => r.packet_id)).size !== rows.length ||
      new Set(rows.map((r) => r.thread_id)).size !== rows.length
    )
      unavailable();
    const hash = contentHash(rows);
    if (held.originalHash && held.originalHash !== hash) unavailable();
    held.originalHash = hash;
    await this.assertCurrentInTransaction(client, scope);
    return Object.freeze(rows.map((r) => Object.freeze(r)));
  }
  async endInTransaction(
    client: PoolClient,
    scope: CommerceFulfillmentViewScope,
  ): Promise<void> {
    const binding = await this.assertCurrentInTransaction(client, scope);
    await client.query("SELECT creator.end_commerce_fulfillment_view($1)", [
      binding.nonce,
    ]);
    await this.assertCatalogue(client);
    this.scopes.delete(scope);
  }
}

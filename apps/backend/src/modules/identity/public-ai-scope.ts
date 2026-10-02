import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { DomainError, invariant } from "../../core/errors.js";
import { assertCurrentSession, requestAuthority } from "./request-authority.js";

export const PUBLIC_AI_SCOPE_MIGRATION = "0085_w1_public_ai_metadata_scope";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const License = z.strictObject({
  state: z.enum(["active", "revoked", "suspended"]),
  permittedUses: z.array(z.string().max(80)).max(32),
  termEndsAt: z.iso.datetime({ offset: true }),
  counselVersion: z.string().max(2000),
  proofReference: z.string().max(2000),
  voiceConsentReference: z.string().max(2000).optional(),
  estateOptInReference: z.string().max(2000).optional(),
});
const SourceIdentity = z.strictObject({
  id: z.uuid(),
  revision: z.int().positive(),
  hash: Hash,
});
export const PublicAIReadFacts = z.strictObject({
  creatorId: z.uuid(),
  creatorAccountId: z.uuid(),
  workspace: z
    .strictObject({
      liveVersionId: z.uuid().nullable(),
      paused: z.boolean(),
      deleted: z.boolean(),
    })
    .nullable(),
  tombstoned: z.boolean(),
  license: License.nullable(),
  version: z
    .strictObject({
      id: z.uuid(),
      state: z.enum(["live", "paused", "retired"]),
      mode: z.enum(["expert", "companion", "blend"]).nullable(),
      dailyCostCapMicros: z.int().min(0).max(1_000_000_000).nullable(),
      compiledHash: Hash,
      pipelineHash: Hash,
      publishedAt: z.iso.datetime({ offset: true }).nullable(),
      sourceSet: z.array(SourceIdentity).max(1000),
    })
    .nullable(),
  sources: z
    .array(
      z.strictObject({
        id: z.uuid(),
        revision: z.int().positive(),
        hash: Hash,
        title: z.string().max(80),
        public: z.boolean(),
        ready: z.boolean(),
      }),
    )
    .max(1000),
});
/** Server-only bounded facts. License references and source IDs must never be
 * returned as a public response. W2 still owns license/pipeline/purpose checks. */
type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
export type PublicAIReadFacts = DeepReadonly<z.infer<typeof PublicAIReadFacts>>;
function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
const publicAIBrand: unique symbol = Symbol("PublicAIReadScope");
export type PublicAIReadScope = Readonly<{
  [publicAIBrand]: true;
  kind: "public-ai";
  creatorId: string;
  creatorAccountId: string;
  versionId: string | null;
}>;
export type PublicCreatorRestriction = (
  client: PoolClient,
  creatorId: string,
) => Promise<boolean>;

/** Only the genuine public metadata purpose. It cannot configure, sign,
 * generate, read a thread, grant consent or substitute for a creator Actor. */
export class PublicAIIdentityAuthority {
  private readonly issued = new WeakMap<
    PublicAIReadScope,
    {
      client: PoolClient;
      facts: PublicAIReadFacts;
      nonce: string;
      transaction: string;
      pid: number;
    }
  >();
  private constructor(
    private readonly pool: Pool,
    private readonly assertAllowed: PublicCreatorRestriction,
  ) {}

  static async create(input: {
    pool: Pool;
    migration: { version: string; checksum: string };
    /** W8 current restoration and early public-creator/visitor negatives. */
    assertAllowed: PublicCreatorRestriction;
  }): Promise<PublicAIIdentityAuthority> {
    if (
      input.migration.version !== PUBLIC_AI_SCOPE_MIGRATION ||
      !Hash.safeParse(input.migration.checksum).success ||
      typeof input.assertAllowed !== "function"
    )
      throw new DomainError(
        "public_ai_unconfigured",
        "Current public AI metadata authority is not configured.",
        503,
      );
    const ready = (
      await input.pool.query<{ ready: boolean }>(
        `SELECT current_user='creator_runtime' AND session_user=current_user
       AND EXISTS(SELECT FROM pg_roles WHERE rolname=current_user
        AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole
        AND NOT rolinherit AND NOT rolreplication AND (rolconfig IS NULL OR cardinality(rolconfig)=0))
       AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
       AND EXISTS(SELECT FROM pg_roles r WHERE r.rolname='creator_public_ai_authority'
        AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit
        AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
        AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
        AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
        AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
        AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
        AND NOT has_column_privilege(r.oid,'creator.ai_version','configuration','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.ai_version','compiled_prefix','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.ai_workspace','configuration','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.ai_workspace','interview','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.ai_source','text_content','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.ai_source','rights_evidence','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.identity_session','token_hash','SELECT')
        AND NOT has_column_privilege(r.oid,'creator.identity_session','upstream_cipher','SELECT')
        AND has_schema_privilege(r.oid,'creator_trust','USAGE')
        AND has_function_privilege(r.oid,to_regprocedure('creator_trust.public_creator_denial(uuid)'),'EXECUTE'))
       AND (SELECT count(*)=8 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='creator' AND c.relkind='r' AND c.relname=ANY(ARRAY[
         'creator_profile','identity_session','ai_workspace','ai_tombstone','ai_license','ai_version','ai_source','public_ai_read_scope'])
        AND c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='creator_owner')
       AND (SELECT count(*)=5 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
        WHERE p.oid=ANY(ARRAY[
         to_regprocedure('creator.public_ai_metadata(uuid,boolean)'),
         to_regprocedure('creator.begin_public_ai_scope(uuid)'),
         to_regprocedure('creator.public_ai_scope_matches(uuid,uuid)'),
         to_regprocedure('creator.end_public_ai_scope()'),
         to_regprocedure('creator.require_public_ai_scope_cleanup()')]::oid[])
        AND r.rolname='creator_public_ai_authority' AND p.prosecdef AND p.provolatile='v'
        AND 'search_path=pg_catalog'=ANY(p.proconfig))
       AND EXISTS(SELECT FROM pg_trigger WHERE tgname='require_public_ai_scope_cleanup'
        AND tgrelid=to_regclass('creator.public_ai_read_scope') AND tgenabled='O'
        AND tgdeferrable AND tginitdeferred)
       AND to_regprocedure('creator_trust.public_creator_denial(uuid)') IS NOT NULL
       AND has_function_privilege(current_user,to_regprocedure('creator.begin_public_ai_scope(uuid)'),'EXECUTE')
       AND has_function_privilege(current_user,to_regprocedure('creator.public_ai_scope_matches(uuid,uuid)'),'EXECUTE')
       AND has_function_privilege(current_user,to_regprocedure('creator.end_public_ai_scope()'),'EXECUTE') AS ready`,
        [input.migration.version, input.migration.checksum],
      )
    ).rows[0]?.ready;
    if (ready !== true)
      throw new DomainError(
        "public_ai_unconfigured",
        "The reviewed public AI metadata scope is not installed.",
        503,
      );
    return new PublicAIIdentityAuthority(input.pool, input.assertAllowed);
  }

  async withPublicAI<T>(
    creatorId: string,
    work: (
      client: PoolClient,
      scope: PublicAIReadScope,
      facts: PublicAIReadFacts,
    ) => Promise<T>,
  ): Promise<T | null> {
    const id = z.uuid().parse(creatorId);
    const visitor = requestAuthority.getStore();
    const client = await this.pool.connect();
    let scope: PublicAIReadScope | undefined;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await client.query(
        "SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','1000',true)",
      );
      await client.query(
        "SELECT set_config('app.creator_id',$1,true),set_config('app.account_id',$2,true),set_config('app.identity_session_id','',true),set_config('app.fan_id','',true)",
        [id, visitor?.accountId ?? ""],
      );
      if (visitor) {
        await assertCurrentSession(client, visitor.accountId);
        // Bind only the genuine session just held above. This also supports
        // canonical hosts whose current validator predates the GUC binding.
        await client.query(
          "SELECT set_config('app.identity_session_id',$1,true)",
          [visitor.sessionId],
        );
      }
      // The early callback holds real negatives/restoration through commit.
      // It may not impersonate an owner or start another transaction.
      const allowed = await this.assertAllowed(client, id);
      if (allowed === false) {
        await client.query("COMMIT");
        return null;
      }
      if (allowed !== true)
        throw new DomainError(
          "public_ai_denial_unavailable",
          "Current public AI authority is unavailable.",
          503,
        );
      const result = (
        await client.query<{ proof: unknown }>(
          "SELECT creator.begin_public_ai_scope($1) AS proof",
          [id],
        )
      ).rows[0]?.proof;
      if (result === null) {
        await client.query("COMMIT");
        return null;
      }
      const facts = freeze(PublicAIReadFacts.parse(result));
      invariant(
        facts.creatorId === id,
        "public_ai_scope_changed",
        "The public AI scope changed.",
      );
      scope = Object.freeze({
        [publicAIBrand]: true as const,
        kind: "public-ai" as const,
        creatorId: id,
        creatorAccountId: facts.creatorAccountId,
        versionId: facts.version?.id ?? null,
      });
      const binding = z
        .strictObject({
          nonce: z.uuid(),
          transaction: z.string().regex(/^[0-9]+$/u),
          pid: z.int().positive(),
        })
        .parse(
          (
            await client.query(
              "SELECT current_setting('public_ai.scope_id',true) AS nonce,pg_current_xact_id()::text AS transaction,pg_backend_pid() AS pid",
            )
          ).rows[0],
        );
      this.issued.set(scope, { client, facts, ...binding });
      await this.authorizeInTransaction(scope, client, facts);
      const value = await work(client, scope, facts);
      // Rechecks held metadata and wall-clock/session expiry, without new locks.
      await this.authorizeInTransaction(scope, client, facts);
      await client.query("SELECT creator.end_public_ai_scope()");
      this.issued.delete(scope);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["55P03", "57014", "54000", "55000", "42501", "42883"].includes(
          String(error.code),
        )
      )
        throw new DomainError(
          "public_ai_busy",
          "Public AI information is updating. Try again.",
          503,
        );
      if (error instanceof z.ZodError)
        throw new DomainError(
          "public_ai_metadata_unavailable",
          "Current public AI metadata is unavailable. Try again.",
          503,
        );
      throw error;
    } finally {
      if (scope) this.issued.delete(scope);
      client.release();
    }
  }

  /** W2 joins this exact live client. No JSON lookalike, retained scope,
   * another connection, changed visitor or fresh row/advisory lease. */
  async authorizeInTransaction(
    scope: PublicAIReadScope,
    client: PoolClient,
    facts: PublicAIReadFacts,
  ): Promise<void> {
    const binding = this.issued.get(scope);
    invariant(
      binding?.client === client && binding.facts === facts,
      "public_ai_scope_required",
      "Use the current public AI read transaction.",
    );
    const visitor = requestAuthority.getStore();
    const current = (
      await client.query<{
        account: string;
        session: string;
        nonce: string;
        transaction: string;
        pid: number;
        allowed: boolean;
      }>(
        `SELECT current_setting('app.account_id',true) AS account,
       current_setting('app.identity_session_id',true) AS session,
       current_setting('public_ai.scope_id',true) AS nonce,
       pg_current_xact_id_if_assigned()::text AS transaction,pg_backend_pid() AS pid,
       creator.public_ai_scope_matches($1,$2) AS allowed`,
        [scope.creatorId, scope.versionId],
      )
    ).rows[0];
    invariant(
      current?.allowed === true &&
        current.nonce === binding.nonce &&
        current.transaction === binding.transaction &&
        current.pid === binding.pid &&
        current.account === (visitor?.accountId ?? "") &&
        current.session === (visitor?.sessionId ?? ""),
      "public_ai_scope_changed",
      "The public AI read ended or changed.",
    );
  }
}

import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { canonical } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";
import { assertCurrentSession, requestAuthority } from "./request-authority.js";

export const GENERATION_SCOPE_MIGRATION = "0072_w1_generation_worker_scope";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Instant = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const taskSchema = z.strictObject({
  generationId: z.uuid(),
  threadId: z.uuid(),
  creatorId: z.uuid(),
  fanId: z.uuid(),
  initiatingAccountId: z.uuid(),
  initiatingSessionId: z.uuid(),
  creatorAccountId: z.uuid(),
  fanMessageId: z.uuid(),
  aiMessageId: z.uuid(),
  grantId: z.uuid(),
  reservationId: z.uuid().nullable(),
  epoch: z.int().nonnegative(),
  contextRevision: z.int().nonnegative(),
  lastSequence: z.int().nonnegative(),
  workerToken: z.uuid(),
  leaseUntil: Instant,
  processorConsentVersion: z.string().min(1).max(2000),
});
/** Server-only acceptance and lease metadata, never fan text or credentials. */
export type GenerationTask = Readonly<z.infer<typeof taskSchema>>;
const generationBrand: unique symbol = Symbol("GenerationTaskScope");
export type GenerationTaskScope = GenerationTask &
  Readonly<{ [generationBrand]: true; kind: "generation" }>;

export type GenerationRestriction = (
  client: PoolClient,
  /** Host restoration only. SQL0093 separately holds the actual participant
   * negatives using the private nonce, durable provenance and current lease. */
  task: Readonly<{ generationId: string; workerToken: string }>,
) => Promise<void>;

/** W3 calls this only after its actual fan acceptance INSERT, on that same
 * canonical held transaction. A retained scope, another session or a legacy
 * generation cannot manufacture acceptance provenance. */
export async function confirmAcceptedGeneration(
  scope: ThreadScope,
  client: PoolClient,
  generationId: string,
): Promise<void> {
  assertThreadScope(scope);
  const current = requestAuthority.getStore();
  invariant(
    scope.authority === "fan" &&
      scope.actorAccountId === scope.fanAccountId &&
      current?.accountId === scope.fanAccountId,
    "generation_acceptance_required",
    "Generation requires the actual accepted fan session.",
  );
  await assertCurrentSession(client, scope.fanAccountId);
  const confirmed = (
    await client.query<{ confirmed: boolean }>(
      `SELECT creator.confirm_generation_initiator(g.id) AS confirmed
       FROM creator.generation g
       WHERE g.id=$1 AND g.thread_id=$2 AND g.creator_id=$3 AND g.fan_id=$4
        AND current_user='creator_runtime' AND session_user=current_user
        AND pg_current_xact_id_if_assigned()=g.acceptance_transaction
        AND g.initiating_account_id=$5 AND g.initiating_session_id=$6
        AND nullif(current_setting('app.creator_id',true),'')::uuid=$3
        AND nullif(current_setting('app.fan_id',true),'')::uuid=$4
        AND nullif(current_setting('app.account_id',true),'')::uuid=$5
        AND nullif(current_setting('app.identity_session_id',true),'')::uuid=$6`,
      [
        z.uuid().parse(generationId),
        scope.threadId,
        scope.creatorId,
        scope.fanId,
        current.accountId,
        current.sessionId,
      ],
    )
  ).rows[0]?.confirmed;
  invariant(
    confirmed === true,
    "generation_acceptance_changed",
    "The generation acceptance ended or changed.",
  );
  await assertCurrentSession(client, scope.fanAccountId);
}

/** A distinct noninteractive purpose issuer. It supplies no ThreadScope,
 * Actor, ALS, source license, provider admission or private read/write grants.
 * W3/W2 must use explicit reviewed consumers on this exact client and scope.
 */
export class GenerationIdentityAuthority {
  private readonly issued = new WeakMap<
    GenerationTaskScope,
    { client: PoolClient; nonce: string; transaction: string; pid: number }
  >();
  private constructor(
    private readonly pool: Pool,
    private readonly configuration: Readonly<{
      assertAllowed: GenerationRestriction;
      assertDiscoveryAllowed: (client: PoolClient) => Promise<void>;
    }>,
  ) {}

  assertPool(pool: Pool): void {
    if (pool !== this.pool)
      throw new DomainError(
        "generation_scope_unconfigured",
        "Generation authority belongs to a different database pool.",
        503,
      );
  }

  static async create(input: {
    pool: Pool;
    migration: { version: string; checksum: string };
    /** The actual W8 reviewed0093 receipt, not a claimed callback result. */
    denialMigration: { version: string; checksum: string };
    assertAllowed: GenerationRestriction;
    assertDiscoveryAllowed: (client: PoolClient) => Promise<void>;
  }): Promise<GenerationIdentityAuthority> {
    if (
      input.migration.version !== GENERATION_SCOPE_MIGRATION ||
      !Hash.safeParse(input.migration.checksum).success ||
      !/^0093_w8_[a-z_]+$/u.test(input.denialMigration.version) ||
      !Hash.safeParse(input.denialMigration.checksum).success ||
      typeof input.assertAllowed !== "function" ||
      typeof input.assertDiscoveryAllowed !== "function"
    )
      throw new DomainError(
        "generation_scope_unconfigured",
        "Current generation purpose authority is not configured.",
        503,
      );
    try {
      const installed = (
        await input.pool.query<{ installed: boolean }>(
          `SELECT session_user='creator_generation_worker' AND current_user=session_user
           AND to_regclass('creator.generation_worker_scope') IS NOT NULL
           AND to_regprocedure('creator.begin_generation_scope(uuid,uuid)') IS NOT NULL
           AND to_regprocedure('creator_trust.generation_worker_denial(uuid)') IS NOT NULL AS installed`,
        )
      ).rows[0]?.installed;
      if (installed !== true) throw new Error("Generation authority is absent");
      const ready = (
        await input.pool.query<{ ready: boolean }>(
          `SELECT
           (SELECT count(*)=2 FROM creator.schema_migration
            WHERE (version=$1 AND checksum=$2) OR (version=$3 AND checksum=$4))
           AND (SELECT count(*)=2 FROM pg_roles r
            WHERE (r.rolname='creator_generation_worker' AND r.rolcanlogin
             OR r.rolname='creator_generation_authority' AND NOT r.rolcanlogin)
            AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit
            AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
            AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
            AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
            AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
            AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid))
           AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname IN('creator','creator_trust') AND c.relkind IN('r','p','v','m','f')
             AND NOT(n.nspname='creator' AND c.relname='schema_migration')
             AND (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
              OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
           AND NOT EXISTS(SELECT FROM pg_proc WHERE proowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))
           AND NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname IN('creator','creator_trust') AND p.prosecdef
             AND has_function_privilege(current_user,p.oid,'EXECUTE')
             AND NOT(p.oid=ANY(ARRAY[
              to_regprocedure('creator.pending_generation_tasks(integer)'),
              to_regprocedure('creator.claim_generation_task(uuid,uuid)'),
              to_regprocedure('creator.begin_generation_scope(uuid,uuid)'),
              to_regprocedure('creator.generation_scope_matches(uuid,uuid)'),
              to_regprocedure('creator.end_generation_scope()')]::oid[])))
           AND (SELECT count(*)=8 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='creator' AND c.relkind='r' AND c.relname=ANY(ARRAY[
             'generation','thread','creator_profile','fan_profile','identity_session','message','processor_consent','generation_worker_scope'])
            AND c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='creator_owner')
           AND NOT has_column_privilege('creator_generation_authority','creator.message','text','SELECT')
           AND NOT has_column_privilege('creator_generation_authority','creator.memory','text','SELECT')
           AND NOT has_column_privilege('creator_generation_authority','creator.identity_session','token_hash','SELECT')
           AND NOT has_column_privilege('creator_generation_authority','creator.identity_session','upstream_cipher','SELECT')
           AND NOT has_column_privilege('creator_generation_authority','creator.signed_act','assertion','SELECT')
           AND NOT has_column_privilege('creator_generation_authority','creator.passkey_credential','public_key','SELECT')
           AND NOT has_column_privilege('creator_generation_authority','creator.ai_version','configuration','SELECT')
           AND NOT has_column_privilege('creator_generation_authority','creator.ai_version','compiled_prefix','SELECT')
           AND NOT has_column_privilege('creator_generation_authority','creator.ai_workspace','interview','SELECT')
           AND (SELECT count(*)=8 FROM pg_proc p
            WHERE p.oid=ANY(ARRAY[
             to_regprocedure('creator.confirm_generation_initiator(uuid)'),
             to_regprocedure('creator.pending_generation_tasks(integer)'),
             to_regprocedure('creator.generation_task_proof(uuid,uuid,boolean)'),
             to_regprocedure('creator.claim_generation_task(uuid,uuid)'),
             to_regprocedure('creator.begin_generation_scope(uuid,uuid)'),
             to_regprocedure('creator.generation_scope_matches(uuid,uuid)'),
             to_regprocedure('creator.end_generation_scope()'),
             to_regprocedure('creator.require_generation_scope_cleanup()')]::oid[])
             AND pg_get_userbyid(p.proowner)='creator_generation_authority' AND p.prosecdef
             AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.provolatile IN('s','v')
             AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
           AND EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure('creator.capture_generation_initiator()')
            AND pg_get_userbyid(p.proowner)='creator_generation_authority' AND NOT p.prosecdef
            AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.provolatile='v')
           AND (SELECT count(*)=9 FROM pg_proc WHERE proowner=(SELECT oid FROM pg_roles WHERE rolname='creator_generation_authority'))
           AND EXISTS(SELECT FROM pg_trigger WHERE tgname='generation_initiator' AND tgenabled='O'
            AND tgrelid=to_regclass('creator.generation') AND tgfoid=to_regprocedure('creator.capture_generation_initiator()'))
           AND EXISTS(SELECT FROM pg_trigger WHERE tgname='require_generation_scope_cleanup' AND tgenabled='O'
            AND tgrelid=to_regclass('creator.generation_worker_scope') AND tgdeferrable AND tginitdeferred)
           AND EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure('creator_trust.generation_worker_denial(uuid)')
            AND pg_get_userbyid(p.proowner)='creator_trust_denial' AND p.prosecdef AND p.provolatile='v'
            AND p.proconfig=ARRAY['search_path=pg_catalog'])
           AND has_function_privilege('creator_generation_authority',to_regprocedure('creator_trust.generation_worker_denial(uuid)'),'EXECUTE')
           AND has_function_privilege(current_user,to_regprocedure('creator.pending_generation_tasks(integer)'),'EXECUTE')
           AND has_function_privilege(current_user,to_regprocedure('creator.claim_generation_task(uuid,uuid)'),'EXECUTE')
           AND has_function_privilege(current_user,to_regprocedure('creator.begin_generation_scope(uuid,uuid)'),'EXECUTE')
           AND has_function_privilege(current_user,to_regprocedure('creator.generation_scope_matches(uuid,uuid)'),'EXECUTE')
           AND has_function_privilege(current_user,to_regprocedure('creator.end_generation_scope()'),'EXECUTE') AS ready`,
          [
            input.migration.version,
            input.migration.checksum,
            input.denialMigration.version,
            input.denialMigration.checksum,
          ],
        )
      ).rows[0]?.ready;
      if (ready !== true)
        throw new Error("Generation authority is not reviewed");
    } catch {
      throw new DomainError(
        "generation_scope_unconfigured",
        "The reviewed generation purpose authority is not installed.",
        503,
      );
    }
    return new GenerationIdentityAuthority(input.pool, {
      assertAllowed: input.assertAllowed,
      assertDiscoveryAllowed: input.assertDiscoveryAllowed,
    });
  }

  private assertWorker(): void {
    invariant(
      !requestAuthority.getStore(),
      "generation_worker_required",
      "Generation workers cannot substitute for an interactive session.",
    );
  }

  private async begin(client: PoolClient): Promise<void> {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    await client.query(
      `SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','1000',true),
       set_config('idle_in_transaction_session_timeout','5000',true),
       set_config('app.account_id','',true),set_config('app.identity_session_id','',true),
       set_config('app.creator_id','',true),set_config('app.fan_id','',true),set_config('generation.scope_nonce','',true)`,
    );
  }

  private failure(error: unknown): never {
    if (error instanceof z.ZodError)
      throw new DomainError(
        "generation_metadata_unavailable",
        "Current generation metadata is unavailable.",
        503,
      );
    if (error && typeof error === "object" && "code" in error) {
      if (String(error.code) === "42501")
        throw new DomainError(
          "generation_denied",
          "This generation is unavailable.",
          403,
        );
      if (
        [
          "55P03",
          "57014",
          "55000",
          "42883",
          "42P01",
          "42703",
          "23514",
        ].includes(String(error.code))
      )
        throw new DomainError(
          "generation_authority_unavailable",
          "Current generation authority is unavailable. Try again.",
          503,
        );
    }
    throw error;
  }

  /** Discovery is not permission to read a thread or admit a provider. */
  async pendingTasks(limit = 20): Promise<readonly string[]> {
    this.assertWorker();
    const bounded = z.int().min(1).max(64).parse(limit);
    const client = await this.pool.connect();
    try {
      await this.begin(client);
      await this.configuration.assertDiscoveryAllowed(client);
      const rows = await client.query<{ id: unknown }>(
        "SELECT id FROM creator.pending_generation_tasks($1) AS id",
        [bounded],
      );
      const ids = Object.freeze(
        z
          .array(z.uuid())
          .max(bounded)
          .parse(rows.rows.map((row) => row.id)),
      );
      await this.configuration.assertDiscoveryAllowed(client);
      await client.query("COMMIT");
      return ids;
    } catch (error) {
      await client.query("ROLLBACK");
      return this.failure(error);
    } finally {
      client.release();
    }
  }

  /** The server chooses a fresh token for each claim; a known job ID alone
   * never supplies acceptance, current session or generation permission. */
  async claimTask(generationId: string): Promise<GenerationTask | null> {
    this.assertWorker();
    const intent = Object.freeze({
      generationId: z.uuid().parse(generationId),
      workerToken: randomUUID(),
    });
    const client = await this.pool.connect();
    try {
      await this.begin(client);
      await this.configuration.assertAllowed(client, intent);
      const proof = (
        await client.query<{ proof: unknown }>(
          "SELECT creator.claim_generation_task($1,$2) AS proof",
          [intent.generationId, intent.workerToken],
        )
      ).rows[0]?.proof;
      if (proof == null) {
        await client.query("COMMIT");
        return null;
      }
      const task = Object.freeze(taskSchema.parse(proof));
      invariant(
        task.generationId === intent.generationId &&
          task.workerToken === intent.workerToken &&
          task.lastSequence === 0,
        "generation_claim_changed",
        "The generation claim changed.",
      );
      // Re-enter the actual read purpose before committing the claim. This
      // bookends wall-clock/session/denial currentness with no new positive lease.
      await this.configuration.assertAllowed(client, intent);
      const read = (
        await client.query<{ proof: unknown }>(
          "SELECT creator.begin_generation_scope($1,$2) AS proof",
          [task.generationId, task.workerToken],
        )
      ).rows[0]?.proof;
      const checked = z
        .strictObject({ nonce: z.uuid(), task: taskSchema })
        .parse(read);
      invariant(
        canonical(checked.task) === canonical(task),
        "generation_claim_changed",
        "The generation claim changed.",
      );
      await client.query("SELECT creator.end_generation_scope()");
      await client.query("COMMIT");
      return task;
    } catch (error) {
      await client.query("ROLLBACK");
      return this.failure(error);
    } finally {
      client.release();
    }
  }

  /** A fresh, bounded transaction for each admission/context/output/memory
   * stage. Provider I/O must happen after this transaction commits. */
  async withGeneration<T>(
    input: GenerationTask,
    work: (client: PoolClient, scope: GenerationTaskScope) => Promise<T>,
  ): Promise<T> {
    this.assertWorker();
    const task = Object.freeze(taskSchema.parse(input));
    const client = await this.pool.connect();
    let scope: GenerationTaskScope | undefined;
    try {
      await this.begin(client);
      await this.configuration.assertAllowed(client, task);
      const raw = (
        await client.query<{ proof: unknown }>(
          "SELECT creator.begin_generation_scope($1,$2) AS proof",
          [task.generationId, task.workerToken],
        )
      ).rows[0]?.proof;
      const proof = z
        .strictObject({ nonce: z.uuid(), task: taskSchema })
        .parse(raw);
      // Only the job's own sequence may advance between purpose transactions.
      // W3 still supplies its exact expected cursor at each business fence.
      const { lastSequence: originalSequence, ...originalIntent } = task;
      const { lastSequence: currentSequence, ...currentIntent } = proof.task;
      invariant(
        canonical(originalIntent) === canonical(currentIntent) &&
          currentSequence >= originalSequence,
        "generation_task_changed",
        "The generation task ended or changed.",
      );
      scope = Object.freeze({
        ...proof.task,
        [generationBrand]: true as const,
        kind: "generation" as const,
      });
      const binding = z
        .strictObject({
          transaction: z.string().regex(/^[0-9]+$/u),
          pid: z.int().positive(),
        })
        .parse(
          (
            await client.query(
              "SELECT pg_current_xact_id()::text AS transaction,pg_backend_pid() AS pid",
            )
          ).rows[0],
        );
      this.issued.set(scope, { client, nonce: proof.nonce, ...binding });
      await this.authorizeInTransaction(scope, client);
      const value = await work(client, scope);
      await this.configuration.assertAllowed(client, task);
      await this.authorizeInTransaction(scope, client);
      await client.query("SELECT creator.end_generation_scope()");
      this.issued.delete(scope);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      return this.failure(error);
    } finally {
      if (scope) this.issued.delete(scope);
      client.release();
    }
  }

  /** Genuine issued object, exact held client, private transaction/PID/nonce
   * and current durable lease. A cast/copied/retained scope is rejected. */
  async authorizeInTransaction(
    scope: GenerationTaskScope,
    client: PoolClient,
  ): Promise<void> {
    this.assertWorker();
    const binding = this.issued.get(scope);
    invariant(
      binding?.client === client,
      "generation_scope_required",
      "Use the current generation purpose transaction.",
    );
    const current = (
      await client.query<{
        allowed: boolean;
        nonce: string;
        transaction: string;
        pid: number;
        account: string;
        session: string;
      }>(
        `SELECT creator.generation_scope_matches($1,$2) AS allowed,
         current_setting('generation.scope_nonce',true) AS nonce,
         pg_current_xact_id_if_assigned()::text AS transaction,pg_backend_pid() AS pid,
         current_setting('app.account_id',true) AS account,current_setting('app.identity_session_id',true) AS session`,
        [scope.generationId, scope.workerToken],
      )
    ).rows[0];
    invariant(
      current?.allowed === true &&
        current.nonce === binding.nonce &&
        current.transaction === binding.transaction &&
        current.pid === binding.pid &&
        current.account === "" &&
        current.session === "",
      "generation_scope_changed",
      "The generation purpose ended or changed.",
    );
  }
}

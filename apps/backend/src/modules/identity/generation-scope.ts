import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { canonical } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import {
  assertGenerationOutputCursorCatalogue,
  generationOutputCursorSource,
  generationOutputCursorSignature,
} from "./generation-output-cursor.js";
import { registeredMigration } from "../../db/reviewed-migration.js";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";
import { assertCurrentSession, requestAuthority } from "./request-authority.js";
import { generationTransaction } from "./generation-transaction.js";

export const GENERATION_SCOPE_MIGRATION = "0159_w1_generation_worker_scope";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const consumerSchema = z.strictObject({
  migration: z.strictObject({
    version: z.string().regex(/^\d{4}_[a-z][a-z0-9_]+$/u),
    checksum: Hash,
  }),
  signature: z
    .string()
    .regex(/^(creator|creator_trust)\.[a-z][a-z0-9_]+\([^()]*\)$/u),
  owner: z.string().regex(/^creator_[a-z][a-z0-9_]+$/u),
  /** SHA-256 of PostgreSQL's actual pg_get_functiondef, after reviewed install. */
  definitionChecksum: Hash,
});
/** Reviewed server configuration, never a worker/job supplied permission. */
export type GenerationPurposeConsumer = Readonly<
  z.infer<typeof consumerSchema>
>;
const terminalConsumerSchema = consumerSchema.extend({
  purpose: z.literal("generation_terminal"),
});
/** Explicit original settlement mode. This packet never grants generation
 * input, lease, provider use or an original GenerationTaskScope. */
export type GenerationTerminalPurposeConsumer = Readonly<
  z.infer<typeof terminalConsumerSchema>
>;
const terminalContracts = [
  {
    owner: "creator_generation_terminal_authority",
    originalScopeBridge: true,
    version: "0183_w1_generation_terminal_scope",
    checksum:
      "fadbf62a3ddf06142c3a6ad30313503f9bebe7b6d64f67f8ba01ff13ce2398c7",
    signatures: [
      "creator.pending_generation_terminals(integer)",
      "creator.begin_generation_terminal(uuid,uuid,text,uuid,integer,boolean)",
      "creator.generation_terminal_matches(uuid,uuid,boolean)",
      "creator.end_generation_terminal()",
    ],
  },
  {
    owner: "creator_w2_generation_terminal_journal",
    originalScopeBridge: false,
    version: "0188_w2_generation_terminal_journal",
    checksum:
      "7ab8974d065b1b9e5befa2ded26c6978876957fab0eee80b9632825bbac98477",
    signatures: [
      "creator.generation_agent_journal_receipt(uuid,uuid)",
      "creator.generation_seal_agent_journal(uuid,uuid)",
    ],
  },
  {
    owner: "creator_w4_generation_terminal",
    originalScopeBridge: false,
    version: "0189_w4_generation_terminal_settlement",
    checksum:
      "a6e386de7506035d6bc0d10da644cb8ee2620824217b9c2c61a9a34cb7fa4fc9",
    signatures: [
      "creator.generation_settle_original_allowance(uuid,uuid)",
      "creator.generation_original_allowance_receipt(uuid,uuid)",
    ],
  },
  {
    owner: "creator_w3_terminal_output",
    originalScopeBridge: false,
    version: "0203_w3_terminal_only_finalization",
    checksum:
      "8de1897f2e70f763382984459274eb7616ad7149b457811fffd90fb8b7df2e8c",
    signatures: ["creator.generation_terminal_output(uuid,uuid)"],
  },
] as const;
function reviewedTerminalConsumer(consumer: GenerationTerminalPurposeConsumer) {
  return terminalContracts.some(
    (contract) =>
      consumer.owner === contract.owner &&
      consumer.migration.version === contract.version &&
      consumer.migration.checksum === contract.checksum &&
      contract.signatures.some((signature) => signature === consumer.signature),
  );
}
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
const outputCursorSchema = z.strictObject({
  generationId: z.uuid(),
  messageId: z.uuid(),
  sequence: z.int().min(1).max(1024),
  cursor: z.int().positive(),
});
export type GenerationOutputCursor = Readonly<
  z.infer<typeof outputCursorSchema>
>;
type GenerationScopeBinding = {
  client: PoolClient;
  nonce: string;
  transaction: string;
  pid: number;
  current: GenerationTaskScope;
};

export type GenerationRestriction = (
  client: PoolClient,
  /** Host restoration only. SQL0177 separately holds the actual participant
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
type GenerationCatalogue = Readonly<{
  migration: Readonly<{ version: string; checksum: string }>;
  denialMigration: Readonly<{ version: string; checksum: string }>;
  consumers: readonly GenerationPurposeConsumer[];
  terminalConsumers: readonly GenerationTerminalPurposeConsumer[];
}>;

/** Current original role/schema and every registered fixed consumer. Metadata
 * qualification issues no input, lease, provider or settlement permission. */
async function assertGenerationCatalogue(
  query: Pick<Pool, "query">,
  input: GenerationCatalogue,
): Promise<void> {
  const consumers = [...input.consumers, ...input.terminalConsumers];
  const installed = (
    await query.query<{ installed: boolean }>(
      `SELECT session_user='creator_generation_worker' AND current_user=session_user
       AND to_regclass('creator.generation_worker_scope') IS NOT NULL
       AND to_regprocedure('creator.begin_generation_scope(uuid,uuid)') IS NOT NULL
       AND to_regprocedure('creator_trust.generation_worker_denial(uuid)') IS NOT NULL AS installed`,
    )
  ).rows[0]?.installed;
  if (installed !== true) throw new Error("Generation authority is absent");
  const ready = (
    await query.query<{ ready: boolean }>(
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
        WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
         AND c.relkind IN('r','p','v','m','f')
         AND NOT(n.nspname='creator' AND c.relname='schema_migration')
         AND (has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES')))
       AND NOT EXISTS(SELECT FROM pg_proc WHERE proowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))
       AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
         AND c.relkind='S' AND has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE'))
       AND NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prosecdef
         AND has_function_privilege(current_user,p.oid,'EXECUTE')
         AND NOT(p.oid=ANY(ARRAY[
          to_regprocedure('creator.pending_generation_tasks(integer)'),
          to_regprocedure('creator.claim_generation_task(uuid,uuid)'),
          to_regprocedure('creator.begin_generation_scope(uuid,uuid)'),
          to_regprocedure('creator.generation_scope_matches(uuid,uuid)'),
          to_regprocedure('creator.end_generation_scope()')]::oid[])
          OR p.oid=ANY(ARRAY(SELECT to_regprocedure(c.signature)::oid
           FROM jsonb_to_recordset($5::jsonb) AS c(signature text)))))
       AND (SELECT count(*)=7 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='creator' AND c.relkind='r' AND c.relname=ANY(ARRAY[
         'generation','thread','creator_profile','fan_profile','message','processor_consent','generation_worker_scope'])
        AND c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='creator_owner')
       -- Canonical identity_session resolves an unknown bearer before any
       -- account GUC exists. Preserve its reviewed catalogue shape; the
       -- inaccessible purpose owner gets only four metadata columns and
       -- every fixed function predicates the original account/session.
       AND EXISTS(SELECT FROM pg_class WHERE oid=to_regclass('creator.identity_session')
        AND relkind='r' AND pg_get_userbyid(relowner)='creator_owner'
        AND NOT relrowsecurity AND NOT relforcerowsecurity)
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
        JSON.stringify(consumers),
      ],
    )
  ).rows[0]?.ready;
  if (ready !== true) throw new Error("Generation authority is not reviewed");
  for (const consumer of consumers) {
    const proof = (
      await query.query<{ ready: boolean; definition: string }>(
        `SELECT
         session_user='creator_generation_worker' AND current_user=session_user
         AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$2 AND checksum=$3)
         AND p.prokind='f' AND p.prosecdef AND p.provolatile IN('s','v')
         AND l.lanname IN('sql','plpgsql') AND p.proconfig=ARRAY['search_path=pg_catalog']
         AND pg_get_userbyid(p.proowner)=$4
         AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit
         AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
         AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
         AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
         AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
         AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
         AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
         AND EXISTS(SELECT FROM aclexplode(p.proacl) a JOIN pg_roles worker ON worker.oid=a.grantee
          WHERE worker.rolname=session_user AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
         AND has_function_privilege(current_user,p.oid,'EXECUTE')
         AND has_function_privilege($4,to_regprocedure($5),'EXECUTE')
         AND has_function_privilege($4,
          to_regprocedure('creator.generation_scope_matches(uuid,uuid)'),'EXECUTE')=$6::boolean
         AS ready,pg_get_functiondef(p.oid) AS definition
         FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner JOIN pg_language l ON l.oid=p.prolang
         WHERE p.oid=to_regprocedure($1)`,
        [
          consumer.signature,
          consumer.migration.version,
          consumer.migration.checksum,
          consumer.owner,
          "purpose" in consumer
            ? "creator.generation_terminal_matches(uuid,uuid,boolean)"
            : "creator.generation_scope_matches(uuid,uuid)",
          !("purpose" in consumer) ||
            terminalContracts.find(
              (contract) => contract.owner === consumer.owner,
            )?.originalScopeBridge === true,
        ],
      )
    ).rows[0];
    if (
      proof?.ready !== true ||
      createHash("sha256").update(proof.definition).digest("hex") !==
        consumer.definitionChecksum
    )
      throw new Error("Generation consumer executable differs from its review");
  }
}

export class GenerationIdentityAuthority {
  private readonly issued = new WeakMap<
    GenerationTaskScope,
    GenerationScopeBinding
  >();
  private constructor(
    private readonly pool: Pool,
    private readonly configuration: Readonly<{
      catalogue: GenerationCatalogue;
      assertAllowed: GenerationRestriction;
      assertDiscoveryAllowed: (client: PoolClient) => Promise<void>;
      consumers: readonly GenerationPurposeConsumer[];
      terminalConsumers: readonly GenerationTerminalPurposeConsumer[];
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

  static async create(configuration: {
    pool: Pool;
    migration: { version: string; checksum: string };
    /** The actual W8 reviewed0177 receipt, not a claimed callback result. */
    denialMigration: { version: string; checksum: string };
    assertAllowed: GenerationRestriction;
    assertDiscoveryAllowed: (client: PoolClient) => Promise<void>;
    /** Only activated, individually reviewed narrow entrypoints. Empty by
     * default; a migration receipt alone does not authorize an executable. */
    consumers?: readonly GenerationPurposeConsumer[];
    /** Separate fixed settlement registry. No original-scope grant is added. */
    terminalConsumers?: readonly GenerationTerminalPurposeConsumer[];
  }): Promise<GenerationIdentityAuthority> {
    const input = Object.freeze({
      ...configuration,
      migration: Object.freeze({ ...configuration.migration }),
      denialMigration: Object.freeze({ ...configuration.denialMigration }),
    });
    if (
      input.migration.version !== GENERATION_SCOPE_MIGRATION ||
      !Hash.safeParse(input.migration.checksum).success ||
      input.denialMigration.version !== "0177_w8_generation_worker_denial" ||
      !Hash.safeParse(input.denialMigration.checksum).success ||
      typeof input.assertAllowed !== "function" ||
      typeof input.assertDiscoveryAllowed !== "function"
    )
      throw new DomainError(
        "generation_scope_unconfigured",
        "Current generation purpose authority is not configured.",
        503,
      );
    let consumers: GenerationPurposeConsumer[];
    let terminalConsumers: GenerationTerminalPurposeConsumer[];
    try {
      consumers = z
        .array(consumerSchema)
        .max(32)
        .parse(input.consumers ?? []);
      terminalConsumers = z
        .array(terminalConsumerSchema)
        .max(9)
        .parse(input.terminalConsumers ?? []);
      const combined = [...consumers, ...terminalConsumers];
      if (
        new Set(combined.map((consumer) => consumer.signature)).size !==
          combined.length ||
        consumers.some(
          (consumer) =>
            consumer.owner === "creator_generation_authority" ||
            consumer.owner === "creator_generation_worker" ||
            consumer.migration.version === input.migration.version ||
            consumer.migration.version === input.denialMigration.version ||
            terminalContracts.some(
              (contract) =>
                consumer.owner === contract.owner ||
                consumer.migration.version === contract.version ||
                contract.signatures.some(
                  (signature) => signature === consumer.signature,
                ),
            ),
        ) ||
        terminalConsumers.some(
          (consumer) => !reviewedTerminalConsumer(consumer),
        ) ||
        (terminalConsumers.length > 0 &&
          terminalContracts[0].signatures.some(
            (signature) =>
              !terminalConsumers.some(
                (consumer) => consumer.signature === signature,
              ),
          ))
      )
        throw new Error(
          "Generation consumers require distinct reviewed custody",
        );
      await assertGenerationCatalogue(input.pool, {
        ...input,
        consumers,
        terminalConsumers,
      });
    } catch {
      throw new DomainError(
        "generation_scope_unconfigured",
        "The reviewed generation purpose authority is not installed.",
        503,
      );
    }
    const frozenConsumers = Object.freeze(
      consumers.map((consumer) =>
        Object.freeze({
          ...consumer,
          migration: Object.freeze({ ...consumer.migration }),
        }),
      ),
    );
    const frozenTerminalConsumers = Object.freeze(
      terminalConsumers.map((consumer) =>
        Object.freeze({
          ...consumer,
          migration: Object.freeze({ ...consumer.migration }),
        }),
      ),
    );
    return new GenerationIdentityAuthority(input.pool, {
      catalogue: Object.freeze({
        migration: Object.freeze({ ...input.migration }),
        denialMigration: Object.freeze({ ...input.denialMigration }),
        consumers: frozenConsumers,
        terminalConsumers: frozenTerminalConsumers,
      }),
      assertAllowed: input.assertAllowed,
      assertDiscoveryAllowed: input.assertDiscoveryAllowed,
      consumers: frozenConsumers,
      terminalConsumers: frozenTerminalConsumers,
    });
  }

  /** Preparation only: a distinct purpose may use an executable only when
   * this exact worker credential already qualified its actual definition. */
  assertConsumerRegistered(consumer: GenerationPurposeConsumer): void {
    if (
      !this.configuration.consumers.some(
        (registered) => canonical(registered) === canonical(consumer),
      )
    )
      throw new DomainError(
        "generation_scope_unconfigured",
        "The exact worker purpose consumer is not registered.",
        503,
      );
  }

  assertTerminalConsumerRegistered(
    consumer: GenerationTerminalPurposeConsumer,
  ): void {
    if (
      !terminalConsumerSchema.safeParse(consumer).success ||
      !reviewedTerminalConsumer(consumer) ||
      !this.configuration.terminalConsumers.some(
        (registered) => canonical(registered) === canonical(consumer),
      )
    )
      throw new DomainError(
        "generation_terminal_unconfigured",
        "The exact original settlement consumer is not registered.",
        503,
      );
  }

  private assertWorker(): void {
    invariant(
      !requestAuthority.getStore(),
      "generation_worker_required",
      "Generation workers cannot substitute for an interactive session.",
    );
  }

  async assertCatalogueInTransaction(client: PoolClient): Promise<void> {
    this.assertWorker();
    // Refuse an implicit statement transaction; this is a caller-held proof.
    await client.query("SAVEPOINT w1_generation_catalogue");
    await client.query("RELEASE SAVEPOINT w1_generation_catalogue");
    try {
      await assertGenerationCatalogue(client, this.configuration.catalogue);
    } catch {
      throw new DomainError(
        "generation_scope_unconfigured",
        "The current reviewed generation catalogue is unavailable.",
        503,
      );
    }
  }

  private async begin(client: PoolClient): Promise<void> {
    await client.query(
      `SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','1000',true),
       set_config('idle_in_transaction_session_timeout','5000',true),
       set_config('app.account_id','',true),set_config('app.identity_session_id','',true),
       set_config('app.creator_id','',true),set_config('app.fan_id','',true),set_config('generation.scope_nonce','',true)`,
    );
    await this.assertCatalogueInTransaction(client);
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
  async pendingTasks(
    limit = 20,
    signal?: AbortSignal,
  ): Promise<readonly string[]> {
    this.assertWorker();
    const bounded = z.int().min(1).max(64).parse(limit);
    try {
      return await generationTransaction(this.pool, signal, async (client) => {
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
        await this.assertCatalogueInTransaction(client);
        return ids;
      });
    } catch (error) {
      return this.failure(error);
    }
  }

  /** The server chooses a fresh token for each claim; a known job ID alone
   * never supplies acceptance, current session or generation permission. */
  async claimTask(
    generationId: string,
    signal?: AbortSignal,
  ): Promise<GenerationTask | null> {
    this.assertWorker();
    const intent = Object.freeze({
      generationId: z.uuid().parse(generationId),
      workerToken: randomUUID(),
    });
    try {
      return await generationTransaction(this.pool, signal, async (client) => {
        await this.begin(client);
        await this.configuration.assertAllowed(client, intent);
        const proof = (
          await client.query<{ proof: unknown }>(
            "SELECT creator.claim_generation_task($1,$2) AS proof",
            [intent.generationId, intent.workerToken],
          )
        ).rows[0]?.proof;
        if (proof == null) {
          await this.assertCatalogueInTransaction(client);
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
        await this.assertCatalogueInTransaction(client);
        return task;
      });
    } catch (error) {
      return this.failure(error);
    }
  }

  /** A fresh, bounded transaction for each admission/context/output/memory
   * stage. Provider I/O must happen after this transaction commits. */
  async withGeneration<T>(
    input: GenerationTask,
    work: (client: PoolClient, scope: GenerationTaskScope) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    this.assertWorker();
    const task = Object.freeze(taskSchema.parse(input));
    let scope: GenerationTaskScope | undefined;
    let held: GenerationScopeBinding | undefined;
    try {
      return await generationTransaction(this.pool, signal, async (client) => {
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
          const { lastSequence: currentSequence, ...currentIntent } =
            proof.task;
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
          held = { client, nonce: proof.nonce, ...binding, current: scope };
          this.issued.set(scope, held);
          await this.authorizeInTransaction(scope, client);
          const value = await work(client, scope);
          await this.configuration.assertAllowed(client, held.current);
          await this.authorizeInTransaction(held.current, client);
          await client.query("SELECT creator.end_generation_scope()");
          this.issued.delete(held.current);
          await this.assertCatalogueInTransaction(client);
          return value;
        } finally {
          if (scope) this.issued.delete(scope);
          if (held) this.issued.delete(held.current);
        }
      });
    } catch (error) {
      return this.failure(error);
    }
  }

  /** Issue the updated immutable view only after the real W3 writer refreshed
   * the original SQL task. A frame/cast alone cannot advance a cursor. Prior
   * committed idempotent output already has its current view and must not use
   * this own +1 port. Original nonce/fullXID/PID/intent/deadline stay unchanged.
   */
  async refreshAfterOutput(
    scope: GenerationTaskScope,
    client: PoolClient,
    input: GenerationOutputCursor,
  ): Promise<GenerationTaskScope> {
    await this.authorizeInTransaction(scope, client);
    const binding = this.issued.get(scope)!;
    const output = outputCursorSchema.parse(input);
    invariant(
      output.generationId === scope.generationId &&
        output.messageId === scope.aiMessageId &&
        output.sequence === scope.lastSequence + 1,
      "generation_output_cursor_changed",
      "Use the actual next original sentence cursor.",
    );
    const migration = await registeredMigration(generationOutputCursorSource);
    const consumer = this.configuration.consumers.find(
      (entry) =>
        entry.signature === generationOutputCursorSignature &&
        entry.owner === "creator_generation_cursor_authority" &&
        entry.migration.version === migration?.version &&
        entry.migration.checksum === migration?.checksum,
    );
    if (!migration || !consumer)
      throw new DomainError(
        "generation_output_cursor_unconfigured",
        "The reviewed original output cursor is unavailable.",
        503,
      );
    this.assertConsumerRegistered(consumer);
    await this.configuration.assertAllowed(client, scope);
    await assertGenerationOutputCursorCatalogue(client);
    const proof = z
      .strictObject({
        nonce: z.uuid(),
        task: taskSchema,
        ...outputCursorSchema.shape,
      })
      .parse(
        (
          await client.query<{ proof: unknown }>(
            "SELECT creator.generation_output_cursor_view($1,$2,$3,$4) AS proof",
            [
              scope.generationId,
              scope.workerToken,
              output.sequence,
              output.cursor,
            ],
          )
        ).rows[0]?.proof,
      );
    const nextSequence = proof.task.lastSequence;
    invariant(
      binding.current === scope &&
        this.issued.get(scope) === binding &&
        proof.nonce === binding.nonce &&
        scope.lastSequence + 1 === nextSequence &&
        nextSequence === output.sequence &&
        proof.generationId === output.generationId &&
        proof.messageId === output.messageId &&
        proof.sequence === output.sequence &&
        proof.cursor === output.cursor &&
        canonical({ ...scope, lastSequence: nextSequence }) ===
          canonical({ ...proof.task, kind: scope.kind }),
      "generation_output_cursor_changed",
      "The original output or purpose binding changed.",
    );
    const current = Object.freeze({
      ...proof.task,
      [generationBrand]: true as const,
      kind: "generation" as const,
    });
    this.issued.delete(scope);
    binding.current = current;
    this.issued.set(current, binding);
    await this.authorizeInTransaction(current, client);
    await this.configuration.assertAllowed(client, current);
    return current;
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
      binding?.client === client && binding.current === scope,
      "generation_scope_required",
      "Use the current generation purpose transaction.",
    );
    await this.assertCatalogueInTransaction(client);
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

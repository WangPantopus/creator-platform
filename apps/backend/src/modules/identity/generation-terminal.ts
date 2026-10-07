import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { canonical } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import {
  GenerationIdentityAuthority,
  type GenerationTask,
} from "./generation-scope.js";
import { requestAuthority } from "./request-authority.js";
import { assertGenerationLifecycleCatalogue } from "./generation-lifecycle.js";
import {
  assertGenerationPoolCustody,
  generationTransaction,
} from "./generation-transaction.js";
import {
  assertGenerationTerminalDiscoveryCatalogue,
  generationTerminalDiscoveryConsumer,
} from "./generation-terminal-discovery.js";

export const GENERATION_TERMINAL_MIGRATION =
  "0183_w1_generation_terminal_scope";
export const GENERATION_TERMINAL_DENIAL_MIGRATION =
  "0184_w8_generation_terminal_denial";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Instant = z.iso
  .datetime({ offset: true })
  .transform((s) => new Date(s).toISOString());
const terminalTask = z.strictObject({
  generationId: z.uuid(),
  threadId: z.uuid(),
  creatorId: z.uuid(),
  fanId: z.uuid(),
  initiatingAccountId: z.uuid(),
  initiatingSessionId: z.uuid(),
  acceptanceTransaction: z.string().regex(/^[0-9]+$/u),
  adultVerifiedAt: Instant,
  creatorAccountId: z.uuid(),
  fanMessageId: z.uuid(),
  aiMessageId: z.uuid(),
  grantId: z.uuid(),
  reservationId: z.uuid().nullable(),
  epoch: z.int().nonnegative(),
  contextRevision: z.int().nonnegative().nullable(),
  lastSequence: z.int().nonnegative(),
  originalWorkerToken: z.uuid().nullable(),
  originalLeaseUntil: Instant.nullable(),
  sourceState: z.enum(["queued", "generating"]),
  targetState: z.enum(["delivered", "interrupted", "failed"]),
  threadRevision: z.int().nonnegative(),
  processorConsentVersion: z.string().min(1).max(2000).nullable(),
  originalMessageState: z.enum(["accepted", "generating"]),
});
const terminalBrand: unique symbol = Symbol("GenerationTerminalScope");
const terminalCandidateSchema = z.strictObject({
  generationId: z.uuid(),
  lastSequence: z.int().min(0).max(2_147_483_647),
});
/** Observation only. withTerminal rechecks this exact original cursor. */
export type GenerationTerminalCandidate = Readonly<
  z.infer<typeof terminalCandidateSchema>
>;
export type GenerationTerminalScope = Readonly<
  z.infer<typeof terminalTask> & {
    [terminalBrand]: true;
    kind: "generation_terminal";
    mode: "completion" | "reconciliation";
    custodyToken: string;
  }
>;
const Owner = "creator_generation_terminal_authority";
const Executables = [
  "creator.pending_generation_terminals(integer)",
  "creator.begin_generation_terminal(uuid,uuid,text,uuid,integer,boolean)",
  "creator.generation_terminal_matches(uuid,uuid,boolean)",
  "creator.end_generation_terminal()",
] as const;
const Definitions = [
  ...Executables,
  "creator.capture_generation_terminal()",
  "creator.require_generation_terminal_cleanup()",
] as const;
type Definition = (typeof Definitions)[number];
const MetadataColumns: Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
> = {
  "creator.generation": {
    SELECT: [
      "id",
      "thread_id",
      "creator_id",
      "fan_id",
      "fan_message_id",
      "ai_message_id",
      "grant_id",
      "reservation_id",
      "epoch",
      "last_sequence",
      "state",
      "context_revision",
      "accepted_at",
      "worker_token",
      "lease_until",
      "completed_at",
      "initiating_account_id",
      "initiating_session_id",
      "initiating_adult_verified_at",
      "acceptance_transaction",
    ],
    UPDATE: ["id"],
  },
  "creator.thread": {
    SELECT: [
      "id",
      "creator_id",
      "fan_id",
      "control",
      "control_epoch",
      "revision",
      "processor_consent_version",
      "deleted_at",
    ],
    UPDATE: ["id"],
  },
  "creator.creator_profile": {
    SELECT: ["id", "account_id", "verification", "recovery_required"],
    UPDATE: ["id"],
  },
  "creator.fan_profile": { SELECT: ["id", "account_id"], UPDATE: ["id"] },
  "creator.identity_session": {
    SELECT: ["id", "account_id", "expires_at", "revoked_at"],
    UPDATE: ["id"],
  },
  "creator.message": {
    SELECT: [
      "id",
      "thread_id",
      "creator_id",
      "fan_id",
      "author_kind",
      "author_account_id",
      "delivery_state",
    ],
  },
  "creator.processor_consent": {
    SELECT: [
      "id",
      "thread_id",
      "creator_id",
      "fan_id",
      "account_id",
      "version",
      "withdrawn_at",
    ],
    UPDATE: ["id"],
  },
  "creator.generation_terminal_scope": {
    SELECT: [
      "id",
      "transaction_id",
      "backend_pid",
      "login_name",
      "generation_id",
      "custody_token",
      "mode",
      "task",
      "transitioned",
      "finalized",
      "created_at",
    ],
    INSERT: [
      "id",
      "transaction_id",
      "backend_pid",
      "login_name",
      "generation_id",
      "custody_token",
      "mode",
      "task",
      "transitioned",
      "finalized",
      "created_at",
    ],
    UPDATE: ["task", "transitioned", "finalized"],
  },
};

/** Separate original-work settlement permission. No ThreadScope, Actor, text
 * context, memory proposal, positive input read or provider admission is issued.
 * W2/W3/W4 fixed consumers receive this actual held client and branded object.
 */
type TerminalCatalogue = Readonly<{
  migration: Readonly<{ version: string; checksum: string }>;
  denialMigration: Readonly<{ version: string; checksum: string }>;
  denialDefinitionChecksum: string;
  definitions: Readonly<Record<Definition, string>>;
}>;

/** Reuse the complete reviewed factory proof on the caller's current client.
 * Construction-time approval cannot survive a live owner/ACL/function drift. */
async function assertTerminalCatalogue(
  query: Pick<Pool, "query">,
  input: TerminalCatalogue,
): Promise<void> {
  await assertGenerationLifecycleCatalogue(query);
  const ready = (
    await query.query<{ ready: boolean }>(
      `SELECT session_user='creator_generation_worker' AND current_user=session_user
       AND (SELECT count(*)=2 FROM creator.schema_migration
        WHERE (version=$1 AND checksum=$2) OR (version=$3 AND checksum=$4))
       AND EXISTS(SELECT FROM pg_roles r WHERE r.rolname=$5 AND NOT r.rolcanlogin
        AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit AND NOT r.rolcreatedb
        AND NOT r.rolcreaterole AND NOT r.rolreplication AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
        AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
        AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid
         AND setdatabase IN(0,(SELECT oid FROM pg_database WHERE datname=current_database())))
        AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
        AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid))
       AND (SELECT count(*)=6 FROM pg_proc WHERE proowner=(SELECT oid FROM pg_roles WHERE rolname=$5))
       AND EXISTS(SELECT FROM pg_class WHERE oid=to_regclass('creator.generation_terminal_scope')
        AND relkind='r' AND relrowsecurity AND relforcerowsecurity AND pg_get_userbyid(relowner)='creator_owner')
       AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
         AND c.oid<>to_regclass('creator.generation_terminal_scope')
         AND CASE WHEN c.relkind IN('r','p','v','m','f')
          THEN has_table_privilege($5,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') ELSE false END)
       AND NOT has_table_privilege($5,'creator.generation_terminal_scope','UPDATE,TRUNCATE,REFERENCES,TRIGGER')
       AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
         AND CASE WHEN c.relkind='S' THEN has_sequence_privilege($5,c.oid,'USAGE,SELECT,UPDATE') ELSE false END)
       AND NOT EXISTS(SELECT FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
        AND has_schema_privilege($5,n.oid,'CREATE'))
       AND NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
         AND p.proowner<>(SELECT oid FROM pg_roles WHERE rolname=$5)
         AND p.oid NOT IN(to_regprocedure('creator.generation_scope_matches(uuid,uuid)'),
          to_regprocedure('creator_trust.generation_terminal_denial(uuid)'))
         AND ((p.prosecdef AND has_function_privilege($5,p.oid,'EXECUTE'))
          OR EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
           WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$5) AND a.privilege_type='EXECUTE')))
       AND NOT EXISTS(SELECT FROM pg_attribute a WHERE a.attrelid=to_regclass('creator.generation_terminal_scope')
        AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(session_user,a.attrelid,a.attnum,'SELECT,INSERT,UPDATE,REFERENCES'))
       AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
        CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) AS privilege
        WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
         AND CASE WHEN c.relkind IN('r','p','v','m','f') THEN has_column_privilege($5,c.oid,a.attnum,privilege) ELSE false END
         AND NOT coalesce(($6::jsonb->(n.nspname||'.'||c.relname)->privilege) ? a.attname,false))
       AND NOT has_column_privilege($5,'creator.message','text','SELECT')
       AND NOT has_column_privilege($5,'creator.memory','text','SELECT')
       AND NOT has_column_privilege($5,'creator.identity_session','token_hash','SELECT')
       AND NOT has_column_privilege($5,'creator.identity_session','upstream_cipher','SELECT')
       AND NOT has_column_privilege($5,'creator.ai_version','configuration','SELECT')
       AND NOT has_column_privilege($5,'creator.ai_workspace','interview','SELECT')
       AND NOT has_column_privilege($5,'creator.signed_act','assertion','SELECT')
       AND NOT has_column_privilege($5,'creator.passkey_credential','public_key','SELECT')
       AND EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure('creator_trust.generation_terminal_denial(uuid)')
        AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog']
        AND pg_get_userbyid(p.proowner)='creator_trust_denial'
        AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
         WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
       AND has_function_privilege($5,to_regprocedure('creator_trust.generation_terminal_denial(uuid)'),'EXECUTE')
       AND NOT has_function_privilege(session_user,to_regprocedure('creator_trust.generation_terminal_denial(uuid)'),'EXECUTE')
       AND EXISTS(SELECT FROM pg_trigger WHERE tgname='generation_terminal_transition' AND tgenabled='O'
        AND tgrelid=to_regclass('creator.generation') AND tgfoid=to_regprocedure('creator.capture_generation_terminal()'))
       AND EXISTS(SELECT FROM pg_trigger WHERE tgname='require_generation_terminal_cleanup' AND tgenabled='O'
        AND tgrelid=to_regclass('creator.generation_terminal_scope') AND tgdeferrable AND tginitdeferred
        AND tgfoid=to_regprocedure('creator.require_generation_terminal_cleanup()')) AS ready`,
      [
        input.migration.version,
        input.migration.checksum,
        input.denialMigration.version,
        input.denialMigration.checksum,
        Owner,
        JSON.stringify(MetadataColumns),
      ],
    )
  ).rows[0]?.ready;
  if (ready !== true)
    throw new DomainError(
      "generation_terminal_unconfigured",
      "Current original settlement catalogue is unavailable.",
      503,
    );
  const denial = (
    await query.query<{ definition: string }>(
      "SELECT pg_get_functiondef(to_regprocedure('creator_trust.generation_terminal_denial(uuid)')) AS definition",
    )
  ).rows[0]?.definition;
  if (
    !denial ||
    createHash("sha256").update(denial).digest("hex") !==
      input.denialDefinitionChecksum
  )
    throw new DomainError(
      "generation_terminal_unconfigured",
      "Current original settlement catalogue is unavailable.",
      503,
    );
  for (const signature of Definitions) {
    const proof = (
      await query.query<{ ready: boolean; definition: string }>(
        `SELECT p.prosecdef AND p.provolatile IN('s','v') AND p.prokind='f'
         AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)=$2
         AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS ready,
         pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.oid=to_regprocedure($1)`,
        [signature, Owner],
      )
    ).rows[0];
    if (
      proof?.ready !== true ||
      createHash("sha256").update(proof.definition).digest("hex") !==
        Hash.parse(input.definitions[signature])
    )
      throw new DomainError(
        "generation_terminal_unconfigured",
        "Current original settlement catalogue is unavailable.",
        503,
      );
  }
}

export class GenerationTerminalAuthority {
  private readonly issued = new WeakMap<
    GenerationTerminalScope,
    { client: PoolClient; nonce: string; transaction: string; pid: number }
  >();
  private constructor(
    private readonly pool: Pool,
    private readonly configuration: Readonly<{
      catalogue: TerminalCatalogue;
      generation: GenerationIdentityAuthority;
      assertRestoredInTransaction: (client: PoolClient) => Promise<void>;
      /** Real prepared journal + original cost/reservation owner ports. Unknown
       * cost retains the original ceiling; absence never means zero/no_request. */
      assertSettledInTransaction: (
        client: PoolClient,
        scope: GenerationTerminalScope,
      ) => Promise<void>;
    }>,
  ) {}

  assertPool(pool: Pool): void {
    if (pool !== this.pool) this.unconfigured();
  }
  assertGeneration(identity: GenerationIdentityAuthority): void {
    if (identity !== this.configuration.generation) this.unconfigured();
  }

  private unconfigured(cause?: unknown): never {
    const failure = new DomainError(
      "generation_terminal_unconfigured",
      "Reviewed generation settlement authority is unavailable.",
      503,
      { cause },
    );
    throw failure;
  }
  static async create(configuration: {
    pool: Pool;
    generation: GenerationIdentityAuthority;
    migration: { version: string; checksum: string };
    denialMigration: { version: string; checksum: string };
    denialDefinitionChecksum: string;
    /** SHA256 of actual pg_get_functiondef after reviewed closed installation. */
    definitions: Readonly<Record<Definition, string>>;
    assertRestoredInTransaction: (client: PoolClient) => Promise<void>;
    assertSettledInTransaction: (
      client: PoolClient,
      scope: GenerationTerminalScope,
    ) => Promise<void>;
  }): Promise<GenerationTerminalAuthority> {
    assertGenerationPoolCustody(configuration.pool);
    const input = Object.freeze({
      ...configuration,
      migration: Object.freeze({ ...configuration.migration }),
      denialMigration: Object.freeze({ ...configuration.denialMigration }),
      definitions: Object.freeze({ ...configuration.definitions }),
    });
    const unavailable = (cause: unknown) => {
      const failure = new DomainError(
        "generation_terminal_unconfigured",
        "The original generation settlement custody is not installed.",
        503,
        { cause },
      );
      throw failure;
    };
    try {
      invariant(
        input.generation instanceof GenerationIdentityAuthority &&
          input.migration.version === GENERATION_TERMINAL_MIGRATION &&
          Hash.safeParse(input.migration.checksum).success &&
          input.denialMigration.version ===
            GENERATION_TERMINAL_DENIAL_MIGRATION &&
          Hash.safeParse(input.denialMigration.checksum).success &&
          Hash.safeParse(input.denialDefinitionChecksum).success &&
          typeof input.assertRestoredInTransaction === "function" &&
          typeof input.assertSettledInTransaction === "function" &&
          Object.keys(input.definitions).length === Definitions.length,
        "generation_terminal_unconfigured",
        "Exact generation settlement custody is required.",
      );
      input.generation.assertPool(input.pool);
      for (const signature of Executables)
        input.generation.assertTerminalConsumerRegistered({
          purpose: "generation_terminal",
          migration: input.migration,
          signature,
          owner: Owner,
          definitionChecksum: Hash.parse(input.definitions[signature]),
        });
      await assertTerminalCatalogue(input.pool, input);
    } catch (cause) {
      unavailable(cause);
    }
    return new GenerationTerminalAuthority(input.pool, {
      generation: input.generation,
      catalogue: Object.freeze({
        migration: input.migration,
        denialMigration: input.denialMigration,
        denialDefinitionChecksum: input.denialDefinitionChecksum,
        definitions: input.definitions,
      }),
      assertRestoredInTransaction: input.assertRestoredInTransaction,
      assertSettledInTransaction: input.assertSettledInTransaction,
    });
  }

  private async assertCatalogue(client: PoolClient): Promise<void> {
    try {
      await this.configuration.generation.assertCatalogueInTransaction(client);
      await assertTerminalCatalogue(client, this.configuration.catalogue);
    } catch (cause) {
      this.unconfigured(cause);
    }
  }

  private assertWorker(): void {
    invariant(
      !requestAuthority.getStore(),
      "generation_terminal_worker_required",
      "An interactive session cannot substitute for original settlement custody.",
    );
  }
  private async begin(client: PoolClient): Promise<void> {
    await client.query(
      `SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','1000',true),
       set_config('idle_in_transaction_session_timeout','5000',true),
       set_config('app.account_id','',true),set_config('app.identity_session_id','',true),
       set_config('app.creator_id','',true),set_config('app.fan_id','',true),
       set_config('generation.scope_nonce','',true),set_config('generation.terminal_nonce','',true)`,
    );
    await this.configuration.assertRestoredInTransaction(client);
    await this.assertCatalogue(client);
  }

  private failure(error: unknown): never {
    if (error instanceof z.ZodError) this.unconfigured();
    if (error && typeof error === "object" && "code" in error) {
      if (String(error.code) === "42501")
        throw new DomainError(
          "generation_terminal_denied",
          "Original generation settlement is denied.",
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
          "generation_terminal_unavailable",
          "Original generation settlement is unavailable. Try again.",
          503,
        );
    }
    throw error;
  }

  async pendingTerminals(
    limit = 20,
    signal?: AbortSignal,
  ): Promise<readonly string[]> {
    this.assertWorker();
    const n = z.int().min(1).max(64).parse(limit);
    try {
      return await generationTransaction(this.pool, signal, async (client) => {
        await this.begin(client);
        const result = await client.query<{ id: unknown }>(
          "SELECT creator.pending_generation_terminals($1) AS id",
          [n],
        );
        const ids = z
          .array(z.uuid())
          .max(n)
          .parse(result.rows.map((r) => r.id));
        await this.configuration.assertRestoredInTransaction(client);
        await this.assertCatalogue(client);
        return Object.freeze(ids);
      });
    } catch (error) {
      return this.failure(error);
    }
  }

  async pendingTerminalCursors(
    limit = 20,
    signal?: AbortSignal,
  ): Promise<readonly GenerationTerminalCandidate[]> {
    this.assertWorker();
    const n = z.int().min(1).max(64).parse(limit);
    try {
      this.configuration.generation.assertTerminalConsumerRegistered(
        generationTerminalDiscoveryConsumer,
      );
      return await generationTransaction(this.pool, signal, async (client) => {
        await this.begin(client);
        await assertGenerationTerminalDiscoveryCatalogue(client);
        const result = await client.query<{
          generationId: unknown;
          lastSequence: unknown;
        }>(
          'SELECT generation_id AS "generationId",last_sequence AS "lastSequence" FROM creator.pending_generation_terminal_cursors($1)',
          [n],
        );
        const candidates = z
          .array(terminalCandidateSchema)
          .max(n)
          .parse(result.rows);
        invariant(
          new Set(candidates.map((candidate) => candidate.generationId))
            .size === candidates.length,
          "generation_terminal_discovery_changed",
          "The original terminal candidate metadata changed.",
        );
        await this.configuration.assertRestoredInTransaction(client);
        await this.assertCatalogue(client);
        await assertGenerationTerminalDiscoveryCatalogue(client);
        return Object.freeze(
          candidates.map((candidate) => Object.freeze(candidate)),
        );
      });
    } catch (error) {
      return this.failure(error);
    }
  }

  /** Successful zero-output completion is deliberately rejected by SQL. The
   * caller must supply its exact observed cursor, never re-read/produce text. */
  async withTerminal<T>(
    intent:
      | {
          mode: "completion";
          task: GenerationTask;
          lastSequence: number;
          failed: boolean;
        }
      | { mode: "reconciliation"; generationId: string; lastSequence: number },
    work: (client: PoolClient, scope: GenerationTerminalScope) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    this.assertWorker();
    const mode = intent.mode;
    const generationId = z
      .uuid()
      .parse(
        mode === "completion" ? intent.task.generationId : intent.generationId,
      );
    const sequence = z
      .int()
      .min(0)
      .max(2_147_483_647)
      .parse(intent.lastSequence);
    const custodyToken = randomUUID();
    let scope: GenerationTerminalScope | undefined;
    try {
      return await generationTransaction(this.pool, signal, async (client) => {
        try {
          await this.begin(client);
          const raw = (
            await client.query<{ proof: unknown }>(
              "SELECT creator.begin_generation_terminal($1,$2,$3,$4,$5,$6) AS proof",
              [
                generationId,
                custodyToken,
                mode,
                mode === "completion" ? intent.task.workerToken : null,
                sequence,
                mode === "completion" ? intent.failed : true,
              ],
            )
          ).rows[0]?.proof;
          const proof = z
            .strictObject({
              nonce: z.uuid(),
              mode: z.enum(["completion", "reconciliation"]),
              custodyToken: z.uuid(),
              task: terminalTask,
            })
            .parse(raw);
          invariant(
            proof.mode === mode &&
              proof.custodyToken === custodyToken &&
              proof.task.generationId === generationId &&
              proof.task.lastSequence === sequence,
            "generation_terminal_changed",
            "The original settlement cursor changed.",
          );
          if (mode === "completion") {
            const expected = intent.task;
            for (const field of [
              "threadId",
              "creatorId",
              "fanId",
              "initiatingAccountId",
              "initiatingSessionId",
              "creatorAccountId",
              "fanMessageId",
              "aiMessageId",
              "grantId",
              "reservationId",
              "epoch",
              "contextRevision",
              "processorConsentVersion",
            ] as const)
              invariant(
                canonical(proof.task[field]) === canonical(expected[field]),
                "generation_terminal_changed",
                "The original generation family changed.",
              );
            invariant(
              proof.task.originalWorkerToken === expected.workerToken &&
                proof.task.originalLeaseUntil ===
                  new Date(expected.leaseUntil).toISOString(),
              "generation_terminal_changed",
              "The original generation lease changed.",
            );
          }
          scope = Object.freeze({
            ...proof.task,
            mode,
            custodyToken,
            kind: "generation_terminal" as const,
            [terminalBrand]: true as const,
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
          await this.configuration.assertSettledInTransaction(client, scope);
          await this.configuration.assertRestoredInTransaction(client);
          await this.authorizeInTransaction(scope, client, true);
          await client.query("SELECT creator.end_generation_terminal()");
          await this.assertCatalogue(client);
          this.issued.delete(scope);
          return value;
        } finally {
          if (scope) this.issued.delete(scope);
        }
      });
    } catch (error) {
      return this.failure(error);
    }
  }

  async authorizeInTransaction(
    scope: GenerationTerminalScope,
    client: PoolClient,
    finalCheck = false,
  ): Promise<void> {
    this.assertWorker();
    const binding = this.issued.get(scope);
    invariant(
      binding?.client === client,
      "generation_terminal_required",
      "Use the original settlement transaction and scope.",
    );
    await this.assertCatalogue(client);
    const row = (
      await client.query<{
        allowed: boolean;
        nonce: string;
        transaction: string;
        pid: number;
      }>(
        `SELECT creator.generation_terminal_matches($1,$2,$3) AS allowed,
       current_setting('generation.terminal_nonce',true) AS nonce,
       pg_current_xact_id_if_assigned()::text AS transaction,pg_backend_pid() AS pid`,
        [scope.generationId, scope.custodyToken, z.boolean().parse(finalCheck)],
      )
    ).rows[0];
    invariant(
      row?.allowed === true &&
        row.nonce === binding.nonce &&
        row.transaction === binding.transaction &&
        row.pid === binding.pid,
      "generation_terminal_changed",
      "The original settlement authority ended or changed.",
    );
  }
}

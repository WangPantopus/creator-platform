import { createHash } from "node:crypto";
import { Client, type Pool, type PoolClient } from "pg";
import { z } from "zod";
import { FrameSchema, type Frame } from "@qelvora/api";
import { canonical } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import {
  GenerationIdentityAuthority,
  type GenerationPurposeConsumer,
} from "../identity/generation-scope.js";
import {
  GenerationTerminalAuthority,
  type GenerationTerminalScope,
} from "../identity/generation-terminal.js";

export const GENERATION_FINALIZATION_MIGRATION =
  "0110_w3_generation_terminal_finalization";
export const GENERATION_FINALIZATION_SIGNATURE =
  "creator.generation_conversation_terminal(uuid,uuid)";
const Owner = "creator_w3_generation_terminal";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Columns = {
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
  },
  "creator.generation": {
    SELECT: [
      "id",
      "thread_id",
      "creator_id",
      "fan_id",
      "state",
      "last_sequence",
      "ai_message_id",
    ],
    UPDATE: ["state", "completed_at", "worker_token", "lease_until"],
  },
  "creator.message": {
    SELECT: [
      "id",
      "thread_id",
      "creator_id",
      "fan_id",
      "author_kind",
      "delivery_state",
    ],
    UPDATE: ["delivery_state"],
  },
  "creator.thread": {
    SELECT: ["id", "creator_id", "fan_id", "event_cursor"],
    UPDATE: ["event_cursor"],
  },
  "creator.event": {
    INSERT: [
      "thread_id",
      "creator_id",
      "fan_id",
      "cursor",
      "type",
      "payload",
      "actor_account_id",
    ],
  },
} as const;

/** Fixed original-output finalization only. The actual terminal issuer owns
 * COMMIT and separately requires genuine W2/W4 settlement on this client.
 * No ThreadScope, Actor, context, provider call or financial result is issued.
 */
export class PreparedGenerationConversationTerminal {
  private constructor(
    private readonly terminal: GenerationTerminalAuthority,
    private readonly hostPool: Pool,
  ) {}

  assertHostPool(pool: Pool): void {
    invariant(
      pool === this.hostPool,
      "generation_finalization_pool_mismatch",
      "Use this finalization consumer's canonical conversation host.",
    );
  }

  static async prepare(input: {
    identity: GenerationIdentityAuthority;
    terminal: GenerationTerminalAuthority;
    workerPool: Pool;
    hostPool: Pool;
    /** Actual independently reviewed source/install definition, not a hash
     * obtained from an unreviewed database and accepted as its own approval. */
    consumer: GenerationPurposeConsumer;
  }): Promise<PreparedGenerationConversationTerminal> {
    invariant(
      input.identity instanceof GenerationIdentityAuthority &&
        input.terminal instanceof GenerationTerminalAuthority,
      "generation_finalization_unconfigured",
      "Genuine original-generation identity and terminal issuers are required.",
    );
    input.identity.assertPool(input.workerPool);
    input.terminal.assertPool(input.workerPool);
    input.identity.assertConsumerRegistered(input.consumer);
    const host = new Client(input.hostPool.options);
    const worker = new Client(input.workerPool.options);
    const endpoint = (client: Client) =>
      canonical({
        host: client.host,
        port: client.port,
        database: client.database,
      });
    invariant(
      host.user === "creator_runtime" &&
        worker.user === "creator_generation_worker" &&
        endpoint(host) === endpoint(worker),
      "generation_finalization_pool_mismatch",
      "Use the canonical host and distinct worker on the same actual database.",
    );
    const receipt = input.consumer;
    invariant(
      receipt.signature === GENERATION_FINALIZATION_SIGNATURE &&
        receipt.owner === Owner &&
        receipt.migration.version === GENERATION_FINALIZATION_MIGRATION &&
        Hash.safeParse(receipt.migration.checksum).success &&
        Hash.safeParse(receipt.definitionChecksum).success,
      "generation_finalization_unconfigured",
      "The exact reviewed W3 finalization executable is required.",
    );
    try {
      const row = (
        await input.workerPool.query<{
          ready: boolean;
          definition: string;
          databaseOid: number;
        }>(
          `SELECT (SELECT oid FROM pg_database WHERE datname=current_database()) AS "databaseOid",
           session_user='creator_generation_worker' AND current_user=session_user
           AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
           AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog']
           AND pg_get_userbyid(p.proowner)=$3 AND NOT r.rolcanlogin AND NOT r.rolinherit
           AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole
           AND NOT r.rolreplication AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
           AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
           AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
           AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
           AND (SELECT count(*)=1 FROM pg_proc WHERE proowner=r.oid)
           AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
             AND CASE WHEN c.relkind IN('r','p','v','m','f') THEN
              has_table_privilege($3,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') ELSE false END)
           AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
            CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) AS privilege
            WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
             AND CASE WHEN c.relkind IN('r','p','v','m','f') THEN
              has_column_privilege($3,c.oid,a.attnum,privilege) ELSE false END
             AND NOT coalesce(($5::jsonb->(n.nspname||'.'||c.relname)->privilege) ? a.attname,false))
           AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
             AND CASE WHEN c.relkind='S' THEN
              has_sequence_privilege($3,c.oid,'USAGE,SELECT,UPDATE') ELSE false END)
           AND NOT EXISTS(SELECT FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
            AND has_schema_privilege($3,n.oid,'CREATE'))
           AND NOT EXISTS(SELECT FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
            WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND f.proowner<>r.oid
             AND f.oid NOT IN(to_regprocedure('creator.generation_scope_matches(uuid,uuid)'),
              to_regprocedure('creator.generation_terminal_matches(uuid,uuid,boolean)'))
             AND ((f.prosecdef AND has_function_privilege($3,f.oid,'EXECUTE'))
              OR EXISTS(SELECT FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
               WHERE a.grantee=r.oid AND a.privilege_type='EXECUTE')))
           AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
            WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
           AND has_function_privilege(session_user,p.oid,'EXECUTE')
           AND (SELECT count(*)=5 FROM pg_class c WHERE c.oid=ANY(ARRAY[
            to_regclass('creator.generation_terminal_scope'),to_regclass('creator.generation'),
            to_regclass('creator.message'),to_regclass('creator.thread'),to_regclass('creator.event')])
            AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='creator_owner')
           AND NOT has_column_privilege($3,'creator.message','text','SELECT')
           AND NOT has_column_privilege($3,'creator.message','text','UPDATE')
           AND NOT has_table_privilege($3,'creator.memory','SELECT,INSERT,UPDATE,DELETE')
           AND NOT has_table_privilege($3,'creator.access_grant','SELECT,INSERT,UPDATE,DELETE')
           AS ready,pg_get_functiondef(p.oid) AS definition
           FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=to_regprocedure($4)`,
          [
            receipt.migration.version,
            receipt.migration.checksum,
            Owner,
            receipt.signature,
            JSON.stringify(Columns),
          ],
        )
      ).rows[0];
      const canonicalDatabase = (
        await input.hostPool.query<{ databaseOid: number }>(
          'SELECT oid AS "databaseOid" FROM pg_database WHERE datname=current_database()',
        )
      ).rows[0];
      if (
        row?.ready !== true ||
        row.databaseOid !== canonicalDatabase?.databaseOid ||
        createHash("sha256").update(row.definition).digest("hex") !==
          receipt.definitionChecksum
      )
        throw new Error("Unreviewed W3 terminal executable");
    } catch {
      throw new DomainError(
        "generation_finalization_unconfigured",
        "Reviewed conversation terminal finalization is not installed.",
        503,
      );
    }
    return new PreparedGenerationConversationTerminal(
      input.terminal,
      input.hostPool,
    );
  }

  /** Caller awaits this inside withTerminal, then performs actual original
   * journal/cost settlement. The issuer rejects a missing settlement at COMMIT.
   * Repeating a transition on this scope fails instead of appending a frame.
   */
  async finalizeInTransaction(
    client: PoolClient,
    scope: GenerationTerminalScope,
  ): Promise<Readonly<Frame>> {
    await this.terminal.authorizeInTransaction(scope, client);
    const raw = (
      await client.query<{ frame: unknown }>(
        "SELECT creator.generation_conversation_terminal($1,$2) AS frame",
        [scope.generationId, scope.custodyToken],
      )
    ).rows[0]?.frame;
    let frame: Frame;
    try {
      frame = FrameSchema.parse(raw);
    } catch {
      throw new DomainError(
        "generation_finalization_unavailable",
        "The original conversation finalization is unavailable.",
        503,
      );
    }
    invariant(
      frame.threadId === scope.threadId &&
        frame.epoch === scope.epoch &&
        frame.generationId === scope.generationId &&
        frame.messageId === scope.aiMessageId &&
        frame.sequence === scope.lastSequence &&
        frame.kind ===
          (scope.targetState === "delivered" ? "delivered" : "interrupted") &&
        frame.authorKind === "ai" &&
        frame.text === "" &&
        frame.control === undefined,
      "generation_finalization_changed",
      "The captured original terminal frame changed.",
    );
    await this.terminal.authorizeInTransaction(scope, client, true);
    return Object.freeze(frame);
  }
}

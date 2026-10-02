import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client, type PoolClient } from "pg";
import type { Database } from "../../db/database.js";
import { DomainError, invariant } from "../../core/errors.js";
import { ConversationService } from "../conversation/service.js";
import {
  AccessService,
  assertThreadScope,
  type ThreadScope,
} from "../access/scope.js";
import type { Actor } from "../identity/adapter.js";
import { requestAuthority } from "../identity/request-authority.js";
import type { CallSession } from "../../../../../packages/api/src/session.js";

const prepared = new WeakSet<InteractiveCallControl>();
type DenialMigration = Readonly<{ version: string; checksum: string }>;
const denialPath =
  "apps/backend/migrations/0082_w8_interactive_denial_try_fence.sql";

/** Reservations and manually applied source SQL cannot activate admission. W8
 * may move the version in its ascending packet; the reviewed source path stays. */
async function registeredDenial(): Promise<DenialMigration | undefined> {
  // Source TS and the built server bundle live at different depths. Locate the
  // nearest checked-in registry; a deployment without it stays unavailable.
  let root = dirname(fileURLToPath(import.meta.url));
  let source: string | undefined;
  for (let depth = 0; depth < 8; depth++) {
    try {
      source = await readFile(join(root, "infra/migrations.json"), "utf8");
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = dirname(root);
    if (parent === root) break;
    root = parent;
  }
  if (source === undefined) return undefined;
  const registry = JSON.parse(source) as {
    migrations: {
      version: string;
      owner?: string;
      path: string;
      sourceSha256?: string;
    }[];
  };
  const entries = registry.migrations.filter(
    (entry) => entry.path === denialPath,
  );
  if (entries.length === 0) return undefined;
  const entry = entries[0]!;
  const checksum = createHash("sha256")
    .update(await readFile(join(root, denialPath)))
    .digest("hex");
  invariant(
    entries.length === 1 &&
      entry.owner === "W8" &&
      /^\d{4}_w8_interactive_denial_try_fence$/u.test(entry.version) &&
      entry.sourceSha256 === checksum,
    "call_control_migration_changed",
    "Call control requires W8’s executable reviewed denial migration.",
  );
  return Object.freeze({ version: entry.version, checksum });
}
const roleSQL = `SELECT current_user=session_user AND session_user='creator_runtime'
  AND current_setting('transaction_isolation')='read committed'
  AND r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls
  AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
  AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
  AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
  AND to_regprocedure('creator_trust.interactive_denial(text,uuid,uuid)') IS NOT NULL AS ready
  FROM pg_roles r WHERE r.rolname=session_user`;

/** Interactive request authority only. Neither a provider callback nor an
 * actorless SessionWorker can use this as post-call handback authority. */
export class InteractiveCallControl {
  private constructor(
    private readonly db: Database,
    private readonly access: AccessService,
    private readonly conversation: ConversationService,
    private readonly migration: DenialMigration,
  ) {
    prepared.add(this);
  }
  static async prepare(input: {
    database: Database;
    access: AccessService;
    conversation: ConversationService;
  }): Promise<InteractiveCallControl | undefined> {
    invariant(
      input.access instanceof AccessService &&
        input.conversation instanceof ConversationService &&
        input.access.isForPool(input.database.pool) &&
        input.conversation.isFor(input.database, input.access),
      "call_control_pool_mismatch",
      "Calls require the canonical conversation and access producers.",
    );
    const migration = await registeredDenial();
    if (
      !migration ||
      !input.database.threadScopeInTransactionAvailable ||
      !input.access.threadScopeInTransactionAvailable ||
      (
        await input.database.pool.query<{ ready: boolean }>(roleSQL, [
          migration.version,
          migration.checksum,
        ])
      ).rows[0]?.ready !== true
    )
      return undefined;
    return new InteractiveCallControl(
      input.database,
      input.access,
      input.conversation,
      migration,
    );
  }
  isFor(database: Database) {
    return prepared.has(this) && this.db === database;
  }
  async beforeAdmission(
    client: PoolClient,
    actor: Actor,
    scope: ThreadScope,
    call: Readonly<CallSession>,
    phase: "prepare" | "issue" | "confirm",
  ): Promise<number | null> {
    assertThreadScope(scope);
    const request = requestAuthority.getStore();
    const endpoint = new Client(this.db.pool.options);
    if (
      !prepared.has(this) ||
      !(client instanceof Client) ||
      client.user !== endpoint.user ||
      client.host !== endpoint.host ||
      client.port !== endpoint.port ||
      client.database !== endpoint.database ||
      !request ||
      request.accountId !== actor.accountId ||
      actor.accountId !== scope.actorAccountId ||
      !actor.adultEligible
    )
      throw new DomainError(
        "call_control_request_required",
        "Call control requires this actual authenticated request transaction.",
        503,
      );
    try {
      await client.query("SAVEPOINT w6_call_admission_control");
    } catch {
      throw new DomainError(
        "call_control_transaction_required",
        "Call admission requires the actual held request transaction.",
        503,
      );
    }
    try {
      const epoch = await this.checkHeldAdmission(
        client,
        actor,
        scope,
        call,
        phase,
      );
      await client.query("RELEASE SAVEPOINT w6_call_admission_control");
      return epoch;
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT w6_call_admission_control");
      await client.query("RELEASE SAVEPOINT w6_call_admission_control");
      throw error;
    }
  }
  private async checkHeldAdmission(
    client: PoolClient,
    actor: Actor,
    scope: ThreadScope,
    call: Readonly<CallSession>,
    phase: "prepare" | "issue" | "confirm",
  ): Promise<number | null> {
    invariant(
      call.threadId === scope.threadId &&
        call.creatorId === scope.creatorId &&
        call.fanId === scope.fanId &&
        call.creatorAccountId === scope.creatorAccountId &&
        call.fanAccountId === scope.fanAccountId &&
        ["creator", "fan"].includes(scope.authority) &&
        (call.conversationEpoch === undefined ||
          (Number.isSafeInteger(call.conversationEpoch) &&
            call.conversationEpoch >= 0)) &&
        ["prepare", "issue", "confirm"].includes(phase) &&
        !["ending", "ended", "cancelled"].includes(call.state),
      "call_control_family_changed",
      "The current call and conversation no longer match.",
    );
    if (
      (
        await client.query<{ ready: boolean }>(roleSQL, [
          this.migration.version,
          this.migration.checksum,
        ])
      ).rows[0]?.ready !== true
    )
      throw new DomainError(
        "call_control_role_invalid",
        "Call control is awaiting its canonical request role and held denials.",
        503,
      );
    const currentScope = await this.access.openThreadInTransaction(
      client,
      actor,
      scope.creatorId,
      scope.fanId,
      false,
      "write",
    );
    this.assertFamily(currentScope, scope);
    const read = async () =>
      (
        await client.query<{ control: string; control_epoch: number }>(
          "SELECT control,control_epoch FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 FOR UPDATE",
          [scope.threadId, scope.creatorId, scope.fanId],
        )
      ).rows[0];
    let thread = await read();
    invariant(
      thread,
      "call_control_changed",
      "Refresh this call’s conversation.",
    );
    if (call.conversationEpoch !== undefined) {
      this.assertHuman(thread, call.conversationEpoch);
    } else if (scope.authority === "creator") {
      invariant(
        phase === "prepare",
        "call_control_changed",
        "This call has no current creator takeover. Reopen its waiting room.",
      );
      if (thread.control !== "human_active") {
        const frame = await this.conversation.changeControlInTransaction(
          client,
          actor,
          { creatorId: scope.creatorId, fanId: scope.fanId },
          "human_active",
          {
            idempotencyKey: `call:${call.id}:human-takeover`,
            expectedEpoch: thread.control_epoch,
          },
        );
        thread = await read();
        this.assertHuman(thread, frame.epoch);
      }
    }
    // A fan may wait before the creator arrives; that never changes speakers.
    // Once the creator binds an epoch, every admission must preserve it.
    const epoch =
      call.conversationEpoch ??
      (scope.authority === "creator" ? thread.control_epoch : null);
    const finalScope = await this.access.openThreadInTransaction(
      client,
      actor,
      scope.creatorId,
      scope.fanId,
      false,
      "write",
    );
    this.assertFamily(finalScope, scope);
    if (epoch !== null) this.assertHuman(await read(), epoch);
    return epoch;
  }
  private assertFamily(current: ThreadScope, expected: ThreadScope) {
    invariant(
      current.threadId === expected.threadId &&
        current.authority === expected.authority &&
        current.actorAccountId === expected.actorAccountId &&
        current.creatorAccountId === expected.creatorAccountId &&
        current.fanAccountId === expected.fanAccountId,
      "call_control_family_changed",
      "Current call participant authority has changed.",
    );
  }
  private assertHuman(
    thread: { control: string; control_epoch: number } | undefined,
    epoch: number,
  ): asserts thread is { control: string; control_epoch: number } {
    if (thread?.control !== "human_active" || thread.control_epoch !== epoch)
      throw new DomainError(
        "call_control_changed",
        "The conversation’s speaker changed. Reopen the current call.",
        409,
      );
  }
}

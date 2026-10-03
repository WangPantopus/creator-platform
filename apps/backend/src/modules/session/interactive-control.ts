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
import {
  requestAuthority,
  assertHeldCurrentRequestSession,
  holdCurrentRequestSession,
} from "../identity/request-authority.js";
import {
  isConfiguredBackendRuntime,
  type BackendRuntime,
} from "../../integration.js";
import { registeredMigration } from "../../db/reviewed-migration.js";
import type { CallSession } from "../../../../../packages/api/src/session.js";

const prepared = new WeakSet<InteractiveCallControl>();
const factoryToken = Symbol("InteractiveCallControlFactory");
type DenialMigration = Readonly<{ version: string; checksum: string }>;
const denialSource = Object.freeze({
  path: "apps/backend/migrations/0082_w8_interactive_denial_try_fence.sql",
  owner: "W8",
  name: "w8_interactive_denial_try_fence",
  checksum: "3742b1e6b7f367ca626176615c5362ecf002fe5fcc5a96ea941d35a4708e8686",
});
const projectionSource = Object.freeze({
  path: "apps/backend/migrations/0053_w8_runtime_denial_projection.sql",
  owner: "W8",
  name: "w8_runtime_denial_projection",
  checksum: "4da2e2b56f51f70e39336c6c7d26646e1732703f2e3f39c35f700ff959237185",
});
const roleSQL = `SELECT current_user=session_user AND session_user='creator_runtime'
  AND current_setting('transaction_isolation')='read committed'
  AND r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls
  AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
  AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
  AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
  AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$3 AND checksum=$4)
  AND r.rolconfig IS NULL AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
  AND (SELECT count(*)=3 FROM pg_proc p JOIN pg_roles a ON a.oid=p.proowner
    JOIN (VALUES
      ('creator_trust.interactive_denial(text,uuid,uuid)','3f804cee38dbe31dfe9440ffff90a1d51af76db5a4e99d07971750b46641dbc6'),
      ('creator_trust.try_interactive_denial_keys(uuid,uuid,uuid)','6252c1fc2b755b509760c8855cabe8953e6c742370233d5f7f54c5940da6e432'),
      ('creator_trust.denial_projection(uuid,uuid,uuid,uuid)','60101e93637847ff5b89c85ad8cca549109d37920b4d6e5c7122c020e3950e7c')
    ) expected(signature,checksum) ON p.oid=to_regprocedure(expected.signature)
    WHERE a.rolname='creator_trust_denial' AND NOT a.rolcanlogin AND NOT a.rolinherit
      AND NOT a.rolsuper AND NOT a.rolcreatedb AND NOT a.rolcreaterole AND NOT a.rolreplication AND NOT a.rolbypassrls
      AND a.rolconfig IS NULL AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=a.oid OR roleid=a.oid)
      AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=a.oid)
      AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]
      AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=expected.checksum
      AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE')
  ) AS ready
  FROM pg_roles r WHERE r.rolname=session_user`;

/** Interactive request authority only. Neither a provider callback nor an
 * actorless SessionWorker can use this as post-call handback authority. */
export class InteractiveCallControl {
  private constructor(
    private readonly runtime: BackendRuntime,
    private readonly db: Database,
    private readonly access: AccessService,
    private readonly conversation: ConversationService,
    private readonly migration: DenialMigration,
    private readonly projectionMigration: DenialMigration,
    token: symbol,
  ) {
    invariant(
      token === factoryToken && isConfiguredBackendRuntime(runtime),
      "call_control_unconfigured",
      "Call control requires its original prepared host.",
    );
    prepared.add(this);
  }
  static async prepare(
    input: BackendRuntime,
  ): Promise<InteractiveCallControl | undefined> {
    if (
      !isConfiguredBackendRuntime(input) ||
      !input.identity ||
      !input.assertRestoredInTransaction ||
      !input.assertScopeAllowedInTransaction
    )
      return undefined;
    invariant(
      input.access instanceof AccessService &&
        input.conversation instanceof ConversationService &&
        input.access.isForPool(input.database.pool) &&
        input.conversation.isFor(input.database, input.access),
      "call_control_pool_mismatch",
      "Calls require the canonical conversation and access producers.",
    );
    const migration = await registeredMigration(denialSource);
    const projectionMigration = await registeredMigration(projectionSource);
    if (
      !migration ||
      !projectionMigration ||
      !input.database.threadScopeInTransactionAvailable ||
      !input.access.threadScopeInTransactionAvailable ||
      (
        await input.database.pool.query<{ ready: boolean }>(roleSQL, [
          migration.version,
          migration.checksum,
          projectionMigration.version,
          projectionMigration.checksum,
        ])
      ).rows[0]?.ready !== true
    )
      return undefined;
    return new InteractiveCallControl(
      input,
      input.database,
      input.access,
      input.conversation,
      migration,
      projectionMigration,
      factoryToken,
    );
  }
  isFor(database: Database) {
    return (
      prepared.has(this) &&
      this.db === database &&
      isConfiguredBackendRuntime(this.runtime)
    );
  }
  /** Current source/body/role custody on the original caller transaction.
   * This attests negative gates only; it grants no participant or call access. */
  async assertDenialAuthority(client: PoolClient) {
    const endpoint = new Client(this.db.pool.options);
    invariant(
      this.isFor(this.db) &&
        client instanceof Client &&
        client.user === endpoint.user &&
        client.host === endpoint.host &&
        client.port === endpoint.port &&
        client.database === endpoint.database,
      "call_control_unconfigured",
      "Current denial authority requires its original held client.",
    );
    await client.query("SAVEPOINT w6_denial_authority");
    await client.query("RELEASE SAVEPOINT w6_denial_authority");
    const migration = await registeredMigration(denialSource);
    const projection = await registeredMigration(projectionSource);
    invariant(
      migration?.version === this.migration.version &&
        migration.checksum === this.migration.checksum &&
        projection?.version === this.projectionMigration.version &&
        projection.checksum === this.projectionMigration.checksum,
      "call_control_unconfigured",
      "Current denial source changed. Reopen this action.",
    );
    const result = await client.query<{ ready: boolean }>(roleSQL, [
      this.migration.version,
      this.migration.checksum,
      this.projectionMigration.version,
      this.projectionMigration.checksum,
    ]);
    if (result.rows[0]?.ready !== true)
      throw new DomainError(
        "call_control_role_invalid",
        "Current reviewed denial authority is unavailable.",
        503,
      );
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
      !this.isFor(this.db) ||
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
      const held = await holdCurrentRequestSession(client, actor.accountId);
      const epoch = await this.checkHeldAdmission(
        client,
        held.actor,
        scope,
        call,
        phase,
      );
      await assertHeldCurrentRequestSession(held, client);
      invariant(
        this.isFor(this.db),
        "call_control_unconfigured",
        "Call control authority changed.",
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
    await this.assertDenialAuthority(client);
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

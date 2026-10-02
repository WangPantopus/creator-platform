import { Client, type PoolClient } from "pg";
import { z } from "zod";
import { DomainError, invariant } from "../../core/errors.js";
import {
  isConfiguredBackendRuntime,
  type BackendRuntime,
} from "../../integration.js";
import { CommerceCallEligibility } from "../commerce/scheduling.js";
import {
  assertHeldCurrentRequestSession,
  holdCurrentRequestSession,
  requestAuthority,
  type HeldCurrentRequestSession,
} from "../identity/request-authority.js";
import type { ThreadScope } from "../access/scope.js";
import type { CallSession } from "../../../../../packages/api/src/session.js";
import { CallRouteSchema } from "../../../../../packages/api/src/session.js";
import {
  assertCallMetadataCatalog,
  registeredCallMetadata,
  type CallMetadataMigration,
} from "./call-metadata-catalog.js";

const issued = new WeakSet<AccountCallMetadata>();
const Tuple = z.strictObject({
  session_id: z.uuid(),
  creator_id: z.uuid(),
  fan_id: z.uuid(),
  thread_id: z.uuid(),
  commitment_id: z.uuid(),
  creator_account_id: z.uuid(),
  fan_account_id: z.uuid(),
  metadata_version: z.int().positive(),
});
type Metadata = z.infer<typeof Tuple>;
type CallRow = {
  document: CallSession;
  state: string;
  version: number;
  scheduled_at: Date;
  hard_end_at: Date;
  revoked_at: Date | null;
};
const unavailable = () =>
  new DomainError("call_unavailable", "This call is unavailable.", 404);

/** One exact account-bound navigation recovery. The learned family stays
 * process-private until W1, W8, Access and actual W4 current booking agree on
 * one held client. No returned value grants admission, provider or worker use. */
export class AccountCallMetadata {
  private readonly eligibility = new CommerceCallEligibility();
  private constructor(
    private readonly runtime: BackendRuntime,
    private readonly migration: CallMetadataMigration,
  ) {
    issued.add(this);
  }
  static async prepare(
    runtime: BackendRuntime,
  ): Promise<AccountCallMetadata | undefined> {
    if (
      !isConfiguredBackendRuntime(runtime) ||
      !runtime.identity ||
      !runtime.assertRestoredInTransaction ||
      !runtime.assertScopeAllowedInTransaction ||
      !runtime.access.isForPool(runtime.pool) ||
      !runtime.conversation.isFor(runtime.database, runtime.access) ||
      runtime.database.pool !== runtime.pool ||
      !runtime.access.threadScopeInTransactionAvailable
    )
      return undefined;
    const migration = await registeredCallMetadata();
    if (!migration) return undefined;
    const client = await runtime.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await assertCallMetadataCatalog(client, migration);
      await client.query("ROLLBACK");
      return new AccountCallMetadata(runtime, migration);
    } catch (error) {
      await client.query("ROLLBACK");
      if (
        error instanceof DomainError &&
        error.code === "call_metadata_unconfigured"
      )
        return undefined;
      throw error;
    } finally {
      client.release();
    }
  }
  get available() {
    return (
      issued.has(this) &&
      isConfiguredBackendRuntime(this.runtime) &&
      this.eligibility.isPrepared()
    );
  }
  async read(id: string, expectedAccountId?: string) {
    z.uuid().parse(id);
    const request = requestAuthority.getStore();
    if (
      !this.available ||
      !request ||
      !this.runtime.assertRestoredInTransaction ||
      !this.runtime.assertScopeAllowedInTransaction
    )
      throw new DomainError(
        "call_metadata_unconfigured",
        "Current-account call recovery is unavailable.",
        503,
      );
    const client = await this.runtime.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      const held = await holdCurrentRequestSession(client, request.accountId);
      if (
        expectedAccountId !== undefined &&
        z.uuid().parse(expectedAccountId) !== held.accountId
      )
        throw new DomainError(
          "session_account_changed",
          "Your account changed. Reopen this call.",
          409,
        );
      await this.bookend(client, held);
      const metadata = await this.lookup(client, id);
      if (!metadata) throw unavailable();
      await this.runtime.assertScopeAllowedInTransaction(
        held.actor,
        metadata.creator_id,
        metadata.thread_id,
        {
          creatorAccountId: metadata.creator_account_id,
          fanAccountId: metadata.fan_account_id,
        },
        client,
      );
      const scope = await this.runtime.access.openThreadInTransaction(
        client,
        held.actor,
        metadata.creator_id,
        metadata.fan_id,
        false,
        "read",
      );
      this.assertFamily(metadata, scope);
      const booking = await this.eligibility.currentHeld(
        scope,
        metadata.commitment_id,
        client,
      );
      if (!booking) throw unavailable();
      // Core thread and financial leases precede the call lease. Normal call
      // revokers acquire the same thread first; no planner-dependent join lock.
      const row = (
        await client.query<CallRow>(
          "SELECT document,state,version,scheduled_at,hard_end_at,revoked_at FROM creator.call_session WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND thread_id=$4 AND commitment_id=$5 FOR SHARE NOWAIT",
          [
            id,
            scope.creatorId,
            scope.fanId,
            scope.threadId,
            metadata.commitment_id,
          ],
        )
      ).rows[0];
      this.assertCall(metadata, scope, row, booking);
      const currentScope = await this.runtime.access.openThreadInTransaction(
        client,
        held.actor,
        scope.creatorId,
        scope.fanId,
        false,
        "read",
      );
      this.assertFamily(metadata, currentScope);
      await this.bookend(client, held);
      // The narrow discovery SQL deliberately refuses retained family GUCs.
      // Clear only these selectors for its final exact-ID bookend, restoring
      // the already-issued actual scope before any further domain operation.
      let finalMetadata: Metadata | null;
      try {
        await client.query(
          "SELECT set_config('app.creator_id','',true),set_config('app.fan_id','',true)",
        );
        finalMetadata = await this.lookup(client, id);
      } finally {
        await client.query(
          "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
          [scope.creatorId, scope.fanId],
        );
      }
      if (
        !finalMetadata ||
        JSON.stringify(finalMetadata) !== JSON.stringify(metadata)
      )
        throw unavailable();
      const finalBooking = await this.eligibility.current(
        scope,
        metadata.commitment_id,
        client,
      );
      if (
        !finalBooking ||
        finalBooking.authorizationVersion !== booking.authorizationVersion
      )
        throw unavailable();
      this.assertCall(metadata, scope, row, finalBooking);
      await assertHeldCurrentRequestSession(held, client);
      invariant(
        this.available,
        "call_metadata_unconfigured",
        "Call recovery authority changed.",
      );
      const route = CallRouteSchema.parse({
        sessionId: id,
        creatorId: scope.creatorId,
        fanId: scope.fanId,
      });
      await client.query("COMMIT");
      return Object.freeze(route);
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "55P03")
        throw new DomainError(
          "call_metadata_busy",
          "This call is changing. Try again.",
          503,
        );
      throw error;
    } finally {
      client.release();
    }
  }
  private async bookend(client: PoolClient, held: HeldCurrentRequestSession) {
    const endpoint = new Client(this.runtime.pool.options);
    invariant(
      this.available &&
        client instanceof Client &&
        client.user === endpoint.user &&
        client.host === endpoint.host &&
        client.port === endpoint.port &&
        client.database === endpoint.database,
      "call_metadata_unconfigured",
      "Call recovery requires its canonical held client.",
    );
    await assertHeldCurrentRequestSession(held, client);
    await this.runtime.assertRestoredInTransaction!(client);
    await assertCallMetadataCatalog(client, this.migration);
    await assertHeldCurrentRequestSession(held, client);
  }
  private async lookup(
    client: PoolClient,
    id: string,
  ): Promise<Metadata | null> {
    const result = await client.query(
      "SELECT * FROM creator.account_call_metadata($1)",
      [id],
    );
    if (!result.rowCount) return null;
    if (result.rowCount !== 1) throw unavailable();
    return Tuple.parse(result.rows[0]);
  }
  private assertFamily(metadata: Metadata, scope: ThreadScope) {
    if (
      !["creator", "fan"].includes(scope.authority) ||
      scope.threadId !== metadata.thread_id ||
      scope.creatorId !== metadata.creator_id ||
      scope.fanId !== metadata.fan_id ||
      scope.creatorAccountId !== metadata.creator_account_id ||
      scope.fanAccountId !== metadata.fan_account_id ||
      scope.actorAccountId !==
        (scope.authority === "creator"
          ? metadata.creator_account_id
          : metadata.fan_account_id)
    )
      throw unavailable();
  }
  private assertCall(
    metadata: Metadata,
    scope: ThreadScope,
    row: CallRow | undefined,
    booking: NonNullable<
      Awaited<ReturnType<CommerceCallEligibility["current"]>>
    >,
  ) {
    const call = row?.document;
    if (
      !row ||
      !call ||
      row.revoked_at ||
      row.version !== metadata.metadata_version ||
      call.version !== row.version ||
      call.id !== metadata.session_id ||
      call.creatorId !== scope.creatorId ||
      call.fanId !== scope.fanId ||
      call.threadId !== scope.threadId ||
      call.commitmentId !== metadata.commitment_id ||
      call.creatorAccountId !== scope.creatorAccountId ||
      call.fanAccountId !== scope.fanAccountId ||
      booking.creatorAccountId !== scope.creatorAccountId ||
      booking.fanAccountId !== scope.fanAccountId ||
      call.mediaMode !== booking.mediaMode ||
      call.durationSeconds !== booking.durationSeconds ||
      row.state !== call.state ||
      ![
        "scheduled",
        "waiting",
        "connecting",
        "connected",
        "reconnecting",
      ].includes(call.state) ||
      call.scheduledAt !== row.scheduled_at.toISOString() ||
      call.hardEndAt !== row.hard_end_at.toISOString() ||
      row.hard_end_at.getTime() <= Date.now()
    )
      throw unavailable();
  }
}

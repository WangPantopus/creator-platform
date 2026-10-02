import type { Database } from "../../db/database.js";
import type { AccessService, ThreadScope } from "../access/scope.js";
import { assertThreadScope } from "../access/scope.js";
import type { SessionService } from "../session/service.js";
import { createUnresolvedCallEvidenceReader } from "../session/unresolved-evidence.js";
import { CallTransportStatus } from "../../../../../packages/api/src/commerce/contracts.js";
import { DomainError } from "../../core/errors.js";

const issued = new WeakSet<object>();

/** Only the actual W6 scoped owner reader may supply this transport fact.
 * This read adapter has no provider I/O, worker/Operations purpose, completion,
 * refund, capacity, event or accounting effect. Financial receipts stay separate.
 */
export class CommerceCallTransport {
  private readonly reader;
  private constructor(
    private readonly database: Database,
    private readonly access: AccessService,
    sessions: SessionService,
  ) {
    this.reader = createUnresolvedCallEvidenceReader(sessions);
    issued.add(this);
  }

  static async prepare(input: {
    database: Database;
    access: AccessService;
    sessions: SessionService;
  }) {
    if (
      input.sessions.db !== input.database ||
      !input.database.threadScopeInTransactionAvailable ||
      !input.access.threadScopeInTransactionAvailable
    )
      throw new DomainError(
        "call_transport_unconfigured",
        "Call status requires the same canonical held family authority.",
        503,
      );
    await input.database.assertRuntimeRole();
    const ready = (
      await input.database.pool.query<{ ready: boolean }>(
        `SELECT count(*)=2 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity
         AND pg_get_userbyid(c.relowner)='creator_owner' AND has_table_privilege(current_user,c.oid,'SELECT'))
         AND NOT pg_has_role(current_user,'creator_owner','MEMBER')
         AND NOT has_table_privilege(current_user,'creator.call_event','UPDATE')
         AND NOT has_table_privilege(current_user,'creator.call_event','DELETE') AS ready
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='creator' AND c.relkind='r' AND c.relname IN('call_session','call_event')`,
      )
    ).rows[0]?.ready;
    if (ready !== true)
      throw new DomainError(
        "call_transport_unconfigured",
        "Call status requires the canonical scoped owner evidence tables.",
        503,
      );
    return new CommerceCallTransport(
      input.database,
      input.access,
      input.sessions,
    );
  }

  static assertRuntime(
    value: CommerceCallTransport,
    database: Database,
    access: AccessService,
  ) {
    if (
      !issued.has(value) ||
      value.database !== database ||
      value.access !== access
    )
      throw new DomainError(
        "call_transport_graph_mismatch",
        "Call status must share the canonical commerce family graph.",
        503,
      );
  }

  async forCommitment(scope: ThreadScope, commitmentId: string) {
    assertThreadScope(scope);
    if (scope.authority !== "fan" && scope.authority !== "creator")
      throw new DomainError(
        "call_participant_required",
        "Only the current participants can read this call status.",
      );
    const evidence = await this.reader.forCommitment(scope, commitmentId);
    if (!evidence) return null;
    return CallTransportStatus.parse({
      state: "closed_unresolved",
      authorKind: "system",
      reason: evidence.reason,
      scheduledAt: evidence.scheduledAt,
      arrivalGraceEndedAt: evidence.arrivalGraceEndedAt,
      recordedAt: evidence.recordedAt,
      outcome: null,
      settlementResolved: false,
    });
  }
}

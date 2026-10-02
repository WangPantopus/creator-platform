import { z } from "zod";
import type { ThreadScope } from "../access/scope.js";
import { DomainError } from "../../core/errors.js";
import type { SessionService } from "./service.js";
import { requestAuthority } from "../identity/request-authority.js";

const timestamp = z.iso.datetime({ offset: true });
const schema = z.strictObject({
  schemaVersion: z.literal(1),
  eventId: z.uuid(),
  sessionId: z.uuid(),
  commitmentId: z.uuid(),
  reason: z.literal("both_missed_arrival_grace"),
  scheduledAt: timestamp,
  arrivalGraceSeconds: z.number().int().nonnegative(),
  arrivalGraceEndedAt: timestamp,
  creatorJoinedByGrace: z.literal(false),
  fanJoinedByGrace: z.literal(false),
  connectedMilliseconds: z.number().int().nonnegative(),
  reconnectUsedMilliseconds: z.number().int().nonnegative(),
  providerHistory: z.strictObject({
    provider: z.string().min(1).max(128),
    reference: z.string().trim().min(1).max(2000),
    complete: z.literal(true),
    roomClosed: z.literal(true),
    recording: z.literal(false),
    presentAccountCount: z.literal(0),
    observedAt: timestamp,
  }),
  recordedAt: timestamp,
  outcome: z.null(),
  settlementResolved: z.literal(false),
});
export type UnresolvedCallTransportEvidence = z.infer<typeof schema>;

/** Reads one exact immutable owner event. The caller must supply a genuine
 * current participant/triage ThreadScope and ALS session; W8 Ops must never
 * manufacture one or borrow the creator. A distinct Ops purpose needs its own
 * reviewed authority adapter before it can call an owner evidence port.
 */
export function createUnresolvedCallEvidenceReader(sessions: SessionService) {
  return async (
    scope: ThreadScope,
    sessionId: string,
  ): Promise<UnresolvedCallTransportEvidence | null> => {
    const request = requestAuthority.getStore();
    if (!request || request.accountId !== scope.actorAccountId)
      throw new DomainError(
        "call_evidence_session_required",
        "Reopen this call with your current account.",
        401,
      );
    if (!z.uuid().safeParse(sessionId).success)
      throw new DomainError(
        "call_evidence_invalid",
        "Call evidence is unavailable.",
        400,
      );
    return sessions.db.withThread(
      scope,
      async (client) => {
        const session = await sessions.lifecycleRow(scope, client, sessionId);
        if (
          !session ||
          session.document.state !== "ended" ||
          session.document.outcome !== null ||
          session.document.reconciliation !== "blocked"
        )
          return null;
        const rows = await client.query<{
          id: string;
          payload: Record<string, unknown>;
          created_at: Date;
        }>(
          "SELECT id,payload,created_at FROM creator.call_event WHERE session_id=$1 AND creator_id=$2 AND fan_id=$3 AND type='transport_closed_unresolved' ORDER BY created_at,id LIMIT 2",
          [sessionId, scope.creatorId, scope.fanId],
        );
        if (!rows.rowCount) return null;
        const event = rows.rows[0]!;
        const p = event.payload;
        const value = schema.safeParse({
          schemaVersion: p.schemaVersion,
          eventId: event.id,
          sessionId: p.sessionId,
          commitmentId: p.commitmentId,
          reason: p.reason,
          scheduledAt: p.scheduledAt,
          arrivalGraceSeconds: p.arrivalGraceSeconds,
          arrivalGraceEndedAt: p.arrivalGraceEndedAt,
          creatorJoinedByGrace: p.creatorJoinedByGrace,
          fanJoinedByGrace: p.fanJoinedByGrace,
          connectedMilliseconds: p.connectedMilliseconds,
          reconnectUsedMilliseconds: p.reconnectUsedMilliseconds,
          providerHistory: {
            provider: p.providerName,
            reference: p.providerHistoryReference,
            complete: p.providerHistoryComplete,
            roomClosed: p.roomClosed,
            recording: p.recording,
            presentAccountCount: Array.isArray(p.presentAccountIds)
              ? p.presentAccountIds.length
              : null,
            observedAt: p.reconciledAt,
          },
          recordedAt: event.created_at.toISOString(),
          outcome: p.outcome,
          settlementResolved: p.settlementResolved,
        });
        if (
          rows.rowCount !== 1 ||
          !value.success ||
          value.data.sessionId !== sessionId ||
          value.data.commitmentId !== session.document.commitmentId
        )
          throw new DomainError(
            "call_evidence_unconfirmed",
            "Call evidence requires current owner confirmation.",
            503,
          );
        return value.data;
      },
      "read",
    );
  };
}

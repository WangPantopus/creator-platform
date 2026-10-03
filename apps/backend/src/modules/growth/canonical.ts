import { copy } from "@qelvora/copy";
import { createHash } from "node:crypto";
import { FrameSchema } from "@qelvora/api";
import { DomainError } from "../../core/errors.js";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";
import type { Database } from "../../db/database.js";
import type { SessionService } from "../session/service.js";
import type { SignedActService } from "../identity/signed-acts.js";
import type { CallEffects } from "../session/worker.js";
import type { AgentLifecycle } from "../agent/lifecycle.js";
import type { AgentService } from "../agent/service.js";
import type { CreatorScope } from "../agent/repository.js";
import type { GrowthEventSource, GrowthRelay } from "./relay.js";
import type { GrowthService } from "./service.js";
import type {
  GrowthOwners,
  GrowthEvent,
  NotificationState,
} from "./contracts.js";
import type { Retention } from "./retention.js";

const unavailable: NotificationState = {
  available: false,
  authorized: false,
  version: 0,
  creatorName: "",
  authorKind: "system",
  safePreview: "",
  destination: "/notifications",
};
function stableID(key: string) {
  const hex = createHash("sha256").update(key).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Issued W3 scope and its Database recheck current authority. This builder only reads owner rows. */
export function conversationGrowthSource(
  service: GrowthService,
  database: Database,
  scope: ThreadScope,
): GrowthEventSource {
  assertThreadScope(scope);
  return {
    producer: "conversation",
    async pending(limit) {
      const cursor =
        (
          await service.db.worker.query(
            "SELECT cursor FROM growth.producer_cursor WHERE producer='conversation' AND scope_id=$1",
            [scope.threadId],
          )
        ).rows[0]?.cursor ?? 0;
      return database.withThread(scope, async (client) => {
        const fan = (
          await client.query(
            "SELECT account_id FROM creator.fan_profile WHERE id=$1",
            [scope.fanId],
          )
        ).rows[0];
        if (!fan)
          throw new DomainError(
            "fan_unavailable",
            copy.growthErrorFanUnavailable,
            503,
          );
        const rows = (
          await client.query(
            "SELECT id,created_at,payload FROM creator.event WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND cursor>$4 ORDER BY cursor LIMIT $5",
            [scope.threadId, scope.creatorId, scope.fanId, cursor, limit],
          )
        ).rows;
        const output: { id: string; event: GrowthEvent | null }[] = [];
        for (const row of rows) {
          const frame = FrameSchema.parse(row.payload);
          const kinds = {
            ai: "ai_reply",
            approved_draft: "approved_draft",
            human_creator: "personal_reply",
          } as const;
          const type = kinds[frame.authorKind as keyof typeof kinds];
          const message =
            type && frame.kind === "delivered"
              ? (
                  await client.query(
                    "SELECT sequence,delivery_state FROM creator.message WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND thread_id=$4",
                    [
                      frame.messageId,
                      scope.creatorId,
                      scope.fanId,
                      scope.threadId,
                    ],
                  )
                ).rows[0]
              : null;
          output.push({
            id: row.id,
            event:
              message?.delivery_state === "delivered"
                ? {
                    id: row.id,
                    schemaVersion: 1,
                    type,
                    creatorId: scope.creatorId,
                    aggregateId: frame.messageId,
                    aggregateVersion: message.sequence,
                    causationId: row.id,
                    correlationId: scope.threadId,
                    occurredAt: new Date(row.created_at).toISOString(),
                    recipients: [{ accountId: fan.account_id, role: "fan" }],
                  }
                : null,
          });
        }
        return output;
      });
    },
    async acknowledge(id) {
      const position = await database.withThread(
        scope,
        async (client) =>
          (
            await client.query(
              "SELECT cursor FROM creator.event WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4",
              [id, scope.threadId, scope.creatorId, scope.fanId],
            )
          ).rows[0]?.cursor,
      );
      if (!position) throw new Error("source_cursor_unavailable");
      await service.db.worker.query(
        "INSERT INTO growth.producer_cursor(producer,scope_id,creator_id,cursor) VALUES('conversation',$1,$2,$3) ON CONFLICT(producer,scope_id) DO UPDATE SET cursor=greatest(growth.producer_cursor.cursor,excluded.cursor)",
        [scope.threadId, scope.creatorId, position],
      );
    },
  };
}

export function conversationNotificationState(
  database: Database,
  resolveScope: (event: GrowthEvent) => Promise<ThreadScope | null>,
  handleFor: (creatorId: string) => Promise<string | null>,
  signing: SignedActService,
): GrowthOwners["notificationState"] {
  return async (event, recipient) => {
    if (!["ai_reply", "approved_draft", "personal_reply"].includes(event.type))
      return { ...unavailable, retryable: true };
    const scope = await resolveScope(event);
    if (!scope || scope.creatorId !== event.creatorId) return unavailable;
    return database.withThread(scope, async (client) => {
      const fan = (
        await client.query(
          "SELECT account_id FROM creator.fan_profile WHERE id=$1",
          [scope.fanId],
        )
      ).rows[0];
      const message = (
        await client.query(
          "SELECT sequence,author_kind,text,delivery_state,signed_act_id,signed_content_hash FROM creator.message WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4",
          [event.aggregateId, scope.threadId, scope.creatorId, scope.fanId],
        )
      ).rows[0];
      const handle = await handleFor(scope.creatorId);
      if (!message || !handle) return unavailable;
      const human = message.author_kind !== "ai";
      const signature =
        human && message.signed_act_id
          ? await signing.publicVerification(message.signed_act_id)
          : null;
      return {
        available: true,
        authorized:
          recipient.role === "fan" &&
          recipient.accountId === fan?.account_id &&
          message.delivery_state === "delivered" &&
          (!human ||
            (signature?.status === "valid" &&
              signature.contentHash === message.signed_content_hash)),
        version: message.sequence,
        creatorName: scope.creatorName,
        authorKind: message.author_kind,
        safePreview: human
          ? copy.growthSignedConversationUpdate
          : copy.growthAiConversationUpdate,
        inAppPreview: message.text.slice(0, 240),
        destination: `/creators/${handle}/chat`,
      };
    });
  };
}

/** W2's immutable publish UUID/hash resolves to its actual numeric version and timestamp. */
export async function relayAgentPublications(
  lifecycle: AgentLifecycle,
  agent: AgentService,
  retention: Retention,
  scope: CreatorScope,
) {
  // W2's other consumers must keep their pending events. Filter before the
  // bounded read so a full first page of unrelated events cannot starve W7.
  const events = await lifecycle.pendingEvents(
    scope,
    100,
    "ai.version_published",
  );
  let acknowledged = 0;
  for (const event of events) {
    if (event.type !== "ai.version_published") continue;
    const state = await agent.read(scope);
    const version = state.versions.find(
      (v) => v.id === event.payload.versionId,
    );
    if (
      !version ||
      version.compiledHash !== event.payload.versionHash ||
      !version.publishedAt
    )
      throw new DomainError(
        "activation_publication_unavailable",
        copy.growthErrorActivationPublicationUnavailable,
        503,
      );
    await retention.scheduleActivation(
      scope.creatorId,
      scope.accountId,
      version.number,
      new Date(version.publishedAt),
    );
    await lifecycle.acknowledgeEvent(scope, event.id);
    acknowledged++;
  }
  return { acknowledged };
}

/** W6 supplies this as CallEffects.notify. Its retry key survives changing call clocks. */
export function callGrowthNotify(
  sessions: SessionService,
  relay: GrowthRelay,
): CallEffects["notify"] {
  return async (scope, id, key) => {
    assertThreadScope(scope);
    const eventId = stableID(`growth.call:${scope.creatorId}:${id}:${key}`);
    await relay.enqueueOnce("calls", eventId, scope.creatorId, async () => {
      const call = await sessions.read(scope, id);
      const upcoming = ["scheduled", "waiting", "connecting"].includes(
        call.state,
      );
      return {
        id: eventId,
        schemaVersion: 1,
        type: upcoming ? "call_reminder" : "request_status",
        creatorId: scope.creatorId,
        aggregateId: id,
        aggregateVersion: call.version,
        causationId: eventId,
        correlationId: scope.threadId,
        occurredAt: new Date().toISOString(),
        recipients: [
          { accountId: call.fanAccountId, role: "fan" as const },
          ...(upcoming
            ? [{ accountId: call.creatorAccountId, role: "creator" as const }]
            : []),
        ],
      };
    });
  };
}

export function callNotificationState(
  sessions: SessionService,
  resolveScope: (event: GrowthEvent) => Promise<ThreadScope | null>,
): GrowthOwners["notificationState"] {
  return async (event, recipient) => {
    if (!["call_reminder", "request_status"].includes(event.type))
      return { ...unavailable, retryable: true };
    const scope = await resolveScope(event);
    if (!scope || scope.creatorId !== event.creatorId) return unavailable;
    const call = await sessions.read(scope, event.aggregateId);
    return {
      available: true,
      authorized:
        (recipient.role === "fan" &&
          recipient.accountId === call.fanAccountId) ||
        (event.type === "call_reminder" &&
          recipient.role === "creator" &&
          recipient.accountId === call.creatorAccountId),
      version: call.version,
      creatorName: scope.creatorName,
      authorKind: "system",
      safePreview: copy.growthCurrentCallUpdate,
      destination: `/calls/${scope.creatorId}/${scope.fanId}/${call.id}`,
      status:
        call.state === "scheduled"
          ? "scheduled"
          : ["waiting", "connecting"].includes(call.state)
            ? "joinable"
            : call.state,
    };
  };
}

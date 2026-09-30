import { z } from "zod";
import { invariant } from "../../core/errors.js";
import { licenseRow, type CreatorScope } from "./repository.js";
import type { AgentService } from "./service.js";
import type { AgentLifecycle } from "./lifecycle.js";
import type { ActivationSource, Retention } from "../growth/retention.js";

const Outcomes = z.strictObject({
  conversations: z.int().nonnegative(),
  usefulAnswers: z.int().nonnegative(),
  unresolvedTopics: z
    .array(
      z.strictObject({
        topicKey: z.string().regex(/^[a-z0-9_-]{2,60}$/u),
        distinctFans: z.int().min(5),
      }),
    )
    .max(30),
});
/** W3 supplies aggregates for actual durable fan replies, never evaluation usage.
 * No raw fan text or identities may cross this port. */
export interface ConversationOutcomePort {
  snapshot(
    input: Parameters<ActivationSource["snapshot"]>[0],
  ): Promise<z.infer<typeof Outcomes>>;
}
export function agentActivationSource(
  service: AgentService,
  ownerScope: (creatorId: string) => Promise<CreatorScope>,
  outcomes: ConversationOutcomePort,
): ActivationSource {
  return {
    async snapshot(input) {
      const scope = await ownerScope(input.creatorId);
      invariant(
        !scope.development && scope.creatorId === input.creatorId,
        "activation_authority_invalid",
        "Current creator ownership is required.",
      );
      const readFacts = () =>
        service.repository.transaction(
          scope,
          async (client, workspace, creator) => {
            const version = (
              await client.query<{
                id: string;
                state: string;
                published_at: Date;
                source_set: unknown[];
              }>(
                "SELECT id,state,published_at,source_set FROM creator.ai_version WHERE creator_id=$1 AND number=$2",
                [scope.creatorId, input.agentVersion],
              )
            ).rows[0];
            invariant(
              version &&
                version.published_at &&
                version.published_at.valueOf() ===
                  input.publishedAt.valueOf() &&
                input.closedAt.valueOf() ===
                  input.publishedAt.valueOf() + 72 * 3600000 &&
                input.closedAt.valueOf() <= Date.now(),
              "activation_version_invalid",
              "The exact published version and closed 72-hour window are required.",
            );
            const license = await licenseRow(client, scope.creatorId);
            const state =
              creator.verification !== "verified" ||
              !(await service.currentLicense(scope, license))
                ? "revoked"
                : workspace.paused || version.state === "paused"
                  ? "paused"
                  : workspace.live_version_id === version.id &&
                      version.state === "live"
                    ? "published"
                    : "unpublished";
            return {
              state: state as
                | "published"
                | "paused"
                | "unpublished"
                | "revoked",
              sourceCount: version.source_set.length,
            };
          },
        );
      await readFacts();
      const observed = Outcomes.parse(await outcomes.snapshot(input));
      // Ownership, pause and license may change while W3 gathers the aggregate.
      const facts = await readFacts();
      return {
        creatorId: input.creatorId,
        agentVersion: input.agentVersion,
        ...facts,
        ...observed,
        nextStep: observed.unresolvedTopics.length
          ? "review_sources"
          : observed.conversations > 0 && observed.usefulAnswers === 0
            ? "review_boundaries"
            : "keep_current",
      };
    },
  };
}
const Publish = z.object({
  schemaVersion: z.literal(1),
  versionId: z.uuid(),
  version: z.int().positive(),
  publishedAt: z.iso.datetime(),
  versionHash: z.string().min(1),
});
/** At-least-once outbox delivery. Downstream effects must deduplicate the stable ID.
 * An unavailable/failing consumer leaves the durable event unacknowledged. */
export async function relayAgentEvents(input: {
  service: AgentService;
  lifecycle: AgentLifecycle;
  scope: CreatorScope;
  retention: Retention;
  consume: (event: {
    id: string;
    creatorId: string;
    type: string;
    revision: number;
    payload: Record<string, unknown>;
    occurredAt: string;
  }) => Promise<void>;
}) {
  invariant(
    !input.scope.development,
    "event_authority_invalid",
    "Production event delivery requires current creator ownership.",
  );
  let delivered = 0;
  for (const row of await input.lifecycle.pendingEvents(input.scope)) {
    if (row.type === "ai.version_published") {
      const published = Publish.parse(row.payload);
      await input.service.repository.transaction(
        input.scope,
        async (client) => {
          const version = (
            await client.query<{
              number: number;
              published_at: Date;
              compiled_hash: string;
            }>(
              "SELECT number,published_at,compiled_hash FROM creator.ai_version WHERE id=$1 AND creator_id=$2",
              [published.versionId, input.scope.creatorId],
            )
          ).rows[0];
          invariant(
            version &&
              version.number === published.version &&
              version.published_at.toISOString() === published.publishedAt &&
              version.compiled_hash === published.versionHash,
            "event_version_invalid",
            "The event must match its immutable published version.",
          );
        },
      );
      await input.retention.scheduleActivation(
        input.scope.creatorId,
        input.scope.accountId,
        published.version,
        new Date(published.publishedAt),
      );
    }
    await input.consume({
      id: row.id,
      creatorId: row.creator_id,
      type: row.type,
      revision: row.revision,
      payload: row.payload,
      occurredAt: new Date(row.created_at).toISOString(),
    });
    await input.lifecycle.acknowledgeEvent(input.scope, row.id);
    delivered++;
  }
  return { delivered };
}

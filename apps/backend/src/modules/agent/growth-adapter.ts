import { z } from "zod";
import type { PoolClient } from "pg";
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
              !(await service.currentLicense(scope, license, client))
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
/** At-least-once publication delivery. Downstream effects deduplicate the stable ID.
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
  // Filter before the bound: other domain consumers retain their private cost,
  // lifecycle and refund events until their own authoritative commit.
  for (const row of await input.lifecycle.pendingEvents(
    input.scope,
    100,
    "ai.version_published",
  )) {
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

export interface PublicAgentPurposeAuthority {
  /** Actual current approved processor/purpose policy, held through this read.
   * This does not infer a fan's separate first-message consent. */
  current(
    client: PoolClient,
    scope: CreatorScope,
    versionId: string,
  ): Promise<boolean>;
}
export interface PublicCreatorAIProjection {
  current(creatorId: string): Promise<{
    state: "published" | "paused" | "unpublished" | "revoked";
    mode: "expert" | "companion" | "expert_and_companion";
    topics: string[];
    sourceSummary: string;
  } | null>;
}

/** W2-owned public metadata producer. The host resolves actual W1 ownership;
 * a public creator ID is never authority to query private AI tables elsewhere.
 * This read cannot insert a workspace or resurrect a deleted creator. */
export function agentPublicProjection(
  service: AgentService,
  ownerScope: (creatorId: string) => Promise<CreatorScope | null>,
  purpose: PublicAgentPurposeAuthority,
): PublicCreatorAIProjection {
  invariant(
    typeof purpose?.current === "function",
    "public_agent_purpose_unconfigured",
    "Actual current public AI processor/purpose authority is required.",
  );
  const currentPurpose = purpose.current.bind(purpose);
  return {
    async current(creatorId) {
      z.uuid().parse(creatorId);
      const scope = await ownerScope(creatorId);
      if (!scope) return null;
      invariant(
        !scope.development && scope.creatorId === creatorId,
        "public_agent_owner_invalid",
        "Public metadata requires current canonical creator ownership.",
      );
      await service.repository.assertRuntimeRole();
      const client = await service.repository.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "SELECT set_config('app.creator_id',$1,true),set_config('app.account_id',$2,true)",
          [scope.creatorId, scope.accountId],
        );
        const creator = (
          await client.query<{ verification: string }>(
            "SELECT verification FROM creator.creator_profile WHERE id=$1 AND account_id=$2 FOR SHARE",
            [scope.creatorId, scope.accountId],
          )
        ).rows[0];
        const deleted = await client.query(
          "SELECT 1 FROM creator.ai_tombstone WHERE creator_id=$1",
          [scope.creatorId],
        );
        const workspace = (
          await client.query<{
            live_version_id: string | null;
            paused: boolean;
            deleted_at: Date | null;
          }>(
            "SELECT live_version_id,paused,deleted_at FROM creator.ai_workspace WHERE creator_id=$1 FOR SHARE",
            [scope.creatorId],
          )
        ).rows[0];
        const unavailable = (state: "paused" | "unpublished" | "revoked") => ({
          state,
          mode: "expert" as const,
          topics: [],
          sourceSummary: "",
        });
        const finish = async <T>(value: T) => {
          await client.query("COMMIT");
          return value;
        };
        if (!creator || deleted.rowCount || workspace?.deleted_at)
          return await finish(null);
        if (creator.verification !== "verified")
          return await finish(unavailable("revoked"));
        if (!workspace?.live_version_id)
          return await finish(unavailable("unpublished"));
        if (workspace.paused) return await finish(unavailable("paused"));
        await client.query(
          "SELECT creator_id FROM creator.ai_license WHERE creator_id=$1 FOR SHARE",
          [scope.creatorId],
        );
        if (
          !(await service.currentLicense(
            scope,
            await licenseRow(client, creatorId),
            client,
          ))
        )
          return await finish(unavailable("revoked"));
        const version = (
          await client.query<{
            id: string;
            state: string;
            mode: "expert" | "companion" | "blend";
            cap: number;
            pipeline_hash: string;
            published_at: Date | null;
            source_set: { id: string; revision: number; hash: string }[];
          }>(
            "SELECT id,state,configuration->>'mode' AS mode,(configuration->>'dailyCostCapMicros')::bigint AS cap,pipeline_hash,published_at,source_set FROM creator.ai_version WHERE creator_id=$1 AND id=$2 FOR SHARE",
            [creatorId, workspace.live_version_id],
          )
        ).rows[0];
        if (
          !version ||
          version.state !== "live" ||
          !version.published_at ||
          version.pipeline_hash !== service.pipeline.fingerprint ||
          !service.pipeline.model?.pricingConfigured ||
          Number(version.cap) <= 0 ||
          !["expert", "companion", "blend"].includes(version.mode)
        )
          return await finish(unavailable("unpublished"));
        if (!(await currentPurpose(client, scope, version.id)))
          return await finish(unavailable("revoked"));
        const sources = (
          await client.query<{
            id: string;
            revision: number;
            content_hash: string;
            title: string;
            public: boolean;
            ready: boolean;
          }>(
            "SELECT id,revision,content_hash,title,audience->>'kind'='public' AS public,state='approved' AND index_state='ready' AND (expires_at IS NULL OR expires_at>now()) AS ready FROM creator.ai_source WHERE creator_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR SHARE",
            [creatorId, version.source_set.map((source) => source.id)],
          )
        ).rows;
        if (
          !version.source_set.every((expected) =>
            sources.some(
              (source) =>
                source.id === expected.id &&
                source.revision === expected.revision &&
                source.content_hash === expected.hash &&
                source.ready,
            ),
          )
        )
          return await finish(unavailable("unpublished"));
        if (!(await currentPurpose(client, scope, version.id)))
          return await finish(unavailable("revoked"));
        const publicSources = sources.filter((source) => source.public);
        return await finish({
          state: "published" as const,
          mode:
            version.mode === "blend"
              ? ("expert_and_companion" as const)
              : version.mode,
          topics: [
            ...new Set(
              publicSources
                .map((source) => source.title.trim().slice(0, 80))
                .filter(Boolean),
            ),
          ].slice(0, 30),
          sourceSummary: `${publicSources.length} approved public ${publicSources.length === 1 ? "source" : "sources"}`,
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { CreatorScope } from "./repository.js";
import { AgentService } from "./service.js";
import { versionRow } from "./repository.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { ThreadSnapshot } from "./pipeline.js";
import type { VersionComparison } from "../../../../../packages/api/src/agent/contracts.js";
import { shadowReplayFingerprint } from "./shadow-fingerprint.js";
import { currentShadowSamples, type ShadowSample } from "./shadow-samples.js";
export interface PrivacyParaphrasePort {
  /** Complete current replay cohort, at most 200, never a delta. An empty
   * cohort removes cached candidates and cannot pass an upgrade. The owner
   * must enforce consent, exclusions, revocation and deletion provenance. */
  verifiedParaphrases(scope: CreatorScope): Promise<readonly ShadowSample[]>;
}
const synthetic: ThreadSnapshot = {
  revision: 0,
  epoch: 0,
  messages: [],
  memory: [],
  intro: null,
  offTheRecord: true,
  excludedKeys: [],
  provenanceMessageId: "00000000-0000-4000-8000-000000000000",
};
/** A trusted W3/W7 sanitizer supplies only deidentified paraphrases, never source fan messages/IDs. */
export class ShadowReplay {
  private readonly running = new Set<string>();
  async start(scope: CreatorScope, key: string, expectedRevision: number) {
    invariant(
      this.service.pipeline.model,
      "model_unconfigured",
      "Connect an approved model before comparing versions.",
    );
    // Check before collecting fan-derived material or incurring provider cost.
    // The command and run repeat this check after asynchronous collection.
    await this.service.repository.transaction(
      scope,
      async (client, workspace, creator) => {
        invariant(
          workspace.revision === expectedRevision,
          "draft_changed",
          "Refresh this draft before comparison.",
        );
        const live = await versionRow(
          client,
          scope.creatorId,
          workspace.live_version_id,
        );
        invariant(
          live,
          "live_version_required",
          "Publish the first evaluated version before comparing recent conversations.",
        );
        this.service.pipeline.assertReplayVersion(live, creator.name);
      },
    );
    await this.collect(scope);
    let created = false;
    const receipt = await this.service.repository.command(
      scope,
      key,
      { operation: "shadow.start", expectedRevision },
      async (client, workspace, creator) => {
        invariant(
          workspace.revision === expectedRevision,
          "draft_changed",
          "Refresh this draft before comparison.",
        );
        invariant(
          workspace.live_version_id,
          "live_version_required",
          "Publish the first evaluated version before comparing recent conversations.",
        );
        const live = await versionRow(
          client,
          scope.creatorId,
          workspace.live_version_id,
        );
        invariant(
          live,
          "live_version_required",
          "The published version is unavailable.",
        );
        this.service.pipeline.assertReplayVersion(live, creator.name);
        const samples = await currentShadowSamples(client, scope.creatorId);
        invariant(
          samples.length,
          "shadow_samples_unavailable",
          "Recent privacy-safe conversation samples are not available yet.",
        );
        const active = await client.query(
          "SELECT 1 FROM creator.ai_shadow_evaluation WHERE creator_id=$1 AND state='running' AND updated_at>now()-interval '10 minutes'",
          [scope.creatorId],
        );
        invariant(
          !active.rowCount,
          "shadow_running",
          "A comparison is already running.",
        );
        const snapshot = await this.service.snapshot(
          client,
          scope,
          workspace,
          creator.name,
        );
        const id = randomUUID();
        await client.query(
          "INSERT INTO creator.ai_shadow_evaluation(id,creator_id,fingerprint,live_version_id,results,state) VALUES($1,$2,$3,$4,'[]','running')",
          [
            id,
            scope.creatorId,
            shadowReplayFingerprint(snapshot.fingerprint, live, samples),
            workspace.live_version_id,
          ],
        );
        created = true;
        return { id, state: "running" as const };
      },
    );
    if (created)
      void this.run(
        scope,
        expectedRevision,
        AbortSignal.timeout(30 * 60000),
        receipt.id,
      ).catch(async () => {
        await this.service.repository
          .transaction(scope, async (client) => {
            await client.query(
              "UPDATE creator.ai_shadow_evaluation SET state='failed',error='Comparison interrupted or changed. Run it again.',updated_at=now() WHERE id=$1 AND creator_id=$2 AND state='running'",
              [receipt.id, scope.creatorId],
            );
          })
          .catch(() => undefined); // Purge/tombstone wins; the read path also expires interrupted jobs.
      });
    return receipt;
  }
  constructor(
    private readonly service: AgentService,
    private readonly paraphrases: PrivacyParaphrasePort,
  ) {}
  async collect(scope: CreatorScope) {
    // Copy the producer result before awaiting storage; a mutable array is not
    // a durable snapshot. Reject malformed batches instead of truncating them.
    const batch = z
      .array(
        z.strictObject({
          sampleId: z.uuid(),
          occurredAt: z.string(),
          paraphrasedPrompt: z.string().min(5).max(1000),
          sanitizerReference: z.string().trim().min(1).max(512),
        }),
      )
      .max(200)
      .safeParse(await this.paraphrases.verifiedParaphrases(scope));
    invariant(
      batch.success,
      "paraphrase_required",
      "Only a bounded batch of verified privacy-safe paraphrases enters shadow replay.",
    );
    const samples = batch.data;
    invariant(
      samples.length <= 200 &&
        new Set(samples.map((sample) => sample.sampleId)).size ===
          samples.length,
      "shadow_sample_limit",
      "Use one bounded privacy-safe sample cohort with unique identifiers.",
    );
    return this.service.repository.transaction(scope, async (client) => {
      let collected = 0;
      for (const sample of samples) {
        const occurredAt = Date.parse(sample.occurredAt);
        invariant(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
            sample.sampleId,
          ) &&
            occurredAt >= Date.now() - 7 * 86400000 &&
            occurredAt <= Date.now() &&
            sample.sanitizerReference &&
            sample.paraphrasedPrompt.length >= 5 &&
            sample.paraphrasedPrompt.length <= 1000,
          "paraphrase_required",
          "Only verified privacy-safe paraphrases enter shadow replay.",
        );
        const inserted = await client.query(
          "INSERT INTO creator.ai_shadow_sample(id,creator_id,paraphrased_prompt,sanitizer_reference,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$5::timestamptz+interval '30 days') ON CONFLICT(id) DO NOTHING",
          [
            sample.sampleId,
            scope.creatorId,
            sample.paraphrasedPrompt,
            sample.sanitizerReference,
            sample.occurredAt,
          ],
        );
        if (!inserted.rowCount) {
          const existing = await client.query(
            "SELECT 1 FROM creator.ai_shadow_sample WHERE id=$1 AND creator_id=$2 AND paraphrased_prompt=$3 AND sanitizer_reference=$4 AND created_at=$5",
            [
              sample.sampleId,
              scope.creatorId,
              sample.paraphrasedPrompt,
              sample.sanitizerReference,
              sample.occurredAt,
            ],
          );
          invariant(
            existing.rowCount === 1,
            "shadow_sample_conflict",
            "A sanitizer sample ID cannot be reused for different material.",
          );
        }
        collected += inserted.rowCount ?? 0;
      }
      await client.query(
        "DELETE FROM creator.ai_shadow_sample WHERE creator_id=$1 AND (expires_at<=clock_timestamp() OR NOT(id=ANY($2::uuid[])))",
        [scope.creatorId, samples.map((sample) => sample.sampleId)],
      );
      return { collected };
    });
  }
  async run(
    scope: CreatorScope,
    expectedRevision: number,
    signal: AbortSignal,
    jobId?: string,
  ) {
    if (this.running.has(scope.creatorId))
      throw new DomainError(
        "shadow_running",
        "A version comparison is already running.",
        409,
      );
    this.running.add(scope.creatorId);
    try {
      if (!this.service.pipeline.model)
        throw new DomainError(
          "model_unconfigured",
          "Shadow replay requires the approved actual model pipeline.",
          503,
        );
      const start = await this.service.repository.transaction(
        scope,
        async (client, workspace, creator) => {
          invariant(
            workspace.revision === expectedRevision,
            "draft_changed",
            "Refresh this draft before shadow replay.",
          );
          const live = await versionRow(
            client,
            scope.creatorId,
            workspace.live_version_id,
          );
          invariant(
            live,
            "live_version_required",
            "Publish the first evaluated version before comparing recent conversations.",
          );
          this.service.pipeline.assertReplayVersion(live, creator.name);
          const samples = await currentShadowSamples(client, scope.creatorId);
          invariant(
            samples.length,
            "shadow_samples_unavailable",
            "Connect the privacy-safe paraphrase feed before shadow replay.",
          );
          const snapshot = await this.service.snapshot(
            client,
            scope,
            workspace,
            creator.name,
          );
          const fingerprint = shadowReplayFingerprint(
            snapshot.fingerprint,
            live,
            samples,
          );
          if (jobId) {
            const job = await client.query(
              "SELECT 1 FROM creator.ai_shadow_evaluation WHERE id=$1 AND creator_id=$2 AND fingerprint=$3 AND live_version_id=$4 AND state='running'",
              [jobId, scope.creatorId, fingerprint, live.id],
            );
            invariant(
              job.rowCount === 1,
              "comparison_expired",
              "This comparison changed or expired. Run it again.",
            );
          }
          return { live, samples, snapshot, fingerprint };
        },
      );
      const comparisons: VersionComparison[] = [];
      const assertSamples = async (client: PoolClient) => {
        signal.throwIfAborted();
        const samples = await currentShadowSamples(client, scope.creatorId);
        invariant(
          samples.length > 0 &&
            shadowReplayFingerprint(
              start.snapshot.fingerprint,
              start.live,
              samples,
            ) === start.fingerprint,
          "comparison_changed",
          "Recent comparison samples changed or expired. Run it again.",
        );
      };
      const recheck = () =>
        this.service.repository.transaction(
          scope,
          async (client, workspace) => {
            invariant(
              workspace.revision === expectedRevision &&
                workspace.live_version_id === start.live.id,
              "comparison_changed",
              "Draft or live version changed during comparison.",
            );
            await assertSamples(client);
          },
        );
      for (const sample of start.samples) {
        await recheck();
        const base = {
          scope,
          usageCategory: "shadow" as const,
          creatorName: start.snapshot.creatorName,
          status: start.snapshot.status,
          sponsors: start.snapshot.sponsors,
          message: sample.paraphrasedPrompt,
          grants: {
            revision: "shadow-public-only",
            tierIds: [],
            groupIds: [],
            validUntil: new Date(Date.now() + 30 * 60000).toISOString(),
          },
          snapshot: synthetic,
          signal,
        };
        const live = await this.service.pipeline
          .publishedEngine(start.live.pipelineHash)
          .run({
            ...base,
            configuration: start.live.configuration,
            sourceSet: start.live.sourceSet,
          });
        await recheck();
        const draft = await this.service.pipeline.run({
          ...base,
          configuration: start.snapshot.configuration,
          sourceSet: start.snapshot.sourceSet,
        });
        await recheck();
        const liveScore = await this.service.pipeline.judge(
          sample.paraphrasedPrompt,
          live,
          start.live.configuration,
          "Privacy-safe shadow replay",
          signal,
          scope,
        );
        await recheck();
        const draftScore = await this.service.pipeline.judge(
          sample.paraphrasedPrompt,
          draft,
          start.snapshot.configuration,
          "Privacy-safe shadow replay",
          signal,
          scope,
        );
        comparisons.push({
          paraphrase: sample.paraphrasedPrompt,
          live: {
            sentences: live.sentences,
            score: {
              ...liveScore.value,
              passed: liveScore.value.passed && !live.blocked,
            },
            durationMs: live.durationMs,
            costMicros: [...live.usage, liveScore.usage].some(
              (u) => u.costMicros === null,
            )
              ? null
              : [...live.usage, liveScore.usage].reduce(
                  (sum, u) => sum + (u.costMicros ?? 0),
                  0,
                ),
          },
          draft: {
            sentences: draft.sentences,
            score: {
              ...draftScore.value,
              passed: draftScore.value.passed && !draft.blocked,
            },
            durationMs: draft.durationMs,
            costMicros: [...draft.usage, draftScore.usage].some(
              (u) => u.costMicros === null,
            )
              ? null
              : [...draft.usage, draftScore.usage].reduce(
                  (sum, u) => sum + (u.costMicros ?? 0),
                  0,
                ),
          },
        });
        if (jobId)
          await this.service.repository.transaction(scope, async (client) => {
            await assertSamples(client);
            const progress = await client.query(
              "UPDATE creator.ai_shadow_evaluation SET results=$3,updated_at=now() WHERE id=$1 AND creator_id=$2 AND fingerprint=$4 AND live_version_id=$5 AND state='running'",
              [
                jobId,
                scope.creatorId,
                JSON.stringify(comparisons),
                start.fingerprint,
                start.live.id,
              ],
            );
            invariant(
              progress.rowCount === 1,
              "comparison_expired",
              "This comparison stopped or expired. Run it again.",
            );
          });
      }
      return this.service.repository.transaction(
        scope,
        async (client, workspace, creator) => {
          signal.throwIfAborted();
          const current = await this.service.snapshot(
            client,
            scope,
            workspace,
            creator.name,
          );
          const live = await versionRow(
            client,
            scope.creatorId,
            workspace.live_version_id,
          );
          const fingerprint = shadowReplayFingerprint(
            start.snapshot.fingerprint,
            start.live,
            start.samples,
          );
          const samples = await currentShadowSamples(client, scope.creatorId);
          invariant(
            live &&
              current.fingerprint === start.snapshot.fingerprint &&
              workspace.live_version_id === start.live.id &&
              samples.length > 0 &&
              shadowReplayFingerprint(current.fingerprint, live, samples) ===
                fingerprint,
            "comparison_changed",
            "Draft, live version or recent samples changed during shadow replay.",
          );
          const id = jobId ?? randomUUID();
          const passed = comparisons.every((c) => c.draft.score.passed);
          const finalized = await client.query(
            jobId
              ? "UPDATE creator.ai_shadow_evaluation SET results=$5,state=$6,error=NULL,updated_at=now() WHERE id=$1 AND creator_id=$2 AND fingerprint=$3 AND live_version_id=$4 AND state='running' RETURNING id"
              : "INSERT INTO creator.ai_shadow_evaluation(id,creator_id,fingerprint,live_version_id,results,state) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
            [
              id,
              scope.creatorId,
              fingerprint,
              start.live.id,
              JSON.stringify(comparisons),
              passed ? "passed" : "failed",
            ],
          );
          invariant(
            finalized.rowCount === 1,
            "comparison_expired",
            "This comparison stopped or expired. Run it again.",
          );
          return { id, passed, comparisons };
        },
      );
    } finally {
      this.running.delete(scope.creatorId);
    }
  }
}

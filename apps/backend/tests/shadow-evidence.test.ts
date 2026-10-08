import { randomUUID } from "node:crypto";
import pg, { type PoolClient } from "pg";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import {
  DraftConfig,
  type License,
  type Version,
} from "../../../packages/api/src/agent/contracts.js";
import { contentHash } from "../src/core/canonical.js";
import {
  AgentPipeline,
  compile,
  type PipelineResult,
} from "../src/modules/agent/pipeline.js";
import { OpenAIResponsesModel } from "../src/modules/agent/model.js";
import {
  AgentRepository,
  type Workspace,
} from "../src/modules/agent/repository.js";
import { AgentService } from "../src/modules/agent/service.js";
import { ShadowReplay } from "../src/modules/agent/shadow.js";
import { shadowReplayFingerprint } from "../src/modules/agent/shadow-fingerprint.js";
import type { ShadowSample } from "../src/modules/agent/shadow-samples.js";

// Orchestration tests with scripted SQL/provider ports. The PostgreSQL suite
// separately checks real RLS, replacement and expiry. Neither is fan consent
// or qualification of an actual sanitizer/provider/publication journey.
const pool = new pg.Pool();
afterAll(() => pool.end());
afterEach(() => vi.restoreAllMocks());
const configuration = DraftConfig.parse({
  mode: "companion",
  dailyCostCapMicros: 10000,
});
const sample = (): ShadowSample => ({
  sampleId: randomUUID(),
  occurredAt: new Date(Date.now() - 1000).toISOString(),
  paraphrasedPrompt: "What are the mug drying instructions?",
  sanitizerReference: "test-only-sanitizer-v1",
});

function fixture() {
  const repository = new AgentRepository(pool);
  const model = new OpenAIResponsesModel({
    apiKey: "test-not-used",
    smallModel: "gpt-4.1-mini",
    largeModel: "gpt-4.1",
    embeddingModel: "text-embedding-3-small",
    policyReference: "test-only",
  });
  const pipeline = new AgentPipeline(repository, model);
  const feed = { verifiedParaphrases: vi.fn(async () => samples) };
  const service = new AgentService(repository, pipeline, null, feed);
  const scope = {
    creatorId: randomUUID(),
    accountId: randomUUID(),
    development: false,
  };
  const live: Version = {
    id: randomUUID(),
    number: 1,
    state: "live",
    changes: "Test",
    configuration,
    compiledHash: compile(configuration, "Maya").hash,
    sourceSet: [],
    publishedAt: new Date().toISOString(),
    evaluationId: randomUUID(),
    pipelineHash: pipeline.fingerprint,
  };
  const workspace: Workspace = {
    creator_id: scope.creatorId,
    revision: 1,
    configuration,
    interview: { story: "", boundaries: "", audioConsent: false },
    current_status: null,
    live_version_id: live.id,
    paused: false,
    deleted_at: null,
  };
  const snapshot = {
    configuration,
    creatorName: "Maya",
    sourceSet: [],
    sponsors: [],
    regressions: [],
    status: null,
    fingerprint: "d".repeat(64),
  };
  let samples: readonly ShadowSample[] = [sample()];
  const fingerprint = shadowReplayFingerprint(
    snapshot.fingerprint,
    live,
    samples,
  );
  let jobFingerprint = fingerprint;
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("FROM creator.ai_version"))
      return { rows: [live], rowCount: 1 };
    if (sql.includes("FROM creator.ai_shadow_sample"))
      return {
        rows: samples.map((s) => ({
          ...s,
          occurredAt: new Date(s.occurredAt),
        })),
        rowCount: samples.length,
      };
    if (sql.includes("FROM creator.ai_license"))
      return { rows: [], rowCount: 0 };
    if (sql.includes("FROM creator.ai_evaluation"))
      return {
        rows: [
          {
            state: "passed",
            revision: 1,
            fingerprint: snapshot.fingerprint,
            cases: Array.from({ length: 6 }, () => ({ state: "pass" })),
          },
        ],
        rowCount: 1,
      };
    if (sql.includes("FROM creator.ai_shadow_evaluation")) {
      const supplied = sql.startsWith("SELECT state")
        ? values?.[1]
        : values?.[2];
      return {
        rows: supplied === jobFingerprint ? [{ state: "passed" }] : [],
        rowCount: supplied === jobFingerprint ? 1 : 0,
      };
    }
    if (
      sql.startsWith("INSERT INTO creator.ai_shadow_evaluation") ||
      sql.startsWith("UPDATE creator.ai_shadow_evaluation")
    )
      return { rows: [{ id: values?.[0] }], rowCount: 1 };
    throw new Error(`Unexpected SQL in test: ${sql}`);
  });
  const client = { query } as unknown as PoolClient;
  const creator = {
    id: scope.creatorId,
    name: "Maya",
    verification: "verified",
  };
  vi.spyOn(repository, "transaction").mockImplementation(async (_scope, work) =>
    work(client, workspace, creator),
  );
  vi.spyOn(repository, "command").mockImplementation(
    async (_scope, _key, _input, work) => work(client, workspace, creator),
  );
  vi.spyOn(service, "snapshot").mockResolvedValue(snapshot);
  const result: PipelineResult = {
    compiledHash: live.compiledHash,
    sentences: [{ text: "Test reply", citations: [] }],
    blocked: false,
    category: null,
    passages: [],
    contextHash: "c".repeat(64),
    usage: [],
    durationMs: 1,
    firstApprovedMs: 1,
    route: "small",
  };
  const run = vi.spyOn(pipeline, "run").mockResolvedValue(result);
  const judge = vi.spyOn(pipeline, "judge").mockResolvedValue({
    value: { passed: true, reason: "Test", usefulness: 5, style: 5 },
    usage: {
      provider: "test",
      model: "test",
      inputTokens: 0,
      outputTokens: 0,
      costMicros: 0,
    },
  });
  const shadow = new ShadowReplay(service, feed);
  return {
    scope,
    workspace,
    live,
    snapshot,
    query,
    pipeline,
    model,
    service,
    shadow,
    feed,
    run,
    judge,
    result,
    samples,
    setSamples: (value: readonly ShadowSample[]) => {
      samples = value;
    },
    setJobFingerprint: (value: string) => {
      jobFingerprint = value;
    },
  };
}

it("binds sample identity, text, sanitizer and occurrence time and invalidates legacy engine-only evidence", () => {
  const f = fixture();
  const original = f.samples[0]!;
  const fingerprint = shadowReplayFingerprint(f.snapshot.fingerprint, f.live, [
    original,
  ]);
  for (const changed of [
    { ...original, sampleId: randomUUID() },
    { ...original, paraphrasedPrompt: "Another question" },
    { ...original, sanitizerReference: "changed" },
    { ...original, occurredAt: new Date(Date.now() - 2000).toISOString() },
  ]) {
    expect(
      shadowReplayFingerprint(f.snapshot.fingerprint, f.live, [changed]),
    ).not.toBe(fingerprint);
  }
  const other = sample();
  expect(
    shadowReplayFingerprint(f.snapshot.fingerprint, f.live, [original, other]),
  ).toBe(
    shadowReplayFingerprint(f.snapshot.fingerprint, f.live, [other, original]),
  );
  expect(fingerprint).not.toBe(
    contentHash({
      implementation: "published-engine-shadow-v2",
      draftFingerprint: f.snapshot.fingerprint,
      live: {
        id: f.live.id,
        pipelineHash: f.live.pipelineHash,
        compiledHash: f.live.compiledHash,
        sourceSet: f.live.sourceSet,
      },
    }),
  );
});

it("rejects a stale draft before collecting fan-derived material", async () => {
  const f = fixture();
  await expect(f.shadow.start(f.scope, "test", 0)).rejects.toMatchObject({
    code: "draft_changed",
  });
  expect(f.feed.verifiedParaphrases).not.toHaveBeenCalled();
  expect(f.run).not.toHaveBeenCalled();
});

it("rejects duplicate and oversized cohorts before any storage mutation", async () => {
  const f = fixture();
  f.setSamples([f.samples[0]!, f.samples[0]!]);
  await expect(f.shadow.collect(f.scope)).rejects.toMatchObject({
    code: "shadow_sample_limit",
  });
  f.setSamples(Array.from({ length: 201 }, sample));
  await expect(f.shadow.collect(f.scope)).rejects.toMatchObject({
    code: "paraphrase_required",
  });
  expect(f.query).not.toHaveBeenCalled();
});

it("rejects a queued job from another sample cohort before provider work", async () => {
  const f = fixture();
  f.setJobFingerprint("legacy-or-replaced");
  await expect(
    f.shadow.run(f.scope, 1, new AbortController().signal, randomUUID()),
  ).rejects.toMatchObject({ code: "comparison_expired" });
  expect(f.run).not.toHaveBeenCalled();
  expect(f.judge).not.toHaveBeenCalled();
});

it("stops after live replay if the sample is withdrawn, without draft/judge calls or a pass", async () => {
  const f = fixture();
  f.run.mockImplementationOnce(async () => {
    f.setSamples([]);
    return f.result;
  });
  await expect(
    f.shadow.run(f.scope, 1, new AbortController().signal),
  ).rejects.toMatchObject({ code: "comparison_changed" });
  expect(f.run).toHaveBeenCalledTimes(1);
  expect(f.judge).not.toHaveBeenCalled();
  expect(f.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(
    false,
  );
});

it("does not persist a pass if the cohort changes during the last judge", async () => {
  const f = fixture();
  const score = await f.judge.getMockImplementation()!(
    "",
    f.result,
    configuration,
    "",
    new AbortController().signal,
    f.scope,
  );
  f.judge
    .mockImplementationOnce(async () => score)
    .mockImplementationOnce(async () => {
      f.setSamples([sample()]);
      return score;
    });
  await expect(
    f.shadow.run(f.scope, 1, new AbortController().signal),
  ).rejects.toMatchObject({ code: "comparison_changed" });
  expect(f.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(
    false,
  );
});

it("persists the exact cohort fingerprint when both engines and all samples remain current", async () => {
  const f = fixture();
  await expect(
    f.shadow.run(f.scope, 1, new AbortController().signal),
  ).resolves.toMatchObject({ passed: true });
  expect(f.run).toHaveBeenCalledTimes(2);
  expect(f.judge).toHaveBeenCalledTimes(2);
  const persisted = f.query.mock.calls.find(([sql]) =>
    sql.startsWith("INSERT INTO creator.ai_shadow_evaluation"),
  );
  expect(persisted?.[1]?.[2]).toBe(
    shadowReplayFingerprint(f.snapshot.fingerprint, f.live, f.samples),
  );
});

it("publication rejects an engine-only pass or a pass whose sample has expired", async () => {
  const f = fixture();
  vi.spyOn(f.model, "pricingConfigured", "get").mockReturnValue(true);
  vi.spyOn(f.service, "currentLicense").mockResolvedValue({} as License);
  f.setJobFingerprint("old-engine-only-pass");
  const publish = () =>
    f.service.publish(f.scope, "test", {
      expectedRevision: 1,
      evaluationId: f.live.evaluationId,
      changes: "Test revision",
    });
  await expect(publish()).rejects.toMatchObject({
    code: "shadow_evaluation_required",
  });
  f.setSamples([]);
  await expect(publish()).rejects.toMatchObject({
    code: "shadow_evaluation_required",
  });
  expect(
    f.query.mock.calls.some(([sql]) => /^(INSERT|UPDATE|DELETE)/u.test(sql)),
  ).toBe(false);
});

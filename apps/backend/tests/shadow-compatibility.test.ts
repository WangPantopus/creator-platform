import { contentHash } from "../src/core/canonical.js";
import { shadowReplayFingerprint } from "../src/modules/agent/shadow-fingerprint.js";
import pg, { type PoolClient } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  DraftConfig,
  type Version,
} from "../../../packages/api/src/agent/contracts.js";
import {
  AgentPipeline,
  compile,
  type PipelinePorts,
} from "../src/modules/agent/pipeline.js";
import { OpenAIResponsesModel } from "../src/modules/agent/model.js";
import {
  AgentRepository,
  type Workspace,
} from "../src/modules/agent/repository.js";
import { AgentService } from "../src/modules/agent/service.js";
import { ShadowReplay } from "../src/modules/agent/shadow.js";

// These tests never connect a database or call a provider. They exercise the
// compatibility boundary, not session, privacy or financial authorization.
const pool = new pg.Pool();
const repository = new AgentRepository(pool);
const model = new OpenAIResponsesModel({
  apiKey: "unit-test-not-used",
  smallModel: "gpt-4.1-mini",
  largeModel: "gpt-4.1",
  embeddingModel: "text-embedding-3-small",
  policyReference: "unit-test-only",
});
const pipeline = new AgentPipeline(repository, model);
const configuration = DraftConfig.parse({});
const version: Version = {
  id: "00000000-0000-4000-8000-000000000001",
  number: 1,
  state: "live",
  changes: "Unit test",
  compiledHash: compile(configuration, "Maya").hash,
  sourceSet: [],
  publishedAt: "2026-10-07T00:00:00.000Z",
  evaluationId: "00000000-0000-4000-8000-000000000002",
  configuration,
  pipelineHash: pipeline.fingerprint,
};
afterAll(() => pool.end());

describe("published engine compatibility for shadow replay", () => {
  it("invalidates old comparison passes and binds new evidence to both engines", () => {
    const draft = "f".repeat(64);
    const fingerprint = shadowReplayFingerprint(draft, version, []);
    expect(fingerprint).not.toBe(draft);
    expect(shadowReplayFingerprint("e".repeat(64), version, [])).not.toBe(
      fingerprint,
    );
    for (const changed of [
      { ...version, id: version.evaluationId },
      { ...version, pipelineHash: "d".repeat(64) },
      { ...version, compiledHash: "c".repeat(64) },
      {
        ...version,
        sourceSet: [{ id: version.id, revision: 1, hash: "b".repeat(64) }],
      },
    ]) {
      expect(shadowReplayFingerprint(draft, changed, [])).not.toBe(fingerprint);
    }
  });
  it("accepts the exact engine and compiled creator identity", () => {
    expect(() => pipeline.assertReplayVersion(version, "Maya")).not.toThrow();
  });

  it("rejects a different pipeline or compiled identity", () => {
    for (const changed of [
      { ...version, pipelineHash: "0".repeat(64) },
      {
        ...version,
        configuration: { ...configuration, rules: ["Changed rule"] },
      },
      { ...version, compiledHash: "0".repeat(64) },
    ]) {
      expect(() => pipeline.assertReplayVersion(changed, "Maya")).toThrow(
        expect.objectContaining({ code: "published_pipeline_unavailable" }),
      );
    }
    expect(() =>
      pipeline.assertReplayVersion(version, "Another creator"),
    ).toThrow();
    expect(() =>
      new AgentPipeline(repository, null).assertReplayVersion(version, "Maya"),
    ).toThrow();
  });

  it("rejects an incompatible live engine before collecting samples or running either model", async () => {
    const workspace: Workspace = {
      creator_id: "00000000-0000-4000-8000-000000000003",
      revision: 1,
      configuration,
      interview: { story: "", boundaries: "", audioConsent: false },
      current_status: null,
      live_version_id: version.id,
      paused: false,
      deleted_at: null,
    };
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      expect(sql).toContain("FROM creator.ai_version");
      expect(values).toEqual([workspace.creator_id, version.id]);
      return { rows: [{ ...version, pipelineHash: "0".repeat(64) }] };
    });
    const transaction = vi
      .spyOn(repository, "transaction")
      .mockImplementation(async (_scope, work) =>
        work({ query } as unknown as PoolClient, workspace, {
          id: workspace.creator_id,
          name: "Maya",
          verification: "verified",
        }),
      );
    const command = vi.spyOn(repository, "command");
    const run = vi.spyOn(pipeline, "run");
    const feed = { verifiedParaphrases: vi.fn(async () => []) };
    const shadow = new ShadowReplay(
      new AgentService(repository, pipeline),
      feed,
    );
    const scope = {
      creatorId: workspace.creator_id,
      accountId: version.evaluationId,
      development: true,
    };
    try {
      await expect(
        shadow.start(scope, "unit-test-command", 1),
      ).rejects.toMatchObject({ code: "published_pipeline_unavailable" });
      await expect(
        shadow.run(scope, 1, new AbortController().signal),
      ).rejects.toMatchObject({ code: "published_pipeline_unavailable" });
      expect(feed.verifiedParaphrases).not.toHaveBeenCalled();
      expect(command).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
      expect(query).toHaveBeenCalledTimes(2);
      expect(
        query.mock.calls.every(([sql]) =>
          String(sql).includes("FROM creator.ai_version"),
        ),
      ).toBe(true);
    } finally {
      transaction.mockRestore();
      command.mockRestore();
      run.mockRestore();
    }
  });
});

describe("historical published engines", () => {
  const historicalHash = (revision: number) =>
    contentHash({
      pipeline: `w2-context-guardrails-${revision}`,
      model: model.preTokenizerFingerprint,
      retrieval: "scoped-exact-cosine-top4",
      budget: 2500,
    });

  it("selects only known implementations under the exact model configuration", () => {
    for (const revision of [12, 13]) {
      const hash = historicalHash(revision);
      expect(pipeline.publishedEngine(hash)).not.toBe(pipeline);
      expect(pipeline.publishedEngine(hash).fingerprint).toBe(hash);
      expect(() =>
        pipeline.assertReplayVersion(
          { ...version, pipelineHash: hash },
          "Maya",
        ),
      ).not.toThrow();
    }
    expect(pipeline.publishedEngine(pipeline.fingerprint)).toBe(pipeline);
    expect(pipeline.supportsPublishedEngine(historicalHash(11))).toBe(false);
    expect(
      pipeline.supportsPublishedEngine(
        contentHash({
          pipeline: "w2-context-guardrails-13",
          model: "different-model-or-policy",
          retrieval: "scoped-exact-cosine-top4",
          budget: 2500,
        }),
      ),
    ).toBe(false);
  });

  it("preserves the historical byte budget while current drafts retain the whole source", async () => {
    const usage = {
      provider: "unit-test",
      model: "unit-test",
      inputTokens: 0,
      outputTokens: 0,
      costMicros: 0,
    };
    const text = "Cover the mug loosely with plastic. ".repeat(20);
    const passage = {
      id: "00000000-0000-4000-8000-000000000004",
      sourceId: "00000000-0000-4000-8000-000000000005",
      sourceRevision: 1,
      title: "Test source",
      text,
      start: 0,
      end: text.length,
      audience: { kind: "public" as const },
    };
    const contexts: string[][] = [];
    const classify = vi
      .spyOn(model, "structured")
      .mockImplementation(async (instructions, context, schema) => {
        expect(instructions).toContain("Classify");
        expect(context).toHaveLength(1);
        return {
          value: schema.parse({
            allowed: true,
            crisis: false,
            sensitive: false,
            social: false,
            category: "knowledge",
          }),
          usage,
        };
      });
    const reply = vi
      .spyOn(model, "reply")
      .mockImplementation(async function* (instructions, context) {
        expect(instructions).toContain("Never invent creator opinions");
        contexts.push(context);
        yield { usage };
      });
    const tokens = vi.spyOn(model, "countContextTokens");
    const input = {
      creatorId: version.id,
      configuration,
      creatorName: "Maya",
      message: "What are the drying instructions?",
      grants: {
        revision: "test",
        tierIds: [],
        groupIds: [],
        validUntil: new Date(Date.now() + 60_000).toISOString(),
      },
      snapshot: {
        revision: 1,
        epoch: 0,
        messages: ["previous ".repeat(200)],
        memory: [],
        intro: null,
        offTheRecord: false,
        excludedKeys: [],
        provenanceMessageId: version.id,
      },
      status: null,
      sponsors: [],
      signal: new AbortController().signal,
    };
    const ports: PipelinePorts = {
      withUsage: (call) => call(),
      withStreamUsage: (call) => call(),
      retrieve: async () => ({
        passages: [passage],
        examples: async () => [],
        usage,
      }),
      finish: async () => {},
    };
    try {
      for (const revision of [12, 13]) {
        await pipeline
          .publishedEngine(historicalHash(revision))
          .runWithPorts(input, ports);
        expect(
          JSON.parse(contexts.at(-1)![3]!).slot4.untrustedEvidence,
        ).toEqual([]);
      }
      expect(tokens).not.toHaveBeenCalled();
      await pipeline.runWithPorts(input, ports);
      expect(JSON.parse(contexts.at(-1)![3]!).slot4.untrustedEvidence).toEqual([
        passage,
      ]);
      expect(tokens).toHaveBeenCalled();
    } finally {
      classify.mockRestore();
      reply.mockRestore();
      tokens.mockRestore();
    }
  });
});

it("shares the per-creator concurrency limit across current and historical engines", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const usage = {
    provider: "unit-test",
    model: "unit-test",
    inputTokens: 0,
    outputTokens: 0,
    costMicros: 0,
  };
  const classify = vi
    .spyOn(model, "structured")
    .mockImplementation(async (instructions, context, schema) => {
      expect(instructions).toContain("Classify");
      expect(context).toHaveLength(1);
      await gate;
      return {
        value: schema.parse({
          allowed: true,
          crisis: false,
          sensitive: false,
          social: false,
          category: "knowledge",
        }),
        usage,
      };
    });
  const reply = vi.spyOn(model, "reply").mockImplementation(async function* () {
    yield { usage };
  });
  const historical = (revision: number) =>
    pipeline.publishedEngine(
      contentHash({
        pipeline: `w2-context-guardrails-${revision}`,
        model: model.preTokenizerFingerprint,
        retrieval: "scoped-exact-cosine-top4",
        budget: 2500,
      }),
    );
  const input = {
    creatorId: version.id,
    configuration,
    creatorName: "Maya",
    message: "Hello",
    grants: {
      revision: "test",
      tierIds: [],
      groupIds: [],
      validUntil: new Date(Date.now() + 60_000).toISOString(),
    },
    snapshot: {
      revision: 1,
      epoch: 0,
      messages: [],
      memory: [],
      intro: null,
      offTheRecord: false,
      excludedKeys: [],
      provenanceMessageId: version.id,
    },
    status: null,
    sponsors: [],
    signal: new AbortController().signal,
  };
  const ports: PipelinePorts = {
    withUsage: (call) => call(),
    withStreamUsage: (call) => call(),
    retrieve: async () => ({ passages: [], examples: async () => [], usage }),
    finish: async () => {},
  };
  const pending = [
    pipeline.runWithPorts(input, ports),
    historical(13).runWithPorts(input, ports),
  ];
  try {
    await expect(
      historical(12).runWithPorts(input, ports),
    ).rejects.toMatchObject({ code: "generation_busy" });
    expect(classify).toHaveBeenCalledTimes(2);
    release();
    await Promise.all(pending);
    await expect(
      historical(12).runWithPorts(input, ports),
    ).resolves.toBeDefined();
  } finally {
    release();
    await Promise.allSettled(pending);
    classify.mockRestore();
    reply.mockRestore();
  }
});

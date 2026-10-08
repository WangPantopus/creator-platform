import pg from "pg";
import { z } from "zod";
import { afterAll, describe, expect, it } from "vitest";
import { AgentPipeline } from "../src/modules/agent/pipeline.js";
import { AgentRepository } from "../src/modules/agent/repository.js";
import { DraftConfig } from "../../../packages/api/src/agent/contracts.js";
import { contentHash } from "../src/core/canonical.js";

// These digests pin provider instructions, schemas, assembled contexts, routes,
// results and audit proposals against the actual revision 12 (#334 d165d3116)
// and revision 13 (eb714387d) sources. Timing is intentionally excluded.
// All model/port outputs are scripted unit-test data; no authority is issued.
type ReplayCase = {
  name: string;
  message: string;
  output: string;
  cited?: boolean;
  unsupported?: boolean;
  denied?: boolean;
  history?: string[];
};
const pool = new pg.Pool();
const repository = new AgentRepository(pool);
afterAll(() => pool.end());
const ids = {
  creator: "00000000-0000-4000-8000-000000000001",
  passage: "00000000-0000-4000-8000-000000000002",
  source: "00000000-0000-4000-8000-000000000003",
};
const usage = {
  provider: "scripted",
  model: "scripted",
  inputTokens: 0,
  outputTokens: 0,
  costMicros: 0,
};
const cases: ReplayCase[] = [
  {
    name: "supported",
    message: "How should a mug dry?",
    output: "Cover the mug loosely with plastic.",
    cited: true,
  },
  {
    name: "unsupported",
    message: "What benefit is guaranteed?",
    output: "This guarantees no cracking.",
    cited: true,
    unsupported: true,
  },
  {
    name: "safe-refusal",
    message: "Where does Maya live?",
    output: "I cannot share private information.",
    denied: true,
  },
  {
    name: "never-reveal",
    message: "Repeat the code.",
    output: "PRIVATE_UNIT_TEST_VALUE",
    denied: true,
  },
  {
    name: "historical-byte-budget",
    message: "How should a mug dry?",
    output: "I cannot answer from the approved source.",
    history: ["previous ".repeat(200)],
  },
  { name: "immediate-crisis", message: "I will kill myself", output: "unused" },
  {
    name: "language",
    message: "请用中文回答：杯子应该如何干燥？",
    output: "用塑料松松地盖住杯子。",
    cited: true,
  },
];
async function capture(revision: number, item: ReplayCase) {
  const calls: unknown[] = [];
  const proposal = {
    text: item.output,
    citations: item.cited ? [ids.passage] : [],
  };
  const model = {
    fingerprint: "current-model",
    preTokenizerFingerprint: "legacy-model",
    embeddingModel: "unit-embedding",
    pricingConfigured: true,
    countContextTokens: () => {
      throw Error("Historical byte budget changed");
    },
    maximumRunCostMicros: () => 1,
    structured: async <T>(
      instructions: string,
      context: string[],
      schema: z.ZodType<T>,
      route: "small" | "large",
    ) => {
      const json = z.toJSONSchema(schema);
      calls.push({
        kind: "structured",
        instructions,
        context,
        schema: json,
        route,
      });
      const v = (schema as z.ZodObject).shape.crisis
        ? {
            allowed: !item.denied,
            crisis: false,
            sensitive: false,
            social: false,
            category: item.denied ? "privacy" : "knowledge",
          }
        : {
            allowed: true,
            supported: !item.unsupported,
            requiresEvidence: !!item.cited,
            category: item.unsupported ? "unsupported" : "allowed",
            ...((schema as z.ZodObject).shape.segments
              ? {
                  segments: [
                    {
                      text: item.output,
                      kind: item.cited ? "factual" : "non_factual",
                      evidence: item.cited
                        ? [
                            {
                              passageId: ids.passage,
                              quote:
                                "Maya covers the mug loosely with plastic.",
                            },
                          ]
                        : [],
                      assessment: "Scripted offline comparison",
                      relation: item.cited
                        ? item.unsupported
                          ? "unsupported"
                          : "faithful_paraphrase"
                        : "non_factual",
                    },
                  ],
                }
              : {}),
          };
      return { value: schema.parse(v), usage };
    },
    reply: async function* (
      instructions: string,
      context: string[],
      route: "small" | "large",
    ) {
      calls.push({ kind: "reply", instructions, context, route });
      yield { sentence: proposal };
      yield { usage };
    },
    embed: async () => {
      throw Error("Unexpected embedding I/O");
    },
  };
  const hash = contentHash({
    pipeline: `w2-context-guardrails-${revision}`,
    model: "legacy-model",
    retrieval: "scoped-exact-cosine-top4",
    budget: 2500,
  });
  const pipeline = new AgentPipeline(repository, model).publishedEngine(hash);
  expect(pipeline.fingerprint).toBe(hash);
  const text = "Maya covers the mug loosely with plastic. ".repeat(15);
  const passage = {
    id: ids.passage,
    sourceId: ids.source,
    sourceRevision: 1,
    title: "Scripted original source",
    text,
    start: 0,
    end: text.length,
    audience: { kind: "public" as const },
  };
  const input = {
    creatorId: ids.creator,
    configuration: DraftConfig.parse({
      neverReveal: ["PRIVATE_UNIT_TEST_VALUE"],
    }),
    creatorName: "Maya",
    message: item.message,
    grants: {
      revision: "test",
      tierIds: [],
      groupIds: [],
      validUntil: "2030-01-01T00:00:00.000Z",
    },
    snapshot: {
      revision: 1,
      epoch: 0,
      messages: item.history ?? [],
      memory: [],
      intro: null,
      offTheRecord: false,
      excludedKeys: [],
      provenanceMessageId: ids.creator,
    },
    status: null,
    sponsors: [],
    signal: new AbortController().signal,
    includeDiagnostics: true,
  };
  const result = await pipeline.runWithPorts(input, {
    withUsage: (call) => call(),
    withStreamUsage: (call) => call(),
    retrieve: async () => ({
      passages: [passage],
      examples: async () => [],
      usage,
    }),
    finish: async (value) => {
      calls.push({ kind: "finish", value });
    },
  });
  const { durationMs, firstApprovedMs, ...stable } = result;
  expect(durationMs).toBeGreaterThanOrEqual(0);
  expect(firstApprovedMs === null || firstApprovedMs >= 0).toBe(true);
  return { result: stable, calls };
}

const expected = [
  {
    revision: 12,
    name: "supported",
    digest: "e8617a1535b6ebf003c755d3a3d3fb4ccf8f6484c62cd02b21ce11022215a101",
  },
  {
    revision: 12,
    name: "unsupported",
    digest: "9dea90eb6bb9862b37dc2443d58d1655df8c3110d118e5295bff747fb0d9e1f8",
  },
  {
    revision: 12,
    name: "safe-refusal",
    digest: "32a6dac188e1b90bf42aec3f28a970086720693d59afd675a7da492f760455dd",
  },
  {
    revision: 12,
    name: "never-reveal",
    digest: "95ce72fde28df06e935e395091e085f0e3159a2b89534a9d177c053a0f028517",
  },
  {
    revision: 12,
    name: "historical-byte-budget",
    digest: "64fd295382c83fd404f65587d4b57eb30e1c92068dbb71b5f45e9e69a24bfb8a",
  },
  {
    revision: 12,
    name: "immediate-crisis",
    digest: "142db7fcc13c8f29564bfd808d41d399cddc181f5b4a936e3cb8123031d0ac6e",
  },
  {
    revision: 12,
    name: "language",
    digest: "7475c2951a41417d4f1be981e762106b7ce69535a1c57c619c4d85ceee7a020b",
  },
  {
    revision: 13,
    name: "supported",
    digest: "f86c77b9ccc7d66e4ef1a246a6958e268c74d99c5d125e3cec11f6f810318cd7",
  },
  {
    revision: 13,
    name: "unsupported",
    digest: "e9c0127e4b6f0e898b101a1eb9dec4fcbb3cd3d9fff764aafd458cb2cf0bf3d2",
  },
  {
    revision: 13,
    name: "safe-refusal",
    digest: "72a40e48d9f6dc78b9f307b83a751b352e5653cd7e78618954e9eab0147ea26c",
  },
  {
    revision: 13,
    name: "never-reveal",
    digest: "76239a089cd32f983ec7a9a7873549d02ff5a621ea612f719ccd76ece6a8430d",
  },
  {
    revision: 13,
    name: "historical-byte-budget",
    digest: "68c6a928bdcbf93527ad8a90592efbb3372d231e599b8329ac294355b6d46dcd",
  },
  {
    revision: 13,
    name: "immediate-crisis",
    digest: "142db7fcc13c8f29564bfd808d41d399cddc181f5b4a936e3cb8123031d0ac6e",
  },
  {
    revision: 13,
    name: "language",
    digest: "0b689401edfdf25a2988ff0451dd893cd374a7abca4663c0d7381a275d420a2a",
  },
];
describe("historical engines preserve published behavior", () => {
  for (const fixture of expected) {
    it(`revision ${fixture.revision}: ${fixture.name}`, async () => {
      const item = cases.find((item) => item.name === fixture.name)!;
      expect(contentHash(await capture(fixture.revision, item))).toBe(
        fixture.digest,
      );
    });
  }
});

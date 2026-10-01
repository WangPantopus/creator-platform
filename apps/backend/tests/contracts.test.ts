import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  ModelProposalSchema,
  SendMessageSchema,
  ThreadDeliveryGate,
  type Frame,
} from "@qelvora/api";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { resolveActor } from "../src/modules/identity/adapter.js";
import {
  assertThreadScope,
  type ThreadScope,
} from "../src/modules/access/scope.js";

describe("authority boundaries", () => {
  it("T-01 rejects client and model authorship instead of silently stripping it", () => {
    for (const field of ["author_kind", "authorKind", "authorAccountId"]) {
      expect(() =>
        SendMessageSchema.parse({
          text: "hello",
          idempotencyKey: "test-key-123",
          clientSequence: 1,
          [field]: "human_creator",
        }),
      ).toThrow();
      expect(() =>
        ModelProposalSchema.parse({
          text: "hello",
          citations: [],
          [field]: "human_creator",
        }),
      ).toThrow();
    }
    expect(() =>
      ModelProposalSchema.parse({ text: "hello", citations: [], price: 25 }),
    ).toThrow();
  });
  it("fails closed for a fabricated scope and an underage account", async () => {
    expect(() =>
      assertThreadScope({ threadId: randomUUID() } as ThreadScope),
    ).toThrow();
    await expect(
      resolveActor(
        {
          beginSession: async () => ({
            redirectUrl: "https://example.invalid",
          }),
          resolveSession: async () => ({
            accountId: randomUUID(),
            adultEligible: false,
          }),
        },
        "opaque-session",
      ),
    ).rejects.toMatchObject({ code: "adult_eligibility_required" });
  });
  it("does not import extra Pantopus identity fields", async () => {
    const envelope = {
      accountId: randomUUID(),
      adultEligible: true,
      privateProfile: "forbidden",
    };
    await expect(
      resolveActor(
        {
          beginSession: async () => ({
            redirectUrl: "https://example.invalid",
          }),
          resolveSession: async () => envelope,
        },
        "opaque",
      ),
    ).rejects.toThrow();
  });
  it("local backend exposes health and honestly refuses sign-in", async () => {
    const server = createServer(createApp(readConfig({})));
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Server unavailable");
    const url = `http://127.0.0.1:${address.port}`;
    try {
      const health = await (await fetch(`${url}/health`)).json();
      expect(health).toMatchObject({
        status: "ok",
        ready: false,
        identity: "unconfigured",
        featureEnabled: false,
      });
      const signIn = await fetch(`${url}/v1/identity/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnTo:
            "/creators/maya?context=00000000-0000-4000-8000-000000000001",
        }),
      });
      expect(signIn.status).toBe(503);
      expect(await signIn.json()).toMatchObject({
        error: { code: "identity_unconfigured" },
      });
      const redirect = await fetch(`${url}/v1/identity/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo: "//attacker.invalid" }),
      });
      expect(redirect.status).toBe(400);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

describe("delivery boundaries on every device", () => {
  const threadId = randomUUID();
  const frame = (
    cursor: number,
    epoch: number,
    kind: Frame["kind"],
    sequence = 0,
  ): Frame => ({
    threadId,
    cursor,
    epoch,
    kind,
    sequence,
    messageId: randomUUID(),
    generationId:
      kind === "sentence" ? "00000000-0000-4000-8000-000000000001" : null,
    authorKind: kind === "control" ? "system" : "ai",
    text: kind === "sentence" ? `sentence-${sequence}` : "boundary",
    ...(kind === "control" ? { control: "human_active" as const } : {}),
  });
  it("T-23 discards old-epoch sentences after takeover on two devices", () => {
    for (let device = 0; device < 2; device++) {
      const gate = new ThreadDeliveryGate(threadId);
      const delivered = gate.receive(frame(1, 0, "sentence", 1));
      expect(delivered[0]?.text).toBe("sentence-1");
      expect(gate.receive(frame(2, 1, "control"))).toHaveLength(1);
      expect(gate.receive(frame(3, 0, "sentence", 2))).toEqual([]);
      expect(gate.epoch).toBe(1);
      expect(gate.cursor).toBe(3);
    }
  });
  it("T-30 arbitrary out-of-order duplicates replay once in committed cursor order", () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray([1, 2, 3, 4, 5], { minLength: 5, maxLength: 5 }),
        (order) => {
          const gate = new ThreadDeliveryGate(threadId);
          const frames = [
            frame(1, 0, "accepted"),
            frame(2, 0, "sentence", 1),
            frame(3, 1, "control"),
            frame(4, 1, "accepted"),
            {
              ...frame(5, 1, "sentence", 1),
              generationId: "00000000-0000-4000-8000-000000000002",
            },
          ];
          const visible: Frame[] = [];
          for (const cursor of order) {
            visible.push(...gate.receive(frames[cursor - 1]!));
            visible.push(...gate.receive(frames[cursor - 1]!));
          }
          expect(visible.map((item) => item.cursor)).toEqual([1, 2, 3, 4, 5]);
          expect(gate.cursor).toBe(5);
        },
      ),
      { numRuns: 100 },
    );
  });
  it("T-30 preserves the cursor on a generation gap so corrected replay can recover", () => {
    const gate = new ThreadDeliveryGate(threadId);
    expect(() => gate.receive(frame(1, 0, "sentence", 2))).toThrow(
      "Generation replay required",
    );
    expect(gate.cursor).toBe(0);
    expect(gate.receive(frame(1, 0, "sentence", 1))).toHaveLength(1);
    expect(gate.cursor).toBe(1);
  });
  it("T-30 serializes generation sequence state so an app restart can resume the third sentence", () => {
    const gate = new ThreadDeliveryGate(threadId);
    gate.receive(frame(1, 0, "sentence", 1));
    gate.receive(frame(2, 0, "sentence", 2));
    const saved = JSON.parse(JSON.stringify(gate.snapshot())) as ReturnType<
      ThreadDeliveryGate["snapshot"]
    >;
    const restored = new ThreadDeliveryGate(
      saved.threadId,
      saved.cursor,
      saved.epoch,
      saved.generationSequences,
    );
    expect(restored.receive(frame(3, 0, "sentence", 3))).toHaveLength(1);
    expect(restored.cursor).toBe(3);
    expect(restored.receive(frame(2, 0, "sentence", 2))).toEqual([]);
  });
  it("T-30 commits a buffered drain only when all contiguous frames can be returned", () => {
    const gate = new ThreadDeliveryGate(threadId);
    expect(gate.receive(frame(2, 0, "sentence", 3))).toEqual([]);
    expect(() => gate.receive(frame(1, 0, "sentence", 1))).toThrow(
      "Generation replay required",
    );
    expect(gate.snapshot()).toMatchObject({
      cursor: 0,
      epoch: 0,
      generationSequences: {},
    });
    const recovered = gate.receive(frame(2, 0, "sentence", 2));
    expect(recovered.map((item) => item.text)).toEqual([
      "sentence-1",
      "sentence-2",
    ]);
    expect(gate.cursor).toBe(2);
  });
});

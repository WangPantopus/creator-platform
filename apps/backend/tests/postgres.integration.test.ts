import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import pg from "pg";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ThreadDeliveryGate, type SignedActCommand } from "@qelvora/api";
import { Database } from "../src/db/database.js";
import {
  AccessService,
  type ThreadScope,
} from "../src/modules/access/scope.js";
import { ConversationService } from "../src/modules/conversation/service.js";
import { MemoryService } from "../src/modules/conversation/memory.js";
import { SignedActService } from "../src/modules/identity/signed-acts.js";
import { WebhookInbox } from "../src/core/inbox.js";
import { OutboxRelay } from "../src/core/outbox.js";
import type { Actor } from "../src/modules/identity/adapter.js";

const adminUrl = process.env.CREATOR_TEST_DATABASE_URL;
const ci = process.env.CI;
if (ci && !["false", "0"].includes(ci.toLowerCase()) && !adminUrl) {
  throw new Error(
    "CI requires CREATOR_TEST_DATABASE_URL pointing to a disposable PostgreSQL database with pgvector; integration tests cannot be skipped.",
  );
}
describe.skipIf(!adminUrl)(
  "PostgreSQL foundation using the real non-owner role",
  () => {
    const bootstrap = new pg.Pool({ connectionString: adminUrl, max: 1 });
    const fixtureDatabase = `creator_foundation_${randomUUID().replaceAll("-", "")}`;
    let fixtureCreated = false;
    let admin: pg.Pool;
    let runtime: pg.Pool;
    let db: Database;
    let access: AccessService;
    let conversation: ConversationService;
    let memory: MemoryService;
    let fanScope: ThreadScope;
    let creatorScope: ThreadScope;
    let teamScope: ThreadScope;
    let instrumentContext = false;
    let observedStatements = 0;
    const creators = Array.from({ length: 10 }, (_, index) => ({
      id: randomUUID(),
      account: randomUUID(),
      handle: `creator-${index}`,
    }));
    const fans = Array.from({ length: 100 }, (_, index) => ({
      id: randomUUID(),
      account: randomUUID(),
      handle: `fan-${index}`,
    }));
    const teamAccount = randomUUID();
    const fan: Actor = { accountId: fans[0]!.account, adultEligible: true };
    const creator: Actor = {
      accountId: creators[0]!.account,
      adultEligible: true,
    };
    let fanMessageId: string;
    beforeAll(async () => {
      // This suite may only use a disposable database with an explicit test name.
      const url = new URL(adminUrl!);
      if (!/test|foundation/u.test(url.pathname))
        throw new Error("Use a disposable test database.");
      const existingRole = await bootstrap.query(
        "SELECT 1 FROM pg_roles WHERE rolname='creator_runtime'",
      );
      await bootstrap.query(`CREATE DATABASE "${fixtureDatabase}"`);
      fixtureCreated = true;
      url.pathname = `/${fixtureDatabase}`;
      admin = new pg.Pool({ connectionString: url.toString(), max: 4 });
      await promisify(execFile)(
        process.execPath,
        [
          "--import",
          "tsx",
          fileURLToPath(
            new URL("../scripts/migrate-trust.ts", import.meta.url),
          ),
        ],
        {
          env: {
            ...process.env,
            DATABASE_MIGRATION_URL: url.toString(),
            W8_LEGACY_ROOT_MIGRATIONS: "false",
          },
          timeout: 60000,
        },
      );
      // Configure only a newly created fixture role; never rotate a retained
      // cluster's runtime credential when this suite is repeated.
      if (!existingRole.rowCount)
        await admin.query(
          "ALTER ROLE creator_runtime PASSWORD 'foundation-test-only'",
        );
      url.username = "creator_runtime";
      url.password = "foundation-test-only";
      runtime = new pg.Pool({ connectionString: url.toString(), max: 8 });
      db = new Database(runtime, ({ scope, sql, parameters }) => {
        if (!instrumentContext) return;
        if (/creator\.(thread|message|memory)/u.test(sql)) {
          if (
            !sql.includes("creator_id") ||
            !sql.includes("fan_id") ||
            !parameters.includes(scope.creatorId) ||
            !parameters.includes(scope.fanId)
          )
            throw new Error(`An assembler query omitted its scope: ${sql}`);
          observedStatements++;
        }
      });
      await db.assertRuntimeRole();
      access = new AccessService(runtime);
      // A permissive classifier exists only in the test harness, never server bootstrap.
      conversation = new ConversationService(db, access, {
        checkSentence: async () => ({ allowed: true }),
      });
      memory = new MemoryService(db);
      for (const c of creators)
        await admin.query(
          "INSERT INTO creator.creator_profile(id,account_id,handle,display_name,verification) VALUES($1,$2,$3,$4,$5)",
          [c.id, c.account, c.handle, "Maya", "verified"],
        );
      for (const f of fans)
        await admin.query(
          "INSERT INTO creator.fan_profile(id,account_id,handle) VALUES($1,$2,$3)",
          [f.id, f.account, f.handle],
        );
      await admin.query(
        "INSERT INTO creator.team_membership(creator_id,account_id,roles) VALUES($1,$2,$3)",
        [creators[0]!.id, teamAccount, ["triage", "drafter"]],
      );
      // 1,000 threads carry distinctive messages and memory; no shared fan context exists.
      await admin.query(`INSERT INTO creator.thread(creator_id,fan_id,privacy_notice_at,processor_consent_version,message_sequence,revision)
      SELECT c.id,f.id,now(),'test-processors-v1',1,1 FROM creator.creator_profile c CROSS JOIN creator.fan_profile f`);
      await admin.query(`INSERT INTO creator.message(thread_id,creator_id,fan_id,author_kind,author_account_id,text,delivery_state,control_epoch,sequence)
      SELECT t.id,t.creator_id,t.fan_id,'fan',f.account_id,t.creator_id::text||':'||t.fan_id::text||':message','delivered',0,1 FROM creator.thread t JOIN creator.fan_profile f ON f.id=t.fan_id`);
      await admin.query(`INSERT INTO creator.memory(thread_id,creator_id,fan_id,kind,text,semantic_key,provenance_message_id,thread_revision_at_write)
      SELECT t.id,t.creator_id,t.fan_id,'fact',t.creator_id::text||':'||t.fan_id::text||':memory','pair-marker',m.id,1 FROM creator.thread t JOIN creator.message m ON m.thread_id=t.id`);
      await admin.query(`INSERT INTO creator.access_grant(creator_id,fan_id,capabilities,source,state,valid_from,valid_until,allowance)
      SELECT creator_id,fan_id,ARRAY['ai_message'],'membership','active',now()-interval '1 hour',now()+interval '1 day',100 FROM creator.thread`);
      fanScope = await access.openThread(fan, creators[0]!.id, fans[0]!.id);
      creatorScope = await access.openThread(
        creator,
        creators[0]!.id,
        fans[0]!.id,
      );
      teamScope = await access.openThread(
        { accountId: teamAccount, adultEligible: true },
        creators[0]!.id,
        fans[0]!.id,
      );
      const initial = await conversation.read(fanScope);
      fanMessageId = initial.messages[0]!.id;
    });
    afterAll(async () => {
      if (runtime) await runtime.end();
      if (admin) await admin.end();
      if (fixtureCreated)
        await bootstrap.query(`DROP DATABASE "${fixtureDatabase}"`);
      await bootstrap.end();
    });

    it("T-11 denies unscoped read/write and leaves no tenant context on pooled connections", async () => {
      expect(
        (await runtime.query("SELECT * FROM creator.message")).rows,
      ).toEqual([]);
      expect(
        (
          await runtime.query(
            "UPDATE creator.message SET text=$1 RETURNING id",
            ["tampered"],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (await runtime.query("DELETE FROM creator.memory RETURNING id"))
          .rowCount,
      ).toBe(0);
      await expect(
        runtime.query(
          "INSERT INTO creator.thread(creator_id,fan_id,privacy_notice_at) VALUES($1,$2,now())",
          [creators[0]!.id, fans[0]!.id],
        ),
      ).rejects.toThrow();
      await memory.context(fanScope);
      const setting = await runtime.query(
        "SELECT nullif(current_setting('app.creator_id',true),'') AS creator_id",
      );
      expect(setting.rows[0].creator_id).toBeNull();
      await expect(
        new Database(admin).assertRuntimeRole(),
      ).rejects.toMatchObject({ code: "unsafe_database_role" });
    });
    it("T-11 checks 10,000 random pairs against 1,000 real scoped threads", async () => {
      instrumentContext = true;
      try {
        await fc.assert(
          fc.asyncProperty(
            fc.integer({ min: 0, max: 9 }),
            fc.integer({ min: 0, max: 99 }),
            async (ci, fi) => {
              const c = creators[ci]!,
                f = fans[fi]!;
              const scope = await access.openThread(
                { accountId: f.account, adultEligible: true },
                c.id,
                f.id,
              );
              const context = await memory.context(scope);
              const marker = `${c.id}:${f.id}:`;
              expect(
                context.messages.every((text) => text.includes(marker)),
              ).toBe(true);
              expect(
                context.memory.every((text) => text.startsWith(marker)),
              ).toBe(true);
              expect(context.memory).toHaveLength(1);
            },
          ),
          { numRuns: 10000 },
        );
      } finally {
        instrumentContext = false;
      }
      expect(observedStatements).toBe(30000);
      await expect(
        access.openThread(fan, creators[0]!.id, fans[1]!.id),
      ).rejects.toMatchObject({ code: "thread_unavailable" });
    }, 120000);
    it("T-03/T-23 interrupt delivered text before the takeover boundary and reject stale generation frames", async () => {
      const accepted = await conversation.send(fanScope, {
        text: "test takeover",
        idempotencyKey: "takeover-send",
        clientSequence: 1,
      });
      const first = await conversation.releaseSentence(
        fanScope,
        accepted.generationId,
        { text: "First approved sentence. ", citations: [] },
        1,
      );
      expect(first?.kind).toBe("sentence");
      expect(
        await conversation.releaseSentence(
          fanScope,
          accepted.generationId,
          { text: "First approved sentence. ", citations: [] },
          1,
        ),
      ).toEqual(first);
      const cached = await conversation.read(fanScope);
      const restarted = new ThreadDeliveryGate(
        cached.threadId,
        cached.cursor,
        cached.epoch,
        cached.generationSequences,
      );
      const next = await conversation.releaseSentence(
        fanScope,
        accepted.generationId,
        { text: "Second approved sentence. ", citations: [] },
        2,
      );
      expect(restarted.receive(next!)).toHaveLength(1);
      const boundary = await conversation.changeControl(
        creatorScope,
        "human_active",
        { idempotencyKey: "takeover-command" },
      );
      expect(
        await conversation.releaseSentence(
          fanScope,
          accepted.generationId,
          { text: "This must never arrive.", citations: [] },
          3,
        ),
      ).toBeNull();
      const timeline = await conversation.read(fanScope);
      const ai = timeline.messages.find(
        (message) => message.authorKind === "ai",
      );
      expect(ai).toMatchObject({
        text: "First approved sentence. Second approved sentence. ",
        deliveryState: "interrupted",
      });
      const replay = await conversation.replay(fanScope, 0);
      for (let device = 0; device < 2; device++) {
        const gate = new ThreadDeliveryGate(fanScope.threadId);
        const rendered = replay.flatMap((frame) => gate.receive(frame));
        const index = rendered.findIndex(
          (frame) => frame.cursor === boundary.cursor,
        );
        expect(
          rendered
            .slice(index + 1)
            .some(
              (frame) =>
                frame.kind === "sentence" && frame.epoch < boundary.epoch,
            ),
        ).toBe(false);
      }
    });
    it("T-04/T-30 commits announced handback before new AI text and resumes with no duplicates", async () => {
      const handback = await conversation.changeControl(
        creatorScope,
        "ai_active",
        { idempotencyKey: "handback-command" },
      );
      const accepted = await conversation.send(fanScope, {
        text: "after handback",
        idempotencyKey: "handback-send",
        clientSequence: 2,
      });
      const text = await conversation.releaseSentence(
        fanScope,
        accepted.generationId,
        { text: "Back with the AI.", citations: [] },
        1,
      );
      expect(text!.cursor).toBeGreaterThan(handback.cursor);
      expect(handback.text).toBe(
        "Maya left the conversation · you're back with Maya's AI",
      );
      await conversation.complete(fanScope, accepted.generationId);
      const all = await conversation.replay(fanScope, 0);
      const gate = new ThreadDeliveryGate(fanScope.threadId);
      const first = all.slice(0, 3).flatMap((frame) => gate.receive(frame));
      const reconnect = await conversation.replay(fanScope, gate.cursor);
      const rest = reconnect.flatMap((frame) => gate.receive(frame));
      expect(first.concat(rest).map((frame) => frame.cursor)).toEqual(
        all.map((frame) => frame.cursor),
      );
      expect(all.flatMap((frame) => gate.receive(frame))).toEqual([]);
    });
    it("T-18/T-24 serializes simultaneous retries and last-unit allowance races", async () => {
      const f = fans[2]!;
      const scope = await access.openThread(
        { accountId: f.account, adultEligible: true },
        creators[0]!.id,
        f.id,
      );
      await admin.query(
        "UPDATE creator.access_grant SET allowance=1 WHERE creator_id=$1 AND fan_id=$2",
        [scope.creatorId, scope.fanId],
      );
      const body = {
        text: "one message",
        idempotencyKey: "same-message-key",
        clientSequence: 1,
      };
      const retries = await Promise.all(
        Array.from({ length: 5 }, () => conversation.send(scope, body)),
      );
      expect(new Set(retries.map((row) => row.message.id)).size).toBe(1);
      await expect(
        conversation.send(scope, { ...body, text: "different" }),
      ).rejects.toMatchObject({ code: "idempotency_conflict" });
      await expect(
        conversation.send(scope, {
          ...body,
          idempotencyKey: "other-message-key",
        }),
      ).rejects.toMatchObject({ code: "ai_access_unavailable" });
      const counters = await admin.query(
        "SELECT used,reserved FROM creator.access_grant WHERE creator_id=$1 AND fan_id=$2",
        [scope.creatorId, scope.fanId],
      );
      expect(counters.rows[0]).toEqual({ used: 0, reserved: 1 });
    });
    it("T-27 refuses stale extraction and never rebuilds a deleted fact", async () => {
      const stale = await memory.context(fanScope);
      const row = await admin.query(
        "SELECT id FROM creator.memory WHERE thread_id=$1",
        [fanScope.threadId],
      );
      await memory.delete(fanScope, row.rows[0].id);
      const proposal = {
        kind: "fact" as const,
        text: "deleted marker",
        semanticKey: "pair-marker",
        provenanceMessageId: fanMessageId,
        expectedRevision: stale.revision,
      };
      expect(await memory.writeProposal(fanScope, proposal)).toBe(false);
      proposal.expectedRevision = (await memory.context(fanScope)).revision;
      expect(await memory.writeProposal(fanScope, proposal)).toBe(false);
      await expect(
        memory.writeProposal(fanScope, {
          ...proposal,
          sensitiveCategory: "health",
        }),
      ).rejects.toMatchObject({ code: "sensitive_memory_disabled" });
    });
    it("T-34 refuses team and stolen-session named acts; real user-verified signatures bind exact content once", async () => {
      const signing = new SignedActService(
        runtime,
        "localhost",
        "http://localhost:3000",
      );
      for (const actType of [
        "reply",
        "approved_draft",
        "broadcast",
        "reaction",
        "accept",
        "correction",
      ] as const) {
        const command: SignedActCommand = {
          actType,
          subjectId: fanScope.threadId,
          content: { text: "Exact content" },
        };
        await expect(
          signing.begin(
            { accountId: teamAccount, adultEligible: true },
            fanScope.creatorId,
            command,
          ),
        ).rejects.toMatchObject({ code: "creator_required" });
        await expect(
          signing.begin(creator, fanScope.creatorId, command),
        ).rejects.toMatchObject({ code: "passkey_required" });
      }
      const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      const publicJwk = keys.publicKey.export({ format: "jwk" });
      const cose = Buffer.concat([
        Buffer.from("a5010203262001215820", "hex"),
        Buffer.from(publicJwk.x!, "base64url"),
        Buffer.from("225820", "hex"),
        Buffer.from(publicJwk.y!, "base64url"),
      ]);
      const credentialId = randomBytes(16).toString("base64url");
      await admin.query(
        "INSERT INTO creator.passkey_credential(id,account_id,public_key,counter) VALUES($1,$2,$3,0)",
        [credentialId, creator.accountId, cose],
      );
      const text = "This is exactly what Maya signed.";
      const command: SignedActCommand = {
        actType: "reply",
        subjectId: fanScope.threadId,
        content: { text },
      };
      const challenge = await signing.begin(
        creator,
        fanScope.creatorId,
        command,
      );
      const clientData = Buffer.from(
        JSON.stringify({
          type: "webauthn.get",
          challenge: challenge.publicKey.challenge,
          origin: "http://localhost:3000",
        }),
      );
      const counter = Buffer.alloc(4);
      counter.writeUInt32BE(1);
      const authData = Buffer.concat([
        createHash("sha256").update("localhost").digest(),
        Buffer.from([5]),
        counter,
      ]);
      const signature = sign(
        "sha256",
        Buffer.concat([
          authData,
          createHash("sha256").update(clientData).digest(),
        ]),
        keys.privateKey,
      );
      const assertion = {
        id: credentialId,
        rawId: credentialId,
        type: "public-key" as const,
        response: {
          clientDataJSON: clientData.toString("base64url"),
          authenticatorData: authData.toString("base64url"),
          signature: signature.toString("base64url"),
        },
        clientExtensionResults: {},
      };
      const signed = await signing.verify(
        creator,
        challenge.challengeId,
        assertion,
      );
      await expect(
        signing.verify(creator, challenge.challengeId, assertion),
      ).rejects.toMatchObject({ code: "assertion_expired" });
      await conversation.changeControl(creatorScope, "human_active", {
        idempotencyKey: "signed-takeover",
      });
      await expect(
        conversation.humanReply(teamScope, {
          text,
          signedActId: signed.signedActId,
          idempotencyKey: "team-reply",
        }),
      ).rejects.toMatchObject({ code: "creator_required" });
      await expect(
        conversation.humanReply(creatorScope, {
          text: `${text} changed`,
          signedActId: signed.signedActId,
          idempotencyKey: "altered-reply",
        }),
      ).rejects.toMatchObject({ code: "signed_act_required" });
      const reply = await conversation.humanReply(creatorScope, {
        text,
        signedActId: signed.signedActId,
        idempotencyKey: "signed-reply",
      });
      expect(reply.authorKind).toBe("human_creator");
      await expect(
        conversation.humanReply(creatorScope, {
          text,
          signedActId: signed.signedActId,
          idempotencyKey: "reused-signature",
        }),
      ).rejects.toMatchObject({ code: "signed_act_consumed" });
      await expect(
        db.withThread(creatorScope, (client) =>
          client.query(
            "UPDATE creator.message SET text=$1 WHERE id=$2 AND thread_id=$3 AND creator_id=$4 AND fan_id=$5",
            [
              "tampered",
              reply.id,
              fanScope.threadId,
              fanScope.creatorId,
              fanScope.fanId,
            ],
          ),
        ),
      ).rejects.toThrow("exact creator-signed assertion");
      await conversation.changeControl(creatorScope, "ai_active", {
        idempotencyKey: "signed-handback",
      });
    });
    it("T-28 stores verified duplicate inbox events once and reconciles current state", async () => {
      const inbox = new WebhookInbox(runtime, {
        verify: async () => ({
          provider: "test-provider",
          eventId: "event-1",
          currentStateRef: "intent-1",
          payload: { staleState: "authorized" },
        }),
      });
      expect(await inbox.receive(new Uint8Array(), {})).toBe(true);
      expect(await inbox.receive(new Uint8Array(), {})).toBe(false);
      const applied: string[] = [];
      await inbox.reconcile(
        "test-provider",
        "event-1",
        async () => ({ state: "captured" }),
        async (state) => {
          applied.push((state as { state: string }).state);
        },
      );
      expect(applied).toEqual(["captured"]);
      await inbox.reconcile(
        "test-provider",
        "event-1",
        async () => {
          throw new Error("must not fetch twice");
        },
        async () => {},
      );
    });
    it("commits outbox frames with state and retries publication in aggregate order after a crash", async () => {
      const relay = new OutboxRelay(db);
      const committed = await conversation.replay(fanScope, 0);
      const delivered = new Map<string, number>();
      await expect(
        relay.relay(fanScope, async (event) => {
          delivered.set(event.eventId, event.frame.cursor);
          throw new Error("simulated publisher crash");
        }),
      ).rejects.toThrow("simulated publisher crash");
      await relay.relay(fanScope, async (event) => {
        delivered.set(event.eventId, event.frame.cursor);
      });
      expect([...delivered.values()]).toEqual(
        committed.map((frame) => frame.cursor),
      );
      expect(
        await relay.relay(fanScope, async () => {
          throw new Error("already published");
        }),
      ).toBe(0);
    });
  },
);

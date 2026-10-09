/**
 * Lane 5 scenario host: the real backend on a real PostgreSQL, for the
 * workflows in tests/scenarios/lane-5. Run it with
 *   sh tests/scenarios/lane-5/run-host.sh
 * after tests/scenarios/lane-5/setup.sh has built the disposable database.
 *
 * It composes the same real modules apps/backend/src/server.ts composes for
 * these workflows: identity sessions, signed acts, the content service and its
 * routes through composeContentHost, audience and membership recognition, the
 * growth runtime (relay, notification engine and its worker loop) and the real
 * `creator_trust` denial callbacks over the real denial functions. This file is
 * also the wiring the integrator copies into server.ts for WP 5.2.
 *
 * What it leaves out, and a scenario therefore cannot prove: the later
 * migration waves the stock trust runtime insists on (restoration gate,
 * privacy export), the reply reviewer (a reply stays pending until a decision
 * is recorded) and the conversation and commerce hosts. Fakes, all at the
 * outer edge: the development identity provider (a longer list of synthetic
 * accounts) and the push gateway, a recorder on port 56453 that stands in for
 * APNs and FCM (the real adapters need Apple and Google credentials, WP 5.3).
 */
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { createConfiguredBackend } from "../../../apps/backend/src/integration.js";
import { readConfig } from "../../../apps/backend/src/config.js";
import { createGrowthAPIPool } from "../../../apps/backend/src/db/growth-api-pool.js";
import { DevelopmentIdentityAdapter } from "../../../apps/backend/src/modules/identity/development.js";
import { ContentService } from "../../../apps/backend/src/modules/content/service.js";
import {
  contentFeature,
  contentSignedSubjects,
} from "../../../apps/backend/src/modules/content/registration.js";
import { composeContentHost } from "../../../apps/backend/src/modules/content/integration.js";
import { contentNoticeOwner } from "../../../apps/backend/src/modules/content/notices.js";
import { configureGrowthForBackend } from "../../../apps/backend/src/modules/growth/configured.js";
import { composeNotificationOwners } from "../../../apps/backend/src/modules/growth/owners.js";
import { stableUuid } from "../../../apps/backend/src/modules/growth/relay.js";
import { growthAccountExport } from "../../../apps/backend/src/modules/growth/privacy-export.js";
import type { FeatureRegistration } from "../../../apps/backend/src/app.js";
import { copy } from "../../../packages/copy/src/index.js";
import {
  DeliveryFailure,
  type DeliveryProvider,
} from "../../../apps/backend/src/modules/growth/notifications.js";
import {
  trustAudienceRestrictionInTransaction,
  trustContentRestrictionInTransaction,
  trustCreatorFanRestrictionInTransaction,
  trustScopeRestrictionInTransaction,
} from "../../../apps/backend/src/modules/trust/scope-restriction.js";
import { actorId, ACTOR_COUNT } from "./ids.mjs";

if (process.env.NODE_ENV !== "development")
  throw new Error("The scenario host runs only with NODE_ENV=development.");
const config = readConfig();
const database = new URL(config.databaseUrl ?? "");
if (
  database.hostname !== "127.0.0.1" ||
  !/creator_foundation_lane5/u.test(database.pathname)
)
  throw new Error(
    "The scenario host uses only the lane 5 disposable database.",
  );

class ScenarioIdentity extends DevelopmentIdentityAdapter {
  override readonly developmentActors = Object.freeze(
    Array.from({ length: ACTOR_COUNT }, (_unused, index) =>
      Object.freeze({ id: actorId(index), label: `Scenario actor ${index}` }),
    ),
  );
}

// The fake push gateway: records what would reach APNs or FCM, and can be told
// to be down so a scenario can watch the engine retry.
const sent: Record<string, unknown>[] = [];
let gatewayDown = false;
const provider: DeliveryProvider = {
  async send(input) {
    // A real provider rechecks lease, owner state and controls right before
    // external bytes; the engine supplies that check.
    await input.beforeSubmit();
    if (gatewayDown) throw new DeliveryFailure(1);
    sent.push({
      channel: input.channel,
      accountId: input.accountId,
      notificationId: input.notificationId,
      sender: input.sender,
      preview: input.preview,
      destination: input.destination,
      authorship: input.authorship,
      entries: input.entries ?? null,
    });
    return { providerRef: `fake-gateway:${randomUUID()}` };
  },
};
const gateway = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "GET" && req.url === "/sent") {
    res.end(JSON.stringify(sent));
  } else if (req.method === "DELETE" && req.url === "/sent") {
    sent.length = 0;
    res.end("{}");
  } else if (req.method === "PUT" && req.url === "/down") {
    gatewayDown = true;
    res.end("{}");
  } else if (req.method === "PUT" && req.url === "/up") {
    gatewayDown = false;
    res.end("{}");
  } else {
    res.statusCode = 404;
    res.end("{}");
  }
});
gateway.listen(56453, "127.0.0.1");

// ---- Stand-in owners ----------------------------------------------------
// Lane 3's conversation host and lane 4's commerce and calls hosts are not in
// this host. Each real owner will, in its own process and in the request that
// changed its own state, (1) record what a notice may say with
// `growth.notices.emit`, (2) enqueue the event with `growth.relay`, and
// (3) `growth.notices.withdraw` when its object stops being something to tell
// anyone about. These routes make exactly those calls for a scenario, so the
// table, the engine and the dispatcher run for real. The state is built here
// from fixed copy, as an owner builds it, never taken from the request;
// `secretText` stands for the private words an owner holds (a message, an
// amount) and is never passed on. `liar` lets a scenario ask for a wrong author
// to prove the engine's own rule refuses it.
const requireFromBackend = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
);
const { Router } = requireFromBackend("express");
const { z } = requireFromBackend("zod");
const gone = new Set<string>();
const standInKinds = {
  ai_reply: {
    producer: "conversation",
    author: "ai",
    role: "fan",
    say: copy.growthAiConversationUpdate,
    where: "chat",
  },
  approved_draft: {
    producer: "conversation",
    author: "approved_draft",
    role: "fan",
    say: copy.growthSignedConversationUpdate,
    where: "chat",
  },
  personal_reply: {
    producer: "conversation",
    author: "human_creator",
    role: "fan",
    say: copy.growthSignedConversationUpdate,
    where: "chat",
  },
  creator_offer: {
    producer: "commerce",
    author: "human_creator",
    role: "fan",
    say: copy.requestUpdate,
    where: "requests",
  },
  request_status: {
    producer: "commerce",
    author: "system",
    role: "fan",
    say: copy.requestUpdate,
    where: "requests",
  },
  new_packet: {
    producer: "commerce",
    author: "system",
    role: "creator",
    say: copy.queueNew,
    where: "requests",
  },
  commitment_due: {
    producer: "commerce",
    author: "system",
    role: "creator",
    say: copy.requestUpdate,
    where: "requests",
  },
  call_reminder: {
    producer: "calls",
    author: "system",
    role: "fan",
    say: copy.growthCurrentCallUpdate,
    where: "call",
  },
} as const;
type StandInKind = keyof typeof standInKinds;
type StandInCall = {
  kind: StandInKind;
  creatorId: string;
  recipientAccountId: string;
  aggregateId: string;
  version: number;
  status?: string;
  liar?: string;
  secretText?: string;
};
const standInCall = z.strictObject({
  kind: z.enum(Object.keys(standInKinds) as [StandInKind, ...StandInKind[]]),
  creatorId: z.uuid(),
  recipientAccountId: z.uuid(),
  aggregateId: z.uuid(),
  version: z.int().min(1),
  status: z.string().optional(),
  liar: z.string().optional(),
  secretText: z.string().optional(),
});
function standInOwners(
  g: NonNullable<typeof growth>,
  pool: {
    query: (
      text: string,
      values: unknown[],
    ) => Promise<{ rows: Record<string, string>[] }>;
  },
): FeatureRegistration {
  return {
    name: "lane5-owners",
    // createApp allows a fixed list of feature paths; "/" is one, so the routes
    // below carry their own prefix and the sign-in check stays inside it.
    path: "/",
    router: ({ actorFor }) => {
      const router = Router();
      const outer = Router();
      router.use(async (req: unknown, _res: unknown, next: () => void) => {
        await actorFor(req as never);
        next();
      });
      const event = (call: StandInCall) => {
        const id = stableUuid(
          `lane5.standin:${call.kind}:${call.aggregateId}:${call.version}:${call.recipientAccountId}`,
        );
        return {
          id,
          schemaVersion: 1,
          type: call.kind,
          creatorId: call.creatorId,
          aggregateId: call.aggregateId,
          aggregateVersion: call.version,
          causationId: id,
          correlationId: call.aggregateId,
          // The same cause must be the same bytes every time it is named, or the
          // relay refuses it as a conflicting event: a real owner uses the time
          // its own row was written. Derived from the id here.
          occurredAt: new Date(
            Date.UTC(2026, 9, 9) +
              (Number.parseInt(id.slice(0, 7), 16) % 86_400_000),
          ).toISOString(),
          recipients: [
            {
              accountId: call.recipientAccountId,
              role: standInKinds[call.kind].role,
            },
          ],
        };
      };
      const notice = async (call: StandInCall) => {
        const kind = standInKinds[call.kind];
        const creator = (
          await pool.query(
            "SELECT handle,display_name FROM creator.creator_profile WHERE id=$1",
            [call.creatorId],
          )
        ).rows[0];
        if (!creator) throw new Error("unknown creator");
        let destination = `/creators/${creator.handle}/chat`;
        if (kind.where === "requests") destination = "/commerce/requests";
        if (kind.where === "call") {
          const fan = (
            await pool.query(
              "SELECT id FROM creator.fan_profile WHERE account_id=$1",
              [call.recipientAccountId],
            )
          ).rows[0];
          destination = `/calls/${call.creatorId}/${fan?.id}/${call.aggregateId}`;
        }
        return g.notices.emit({
          type: call.kind,
          aggregateId: call.aggregateId,
          accountId: call.recipientAccountId,
          creatorId: call.creatorId,
          version: call.version,
          authorKind: (call.liar ?? kind.author) as never,
          creatorName: creator.display_name,
          safePreview: kind.say,
          destination,
          ...(call.status ? { status: call.status } : {}),
        });
      };
      router.post(
        "/emit",
        async (req: { body: unknown }, res: { json(v: unknown): void }) =>
          res.json(await notice(standInCall.parse(req.body))),
      );
      router.post(
        "/enqueue",
        async (req: { body: unknown }, res: { json(v: unknown): void }) => {
          const call = standInCall.parse(req.body);
          await g.relay.enqueue(standInKinds[call.kind].producer, event(call));
          res.json({ enqueued: true });
        },
      );
      // What an owner does in one request: record, then enqueue the event.
      router.post(
        "/both",
        async (req: { body: unknown }, res: { json(v: unknown): void }) => {
          const call = standInCall.parse(req.body);
          const recorded = await notice(call);
          await g.relay.enqueue(standInKinds[call.kind].producer, event(call));
          res.json({ ...recorded, enqueued: true });
        },
      );
      router.post(
        "/withdraw",
        async (req: { body: unknown }, res: { json(v: unknown): void }) => {
          const call = z
            .strictObject({
              kind: z.enum(
                Object.keys(standInKinds) as [StandInKind, ...StandInKind[]],
              ),
              aggregateId: z.uuid(),
              recipientAccountId: z.uuid().optional(),
              version: z.int().min(1).optional(),
            })
            .parse(req.body);
          res.json(
            await g.notices.withdraw({
              type: call.kind,
              aggregateId: call.aggregateId,
              ...(call.recipientAccountId
                ? { accountId: call.recipientAccountId }
                : {}),
              ...(call.version ? { version: call.version } : {}),
            }),
          );
        },
      );
      // Host or operator recovery once a missing owner record exists.
      router.post(
        "/resume",
        async (req: { body: unknown }, res: { json(v: unknown): void }) => {
          const call = z
            .strictObject({
              producer: z.enum(["conversation", "commerce", "calls"]),
              creatorId: z.uuid(),
            })
            .parse(req.body);
          res.json(await g.relay.resume(call.producer, call.creatorId));
        },
      );
      // The connected owner's own live truth, for a signed-in person reading
      // their list: this message is gone for good.
      router.post(
        "/live",
        async (req: { body: unknown }, res: { json(v: unknown): void }) => {
          const call = z
            .strictObject({ aggregateId: z.uuid(), gone: z.boolean() })
            .parse(req.body);
          if (call.gone) gone.add(call.aggregateId);
          else gone.delete(call.aggregateId);
          res.json({ gone: [...gone] });
        },
      );
      // The real growth erasure and export over a fake authority: W8's job lease
      // is the part that does not exist here, so the authority check says "these
      // are the creators this account owned" and nothing more.
      router.post(
        "/erase",
        async (req: { body: unknown }, res: { json(v: unknown): void }) => {
          const call = z
            .strictObject({
              accountId: z.uuid(),
              ownedCreatorIds: z.array(z.uuid()).default([]),
            })
            .parse(req.body);
          await g.service.privacyDelete(
            call.accountId,
            new AbortController().signal,
            async () => call.ownedCreatorIds,
          );
          res.json({ erased: true });
        },
      );
      router.post(
        "/export",
        async (req: { body: unknown }, res: { json(v: unknown): void }) => {
          const call = z
            .strictObject({
              accountId: z.uuid(),
              ownedCreatorIds: z.array(z.uuid()).default([]),
            })
            .parse(req.body);
          const stream = growthAccountExport(
            g.service,
            call.accountId,
            new AbortController().signal,
            async () => call.ownedCreatorIds,
          );
          const parts: string[] = [];
          for await (const chunk of stream.chunks)
            parts.push(Buffer.from(chunk.data).toString("utf8"));
          await stream.finish();
          res.json({ ndjson: parts.join("") });
        },
      );
      outer.use("/v1/lane5-owners", router);
      return outer;
    },
  };
}

const growthAPIPool = await createGrowthAPIPool(config.databaseUrl);
let growth: Awaited<ReturnType<typeof configureGrowthForBackend>> = null;
const backend = await createConfiguredBackend({
  config,
  identity: new ScenarioIdentity(config.allowedOrigin, "development"),
  guardrails: {
    checkSentence: async () => {
      throw new Error("AI generation is not part of the lane 5 scenarios.");
    },
  },
  assertScopeAllowedInTransaction: trustScopeRestrictionInTransaction(),
  assertAudienceAllowed: trustAudienceRestrictionInTransaction(),
  registerFeatures: async (runtime, onClose) => {
    if (!runtime.audienceIdentity || !runtime.identity)
      throw new Error("Audience identity is required.");
    // Growth first, as in server.ts. Its notification owner needs the content
    // service, which needs growth's relay: the owner is bound once both exist.
    const late: { contentOwner?: ReturnType<typeof contentNoticeOwner> } = {};
    growth = await configureGrowthForBackend({
      ...runtime,
      pool: growthAPIPool ?? runtime.pool,
      assertAllowed: (actor, creatorId) =>
        creatorId
          ? runtime.assertCreatorAllowed(actor, creatorId)
          : runtime.assertActorAllowed(actor),
      provider,
      owners: {
        notificationState: composeNotificationOwners({
          content: async (event, recipient, custody) =>
            late.contentOwner
              ? late.contentOwner(event, recipient, custody)
              : {
                  retryable: true,
                  available: false,
                  authorized: false,
                  version: 0,
                  creatorName: "",
                  authorKind: "system",
                  safePreview: "",
                  destination: "/notifications",
                },
          // A connected conversation owner would answer live for a signed-in
          // person's own list: "gone" if it says so, no opinion otherwise.
          conversation: async (event) => ({
            retryable: !gone.has(event.aggregateId),
            available: false,
            authorized: false,
            version: 0,
            creatorName: "",
            authorKind: "system",
            safePreview: "",
            destination: "/notifications",
          }),
        }),
      },
    });
    if (!growth) throw new Error("Growth is not enabled.");
    const stopGrowth = growth;
    onClose(() => stopGrowth.close());
    const composition = composeContentHost({
      pool: runtime.pool,
      owners: {
        conversation: runtime.conversation,
        access: runtime.access,
        profiles: runtime.identity.profiles,
      },
      dependencies: {
        assertAllowed: runtime.assertCreatorAllowed,
        assertAllowedInTransaction: trustContentRestrictionInTransaction(),
      },
      tenure: { audienceIdentity: runtime.audienceIdentity },
      creatorTenure: {
        holdCreatorFanNegativeAuthority:
          trustCreatorFanRestrictionInTransaction(),
      },
      notices: { relay: growth.relay },
    });
    const content = new ContentService(runtime.pool, composition.dependencies);
    composition.bindContent(content);
    late.contentOwner = contentNoticeOwner({ pool: runtime.pool, content });
    runtime.configureSignedSubjects([contentSignedSubjects(content)]);
    return [
      contentFeature(content),
      growth.feature,
      standInOwners(growth, runtime.pool),
    ];
  },
});

(growth as { start(): void } | null)?.start();
backend.server.listen(config.port, "127.0.0.1", () =>
  process.stdout.write(`lane 5 scenario host listening on ${config.port}\n`),
);
const stop = () =>
  void backend.close().then(async () => {
    gateway.close();
    await growthAPIPool?.end();
    process.exit(0);
  });
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

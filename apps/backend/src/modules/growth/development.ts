/** Explicit loopback-only W7 development runner. Never imported by production bootstrap. */
import express from "express";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import { GrowthDatabase } from "./database.js";
import { GrowthService } from "./service.js";
import { createGrowthRouter } from "./router.js";
import {
  unavailableOwners,
  type PublicCreator,
  type GrowthOwners,
  type GrowthEvent,
} from "./contracts.js";

if (
  process.env.NODE_ENV === "production" ||
  process.env.QELVORA_GROWTH_DEVELOPMENT !== "true"
)
  throw new Error(
    "This runner requires explicit non-production development mode.",
  );
const creatorId = "70000000-0000-4000-8000-000000000001";
const creatorAccount = "70000000-0000-4000-8000-000000000002";
const fanAccount = "70000000-0000-4000-8000-000000000003";
const postId = "70000000-0000-4000-8000-000000000004";
const db = new GrowthDatabase(
  new pg.Pool({
    connectionString:
      process.env.W7_DATABASE_URL ??
      "postgresql://growth_runtime@127.0.0.1:55437/creator_w7",
    max: 5,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    query_timeout: 6000,
  }),
  new pg.Pool({
    connectionString:
      process.env.W7_WORKER_DATABASE_URL ??
      "postgresql://growth_worker@127.0.0.1:55437/creator_w7",
    max: 3,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    query_timeout: 6000,
  }),
);
await db.ready();
const owners: GrowthOwners = {
  ...unavailableOwners,
  creatorFor: async (actor) =>
    actor.accountId === creatorAccount ? creatorId : null,
  notificationState: async (event, recipient) => {
    const post = await service.post("maya", postId);
    return {
      available: Boolean(post),
      authorized: recipient.accountId === fanAccount,
      version: post?.post.version ?? 0,
      creatorName: "Maya",
      authorKind: "human_broadcast",
      audienceLabel: "followers",
      safePreview: post?.post.body.split("\n")[0] ?? "",
      destination: `/creators/maya/posts/${postId}`,
    };
  },
};
const key = process.env.W7_ENCRYPTION_KEY;
if (!key) throw new Error("W7_ENCRYPTION_KEY is required (64 hex digits).");
const service = new GrowthService(db, owners, Buffer.from(key, "hex"));
const identityOrigin = process.env.W7_IDENTITY_API_URL
  ? new URL(process.env.W7_IDENTITY_API_URL)
  : null;
if (
  identityOrigin &&
  (identityOrigin.protocol !== "http:" ||
    !["localhost", "127.0.0.1"].includes(identityOrigin.hostname) ||
    identityOrigin.username ||
    identityOrigin.password)
)
  throw new Error(
    "The development identity bridge must use an explicit loopback W1 API.",
  );
const actorFor = async (req: express.Request) => {
  const authorization = req.headers.authorization;
  if (authorization && identityOrigin) {
    const response = await fetch(
      new URL("/v1/identity/session", identityOrigin),
      {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok)
      throw new DomainError(
        "session_required",
        "Continue with Pantopus to use this feature.",
        401,
      );
    const session = (await response.json()) as {
      accountId: string;
      adultEligible: boolean;
    };
    return {
      accountId: z.uuid().parse(session.accountId),
      adultEligible: z.literal(true).parse(session.adultEligible),
    };
  }
  const selected = req.headers["x-w7-development-actor"];
  if (selected !== "fan" && selected !== "creator")
    throw new DomainError(
      "session_required",
      "Continue with Pantopus to use this feature.",
      401,
    );
  return {
    accountId: selected === "fan" ? fanAccount : creatorAccount,
    adultEligible: true,
  };
};
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.get("/health", (_req, res) =>
  res.json({
    ready: true,
    environment: "synthetic-development",
    identity: identityOrigin ? "canonical-development-bridge" : "unconfigured",
    providers: "unconfigured",
  }),
);
// Forward only W1's existing development session surface. W7 neither issues nor stores identity.
app.use("/v1/identity", async (req, res, next) => {
  if (
    !identityOrigin ||
    !/^(?:GET (?:\/capabilities|\/session)|POST \/(?:continue|complete|refresh|logout|revoke-sessions|fan-profile))$/u.test(
      `${req.method} ${req.path}`,
    )
  )
    return next();
  const response = await fetch(
    new URL(`/v1/identity${req.path}`, identityOrigin),
    {
      method: req.method,
      headers: {
        "Content-Type": "application/json",
        ...(req.headers.authorization
          ? { Authorization: req.headers.authorization }
          : {}),
      },
      ...(req.method === "POST" ? { body: JSON.stringify(req.body) } : {}),
      signal: AbortSignal.timeout(5000),
    },
  );
  res.setHeader("Cache-Control", "no-store");
  res
    .status(response.status)
    .type("application/json")
    .send(await response.text());
});
app.use("/v1/growth", createGrowthRouter(service, actorFor));
// Development console operates the real durable projection module, never canonical peer state.
app.get("/development/state", async (_req, res) =>
  res.json({
    creator: await service.creator("maya"),
    providerMode: "unconfigured",
    actors: ["signed_out", "fan", "creator"],
  }),
);
app.post("/development/publish", async (req, res) => {
  const value = z
    .strictObject({
      state: z.enum(["published", "paused", "unpublished", "revoked"]),
    })
    .parse(req.body);
  const current = await db.worker.query(
    "SELECT version FROM growth.creator_public WHERE id=$1",
    [creatorId],
  );
  const creator: PublicCreator = {
    id: creatorId,
    version: Number(current.rows[0]?.version ?? 0) + 1,
    handle: "maya",
    name: "Maya",
    biography:
      "Glazes, kilns and the long patience of both. I teach what fifteen years of firing got wrong first.",
    category: "Crafts",
    mode: "expert_and_companion",
    state: value.state,
    verified: true,
    topics: ["cone 6 glazes", "kiln repair", "studio setup"],
    sourceSummary: "Development public-source summary · no private source text",
    reliability: "Decision history is not available yet.",
    capacity: "Human request capacity is not connected yet.",
    presence: "Personal reply history is not connected yet.",
    photoCaption: "PHOTO · MAYA'S STUDIO",
    membershipLabel: null,
    accessLines: [
      "You can: browse public posts and follow.",
      "Included: a first conversation of about 24 hours once available.",
      "By request: creator modes are not connected yet.",
      "Changes: membership details are not connected yet.",
    ],
    updatedAt: new Date().toISOString(),
  };
  await service.projectCreator(creator);
  res.json({ saved: true, version: creator.version });
});
app.post("/development/post", async (_req, res) => {
  const current = await db.worker.query(
    "SELECT version FROM growth.content_public WHERE id=$1",
    [postId],
  );
  const version = Number(current.rows[0]?.version ?? 0) + 1;
  await service.projectContent({
    id: postId,
    creatorId,
    version,
    state: "published",
    audience: "public",
    title: "The kiln opening: three test tiles",
    body: "Opened the kiln this morning. The new celadon test came out the color of shallow water.",
    authorKind: "human_broadcast",
    authorLabel: "Maya · to followers",
    signedActId: "70000000-0000-4000-8000-000000000005",
    publishedAt: new Date().toISOString(),
    aiContextEligible: true,
  });
  const event: GrowthEvent = {
    id: randomUUID(),
    schemaVersion: 1,
    type: "note",
    creatorId,
    aggregateId: postId,
    aggregateVersion: version,
    causationId: randomUUID(),
    correlationId: randomUUID(),
    occurredAt: new Date().toISOString(),
    recipients: [{ accountId: fanAccount, role: "fan" }],
  };
  await service.notifications.consume(event);
  res.json({ saved: true, eventId: event.id, syntheticSignedEvidence: true });
});
app.post("/development/insight", async (req, res) => {
  const value = z
    .strictObject({
      fan: z.int().min(1).max(20),
      topic: z.enum(["bisque-temperature", "first-kiln"]),
      version: z.int().positive().default(1),
      unresolved: z.boolean().default(true),
      window: z
        .enum(["2026-09-07", "2026-09-14", "2026-09-21"])
        .default("2026-09-14"),
    })
    .parse(req.body);
  const fanId = `70000000-0000-4000-8000-${String(100 + value.fan).padStart(12, "0")}`;
  await service.signal({
    id: randomUUID(),
    version: value.version,
    creatorId,
    fanAccountId: fanId,
    topicKey: value.topic,
    window: value.window,
    unresolved: value.unresolved,
  });
  res.json({ saved: true });
});
app.post("/development/close-insights", async (req, res) => {
  const { window } = z
    .strictObject({
      window: z.enum(["2026-09-07", "2026-09-14", "2026-09-21"]),
    })
    .parse(req.body);
  await service.closeWindow(creatorId, window);
  res.json({ closed: true });
});
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    void next;
    res.status(error instanceof DomainError ? error.status : 400).json({
      error: {
        code: "development_action_unavailable",
        message: "This development action could not be completed.",
      },
    });
  },
);
const server = app.listen(Number(process.env.PORT ?? 4107), "127.0.0.1", () =>
  process.stdout.write(
    "W7 development API on loopback; synthetic projections and unconfigured providers.\n",
  ),
);
const timer = setInterval(() => {
  void service.notifications.drain().catch(() => {});
}, 5000);
process.on("SIGTERM", () => {
  clearInterval(timer);
  server.close(() => {
    void Promise.all([db.runtime.end(), db.worker.end()]).then(() =>
      process.exit(0),
    );
  });
});

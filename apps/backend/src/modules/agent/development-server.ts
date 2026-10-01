/** Isolated W2 launcher. Uses W1's explicit loopback development identity; no production account issuer. */
import express from "express";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { DevelopmentIdentityAdapter } from "../identity/development.js";
import { resolveActor } from "../identity/adapter.js";
import { Database } from "../../db/database.js";
import { modelFromEnvironment } from "./model.js";
import { createAgentDomain } from "./integration.js";
import { agentFeature } from "./feature.js";
import { DomainError } from "../../core/errors.js";

if (
  process.env.NODE_ENV !== "development" ||
  process.env.W2_DEVELOPMENT_MODE !== "true"
)
  throw new Error("Explicit loopback W2 development mode is required.");
const dbUrl = process.env.W2_DATABASE_URL;
if (!dbUrl)
  throw new Error("Set W2_DATABASE_URL to a non-owner W2 database role.");
const pool = new pg.Pool({ connectionString: dbUrl, max: 8 });
await new Database(pool).assertRuntimeRole();
const identity = new DevelopmentIdentityAdapter(
  "http://localhost:3002",
  "development",
);
const model = modelFromEnvironment();
const domain = createAgentDomain({ pool, model });
const feature = agentFeature({ domain, pool, development: true });
const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Request-Id", randomUUID());
  next();
});
app.use(express.json({ limit: "1100kb" }));
app.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    environment: "w2-isolated-development",
    identity: "W1 synthetic loopback",
    database: "non-owner RLS",
    model: model ? "configured" : "unconfigured",
    publishAvailable: false,
  }),
);
app.use(
  feature.path,
  feature.router({
    actorFor: async (req) => {
      const token = req.headers.authorization?.match(/^Bearer ([^\s]+)$/u)?.[1];
      if (!token)
        throw new DomainError(
          "session_required",
          "Continue with Pantopus to use Studio.",
          401,
        );
      return resolveActor(identity, token);
    },
    scopeFor: async () => {
      throw new DomainError(
        "fan_delivery_unconfigured",
        "This isolated Studio does not issue interactive fan scopes.",
        503,
      );
    },
  }),
);
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    void _next;
    const large =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 413;
    const invalid = error instanceof SyntaxError;
    res.status(large ? 413 : invalid ? 400 : 500).json({
      error: {
        code: large
          ? "source_large"
          : invalid
            ? "invalid_request"
            : "service_unavailable",
        message: large
          ? "Use a text file up to 1 MB."
          : invalid
            ? "Check the fields and try again."
            : "Studio is temporarily unavailable.",
      },
    });
  },
);
const creatorId = process.env.W2_CREATOR_ID;
const accountId = process.env.W2_DEVELOPMENT_ACCOUNT_ID;
const controller = new AbortController();
const worker = domain.ingestion;
const timer = setInterval(() => {
  if (creatorId && accountId)
    void worker
      .tick({ creatorId, accountId, development: true }, controller.signal)
      .catch(() =>
        process.stderr.write(
          "W2 ingestion is unavailable; inspect scoped source state.\n",
        ),
      );
}, 1000);
const server = app.listen(Number(process.env.PORT ?? 4102), "127.0.0.1", () =>
  process.stdout.write(
    "W2 development API listening on loopback; external fan publication is disabled.\n",
  ),
);
const stop = () => {
  clearInterval(timer);
  controller.abort();
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

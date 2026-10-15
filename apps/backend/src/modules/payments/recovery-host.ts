/**
 * Development only: runs the commerce scheduler as its own process beside a
 * development backend, on the same database and with the same payment
 * settings, until a host composes `createDevelopmentCommerceRecovery`
 * in-process. Start it with the backend's settings file:
 *
 *   node --env-file=<backend settings> --import tsx src/modules/payments/recovery-host.ts
 *
 * COMMERCE_RECOVERY_INTERVAL_MS sets the pass interval (default 15 s). With
 * STRIPE_WEBHOOK_SECRET and COMMERCE_WEBHOOK_PORT it also receives the
 * processor's notifications on 127.0.0.1 at
 * /v1/commerce/provider-notifications/stripe, written with the runtime login,
 * which may only insert them. COMMERCE_INBOX_DATABASE_URL names the separate
 * login that may claim them; without it notifications wait and the due scan
 * still finishes every request.
 */
import express from "express";
import { createServer } from "node:http";
import pg from "pg";
import { readConfig } from "../../config.js";
import { Database } from "../../db/database.js";
import { DomainError } from "../../core/errors.js";
import { AccessService } from "../access/scope.js";
import { DevelopmentIdentityAdapter } from "../identity/development.js";
import { CommerceService } from "../commerce/service.js";
import { readCommerceEnvironment } from "../commerce/environment.js";
import { createStripeInboxRouter } from "./inbox.js";
import { createDevelopmentCommerceRecovery } from "./recovery.js";

const config = readConfig();
const loopback = (url: string | undefined) =>
  Boolean(url && ["127.0.0.1", "localhost"].includes(new URL(url).hostname));
if (
  process.env.NODE_ENV !== "development" ||
  config.identityAdapter !== "development" ||
  !loopback(config.databaseUrl) ||
  (process.env.COMMERCE_INBOX_DATABASE_URL &&
    !loopback(process.env.COMMERCE_INBOX_DATABASE_URL))
)
  throw new Error(
    "The commerce scheduler host runs only beside a loopback development backend.",
  );
const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 5,
  connectionTimeoutMillis: 5000,
});
const db = new Database(pool);
await db.assertRuntimeRole();
const inbox = process.env.COMMERCE_INBOX_DATABASE_URL
  ? new pg.Pool({
      connectionString: process.env.COMMERCE_INBOX_DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 5000,
    })
  : undefined;
const commerce = readCommerceEnvironment(pool);
if (!commerce || !("payments" in commerce))
  throw new Error("The commerce scheduler needs the payment settings.");
const service = new CommerceService(
  pool,
  db,
  new AccessService(pool),
  { ...commerce.policy, costAllowanceIntegrated: false },
  commerce.payments,
);
const requested = Number(process.env.COMMERCE_RECOVERY_INTERVAL_MS ?? 15_000);
const interval =
  Number.isSafeInteger(requested) && requested >= 200 ? requested : 15_000;
const recovery = await createDevelopmentCommerceRecovery({
  service,
  pool,
  identity: new DevelopmentIdentityAdapter(
    config.allowedOrigin,
    process.env.NODE_ENV,
  ),
  ...(inbox ? { inbox } : {}),
  intervalMs: interval,
});
recovery.start();
process.stdout.write(
  `Commerce scheduler: a recovery pass every ${interval} ms on the development database${inbox ? ", claiming notifications" : ""}.\n`,
);

let listener: ReturnType<typeof createServer> | undefined;
const port = Number(process.env.COMMERCE_WEBHOOK_PORT);
if (process.env.STRIPE_WEBHOOK_SECRET && Number.isSafeInteger(port)) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    "/v1/commerce/provider-notifications/stripe",
    createStripeInboxRouter(
      pool,
      process.env.STRIPE_WEBHOOK_SECRET,
      process.env.STRIPE_COLLECTION_ACCOUNT ?? "platform",
    ),
  );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;
      const domain =
        error instanceof DomainError
          ? error
          : new DomainError(
              "service_unavailable",
              "The notification could not be recorded.",
              503,
            );
      res
        .status(domain.status)
        .json({ error: { code: domain.code, message: domain.message } });
    },
  );
  listener = createServer(app).listen(port, "127.0.0.1", () =>
    process.stdout.write(
      `Commerce notifications: listening on 127.0.0.1:${port}.\n`,
    ),
  );
}

const stop = () => {
  listener?.close();
  void recovery
    .close()
    .then(() => Promise.all([pool.end(), inbox?.end()]))
    .then(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

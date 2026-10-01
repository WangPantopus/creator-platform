/** Isolated developer host; production integrates createCommerceRouter in W1 bootstrap. */
import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { createServer } from "node:http";
import pg from "pg";
import { z, ZodError } from "zod";
import { createApp } from "../../app.js";
import { readConfig } from "../../config.js";
import { Database } from "../../db/database.js";
import { DomainError } from "../../core/errors.js";
import { AccessService } from "../access/scope.js";
import { ConversationService } from "../conversation/service.js";
import { DevelopmentIdentityAdapter } from "../identity/development.js";
import { SessionService } from "../identity/sessions.js";
import { IdentityProfiles } from "../identity/profiles.js";
import { PasskeyService } from "../identity/passkeys.js";
import { SignedActService } from "../identity/signed-acts.js";
import { CommerceService } from "./service.js";
import { commerceFeature, commerceSignedSubjects } from "./registration.js";
import { ExtendedCommerce } from "./extended.js";
import { StripePaymentProvider } from "../payments/provider.js";
import { createStripeInboxRouter } from "../payments/inbox.js";
import { MembershipBilling } from "./billing.js";

const config = readConfig();
if (
  process.env.NODE_ENV !== "development" ||
  !config.databaseUrl ||
  !config.identitySessionKey ||
  !config.featureEnabled ||
  config.port !== 4104
)
  throw new Error(
    "W4 isolated host requires explicit development configuration, database/session key and reserved port 4104.",
  );
const databaseUrl = new URL(config.databaseUrl);
if (
  !["localhost", "127.0.0.1"].includes(databaseUrl.hostname) ||
  databaseUrl.port !== "55444" ||
  databaseUrl.pathname !== "/creator_w4"
)
  throw new Error("W4 host only connects to its isolated local database.");
const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5000,
});
const database = new Database(pool);
await database.assertRuntimeRole();
const access = new AccessService(pool);
const upstream = new DevelopmentIdentityAdapter(
  config.allowedOrigin,
  process.env.NODE_ENV,
);
const sessions = new SessionService(
  pool,
  upstream,
  Buffer.from(config.identitySessionKey, "base64"),
);
const signing = new SignedActService(
  pool,
  config.rpId,
  config.allowedOrigin,
  undefined,
  [commerceSignedSubjects],
);
const platformIdentity = {
  sessions,
  profiles: new IdentityProfiles(pool),
  passkeys: new PasskeyService(
    pool,
    config.rpId,
    [config.allowedOrigin],
    "Creator Platform",
  ),
  signing,
};
const provider =
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_API_VERSION
    ? new StripePaymentProvider(
        process.env.STRIPE_SECRET_KEY,
        process.env.STRIPE_API_VERSION,
      )
    : undefined;
const service = new CommerceService(
  pool,
  database,
  access,
  {
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/u)
      .parse(process.env.COMMERCE_CURRENCY),
    limitOptions: [],
    passEnabled: false,
    ...(process.env.STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_")
      ? { stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY }
      : {}),
  },
  provider,
);
const app = express();
app.disable("x-powered-by");
if (process.env.STRIPE_WEBHOOK_SECRET)
  app.use(
    "/v1/commerce/provider-notifications/stripe",
    createStripeInboxRouter(pool, process.env.STRIPE_WEBHOOK_SECRET),
  );
app.use(express.json({ limit: "64kb" }));
app.use(
  createApp(config, {
    identity: sessions,
    platformIdentity,
    access,
    conversation: new ConversationService(database, access, {
      checkSentence: async () => {
        throw new Error("AI is not configured.");
      },
    }),
    signing,
    generationAvailable: false,
    features: [
      commerceFeature(
        service,
        new ExtendedCommerce(
          service,
          undefined,
          undefined,
          new MembershipBilling(service),
        ),
      ),
    ],
  }),
);
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  void _next;
  const domain =
    error instanceof DomainError
      ? error
      : error instanceof ZodError
        ? new DomainError(
            "invalid_request",
            "Check the information and try again.",
            400,
          )
        : new DomainError(
            "service_unavailable",
            "The service is unavailable. Your input has been kept.",
            503,
          );
  res
    .status(domain.status)
    .json({ error: { code: domain.code, message: domain.message } });
});
const server = createServer(app);
server.listen(config.port, "127.0.0.1", () =>
  process.stdout.write(
    "W4 API 4104: synthetic development identity; payment/store providers unavailable unless explicitly configured.\n",
  ),
);
const stop = () =>
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

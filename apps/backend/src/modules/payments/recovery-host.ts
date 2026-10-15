/**
 * Development only: runs the commerce scheduler as its own process beside a
 * development backend, on the same database and with the same payment
 * settings, until a host composes `createDevelopmentCommerceRecovery`
 * in-process. Start it with the backend's settings file:
 *
 *   node --env-file=<backend settings> --import tsx src/modules/payments/recovery-host.ts
 *
 * COMMERCE_RECOVERY_INTERVAL_MS sets the pass interval (default 15 s).
 */
import pg from "pg";
import { readConfig } from "../../config.js";
import { Database } from "../../db/database.js";
import { AccessService } from "../access/scope.js";
import { DevelopmentIdentityAdapter } from "../identity/development.js";
import { CommerceService } from "../commerce/service.js";
import { readCommerceEnvironment } from "../commerce/environment.js";
import { createDevelopmentCommerceRecovery } from "./recovery.js";

const config = readConfig();
const database = config.databaseUrl ? new URL(config.databaseUrl) : undefined;
if (
  process.env.NODE_ENV !== "development" ||
  config.identityAdapter !== "development" ||
  !database ||
  !["127.0.0.1", "localhost"].includes(database.hostname)
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
  intervalMs: interval,
});
recovery.start();
process.stdout.write(
  `Commerce scheduler: a recovery pass every ${interval} ms on the development database.\n`,
);
const stop = () => {
  void recovery
    .close()
    .then(() => pool.end())
    .then(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

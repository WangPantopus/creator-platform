import { createServer } from "node:http";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import express from "express";
import { createTrustRuntime } from "./runtime.js";

// The deployed adapter is a reviewed release artifact supplied by W1/domain
// integrations. No HTTP module loading, development identity or fallback owner DB.
const environment = process.env.DEPLOYMENT_ENVIRONMENT;
if (!["review", "staging", "production"].includes(environment ?? ""))
  throw new Error("Choose a deployed environment.");
if (
  process.env.W8_LOCAL_DEVELOPMENT ||
  process.env.IDENTITY_ADAPTER === "development"
)
  throw new Error("Development adapters cannot be deployed.");
const modulePath = process.env.TRUST_ADAPTER_MODULE;
const release = process.env.RELEASE_REVISION;
if (!modulePath || !release || !/^[a-f0-9]{40,64}$/.test(release))
  throw new Error(
    "A reviewed adapter module and immutable release digest are required.",
  );
const root = resolve(process.cwd(), "integrations");
const path = resolve(modulePath);
if (!path.startsWith(root + sep) || !path.endsWith(".mjs"))
  throw new Error("Adapter must be a bundled local integration artifact.");
type Options = Parameters<typeof createTrustRuntime>[0];
const adapter = (await import(pathToFileURL(path).href)) as {
  configure?: () => Promise<Options>;
};
if (typeof adapter.configure !== "function")
  throw new Error("The adapter must export configure().");
const options = await adapter.configure();
if (options.environment !== environment || options.release !== release)
  throw new Error(
    "Adapter environment/release does not match this deployment.",
  );
if (!options.probes.some((p) => p.name === "identity" && p.required))
  throw new Error("An actual required identity probe is mandatory.");
const runtime = await createTrustRuntime(options);
const app = express();
app.disable("x-powered-by");
app.use(runtime.router);
const server = createServer(app);
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
await runtime.start();
const port = Number(process.env.PORT ?? 4108);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid service port.");
server.listen(port, "0.0.0.0", () =>
  process.stdout.write(
    JSON.stringify({
      level: "info",
      event: "trust_started",
      environment,
      release,
      port,
    }) + "\n",
  ),
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  await runtime.stop();
  await closed;
  await Promise.all([options.apiPool.end(), options.workerPool.end()]);
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());

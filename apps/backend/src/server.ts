import { createServer } from "node:http";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { createConfiguredBackend } from "./integration.js";
import { DevelopmentIdentityAdapter } from "./modules/identity/development.js";

// Production integration supplies dependencies through createApp; no local identity fallback exists.
const config = readConfig();
if (config.identityAdapter === "development" && !config.identitySessionKey) throw new Error("Development identity requires an explicit IDENTITY_SESSION_KEY.");
const configured = config.identityAdapter === "development" ? await createConfiguredBackend({ config, identity: new DevelopmentIdentityAdapter(config.allowedOrigin, process.env.NODE_ENV), guardrails: { checkSentence: async () => { throw new Error("AI generation is unconfigured."); } } }) : undefined;
const server = configured?.server ?? createServer(createApp(config));
server.listen(config.port, () =>
  process.stdout.write(
    `Interactive API listening on ${config.port}; identity mode ${config.identityAdapter ?? "unconfigured"}.\n`,
  ),
);
const shutdown = () => configured ? void configured.close().then(() => process.exit(0)) : server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

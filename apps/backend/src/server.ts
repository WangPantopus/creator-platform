import { createServer } from "node:http";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { createConfiguredBackend } from "./integration.js";
import { DevelopmentIdentityAdapter } from "./modules/identity/development.js";
import { commerceSignedSubjects } from "./modules/commerce/registration.js";
import { createCommerceRuntime } from "./modules/commerce/runtime.js";
import { readCommerceEnvironment } from "./modules/commerce/environment.js";

// Production hosts inject genuine identity, W8 denials and provider dependencies
// into the same configured-host seam. Development identity is always explicit.
const config = readConfig();
if (config.identityAdapter === "development" && !config.identitySessionKey)
  throw new Error(
    "Development identity requires an explicit IDENTITY_SESSION_KEY.",
  );
const configured =
  config.identityAdapter === "development"
    ? await createConfiguredBackend({
        config,
        identity: new DevelopmentIdentityAdapter(
          config.allowedOrigin,
          process.env.NODE_ENV,
        ),
        guardrails: {
          checkSentence: async () => {
            throw new Error("AI generation is unconfigured.");
          },
        },
        signedSubjectPolicies: [commerceSignedSubjects],
        registerFeatures: async ({ pool, database, access }) => {
          const commerce = readCommerceEnvironment(pool);
          return commerce
            ? [
                createCommerceRuntime({ pool, database, access, ...commerce })
                  .feature,
              ]
            : [];
        },
      })
    : undefined;
const server = configured?.server ?? createServer(createApp(config));
server.listen(config.port, () =>
  process.stdout.write(
    `Interactive API listening on ${config.port}; identity mode ${config.identityAdapter ?? "unconfigured"}.\n`,
  ),
);
const shutdown = () =>
  configured
    ? void configured.close().then(() => process.exit(0))
    : server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

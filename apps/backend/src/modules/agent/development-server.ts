/** Isolated W2 launcher. Canonical W1 sessions and W3 conversations share the
 * actual runtime pool; missing licensing/policy/journal never enables delivery. */
import { createConfiguredBackend } from "../../integration.js";
import { readConfig } from "../../config.js";
import { DevelopmentIdentityAdapter } from "../identity/development.js";
import { createConversationRuntime } from "../conversation/runtime.js";
import { modelFromEnvironment } from "./model.js";
import { createAgentDomain } from "./integration.js";
import { agentFeature } from "./feature.js";

if (
  process.env.NODE_ENV !== "development" ||
  process.env.W2_DEVELOPMENT_MODE !== "true"
)
  throw new Error("Explicit loopback W2 development mode is required.");
const dbUrl = process.env.W2_DATABASE_URL;
if (!dbUrl)
  throw new Error("Set W2_DATABASE_URL to a non-owner W2 database role.");
const webOrigin = process.env.WEB_ORIGIN ?? "http://127.0.0.1:3002";
const origin = new URL(webOrigin);
if (
  origin.hostname !== "127.0.0.1" ||
  origin.protocol !== "http:" ||
  origin.origin !== webOrigin
)
  throw new Error("W2 Studio requires an exact 127.0.0.1 HTTP origin.");
const identity = new DevelopmentIdentityAdapter(webOrigin, "development");
const model = modelFromEnvironment();
if (!process.env.IDENTITY_SESSION_KEY)
  throw new Error("Set a private development IDENTITY_SESSION_KEY.");
const config = readConfig({
  ...process.env,
  DATABASE_URL: dbUrl,
  CREATOR_FEATURE_ENABLED: "true",
  IDENTITY_ADAPTER: "development",
  WEB_ORIGIN: webOrigin,
  PASSKEY_RP_ID: "127.0.0.1",
  PASSKEY_ORIGINS: webOrigin,
  PORT: process.env.PORT ?? "4102",
});
let domain: ReturnType<typeof createAgentDomain> | undefined;
let conversations: ReturnType<typeof createConversationRuntime> | undefined;
const backend = await createConfiguredBackend({
  config,
  identity,
  guardrails: {
    checkSentence: async () => {
      throw new Error("Licensed fan generation is unconfigured.");
    },
  },
  registerFeatures: async (runtime) => {
    domain = createAgentDomain({ pool: runtime.pool, model });
    await domain.service.repository.assertRuntimeRole();
    conversations = createConversationRuntime(runtime);
    runtime.configureSignedSubjects(conversations.signedSubjectPolicies);
    return [
      conversations.registration,
      agentFeature({ domain, pool: runtime.pool, development: true }),
    ];
  },
});
if (!domain) throw new Error("Creator AI composition is unavailable.");
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
backend.server.listen(config.port, "127.0.0.1", () =>
  process.stdout.write(
    "W2 development API listening on loopback; external fan publication is disabled.\n",
  ),
);
const stop = () => {
  clearInterval(timer);
  controller.abort();
  conversations?.close();
  void backend.close().then(() => process.exit(0));
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

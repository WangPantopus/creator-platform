/** W3 local host uses W1's loopback development identity. No production identity,
 * provider terms, allowance policy, replies or creator approvals are fabricated. */
import { readFile } from "node:fs/promises";
import { createConfiguredBackend } from "../../integration.js";
import { readConfig } from "../../config.js";
import { DevelopmentIdentityAdapter } from "../identity/development.js";
import { createConversationRuntime } from "./runtime.js";
import { ProviderPolicySchema } from "../../../../../packages/api/src/conversation/contracts.js";

if (
  process.env.NODE_ENV !== "development" ||
  process.env.W3_DEVELOPMENT_MODE !== "true"
)
  throw new Error("Explicit W3 development mode is required.");
const config = readConfig();
if (
  !["localhost", "127.0.0.1"].includes(new URL(config.allowedOrigin).hostname)
)
  throw new Error("W3 development requires a loopback origin.");
const policy = process.env.W3_PROVIDER_POLICY_FILE
  ? ProviderPolicySchema.parse(
      JSON.parse(await readFile(process.env.W3_PROVIDER_POLICY_FILE, "utf8")),
    )
  : undefined;
let conversations: ReturnType<typeof createConversationRuntime> | undefined;
const backend = await createConfiguredBackend({
  config,
  identity: new DevelopmentIdentityAdapter(config.allowedOrigin, "development"),
  guardrails: {
    checkSentence: async () => {
      throw new Error("AI generation is unconfigured.");
    },
  },
  registerFeatures: async (runtime) => {
    conversations = createConversationRuntime({
      ...runtime,
      ...(policy ? { policy } : {}),
    });
    return [conversations.registration];
  },
});
backend.server.listen(config.port, "127.0.0.1", () =>
  process.stdout.write(
    `W3 API on ${config.port}; development identity; AI generation unavailable.\n`,
  ),
);
const close = () => {
  conversations?.close();
  void backend.close().then(() => process.exit(0));
};
process.on("SIGTERM", close);
process.on("SIGINT", close);

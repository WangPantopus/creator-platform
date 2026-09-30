import { readConfig } from "../../config.js";
import { createConfiguredBackend } from "../../integration.js";
import { DevelopmentIdentityAdapter } from "../identity/development.js";

/** Isolated W6 development host. W1's canonical bootstrap mounts the unavailable W6 router.
 * Configure actual domain/provider feature registrations through W1/W8 before enabling media or calling.
 */
const config = readConfig();
if (
  process.env.NODE_ENV !== "development" ||
  config.identityAdapter !== "development"
)
  throw new Error(
    "W6 local runtime requires the explicit loopback W1 development identity adapter.",
  );
const backend = await createConfiguredBackend({
  config,
  identity: new DevelopmentIdentityAdapter(config.allowedOrigin, "development"),
  guardrails: {
    checkSentence: async () => {
      throw new Error("generation_unconfigured");
    },
  },
});
backend.server.listen(config.port, "127.0.0.1", () =>
  process.stdout.write(
    `W6 development API on ${config.port}; media/provider integrations unavailable until configured.\n`,
  ),
);
const shutdown = () => {
  void backend.close().then(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

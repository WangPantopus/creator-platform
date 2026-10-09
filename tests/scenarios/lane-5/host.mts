/**
 * Lane 5 scenario host: the real backend on a real PostgreSQL, for the
 * workflows in tests/scenarios/lane-5. Run it with
 *   node --import tsx tests/scenarios/lane-5/host.mts
 * after tests/scenarios/lane-5/setup.sh has built the disposable database.
 *
 * It composes the same real modules apps/backend/src/server.ts composes for
 * the content workflows (identity sessions, signed acts, the content service
 * and its routes, audience and membership recognition) and the real
 * `creator_trust` denial callbacks over the real denial functions. What it
 * leaves out, and a scenario therefore cannot prove: the later migration waves
 * the stock trust runtime insists on (restoration gate, privacy export), the
 * reply reviewer (a reply stays pending until a decision is recorded) and the
 * conversation, commerce and growth hosts. The identity provider is the
 * development adapter with a longer list of synthetic accounts.
 */
import { createConfiguredBackend } from "../../../apps/backend/src/integration.js";
import { readConfig } from "../../../apps/backend/src/config.js";
import { DevelopmentIdentityAdapter } from "../../../apps/backend/src/modules/identity/development.js";
import { ContentService } from "../../../apps/backend/src/modules/content/service.js";
import {
  contentFeature,
  contentSignedSubjects,
} from "../../../apps/backend/src/modules/content/registration.js";
import {
  createContentCreatorTenureHost,
  createContentTenureHost,
} from "../../../apps/backend/src/modules/content/tenure.js";
import {
  trustAudienceRestrictionInTransaction,
  trustContentRestrictionInTransaction,
  trustCreatorFanRestrictionInTransaction,
  trustScopeRestrictionInTransaction,
} from "../../../apps/backend/src/modules/trust/scope-restriction.js";
import { actorId, ACTOR_COUNT } from "./ids.mjs";

if (process.env.NODE_ENV !== "development")
  throw new Error("The scenario host runs only with NODE_ENV=development.");
const config = readConfig();
const database = new URL(config.databaseUrl ?? "");
if (
  database.hostname !== "127.0.0.1" ||
  !/creator_foundation_lane5/u.test(database.pathname)
)
  throw new Error(
    "The scenario host uses only the lane 5 disposable database.",
  );

class ScenarioIdentity extends DevelopmentIdentityAdapter {
  override readonly developmentActors = Object.freeze(
    Array.from({ length: ACTOR_COUNT }, (_unused, index) =>
      Object.freeze({ id: actorId(index), label: `Scenario actor ${index}` }),
    ),
  );
}

const backend = await createConfiguredBackend({
  config,
  identity: new ScenarioIdentity(config.allowedOrigin, "development"),
  guardrails: {
    checkSentence: async () => {
      throw new Error("AI generation is not part of the lane 5 scenarios.");
    },
  },
  assertScopeAllowedInTransaction: trustScopeRestrictionInTransaction(),
  assertAudienceAllowed: trustAudienceRestrictionInTransaction(),
  registerFeatures: async (runtime) => {
    if (!runtime.audienceIdentity || !runtime.identity)
      throw new Error("Audience identity is required.");
    const content = new ContentService(runtime.pool, {
      assertAllowed: runtime.assertCreatorAllowed,
      assertAllowedInTransaction: trustContentRestrictionInTransaction(),
      ...createContentTenureHost({
        audienceIdentity: runtime.audienceIdentity,
      }),
      ...createContentCreatorTenureHost({
        holdCreatorFanNegativeAuthority:
          trustCreatorFanRestrictionInTransaction(),
      }),
    });
    runtime.configureSignedSubjects([contentSignedSubjects(content)]);
    return [contentFeature(content)];
  },
});

backend.server.listen(config.port, "127.0.0.1", () =>
  process.stdout.write(`lane 5 scenario host listening on ${config.port}\n`),
);
const stop = () => void backend.close().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

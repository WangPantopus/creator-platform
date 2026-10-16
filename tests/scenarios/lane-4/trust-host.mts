/**
 * Lane 4 trust host: the real backend with lane 1's development trust worker
 * and commerce's `settleDeparture` composed in (`createCommerceDeparture`), for
 * tests/scenarios/lane-4. It runs beside the lane 4 stack's backend, with that
 * backend's own settings file and database, on another port:
 *   PORT=56447 node --env-file=<backend settings> --import tsx tests/scenarios/lane-4/trust-host.mts
 * (`trust-host-control.mjs` starts and stops it for a scenario.) Its trust
 * worker claims effects from the same queue as the stock backend's, whose
 * `settleDeparture` is not configured yet; whichever claims an effect runs it.
 *
 * This is also the wiring the integrator copies into server.ts:
 *   createDevelopmentTrust(runtime, { ..., settleDeparture:
 *     createCommerceDeparture({ service: commerce.service, index }) })
 * and, for production, `createAgentDomain({ ..., settleDeparture })` with the
 * production work index (lane 1's adapter) supplying `departureScopes`.
 *
 * 127.0.0.1:56448 POST /departure asks for a settlement directly, with the
 * same input the trust worker passes, so a scenario can ask again.
 * Fakes: the development identity, and the card processor (the Stripe edge
 * in the settings file).
 */
import { createServer } from "node:http";
import { createConfiguredBackend } from "../../../apps/backend/src/integration.js";
import { readConfig } from "../../../apps/backend/src/config.js";
import { DevelopmentIdentityAdapter } from "../../../apps/backend/src/modules/identity/development.js";
import { createDevelopmentTrust } from "../../../apps/backend/src/modules/trust/development.js";
import { CommerceService } from "../../../apps/backend/src/modules/commerce/service.js";
import { readCommerceEnvironment } from "../../../apps/backend/src/modules/commerce/environment.js";
import { DevelopmentCommerceWorkIndex } from "../../../apps/backend/src/modules/payments/development-work-index.js";
import { createCommerceDeparture } from "../../../apps/backend/src/modules/payments/departure.js";

const config = readConfig();
const loopback = (url: string | undefined) =>
  Boolean(url && ["127.0.0.1", "localhost"].includes(new URL(url).hostname));
if (
  process.env.NODE_ENV !== "development" ||
  config.identityAdapter !== "development" ||
  process.env.TRUST_LOCAL_DEVELOPMENT !== "true" ||
  !loopback(config.databaseUrl)
)
  throw new Error(
    "The trust host runs only beside a loopback development backend with development trust.",
  );

const identity = new DevelopmentIdentityAdapter(
  config.allowedOrigin,
  process.env.NODE_ENV,
);
let settleDeparture: ReturnType<typeof createCommerceDeparture> | undefined;
const backend = await createConfiguredBackend({
  config,
  identity,
  guardrails: {
    checkSentence: async () => {
      throw new Error("AI generation is not part of the departure scenarios.");
    },
  },
  trust: async (runtime) => {
    const commerce = readCommerceEnvironment(runtime.pool);
    if (!commerce || !("payments" in commerce))
      throw new Error("The commerce payment settings are required.");
    const service = new CommerceService(
      runtime.pool,
      runtime.database,
      runtime.access,
      { ...commerce.policy, costAllowanceIntegrated: false },
      commerce.payments,
      runtime.assertActorAllowed,
    );
    const index = await DevelopmentCommerceWorkIndex.create(
      runtime.pool,
      identity,
    );
    const settle = createCommerceDeparture({ service, index });
    // Each call and its answer, by codes and counts only, for the scenario.
    settleDeparture = async (input) => {
      try {
        const answer = await settle(input);
        process.stdout.write(
          `${JSON.stringify({ event: "settle_departure", caseId: input.caseId, complete: answer.complete, receipt: answer.receipt })}\n`,
        );
        return answer;
      } catch (error) {
        process.stdout.write(
          `${JSON.stringify({ event: "settle_departure_failed", caseId: input.caseId, code: (error as { code?: string }).code ?? "unknown" })}\n`,
        );
        throw error;
      }
    };
    return createDevelopmentTrust(runtime, { settleDeparture });
  },
});
backend.server.listen(config.port, "127.0.0.1", () =>
  process.stdout.write(`lane 4 trust host listening on ${config.port}\n`),
);

const control = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST" || req.url !== "/departure" || !settleDeparture) {
    res.statusCode = 404;
    res.end("{}");
    return;
  }
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    void settleDeparture!(JSON.parse(raw))
      .then((answer) => res.end(JSON.stringify(answer)))
      .catch((error: { code?: string; message?: string }) => {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: { code: error.code ?? "failed" } }));
      });
  });
});
control.listen(56448, "127.0.0.1");

const stop = () =>
  void backend.close().then(() => {
    control.close();
    process.exit(0);
  });
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

// A reviewed-adapter-module stand-in for the E2.2 scenarios. The real adapters
// (lanes 1, 3, 4, 5) do not exist yet, so every slot is an inert placeholder;
// the production host only has to see them declared. The identity is a fake of
// the outer edge (the Pantopus provider): it never issues a session. Which
// slots exist is chosen by E2_2_VARIANT, a JSON object:
//   { "omit": ["payments"], "developmentIdentity": true, "none": true,
//     "trust": { "environment": "staging" } }
const available = async () => ({ state: "available", code: "fixture" });
const provider = (probe) => ({ probe });

export async function configure(env) {
  const variant = JSON.parse(env.E2_2_VARIANT ?? "{}");
  if (variant.none) return {};
  const adapters = {
    identity: variant.developmentIdentity
      ? {
          mode: "development",
          developmentActors: [
            { id: "10000000-0000-4000-8000-000000000001", label: "Fixture" },
          ],
          beginSession: async () => ({
            redirectUrl: "http://localhost/auth/development",
          }),
          resolveSession: async () => {
            throw new Error("fixture: no sessions");
          },
        }
      : {
          mode: "pantopus",
          beginSession: async () => ({
            redirectUrl: "https://pantopus.example.test/authorize",
          }),
          resolveSession: async () => {
            throw new Error("fixture: no sessions");
          },
        },
    // Placeholder: composing it is expected to fail, which the host must treat as a refusal.
    trust: {
      environment: env.DEPLOYMENT_ENVIRONMENT,
      release: env.RELEASE_REVISION,
      identityMode: "pantopus",
      probes: [],
    },
    registerFeatures: async () => [],
    providers: {
      model: {
        guardrails: { checkSentence: async () => ({ allowed: true }) },
        probe: available,
      },
      license: provider(available),
      payments: {
        stripeNotifications: (_req, _res, next) => next(),
        probe: available,
      },
      push: provider(available),
    },
  };
  Object.assign(adapters.trust, variant.trust ?? {});
  const slots = {
    identity: () => delete adapters.identity,
    trust: () => delete adapters.trust,
    features: () => delete adapters.registerFeatures,
    model: () => delete adapters.providers.model,
    license: () => delete adapters.providers.license,
    payments: () => delete adapters.providers.payments,
    push: () => delete adapters.providers.push,
  };
  for (const name of variant.omit ?? []) slots[name]();
  return adapters;
}

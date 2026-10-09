// What the Help and Your data screens read when they open. Reports, blocks,
// export and deletion are not served yet: a deletion that "succeeds" without
// deleting anything would mislead, so deletion arrives with real semantics in
// work package 7.5 and the others with 7.4.
import { authenticate } from "./identity.mjs";

export function register(router) {
  router.add("GET", "/v1/trust/help", () => ({
    emergencyMessage:
      "If you are in immediate danger, contact local emergency services. An AI cannot provide emergency help.",
    resources: [
      {
        name: "Example helpline",
        region: "Anywhere",
        url: "https://example.invalid/help",
        phone: "000 000 0000",
      },
    ],
  }));

  router.add("GET", "/v1/trust/capabilities", () => ({
    localDevelopment: true,
    actorVerification: "configured",
    verificationMethod: "local",
  }));

  router.add("GET", "/v1/trust/my-cases", (ctx) => {
    authenticate(ctx);
    return {
      items: [
        {
          id: "ca5e0000-0000-4000-8000-000000000001",
          number: 1042,
          kind: "support",
          state: "open",
          version: 1,
        },
      ],
    };
  });

  router.add("GET", "/v1/trust/inbox", (ctx) => {
    authenticate(ctx);
    return { items: [] };
  });

  router.add("GET", "/v1/trust/access-history", (ctx) => {
    authenticate(ctx);
    return {
      items: [
        {
          action: "case_opened",
          purpose: "Support case review",
          created_at: new Date(ctx.world.now() - 86_400_000).toISOString(),
        },
      ],
    };
  });

  router.add("GET", "/v1/trust/privacy/jobs", (ctx) => {
    authenticate(ctx);
    return { items: [] };
  });
}

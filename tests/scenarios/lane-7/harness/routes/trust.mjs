// What the Help and Your data screens read when they open, and (WP 7.4 P5)
// reports, blocks and export, recorded for a scenario to read back from
// /__harness/state. Deletion is not served: a deletion that "succeeds" without
// deleting anything would mislead, so it arrives with real semantics in work
// package 7.5. Inputs are checked as trust/contracts.ts checks them.
import { randomUUID } from "node:crypto";
import { Failure } from "../http.mjs";
import { authenticate } from "./identity.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const invalid = (message = "The request does not match the API contract.") =>
  new Failure(400, "invalid_request", message);
const optionalId = (value) => {
  if (value !== undefined && !UUID.test(value)) throw invalid();
  return value ?? null;
};
const checkReason = (reason) => {
  if (typeof reason !== "string" || reason.trim().length < 12) throw invalid();
};

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

  router.add("POST", "/v1/trust/reports", (ctx) => {
    const { account } = authenticate(ctx);
    const body = ctx.body ?? {};
    checkReason(body.reason);
    const creatorId = optionalId(body.creatorId);
    const messageId = optionalId(body.messageId);
    const requestId = optionalId(body.requestId);
    if (body.kind === "ai_report" && !(creatorId && messageId))
      throw invalid("Choose the AI message being reported.");
    const report = {
      id: randomUUID(),
      number: 2000 + ctx.world.trustCommands.length,
      kind: body.kind,
      state: "open",
      version: 1,
    };
    ctx.world.trustCommands.push({
      command: "report",
      account: account.key,
      kind: body.kind,
      creatorId,
      messageId,
      requestId,
    });
    return report;
  });

  router.add("POST", "/v1/trust/blocks", (ctx) => {
    const { account } = authenticate(ctx);
    const body = ctx.body ?? {};
    checkReason(body.reason);
    if (!UUID.test(body.creatorId ?? "")) throw invalid();
    ctx.world.trustCommands.push({
      command: "block",
      account: account.key,
      creatorId: body.creatorId,
    });
    return {
      blocked: true,
      caseId: randomUUID(),
      enforcement: "deny_record_committed",
      domainIntegration: "pending",
    };
  });

  router.add("POST", "/v1/trust/privacy/jobs", (ctx) => {
    const { account } = authenticate(ctx);
    const body = ctx.body ?? {};
    const creatorId = optionalId(body.creatorId);
    const threadId = optionalId(body.threadId);
    if (
      !["account", "creator", "thread"].includes(body.scope) ||
      (body.scope !== "account" && !creatorId) ||
      (body.scope === "thread" && !threadId) ||
      (body.scope === "account" && (creatorId || threadId)) ||
      (body.scope === "creator" && threadId)
    )
      throw invalid();
    if (body.kind !== "export")
      throw new Failure(
        503,
        "deletion_unavailable",
        "Deletion is not served by this test service.",
      );
    ctx.world.trustCommands.push({
      command: "export",
      account: account.key,
      scope: body.scope,
      creatorId,
      threadId,
    });
    return { id: randomUUID(), state: "queued" };
  });

  router.add("GET", "/v1/trust/privacy/jobs", (ctx) => {
    authenticate(ctx);
    return { items: [] };
  });
}

import { randomUUID } from "node:crypto";
import { ConsentEnvelopeSchema, type ConsentEnvelope } from "@qelvora/api";
import type { Actor } from "./adapter.js";
import { invariant } from "../../core/errors.js";

export function consentEnvelope(
  actor: Actor,
  input: Pick<
    ConsentEnvelope,
    "purpose" | "policyVersion" | "decision" | "scope"
  >,
): ConsentEnvelope {
  invariant(
    actor.adultEligible,
    "adult_eligibility_required",
    "Adult eligibility is required.",
  );
  return ConsentEnvelopeSchema.parse({
    ...input,
    id: randomUUID(),
    schemaVersion: 1,
    actorAccountId: actor.accountId,
    occurredAt: new Date().toISOString(),
  });
}

import type { Database } from "../../db/database.js";
import type { CommerceService } from "../commerce/service.js";
import { CommerceScheduling } from "../commerce/scheduling.js";
import { CommerceFulfillment } from "../commerce/fulfillment.js";
import type { CallProvider } from "./provider.js";
import { AvailabilityService } from "./availability.js";
import { SessionService } from "./service.js";
import { SessionWorker, type CallEffects } from "./worker.js";

/** W1/W8 compose this only after allocating availability, approving grace policy and configuring providers.
 * C06 schedules W4's captured obligation; C07 always delegates settlement to W4's durable consumer.
 */
export function createCommerceCallServices(input: {
  database: Database;
  commerce: CommerceService;
  provider: CallProvider;
  graceSeconds: number;
  effects: Omit<Partial<CallEffects>, "settleEvidence">;
}) {
  const availability = new AvailabilityService(input.database);
  const sessions = new SessionService(
    input.database,
    new CommerceScheduling(input.graceSeconds),
    input.provider,
    availability,
  );
  const fulfillment = new CommerceFulfillment(input.commerce);
  const worker = new SessionWorker(sessions, {
    ...input.effects,
    settleEvidence: (scope, evidence, key) =>
      fulfillment.settleEvidence(scope, evidence, key),
  });
  return { availability, sessions, worker };
}

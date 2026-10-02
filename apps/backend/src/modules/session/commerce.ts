import type { BackendRuntime } from "../../integration.js";
import type { CommerceService } from "../commerce/service.js";
import { CommerceScheduling } from "../commerce/scheduling.js";
import { CommerceFulfillment } from "../commerce/fulfillment.js";
import type { CallProvider } from "./provider.js";
import {
  AvailabilityService,
  type AvailabilityRestriction,
} from "./availability.js";
import { SessionService } from "./service.js";
import { SessionWorker, type CallEffects } from "./worker.js";
import type { CreatorIdentityAuthority } from "../identity/creator-scope.js";
import { InteractiveCallControl } from "./interactive-control.js";
import { DomainError } from "../../core/errors.js";

/** W1/W8 compose this only after allocating availability, approving grace policy and configuring providers.
 * C06 schedules W4's captured obligation; C07 always delegates settlement to W4's durable consumer.
 */
export async function createCommerceCallServices(input: {
  runtime: BackendRuntime;
  commerce: CommerceService;
  provider: CallProvider;
  graceSeconds: number;
  effects: Omit<Partial<CallEffects>, "settleEvidence">;
  creatorIdentity?: CreatorIdentityAuthority;
  assertAvailabilityAllowed?: AvailabilityRestriction;
}) {
  const conversationControl = await InteractiveCallControl.prepare(
    input.runtime,
  );
  if (!conversationControl)
    throw new DomainError(
      "call_control_unconfigured",
      "Calling awaits its canonical held creator control authority.",
      503,
    );
  const availability = new AvailabilityService(
    input.runtime.database,
    input.creatorIdentity,
    input.assertAvailabilityAllowed,
  );
  const sessions = new SessionService(
    input.runtime.database,
    new CommerceScheduling(input.graceSeconds),
    input.provider,
    availability,
    conversationControl,
  );
  const fulfillment = new CommerceFulfillment(input.commerce);
  const worker = new SessionWorker(sessions, {
    ...input.effects,
    settleEvidence: (scope, evidence, key) =>
      fulfillment.settleEvidence(scope, evidence, key),
  });
  return { availability, sessions, worker };
}

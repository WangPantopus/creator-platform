import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import type { CommerceService } from "../commerce/service.js";
import type { EffectHook } from "../trust/contracts.js";
import type { CommerceWorkIndex } from "./inbox.js";

/**
 * Commerce's `settleDeparture` for lane 1's trust effect worker. When ops
 * pauses a creator or revokes her license (`agent.pause`,
 * `agent.revoke_license`), the effect completes only once her open paid
 * requests are settled. Each fan with a live request to her is settled as that
 * fan's own issued actor (`releaseForDeparture`):
 * - not accepted: the hold is released and nothing is charged;
 * - accepted: the deadline stays, and the existing late refund applies.
 * Money still moving makes the answer incomplete, and the worker asks again;
 * asking again once everything is settled changes nothing.
 */
export function createCommerceDeparture(input: {
  service: Pick<CommerceService, "releaseForDeparture">;
  index: Required<Pick<CommerceWorkIndex, "departureScopes">>;
}) {
  return async function settleDeparture(
    effect: Parameters<EffectHook["run"]>[0],
  ) {
    const known = z
      .strictObject({ creatorId: z.uuid(), caseId: z.uuid() })
      .safeParse({ creatorId: effect.creatorId, caseId: effect.caseId });
    if (!known.success)
      throw new DomainError(
        "creator_evidence_required",
        "This case needs a creator.",
        409,
      );
    const { creatorId, caseId } = known.data;
    let released = 0;
    let waiting = 0;
    let accepted = 0;
    for (const { actor } of await input.index.departureScopes(creatorId)) {
      const settled = await input.service.releaseForDeparture(
        actor,
        creatorId,
        caseId,
      );
      released += settled.released;
      waiting += settled.waiting;
      accepted += settled.accepted;
    }
    return {
      complete: waiting === 0,
      receipt: { domain: "commerce", creatorId, released, waiting, accepted },
    };
  };
}

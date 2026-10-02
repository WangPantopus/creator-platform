import { copy } from "@qelvora/copy";
import type { PrivacyHook } from "../trust/contracts.js";
import type { GrowthService } from "./service.js";
import { DomainError } from "../../core/errors.js";
import { z } from "zod";
import {
  growthAccountExport,
  type GrowthPrivacyExportStream,
} from "./privacy-export.js";

type GrowthPrivacyInput = Parameters<PrivacyHook["run"]>[0];
/** W8 verifies the exact live task, binding and captured ownership. */
export type GrowthPrivacyTaskAuthority = (
  input: GrowthPrivacyInput & { leaseToken: string; signal: AbortSignal },
) => Promise<readonly string[]>;
export type GrowthPrivacyHook = Omit<PrivacyHook, "run"> & {
  run(input: GrowthPrivacyInput): Promise<
    Awaited<ReturnType<PrivacyHook["run"]>> & {
      stream?: GrowthPrivacyExportStream;
    }
  >;
};

/** Deprecated host contract: a stored ownership snapshot cannot authorize work.
 * Hosts must supply the current leased-task authority below. */
export type GrowthPrivacyScope = (input: {
  jobId: string;
  accountId: string;
}) => Promise<readonly string[] | null>;
export function growthPrivacyHook(
  service: GrowthService,
  scope?: GrowthPrivacyScope,
  taskAuthority?: GrowthPrivacyTaskAuthority,
): GrowthPrivacyHook {
  // Retain the positional host signature without invoking the non-leased port.
  void scope;
  return {
    domain: "growth",
    run: async (input) => {
      if (input.scope !== "account")
        throw new DomainError(
          "growth_scope_adapter_required",
          copy.growthErrorGrowthScopeAdapterRequired,
          503,
        );
      if (!input.leaseToken || !input.signal || !taskAuthority)
        throw new DomainError(
          "growth_privacy_task_authority_required",
          copy.growthErrorGrowthAccountScopeRequired,
          503,
        );
      const currentTask = {
        ...input,
        leaseToken: input.leaseToken,
        signal: input.signal,
      };
      input.signal.throwIfAborted();
      const ownedCreators = z
        .array(z.uuid())
        .max(100)
        .parse(await taskAuthority(currentTask));
      const ownership = [...new Set(ownedCreators)].sort().join(",");
      const assertAuthority = async () => {
        currentTask.signal.throwIfAborted();
        const current = z
          .array(z.uuid())
          .max(100)
          .parse(await taskAuthority(currentTask));
        if ([...new Set(current)].sort().join(",") !== ownership)
          throw new DomainError(
            "growth_privacy_ownership_changed",
            copy.growthErrorGrowthAccountScopeRequired,
            503,
          );
        currentTask.signal.throwIfAborted();
      };
      await assertAuthority();
      if (input.kind === "delete")
        return {
          receipt: await service.privacyDelete(
            input.accountId,
            ownedCreators,
            input.signal,
            assertAuthority,
          ),
          retained: [
            {
              category: "pseudonymous_erasure_fence",
              until: null,
              reason: copy.growthRetainedErasureFence,
            },
            {
              category: "anonymous_event_dedupe",
              until: null,
              reason: copy.growthRetainedEventDedupe,
            },
            {
              category: "anonymous_closed_fan_aggregates",
              until: null,
              reason: copy.growthRetainedFanAggregates,
            },
          ],
        };
      return {
        receipt: { domain: "growth", format: "growth-account-export-v1" },
        stream: growthAccountExport(
          service,
          input.accountId,
          ownedCreators,
          input.signal,
          assertAuthority,
        ),
        retained: [],
      };
    },
  };
}

import { contentHash } from "../../core/canonical.js";
import type { Version } from "../../../../../packages/api/src/agent/contracts.js";
import type { ShadowSample } from "./shadow-samples.js";

/** Bind both engines and the exact current sample cohort. Legacy passes and
 * expired/replaced cohorts cannot authorize publication. Identity is not proof
 * of sanitization, current consent or deletion provenance. */
export function shadowReplayFingerprint(
  draftFingerprint: string,
  live: Version,
  samples: readonly ShadowSample[],
) {
  return contentHash({
    implementation: "published-engine-shadow-samples-v3",
    draftFingerprint,
    live: {
      id: live.id,
      pipelineHash: live.pipelineHash,
      compiledHash: live.compiledHash,
      sourceSet: live.sourceSet,
    },
    samples: [...samples].sort((a, b) => a.sampleId.localeCompare(b.sampleId)),
  });
}

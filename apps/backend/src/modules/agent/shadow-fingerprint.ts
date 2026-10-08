import { contentHash } from "../../core/canonical.js";
import type { Version } from "../../../../../packages/api/src/agent/contracts.js";

/** Invalidates comparisons that used the draft engine for both sides. This is
 * evidence identity only, not permission to read samples or publish a version. */
export function shadowReplayFingerprint(
  draftFingerprint: string,
  live: Version,
) {
  return contentHash({
    implementation: "published-engine-shadow-v2",
    draftFingerprint,
    live: {
      id: live.id,
      pipelineHash: live.pipelineHash,
      compiledHash: live.compiledHash,
      sourceSet: live.sourceSet,
    },
  });
}

import { licensed } from "./repository.js";
import type { License } from "../../../../../packages/api/src/agent/contracts.js";
export type VoiceReleaseGate = {
  pilotPassed: boolean;
  approvedProviderReference: string | null;
  creatorConsentReference: string | null;
  fanOptIn: boolean;
  mediaProvenanceAvailable: boolean;
  watermarkAvailable: boolean;
  spokenLabelAvailable: boolean;
};
/** W6 renders/stores marked media; W2 makes use authorization, never a live call/video persona. */
export function aiVoiceEligibility(
  license: License | null,
  gate: VoiceReleaseGate,
) {
  const reasons: string[] = [];
  if (!gate.pilotPassed)
    reasons.push("AI voice is available only after the pilot gate.");
  if (!licensed(license, "ai_voice"))
    reasons.push(
      "An active AI-voice license and separate creator consent are required.",
    );
  if (
    !gate.creatorConsentReference ||
    gate.creatorConsentReference !== license?.voiceConsentReference
  )
    reasons.push("Creator voice consent does not match this licensed voice.");
  if (!gate.approvedProviderReference)
    reasons.push("An approved voice provider is required.");
  if (!gate.fanOptIn) reasons.push("The fan has not selected AI voice.");
  if (
    !gate.mediaProvenanceAvailable ||
    !gate.watermarkAvailable ||
    !gate.spokenLabelAvailable
  )
    reasons.push(
      "Persistent AI disclosure, provenance and watermark are required.",
    );
  return {
    allowed: reasons.length === 0,
    reasons,
    authorKind: "ai" as const,
    liveAICallAllowed: false,
    liveAIVideoAllowed: false,
  };
}

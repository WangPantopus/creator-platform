import { z } from "zod";

export const AgentAudience = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("public") }),
  z.strictObject({
    kind: z.literal("tier"),
    ids: z.array(z.uuid()).min(1).max(20),
  }),
  z.strictObject({
    kind: z.literal("group"),
    ids: z.array(z.uuid()).min(1).max(20),
  }),
]);
export type Audience = z.infer<typeof AgentAudience>;
export const Mode = z.enum(["expert", "companion", "blend"]);
export const Example = z.strictObject({
  id: z.uuid(),
  text: z.string().trim().min(1).max(2000),
  fixed: z.boolean(),
  approved: z.boolean(),
});
export const DraftConfig = z.strictObject({
  mode: Mode.default("expert"),
  tone: z.enum(["Plainer", "As written", "Warmer"]).default("As written"),
  styleCard: z.string().max(4000).default(""),
  examples: z.array(Example).max(200).default([]),
  rules: z.array(z.string().trim().min(1).max(500)).max(40).default([]),
  neverReveal: z.array(z.string().trim().min(1).max(200)).max(40).default([]),
  handoff: z.string().max(1000).default(""),
  dailyCostCapMicros: z.number().int().min(0).max(1_000_000_000).default(0),
  sessionNudgeMinutes: z.number().int().min(15).max(90).default(90),
  usefulnessCriteria: z.string().max(2000).default(""),
  styleCriteria: z.string().max(2000).default(""),
});
export type Configuration = z.infer<typeof DraftConfig>;
export const Revision = z.number().int().nonnegative();
export const DraftWrite = z.strictObject({
  expectedRevision: Revision,
  configuration: DraftConfig,
});
export const SourceCreate = z.strictObject({
  title: z.string().trim().min(1).max(160),
  text: z.string().trim().min(1).max(250_000),
  origin: z.enum([
    "manual_text",
    "manual_upload",
    "interview",
    "youtube_caption",
    "platform_export",
  ]),
  originReference: z.string().max(500).optional(),
  audience: AgentAudience,
  rightsEvidence: z.string().trim().min(10).max(2000),
  expiresAt: z.iso.datetime().nullable(),
});
export type SourceInput = z.infer<typeof SourceCreate>;
export const SourceAction = z.strictObject({
  expectedRevision: Revision,
  action: z.enum(["approve", "revoke", "retry", "cancel", "restore"]),
  rightsConfirmed: z.boolean().optional(),
});
export const InterviewWrite = z.strictObject({
  expectedRevision: Revision,
  story: z.string().max(20000),
  boundaries: z.string().max(10000),
  audioConsent: z.boolean().default(false),
});
export const StatusWrite = z.strictObject({
  text: z.string().max(2000),
  expiresAt: z.iso.datetime(),
});
export const SponsorWrite = z.strictObject({
  brand: z.string().trim().min(1).max(80),
  aliases: z.array(z.string().trim().min(2).max(80)).max(20),
  expiresAt: z.iso.datetime(),
  active: z.boolean(),
});
export const EvaluationRequest = z.strictObject({ expectedRevision: Revision });
export const PublishRequest = z.strictObject({
  expectedRevision: Revision,
  evaluationId: z.uuid(),
  changes: z.string().trim().min(1).max(500),
});
export const CorrectionRequest = z.strictObject({
  expectedRevision: Revision,
  paraphrasedPrompt: z.string().trim().min(5).max(1000),
  rule: z.string().trim().min(5).max(500),
  unacceptableAnswer: z.string().max(3000),
});
export const PreviewRequest = z.strictObject({
  expectedRevision: Revision,
  message: z.string().trim().min(1).max(2000),
});
export const LicenseRequest = z.strictObject({
  proofReference: z.string().min(1).max(200),
  counselVersion: z.string().min(1).max(100),
  permittedUses: z
    .array(z.enum(["text_ai", "ai_voice", "sponsored_mentions"]))
    .min(1),
  termEndsAt: z.iso.datetime(),
  voiceConsentReference: z.string().max(200).optional(),
  estateOptInReference: z.string().max(200).optional(),
});
export const BoundaryNames = [
  "Identity disclosure",
  "Out of scope",
  "Restricted-source probe",
  "Unsupported opinion",
  "Never-reveal probe",
  "Instruction override",
] as const;
export type Usage = {
  inputTokens: number;
  outputTokens: number;
  costMicros: number | null;
  model: string;
  provider: string;
};
export type Passage = {
  id: string;
  sourceId: string;
  sourceRevision: number;
  title: string;
  text: string;
  start: number;
  end: number;
  audience: Audience;
};
export type EvaluationCase = {
  name: string;
  state: "pass" | "fail";
  prompt: string;
  answer: string;
  reason: string;
  citations: string[];
  usage: Usage | null;
  pipelineUsage?: Usage[];
  firstApprovedMs?: number | null;
  durationMs: number;
};
export type VersionComparison = {
  paraphrase: string;
  live: {
    sentences: { text: string; citations: string[] }[];
    score: {
      passed: boolean;
      reason: string;
      usefulness: number;
      style: number;
    };
    durationMs: number;
    costMicros: number | null;
  };
  draft: VersionComparison["live"];
};
export type Evaluation = {
  id: string;
  revision: number;
  fingerprint: string;
  state: "running" | "passed" | "failed";
  cases: EvaluationCase[];
  createdAt: string;
  completedAt: string | null;
};
export type Source = {
  id: string;
  revision: number;
  title: string;
  origin: SourceInput["origin"];
  originReference: string | null;
  audience: Audience;
  rightsEvidence: string;
  expiresAt: string | null;
  state: "candidate" | "processing" | "failed" | "approved" | "revoked";
  indexState: "pending" | "ready" | "failed";
  progress: number;
  error: string | null;
  contentHash: string;
  createdAt: string;
  reviewedAt: string | null;
};
export type Version = {
  id: string;
  number: number;
  state: "live" | "retired" | "paused";
  changes: string;
  compiledHash: string;
  sourceSet: { id: string; revision: number; hash: string }[];
  publishedAt: string;
  evaluationId: string;
  configuration: Configuration;
  pipelineHash: string;
};
export type License = {
  state: "active" | "revoked" | "suspended";
  permittedUses: string[];
  termEndsAt: string;
  counselVersion: string;
  proofReference: string;
  voiceConsentReference?: string;
  estateOptInReference?: string;
};
export type StudioState = {
  actorAccountId: string;
  creator: { id: string; name: string; verification: string };
  development: boolean;
  revision: number;
  configuration: Configuration;
  interview: { story: string; boundaries: string; audioConsent: boolean };
  status: { text: string; expiresAt: string } | null;
  sources: Source[];
  versions: Version[];
  liveVersion: Version | null;
  evaluation: Evaluation | null;
  license: License | null;
  sponsors: {
    id: string;
    brand: string;
    aliases: string[];
    expiresAt: string;
    active: boolean;
  }[];
  paused: boolean;
  liveVersionId: string | null;
  gates: string[];
  capabilities: {
    model: boolean;
    embeddings: boolean;
    licensing: boolean;
    audioInterview: boolean;
    aiVoice: boolean;
  };
};

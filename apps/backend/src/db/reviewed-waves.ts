import generationReview from "../../../../infra/migrations/reviews/20261007-generation-privacy.json" with { type: "json" };
import contentReview from "../../../../infra/migrations/reviews/20261007-content-privacy.json" with { type: "json" };
import outputReview from "../../../../infra/migrations/reviews/20261007-generation-first-visible.json" with { type: "json" };
import publicAIReview from "../../../../infra/migrations/reviews/20261007-public-ai.json" with { type: "json" };
import recoveryReview from "../../../../infra/migrations/reviews/20261007-generation-recovery.json" with { type: "json" };
import partialRecoveryReview from "../../../../infra/migrations/reviews/20261007-partial-generation-recovery.json" with { type: "json" };
import comparisonReview from "../../../../infra/migrations/reviews/20261008-comparison.json" with { type: "json" };
import noticesReview from "../../../../infra/migrations/reviews/20261015-notices.json" with { type: "json" };
import signInAndMoneyReview from "../../../../infra/migrations/reviews/20261015-sign-in-and-money.json" with { type: "json" };
import workspaceLockReview from "../../../../infra/migrations/reviews/20261022-workspace-lock.json" with { type: "json" };
import replyReview from "../../../../infra/migrations/reviews/20261023-reply-review.json" with { type: "json" };
import studioReplyAuthorityReview from "../../../../infra/migrations/reviews/20261023-studio-reply-authority.json" with { type: "json" };
import coreFollowReview from "../../../../infra/migrations/reviews/20261027-core-follow.json" with { type: "json" };
import pilotColumnsReview from "../../../../infra/migrations/reviews/20261101-pilot-columns.json" with { type: "json" };
import type { assertGenerationWaveRoleSafety } from "../../scripts/migration-generation-roles.js";
import type { assertPrivacyWaveRoleSafety } from "../../scripts/migration-privacy-roles.js";

// The table of reviewed waves: the one list of waves the runtime and the
// operator share. scripts/migration-chain.ts checks each chain wave against it
// for migrate-trust and the local installer, the head profile
// (comparison-profile.ts) walks it from 20261008-comparison on, and
// scripts/activate-wave.ts takes each wave's refusals from it. Static imports
// keep every review in the production build. A registration adds its wave's
// row at the end (step 6 in docs/engineering/migrations.md).

/** The name the generation role check knows a wave by. */
export type GenerationExtension = NonNullable<
  Parameters<typeof assertGenerationWaveRoleSafety>[1]
>;
/** A stage of the privacy role check: the privacy catalogue it checks while
 * the wave that ends the stage is still to come. */
export type PrivacyStage = Exclude<
  keyof Parameters<typeof assertPrivacyWaveRoleSafety>[1],
  "privacy" | "domain"
>;

/** What activate-wave refuses for a wave, word for word, and what it tells
 * the role checks about it. The role checks still name each wave; the last
 * step of Wave 6's plan has them select by wave id instead. */
export type OperatorWave = Readonly<{
  /** Refused when the ledger holds only some of the wave's sources. */
  partial?: string;
  /** Refused when the wave is selected and the ledger lacks the complete
   * wave before it. */
  activation?: string;
  /** Refused when the ledger holds the wave without the complete wave before
   * it. */
  precedes?: string;
  /** The generation role check's name for the wave. */
  extension?: GenerationExtension;
  /** The privacy stage that ends when the wave is installed. */
  privacy?: PrivacyStage;
  /** The ledger counts toward the wave only when it or a later wave is
   * selected: activate-wave has always read the first three waves this way,
   * and the role checks' arguments depend on it. */
  upToSelected?: true;
  /** The reviewed exception the wave's packet records for applying a source
   * below one already applied. */
  orderingException?: Readonly<{
    review: string;
    precedingWave: string;
    pending: string;
  }>;
  /** Refused when activating the wave changes the number of roles. */
  sameRoleCount?: string;
  /** The role each of its sources adds, and the refusal when activating it
   * adds any other. */
  addedRoles?: Readonly<{
    sources: readonly Readonly<{ version: string; role: string }>[];
    refusal: string;
  }>;
}>;
/** A head wave has all three of activate-wave's refusals and both role-check
 * names, and a short name for the operator's refusal when no head wave is
 * registered. */
export type HeadOperatorWave = OperatorWave &
  Readonly<{
    name: string;
    partial: string;
    activation: string;
    precedes: string;
    extension: GenerationExtension;
    privacy: PrivacyStage;
  }>;

/** The head profile's pins have the comparison review's shape: each later
 * head review is written from the one before it and keeps all its keys. */
export type HeadReview = Readonly<typeof comparisonReview>;
/** A wave from 20261008-comparison on: its review, the head profile's
 * refusal when only part of its sources is registered, and activate-wave's
 * view of it. */
export type HeadWave = Readonly<{
  id: string;
  review: HeadReview;
  partial: string;
  operator: HeadOperatorWave;
}>;
/** A head wave after notices also has the refusal when it is registered
 * without the complete wave before it. Notices' predecessor is comparison,
 * which the head profile requires before it looks at any other wave. */
export type LaterHeadWave = HeadWave & Readonly<{ requires: string }>;

/** The head waves, in the chain's order. */
export const headWaves: readonly [HeadWave, HeadWave, ...LaterHeadWave[]] = [
  {
    id: "20261008-comparison",
    review: comparisonReview,
    partial: "The complete reviewed comparison source graph is required.",
    operator: {
      name: "comparison",
      partial: "Partial comparison graph is not an accepted baseline.",
      activation:
        "Comparison activation requires the complete reviewed106 predecessor.",
      precedes: "Comparison cannot precede original recovery.",
      extension: "comparison",
      privacy: "publicBeforeComparison",
    },
  },
  {
    id: "20261015-notices",
    review: noticesReview,
    partial: "The complete reviewed notices source graph is required.",
    operator: {
      name: "notices",
      partial: "Partial notices wave is not an accepted baseline.",
      activation:
        "Notices activation requires the complete reviewed114 predecessor.",
      precedes: "Notices cannot precede comparison.",
      extension: "notices",
      privacy: "comparisonBeforeNotices",
    },
  },
  {
    id: "20261015-sign-in-and-money",
    review: signInAndMoneyReview,
    partial:
      "The complete reviewed sign-in and money source graph is required.",
    requires:
      "The sign-in and money wave requires the complete reviewed notices source graph.",
    operator: {
      name: "sign-in and money",
      partial: "Partial sign-in and money wave is not an accepted baseline.",
      activation:
        "Sign-in and money activation requires the complete reviewed116 predecessor.",
      precedes: "Sign-in and money cannot precede notices.",
      extension: "sign-in-and-money",
      privacy: "noticesBeforeSignInAndMoney",
    },
  },
  {
    id: "20261022-workspace-lock",
    review: workspaceLockReview,
    partial: "The complete reviewed workspace-lock source graph is required.",
    requires:
      "Workspace locking requires the complete sign-in and money predecessor.",
    operator: {
      name: "workspace-lock",
      partial: "Partial workspace-lock wave is not an accepted baseline.",
      activation:
        "Workspace-lock activation requires the complete reviewed119 predecessor.",
      precedes: "Workspace-lock cannot precede sign-in and money.",
      extension: "workspace-lock",
      privacy: "signInAndMoneyBeforeWorkspaceLock",
    },
  },
  {
    id: "20261023-reply-review",
    review: replyReview,
    partial: "The complete reviewed reply-review source graph is required.",
    requires: "Reply review requires the complete workspace-lock predecessor.",
    operator: {
      name: "reply-review",
      partial: "Partial reply-review wave is not an accepted baseline.",
      activation:
        "Reply-review activation requires the complete reviewed120 predecessor.",
      precedes: "Reply review cannot precede workspace locking.",
      extension: "reply-review",
      privacy: "workspaceLockBeforeReplyReview",
    },
  },
  {
    id: "20261023-studio-reply-authority",
    review: studioReplyAuthorityReview,
    partial:
      "The complete reviewed creator/fan denial source graph is required.",
    requires:
      "Creator/fan denial requires the complete reply-review predecessor.",
    operator: {
      name: "creator/fan denial",
      partial: "Partial creator/fan denial wave is not an accepted baseline.",
      activation:
        "Creator/fan denial activation requires the complete reviewed121 predecessor.",
      precedes: "Creator/fan denial cannot precede reply review.",
      extension: "studio-reply-authority",
      privacy: "replyReviewBeforeStudioReplyAuthority",
      sameRoleCount: "Creator/fan denial must not add a role.",
    },
  },
  {
    id: "20261027-core-follow",
    review: coreFollowReview,
    partial: "The complete reviewed core Follow source graph is required.",
    requires:
      "Core Follow metadata requires the complete creator/fan denial predecessor.",
    operator: {
      name: "core Follow",
      partial: "Partial core Follow wave is not an accepted baseline.",
      activation:
        "Core Follow activation requires the complete reviewed122 predecessor.",
      precedes: "Core Follow cannot precede creator/fan denial.",
      extension: "core-follow",
      privacy: "studioReplyAuthorityBeforeCoreFollow",
      addedRoles: {
        sources: [
          {
            version: "0255_w7_core_follow_metadata",
            role: "creator_growth_follow_metadata",
          },
        ],
        refusal: "Core Follow may add only its isolated metadata role.",
      },
    },
  },
  {
    id: "20261101-pilot-columns",
    review: pilotColumnsReview,
    partial: "The complete reviewed pilot-columns source graph is required.",
    requires: "The pilot columns require the complete core Follow predecessor.",
    operator: {
      name: "pilot-columns",
      partial: "Partial pilot-columns wave is not an accepted baseline.",
      activation:
        "Pilot-columns activation requires the complete reviewed123 predecessor.",
      precedes: "Pilot columns cannot precede core Follow.",
      extension: "pilot-columns",
      privacy: "coreFollowBeforePilotColumns",
      addedRoles: {
        sources: [
          {
            version: "0258_w4_provider_inbox_worker",
            role: "creator_commerce_inbox",
          },
        ],
        refusal:
          "The pilot-columns wave must add exactly the commerce inbox login; a login that already exists is refused.",
      },
    },
  },
];

/** Each wave after the canonical bootstrap that this revision has a review
 * for, in the chain's order: the sources its review names, the packet its
 * review pins (every review but the first's), and activate-wave's view of
 * it. The reviews of the content, output and recovery waves name theirs as
 * `source`. */
export const reviewedWaves: readonly Readonly<{
  id: string;
  sources: readonly Readonly<{
    version: string;
    path: string;
    checksum: string;
  }>[];
  baselineWave?: Readonly<{ path: string; sha256: string }>;
  operator: OperatorWave;
}>[] = [
  {
    id: "20261007-generation",
    sources: generationReview.sources,
    operator: {
      partial:
        "Partial generation wave is not an accepted baseline; no repair was attempted.",
      privacy: "canonicalBeforeGeneration",
      upToSelected: true,
    },
  },
  {
    id: "20261007-content",
    sources: [contentReview.source],
    baselineWave: contentReview.baselineWave,
    operator: {
      activation:
        "Content activation requires the complete reviewed100-source predecessor.",
      extension: "content-privacy",
      privacy: "generationBeforeContent",
      upToSelected: true,
      orderingException: {
        review: "20261007-content-privacy",
        precedingWave: "20261007-generation",
        pending: "0198_w5_content_privacy_export",
      },
    },
  },
  {
    id: "20261007-generation-output",
    sources: [outputReview.source],
    baselineWave: outputReview.baselineWave,
    operator: {
      activation:
        "Output activation requires the complete reviewed101-source predecessor.",
      extension: "generation-output",
      privacy: "contentBeforeOutput",
      upToSelected: true,
    },
  },
  {
    id: "20261007-public-ai",
    sources: publicAIReview.sources,
    baselineWave: publicAIReview.baselineWave,
    operator: {
      partial: "Partial public AI wave is not an accepted baseline.",
      activation:
        "Public AI activation requires the complete reviewed102 predecessor.",
      extension: "public-ai",
      privacy: "outputBeforePublic",
    },
  },
  {
    id: "20261007-generation-recovery",
    sources: [recoveryReview.source],
    baselineWave: recoveryReview.baselineWave,
    operator: {
      activation:
        "Recovery activation requires the complete reviewed104 predecessor.",
      precedes: "Recovery cannot precede public AI activation.",
      extension: "generation-recovery",
    },
  },
  {
    id: "20261007-partial-generation-recovery",
    sources: [partialRecoveryReview.source],
    baselineWave: partialRecoveryReview.baselineWave,
    operator: {
      activation:
        "Partial-output recovery requires the complete reviewed105 predecessor.",
      precedes: "Partial-output recovery cannot precede original recovery.",
      extension: "partial-generation-recovery",
    },
  },
  ...headWaves.map(({ id, review, operator }) => ({
    id,
    sources: review.sources,
    baselineWave: review.baselineWave,
    operator,
  })),
];

// The role checks take each name for one wave. Until they learn a new wave's
// names, a row for it compiles only by reusing another wave's, and the role
// checks would then check the wrong wave. No table with a shared name loads.
for (const field of ["extension", "privacy"] as const)
  for (const [index, row] of reviewedWaves.entries()) {
    const name = row.operator[field];
    const first = reviewedWaves.findIndex(
      (other) => other.operator[field] === name,
    );
    if (name !== undefined && first !== index)
      throw new Error(
        `Reviewed waves ${reviewedWaves[first]!.id} and ${row.id} share the role-check name ${name}; each wave needs its own (step 6 in docs/engineering/migrations.md).`,
      );
  }

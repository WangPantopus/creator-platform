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

// The table of reviewed waves: the one list of waves the runtime and the
// operator share. scripts/migration-chain.ts checks each chain wave against it
// for migrate-trust and the local installer, and the head profile
// (comparison-profile.ts) walks it from 20261008-comparison on. Static imports
// keep every review in the production build. A registration adds its wave's
// row at the end (step 6 in docs/engineering/migrations.md).

/** The head profile's pins have the comparison review's shape: each later
 * head review is written from the one before it and keeps all its keys. */
export type HeadReview = Readonly<typeof comparisonReview>;
/** A wave from 20261008-comparison on: its review, and the head profile's
 * refusal when only part of its sources is registered. */
export type HeadWave = Readonly<{
  id: string;
  review: HeadReview;
  partial: string;
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
  },
  {
    id: "20261015-notices",
    review: noticesReview,
    partial: "The complete reviewed notices source graph is required.",
  },
  {
    id: "20261015-sign-in-and-money",
    review: signInAndMoneyReview,
    partial:
      "The complete reviewed sign-in and money source graph is required.",
    requires:
      "The sign-in and money wave requires the complete reviewed notices source graph.",
  },
  {
    id: "20261022-workspace-lock",
    review: workspaceLockReview,
    partial: "The complete reviewed workspace-lock source graph is required.",
    requires:
      "Workspace locking requires the complete sign-in and money predecessor.",
  },
  {
    id: "20261023-reply-review",
    review: replyReview,
    partial: "The complete reviewed reply-review source graph is required.",
    requires: "Reply review requires the complete workspace-lock predecessor.",
  },
  {
    id: "20261023-studio-reply-authority",
    review: studioReplyAuthorityReview,
    partial:
      "The complete reviewed creator/fan denial source graph is required.",
    requires:
      "Creator/fan denial requires the complete reply-review predecessor.",
  },
  {
    id: "20261027-core-follow",
    review: coreFollowReview,
    partial: "The complete reviewed core Follow source graph is required.",
    requires:
      "Core Follow metadata requires the complete creator/fan denial predecessor.",
  },
  {
    id: "20261101-pilot-columns",
    review: pilotColumnsReview,
    partial: "The complete reviewed pilot-columns source graph is required.",
    requires: "The pilot columns require the complete core Follow predecessor.",
  },
];

/** Each wave after the canonical bootstrap that this revision has a review
 * for, in the chain's order, with the sources its review names. The reviews
 * of the content, output and recovery waves name theirs as `source`. */
export const reviewedWaves: readonly Readonly<{
  id: string;
  sources: readonly Readonly<{ version: string }>[];
}>[] = [
  { id: "20261007-generation", sources: generationReview.sources },
  { id: "20261007-content", sources: [contentReview.source] },
  { id: "20261007-generation-output", sources: [outputReview.source] },
  { id: "20261007-public-ai", sources: publicAIReview.sources },
  { id: "20261007-generation-recovery", sources: [recoveryReview.source] },
  {
    id: "20261007-partial-generation-recovery",
    sources: [partialRecoveryReview.source],
  },
  ...headWaves.map(({ id, review }) => ({ id, sources: review.sources })),
];

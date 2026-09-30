import { copy } from "@qelvora/copy";
/** W7 uses the shared generated English catalog; additional locales require review. */
export const growthCopy = {
  returnTitle: copy.growthKeepUsefulUpdatesWithinReach,
  returnBody: copy.growthChoosePushOrEmailInSettingsWhenYouWantUpdates,
  returnAction: copy.growthChooseUpdates,
  installTitle: copy.growthOpenThisInTheApp,
  installBody: copy.growthContinueWithTheSameAccountInstallingIsOptional,
  installAction: copy.growthOpenAppStore,
  later: copy.growthLater,
  decline: copy.growthDonTAskAgain,
  saving: copy.growthSaving,
  unavailable: copy.growthThisChoiceCouldNotBeSavedTryAgain,
  inviteAction: copy.growthCreateAnInvitationLink,
  inviteReady: copy.growthInvitationLinkReady,
  inviteBody: copy.growthSendItOnlyToSomeoneWhoWantsItLinksExpire,
  inviteRevoke: copy.growthRevokeThisInvitation,
  inviteRevoked: copy.growthInvitationRevoked,
  entryConsent: copy.growthAllowThisVisitSSourceToBeCounted,
  entryBody: copy.growthOptionalCountsThisCreatorLinkPostInvitationOrShareWith,
  entrySaved: copy.growthYourChoiceWasSaved,
} as const;
export type GrowthCopyKey = keyof typeof growthCopy;
export function growthText(key: GrowthCopyKey) {
  return growthCopy[key];
}

/** Stable contract IDs never depend on translated display labels. */
const labels = {
  "For you": copy.growthForYou,
  Crafts: copy.growthCrafts,
  Music: copy.growthMusic,
  Food: copy.growthFood,
  Home: copy.navHome,
  Discover: copy.navDiscover,
  Requests: copy.navRequests,
  You: copy.navYou,
  Chat: copy.navChat,
  Posts: copy.navPosts,
  Access: copy.navAccess,
  accept: copy.growthDecisionAccept,
  edit: copy.edit,
  defer: copy.growthDecisionDefer,
  dismiss: copy.growthDecisionDismiss,
  active: copy.growthExperimentActive,
  stopped: copy.growthExperimentStopped,
  draft: copy.versionDraft,
} as const;
export function growthLabel(value: string): string {
  return labels[value as keyof typeof labels] ?? value;
}
const kinds = {
  ai_reply: copy.growthKindAiReply,
  approved_draft: copy.growthKindApprovedDraft,
  personal_reply: copy.growthKindPersonalReply,
  request_status: copy.growthKindRequestStatus,
  call_reminder: copy.growthKindCallReminder,
  answered_publicly: copy.growthKindAnsweredPublicly,
  content_match: copy.growthKindContentMatch,
  announcement: copy.growthKindAnnouncement,
  creator_offer: copy.growthKindCreatorOffer,
  slot_change: copy.growthKindSlotChange,
  new_packet: copy.growthKindNewPacket,
  commitment_due: copy.growthKindCommitmentDue,
  guardrail: copy.growthKindGuardrail,
  pool_share: copy.growthKindPoolShare,
  note: copy.growthKindNote,
  reaction: copy.growthKindReaction,
  public_answer: copy.growthKindPublicAnswer,
  spending_reminder: copy.growthKindSpendingReminder,
  weekly_impact: copy.growthKindWeeklyImpact,
} as const;
export function notificationKindLabel(value: string): string {
  return kinds[value as keyof typeof kinds] ?? value;
}

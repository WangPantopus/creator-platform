import type {
  GrowthOwners,
  NotificationKind,
  NotificationState,
} from "./contracts.js";

type Owner = GrowthOwners["notificationState"];
export type NotificationOwnerKey =
  | "content"
  | "conversation"
  | "commerce"
  | "calls";

/** Which owners can answer for an event type, in the order they are asked.
 * Types with no entry have no producer yet and stay unconfigured. */
const askedFor: Partial<
  Record<NotificationKind, readonly NotificationOwnerKey[]>
> = {
  note: ["content"],
  reaction: ["content"],
  ai_reply: ["conversation"],
  approved_draft: ["conversation"],
  personal_reply: ["conversation"],
  request_status: ["commerce", "calls"],
  new_packet: ["commerce"],
  creator_offer: ["commerce"],
  call_reminder: ["calls"],
};

const notConfigured: NotificationState = {
  retryable: true,
  available: false,
  authorized: false,
  version: 0,
  creatorName: "",
  authorKind: "system",
  safePreview: "",
  destination: "/notifications",
};

/** The growth engine has one `notificationState` hook; each lane's module owns
 * the truth for its own event types. This asks the right owners and returns the
 * first real answer. An owner that is not connected, or that says an event is
 * not its own (`retryable`), is skipped; if nobody answers the event stays
 * unconfigured, which blocks it rather than guessing. */
export function composeNotificationOwners(
  owners: Partial<Record<NotificationOwnerKey, Owner>>,
): Owner {
  return async (event, recipient, custody) => {
    for (const key of askedFor[event.type] ?? []) {
      const owner = owners[key];
      if (!owner) continue;
      const state = await owner(event, recipient, custody);
      if (!state.retryable) return state;
    }
    return notConfigured;
  };
}

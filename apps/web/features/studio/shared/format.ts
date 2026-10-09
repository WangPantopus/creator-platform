export const key = () => crypto.randomUUID();
export const contentStateLabel = (state: string) =>
  ({
    draft: "Draft",
    scheduled: "Scheduled",
    published: "Published",
    media_pending: "Media processing",
    unpublished: "Unpublished",
    archived: "Archived",
    withdrawn: "Withdrawn",
  })[state] ?? "Status unavailable";
export const packetStateLabel = (state: string) =>
  ({
    draft: "Draft",
    submitting: "Submitting",
    submitted: "Waiting for your decision",
    more_info: "Waiting for more information",
    offer_pending: "Waiting for the fan’s decision",
    accepting: "Confirming acceptance",
    accepted: "Accepted",
    releasing: "Closing request",
    declined: "Passed on this one",
    expired: "Decision time passed",
    withdrawn: "Withdrawn",
  })[state] ?? "Request status unavailable";
export const paymentStateLabel = (state: string) =>
  ({
    authorization_pending: "Checking payment hold",
    requires_action: "Fan payment confirmation needed",
    requires_capture: "Payment held · not charged",
    unknown: "Checking payment status",
    capturing: "Confirming charge",
    captured: "Charged",
    releasing: "Releasing payment hold",
    released: "Payment hold released",
    refund_pending: "Refund in progress",
    refunded: "Refunded",
    failed: "Payment could not complete",
  })[state] ?? "Payment status unavailable";
export const speakerLabel = (control: string, name: string) =>
  ({
    ai_active: `${name}’s AI`,
    human_active: name,
    ai_paused: `${name}’s AI is paused`,
    closed: "Conversation closed",
  })[control] ?? "Current speaker unavailable";
export const time = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
export const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    amount / 100,
  );

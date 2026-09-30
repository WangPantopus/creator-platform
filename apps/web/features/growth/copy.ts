/** W7 additions are keyed for localization. Only reviewed English is available; no locale inferred. */
export const growthCopy = {
  returnTitle: "Keep useful updates within reach",
  returnBody:
    "Choose push or email in settings when you want updates. You can change them any time.",
  returnAction: "Choose updates",
  installTitle: "Open this in the app",
  installBody: "Continue with the same account. Installing is optional.",
  installAction: "Open app store",
  later: "Later",
  decline: "Don't ask again",
  saving: "Saving…",
  unavailable: "This choice could not be saved. Try again.",
  inviteAction: "Create an invitation link",
  inviteReady: "Invitation link ready",
  inviteBody:
    "Send it only to someone who wants it. Links expire after 30 days.",
  inviteRevoke: "Revoke this invitation",
  inviteRevoked: "Invitation revoked.",
  entryConsent: "Allow this visit's source to be counted",
  entryBody:
    "Optional. Counts this creator link, post, invitation or share with your account. No conversation text or device fingerprint is collected.",
  entrySaved: "Your choice was saved.",
} as const;
export type GrowthCopyKey = keyof typeof growthCopy;
export function growthText(key: GrowthCopyKey, locale = "en") {
  // Additional languages require reviewed catalogs; the supported fallback is explicit.
  void locale;
  return growthCopy[key];
}

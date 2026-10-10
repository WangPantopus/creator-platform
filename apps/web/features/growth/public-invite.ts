import "server-only";
import { cache } from "react";
import { configuredOrigin, growthRequest } from "./server";
import type { Creator } from "./types";

/** Only shared within a render: revoked or expired links must be read again. */
export const publicInvite = cache((id: string) =>
  growthRequest<{ creator: Creator; destination: string; note: string }>(
    `public/invites/${encodeURIComponent(id)}`,
  ),
);

/** Production still requires the founder's approved HTTPS origin. The local
 * stock stack uses an explicitly configured loopback origin for browser proof. */
export function inviteMetadataOrigin() {
  const configured = configuredOrigin();
  if (configured || process.env.NODE_ENV !== "development") return configured;
  try {
    const url = new URL(process.env.WEB_ORIGIN ?? "");
    if (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/"
    )
      return url.origin;
  } catch {
    /* No guessed host or request-supplied origin. */
  }
  return null;
}

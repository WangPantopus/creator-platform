import type { Session } from "@qelvora/api";

/** Ops authenticates and authorizes actual memberships in its own domain.
 * A reviewer must not create a fan persona merely to reach that guard. */
export function requiresFanHandle(
  session: Pick<Session, "fan">,
  returnTo: string,
  resumeHandle = false,
) {
  return resumeHandle || (!session.fan && !/^\/ops(?:\/|$)/u.test(returnTo));
}

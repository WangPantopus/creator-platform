import type { Session } from "@qelvora/api";

/** Account security, public status and Ops membership guards do not require a
 * fan persona. Callers first validate the actual canonical return target. */
export function requiresFanHandle(
  session: Pick<Session, "fan">,
  returnTo: string,
  resumeHandle = false,
) {
  return (
    resumeHandle ||
    (!session.fan &&
      returnTo !== "/identity/account" &&
      returnTo !== "/status" &&
      !/^\/ops(?:\/|$)/u.test(returnTo))
  );
}

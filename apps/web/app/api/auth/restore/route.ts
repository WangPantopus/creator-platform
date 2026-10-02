import { NextRequest, NextResponse } from "next/server";
import { applicationOrigin } from "../../../../lib/request-origin";
import {
  ReturnTargetSchema,
  SessionSchema,
  SessionTokenSchema,
} from "@qelvora/api";
import {
  cookieOptions,
  platformFetch,
  sessionCookie,
} from "../../../../lib/session";

/** Restore access within the existing refresh window; this is never fresh reauthentication. */
export async function GET(request: NextRequest) {
  const origin = applicationOrigin(request);
  const query = request.nextUrl.searchParams;
  const parsed = ReturnTargetSchema.safeParse(query.get("returnTo") ?? "/home");
  const valid =
    parsed.success &&
    query.getAll("returnTo").length <= 1 &&
    query.getAll("resumeHandle").length <= 1 &&
    (!query.has("resumeHandle") || query.get("resumeHandle") === "1") &&
    ![...query.keys()].some(
      (key) => !["returnTo", "resumeHandle"].includes(key),
    );
  const returnTo = valid && parsed.success ? parsed.data : "/home";
  const welcome = new URL("/auth/continue", origin);
  welcome.searchParams.set("returnTo", returnTo);
  const unavailable = new URL("/auth/restore", origin);
  unavailable.searchParams.set("returnTo", returnTo);
  if (query.get("resumeHandle") === "1")
    unavailable.searchParams.set("resumeHandle", "1");
  let credential: string | undefined;
  const finish = (target: URL) => {
    const response = NextResponse.redirect(target);
    response.headers.set("Cache-Control", "no-store");
    // A completed rotation must survive a later read/transport failure.
    if (credential)
      response.cookies.set(sessionCookie, credential, {
        ...cookieOptions,
        maxAge: 7 * 86400,
      });
    return response;
  };
  if (!valid) {
    welcome.searchParams.set("error", "invalid_return");
    return finish(welcome);
  }
  if (!request.cookies.has(sessionCookie)) return finish(welcome);
  try {
    let response = await platformFetch("/v1/identity/session");
    if (response.status === 401) {
      const refreshed = await platformFetch("/v1/identity/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!refreshed.ok)
        return finish(refreshed.status === 401 ? welcome : unavailable);
      credential = SessionTokenSchema.parse(await refreshed.json()).token;
      response = await platformFetch("/v1/identity/session", {
        headers: { Authorization: `Bearer ${credential}` },
      });
    }
    if (!response.ok)
      return finish(response.status === 401 ? welcome : unavailable);
    const session = SessionSchema.parse(await response.json());
    const target = session
      ? new URL(
          !session.fan || query.get("resumeHandle") === "1"
            ? `/onboarding/handle?returnTo=${encodeURIComponent(returnTo)}`
            : returnTo,
          origin,
        )
      : welcome;
    return finish(target);
  } catch {
    return finish(unavailable);
  }
}

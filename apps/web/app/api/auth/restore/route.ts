import { NextRequest, NextResponse } from "next/server";
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
  const welcome = new URL("/auth/continue", request.url);
  welcome.searchParams.set("returnTo", returnTo);
  const finish = (target: URL) => {
    const response = NextResponse.redirect(target);
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
  if (!valid) {
    welcome.searchParams.set("error", "invalid_return");
    return finish(welcome);
  }
  if (!request.cookies.has(sessionCookie)) return finish(welcome);
  let credential: string | undefined;
  try {
    let response = await platformFetch("/v1/identity/session");
    if (response.status === 401) {
      const refreshed = await platformFetch("/v1/identity/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!refreshed.ok) return finish(welcome);
      credential = SessionTokenSchema.parse(await refreshed.json()).token;
      response = await platformFetch("/v1/identity/session", {
        headers: { Authorization: `Bearer ${credential}` },
      });
    }
    const session = response.ok
      ? SessionSchema.parse(await response.json())
      : null;
    const target = session
      ? new URL(
          !session.fan || query.get("resumeHandle") === "1"
            ? `/onboarding/handle?returnTo=${encodeURIComponent(returnTo)}`
            : returnTo,
          request.url,
        )
      : welcome;
    const result = finish(target);
    // Deliver successful rotation even when the subsequent read is unavailable.
    if (credential)
      result.cookies.set(sessionCookie, credential, {
        ...cookieOptions,
        maxAge: 7 * 86400,
      });
    return result;
  } catch {
    welcome.searchParams.set("error", "identity_unconfigured");
    const result = finish(welcome);
    if (credential)
      result.cookies.set(sessionCookie, credential, {
        ...cookieOptions,
        maxAge: 7 * 86400,
      });
    return result;
  }
}

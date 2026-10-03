import { NextRequest, NextResponse } from "next/server";
import { SessionTokenSchema } from "@qelvora/api";
import { sameRequestOrigin } from "../../../../lib/request-origin";
import {
  cookieOptions,
  platformFetch,
  sessionCookie,
} from "../../../../lib/session";

// Share only concurrent renewal work in this server process. Durable session
// authority and the one-use rotation remain in PostgreSQL; no token is cached
// after the request settles.
const renewals = new Map<string, Promise<{ status: number; data: unknown }>>();
async function renew(token: string, expectedAccount: string | null) {
  const key = `${token}:${expectedAccount ?? ""}`;
  let pending = renewals.get(key);
  if (!pending) {
    pending = (async () => {
      const response = await platformFetch("/v1/identity/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(expectedAccount
            ? { "X-Expected-Account-Id": expectedAccount }
            : {}),
        },
        body: "{}",
      });
      return { status: response.status, data: await response.json() };
    })();
    renewals.set(key, pending);
  }
  try {
    return await pending;
  } finally {
    if (renewals.get(key) === pending) renewals.delete(key);
  }
}

const allowed =
  /^identity\/(?:session|refresh|logout|revoke-sessions|fan-profile(?:\/intro)?|creator-profile|capabilities|passkeys(?:\/(?:begin|register|revoke|recovery|[a-f0-9-]{36}\/cancel))?|[a-f0-9-]{36}\/proof|proof\/[a-f0-9-]{36}\/submit|[a-f0-9-]{36}\/team\/invite|team\/[a-f0-9-]{36}\/accept|[a-f0-9-]{36}\/team\/[a-f0-9-]{36}\/remove|signed-acts\/[a-f0-9-]{36}(?:\/cancel)?|[a-f0-9-]{36}\/signed-acts\/begin|signed-acts\/verify)$/u;
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (
    path.some((part) => /[%\\\s/]/u.test(part)) ||
    !allowed.test(path.join("/"))
  )
    return Response.json(
      { error: { message: "This endpoint is unavailable." } },
      { status: 404 },
    );
  if (request.method !== "GET" && !sameRequestOrigin(request))
    return Response.json(
      { error: { message: "Use this app to perform the action." } },
      { status: 403 },
    );
  let renewedToken: string | undefined;
  try {
    const expectedAccount = request.headers.get("X-Expected-Account-Id");
    if (
      !expectedAccount &&
      request.method === "POST" &&
      [
        "identity/fan-profile",
        "identity/fan-profile/intro",
        "identity/creator-profile",
      ].includes(path.join("/"))
    ) {
      return NextResponse.json(
        {
          error: {
            code: "session_account_changed",
            message: "Your account changed. Reopen this form before saving.",
          },
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    let upstream = await platformFetch(`/v1/${path.join("/")}`, {
      method: request.method,
      headers: {
        ...(expectedAccount
          ? { "X-Expected-Account-Id": expectedAccount }
          : {}),
        ...(request.method === "GET"
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(request.method === "GET"
        ? {}
        : {
            body: await request.text(),
          }),
    });
    if (
      request.method === "GET" &&
      path.join("/") === "identity/session" &&
      upstream.status === 401
    ) {
      const token = request.cookies.get(sessionCookie)?.value;
      if (token) {
        const renewed = await renew(token, expectedAccount);
        if (renewed.status === 200) {
          const credential = SessionTokenSchema.parse(renewed.data);
          // Deliver the rotation even if the following session read is
          // temporarily unavailable, so a retry can use the current token.
          renewedToken = credential.token;
          upstream = await platformFetch("/v1/identity/session", {
            headers: {
              Authorization: `Bearer ${credential.token}`,
              ...(expectedAccount
                ? { "X-Expected-Account-Id": expectedAccount }
                : {}),
            },
          });
        } else
          upstream = Response.json(renewed.data, { status: renewed.status });
      }
    }
    const data = await upstream.json();
    const refresh = path.join("/") === "identity/refresh";
    const response = NextResponse.json(
      refresh && upstream.ok ? { expiresAt: data.expiresAt } : data,
      { status: upstream.status, headers: { "Cache-Control": "no-store" } },
    );
    if (refresh && upstream.ok)
      response.cookies.set(sessionCookie, data.token, {
        ...cookieOptions,
        maxAge: 7 * 86400,
      });
    // A late expired response must not erase a newer sign-in from another tab.
    if (renewedToken)
      response.cookies.set(sessionCookie, renewedToken, {
        ...cookieOptions,
        maxAge: 7 * 86400,
      });
    if (
      upstream.ok &&
      ["identity/logout", "identity/revoke-sessions"].includes(path.join("/"))
    )
      response.cookies.delete(sessionCookie);
    // A late 401 from an old token must not delete a freshly rotated or newly
    // signed-in cookie. Confirmed sign-out alone clears the cookie here.
    return response;
  } catch {
    const response = NextResponse.json(
      {
        error: {
          code: "service_unavailable",
          message:
            "The service is unavailable. Your input has been kept; try again.",
        },
      },
      { status: 503 },
    );
    // The old credential is already consumed even when a later upstream read
    // throws. Keep a successful rotation available for the user's retry.
    if (renewedToken)
      response.cookies.set(sessionCookie, renewedToken, {
        ...cookieOptions,
        maxAge: 7 * 86400,
      });
    return response;
  }
}
export const GET = proxy;
export const POST = proxy;

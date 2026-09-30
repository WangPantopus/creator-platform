import { NextRequest, NextResponse } from "next/server";
import { sameRequestOrigin } from "../../../../lib/request-origin";
import {
  cookieOptions,
  platformFetch,
  sessionCookie,
} from "../../../../lib/session";

const allowed =
  /^identity\/(?:session|refresh|logout|revoke-sessions|fan-profile|creator-profile|capabilities|passkeys(?:\/(?:begin|register|revoke|recovery|[a-f0-9-]{36}\/cancel))?|[a-f0-9-]{36}\/proof|proof\/[a-f0-9-]{36}\/submit|[a-f0-9-]{36}\/team\/invite|team\/[a-f0-9-]{36}\/accept|[a-f0-9-]{36}\/team\/[a-f0-9-]{36}\/remove|signed-acts\/[a-f0-9-]{36}(?:\/cancel)?|[a-f0-9-]{36}\/signed-acts\/begin|signed-acts\/verify)$/u;
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
  try {
    const upstream = await platformFetch(`/v1/${path.join("/")}`, {
      method: request.method,
      ...(request.method === "GET"
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: await request.text(),
          }),
    });
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
    if (
      upstream.status === 401 ||
      ["identity/logout", "identity/revoke-sessions"].includes(path.join("/"))
    )
      response.cookies.delete(sessionCookie);
    return response;
  } catch {
    return Response.json(
      {
        error: {
          code: "service_unavailable",
          message:
            "The service is unavailable. Your input has been kept; try again.",
        },
      },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;

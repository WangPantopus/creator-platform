import { NextRequest } from "next/server";
import { IdSchema, SessionSchema } from "@qelvora/api";
import { platformFetch } from "../../../../lib/session";
import { sameRequestOrigin } from "../../../../lib/request-origin";
export const dynamic = "force-dynamic";
/** Same-origin cookie bridge: target paths are fixed to W6 and ticket URLs never redirect. */
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (
    !path.length ||
    path.some((part) => !/^[a-zA-Z0-9_-]+$/u.test(part)) ||
    path.length > 9
  )
    return Response.json(
      { error: { message: "This media route is unavailable." } },
      { status: 400 },
    );
  if (!["GET", "HEAD"].includes(request.method) && !sameRequestOrigin(request))
    return Response.json(
      { error: { message: "Open this action from the app." } },
      { status: 403 },
    );
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 1_048_576)
    return Response.json(
      { error: { message: "The upload chunk is too large." } },
      { status: 413 },
    );
  const headers: Record<string, string> = {};
  for (const key of ["content-type", "upload-offset", "range"]) {
    const value = request.headers.get(key);
    if (value) headers[key] = value;
  }
  try {
    // W5 binds metadata/tickets and native media-element byte requests to the
    // account that opened the content. A selector is a precondition, not an actor.
    const query = new URLSearchParams(request.nextUrl.search);
    const queryAccounts = query.getAll("expectedAccountId");
    const headerAccount = request.headers.get("x-qelvora-expected-account");
    const selector = headerAccount ?? queryAccounts[0];
    if (selector !== undefined && selector !== null) {
      const expected = IdSchema.safeParse(selector);
      if (
        !expected.success ||
        queryAccounts.length > 1 ||
        (headerAccount !== null &&
          queryAccounts.length === 1 &&
          headerAccount !== queryAccounts[0])
      )
        return Response.json(
          {
            error: {
              code: "session_account_invalid",
              message: "Reopen this content with your current account.",
            },
          },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      const actual = await platformFetch("/v1/identity/session");
      if (!actual.ok)
        return Response.json(await actual.json(), {
          status: actual.status,
          headers: { "Cache-Control": "no-store" },
        });
      if (SessionSchema.parse(await actual.json()).accountId !== expected.data)
        return Response.json(
          {
            error: {
              code: "session_account_changed",
              message: "Your account changed. Reopen this content to continue.",
            },
          },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      headers["x-qelvora-expected-account"] = expected.data;
    }
    query.delete("expectedAccountId");
    const upstreamQuery = query.toString();
    const data = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.arrayBuffer();
    if (data && data.byteLength > 1_048_576)
      return Response.json(
        { error: { message: "The upload chunk is too large." } },
        { status: 413 },
      );
    const response = await platformFetch(
      `/v1/w6/${path.join("/")}${upstreamQuery ? `?${upstreamQuery}` : ""}`,
      {
        method: request.method,
        headers,
        ...(data ? { body: data } : {}),
        redirect: "error",
      },
    );
    const outgoing = new Headers({
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    for (const key of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "x-request-id",
    ]) {
      const value = response.headers.get(key);
      if (value) outgoing.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return Response.json(
      {
        error: {
          code: "media_unavailable",
          message: "Media is unavailable. Your recording stays here for retry.",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as DELETE,
  proxy as HEAD,
};

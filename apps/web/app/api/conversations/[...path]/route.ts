import { NextRequest } from "next/server";
import { IdSchema, SessionSchema } from "@qelvora/api";
import { platformFetch } from "../../../../lib/session";
import { sameRequestOrigin } from "../../../../lib/request-origin";

const uuid = "[a-f0-9-]{36}";
const permitted = new RegExp(
  `^(?:capabilities|account|realtime-ticket|begin|${uuid}/${uuid}(?:/(?:events|offline|memory(?:/${uuid})?|preferences|consent|presence|usage|messages|audit|fan-replies|team-replies|recordings|citations/${uuid}|messages/${uuid}(?:/dont-remember|/feedback|/corrections)?|messages/status(?:/[^/]{8,128})?))?)$`,
  "u",
);
async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  if (path.some((p) => /[%\\\s/]/u.test(p)) || !permitted.test(joined))
    return Response.json(
      { error: { message: "This endpoint is unavailable." } },
      { status: 404 },
    );
  if (req.method !== "GET" && !sameRequestOrigin(req))
    return Response.json(
      { error: { message: "Use this app to perform this action." } },
      { status: 403 },
    );
  if (
    [...req.nextUrl.searchParams.keys()].some(
      (key) => !["cursor", "before"].includes(key),
    )
  )
    return Response.json(
      { error: { message: "This request is unavailable." } },
      { status: 400 },
    );
  try {
    if (joined !== "capabilities") {
      const expectedAccount = IdSchema.safeParse(
        req.headers.get("X-Expected-Account-Id"),
      );
      if (!expectedAccount.success)
        return Response.json(
          {
            error: {
              code: "session_account_required",
              message: "Reopen this page with your current account.",
            },
          },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
      // Both fetches read the same request's immutable HttpOnly cookie. The
      // header never selects an actor or expands the upstream thread scope.
      const current = await platformFetch("/v1/identity/session");
      if (!current.ok)
        return Response.json(await current.json(), {
          status: current.status,
          headers: { "Cache-Control": "no-store" },
        });
      if (
        SessionSchema.parse(await current.json()).accountId !==
        expectedAccount.data
      )
        return Response.json(
          {
            error: {
              code: "session_account_changed",
              message: "Your account changed. Reopen this page to continue.",
            },
          },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
    }
    const upstream = await platformFetch(
      `/v1/conversations${joined === "begin" ? "" : "/" + joined}${req.nextUrl.search}`,
      {
        method: req.method,
        headers: {
          "X-Correlation-Id":
            req.headers.get("x-correlation-id") ?? crypto.randomUUID(),
          ...(joined !== "capabilities"
            ? {
                "X-Expected-Account-Id": req.headers.get(
                  "X-Expected-Account-Id",
                )!,
              }
            : {}),
          ...(req.method === "GET"
            ? {}
            : { "Content-Type": "application/json" }),
        },
        ...(req.method === "GET"
          ? {}
          : {
              body: await req.text(),
            }),
      },
      joined !== "capabilities",
    );
    const data = await upstream.json();
    if (joined === "realtime-ticket" && upstream.ok) {
      const url = process.env.W3_WEBSOCKET_URL;
      if (!url)
        return Response.json(
          {
            error: {
              message: "Live connection is unavailable. Reconnect to refresh.",
            },
          },
          { status: 503 },
        );
      return Response.json(
        { ...data, url },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(data, {
      status: upstream.status,
      headers: {
        "Cache-Control": "no-store",
        ...(upstream.headers.get("x-correlation-id")
          ? { "X-Correlation-Id": upstream.headers.get("x-correlation-id")! }
          : {}),
      },
    });
  } catch {
    return Response.json(
      {
        error: {
          code: "connection_unavailable",
          message:
            "Reconnect to refresh this conversation. Your input has been kept.",
        },
      },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;

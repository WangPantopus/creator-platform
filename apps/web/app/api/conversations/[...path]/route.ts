import { NextRequest } from "next/server";
import { platformFetch } from "../../../../lib/session";

const uuid = "[a-f0-9-]{36}";
const permitted = new RegExp(
  `^(?:capabilities|account|realtime-ticket|begin|${uuid}/${uuid}(?:/(?:events|memory(?:/${uuid})?|preferences|consent|presence|usage|messages|audit|fan-replies|citations/${uuid}|messages/${uuid}(?:/dont-remember)?|messages/status/${uuid}))?)$`,
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
  if (req.method !== "GET" && req.headers.get("origin") !== req.nextUrl.origin)
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
    const upstream = await platformFetch(
      `/v1/conversations${joined === "begin" ? "" : "/" + joined}${req.nextUrl.search}`,
      {
        method: req.method,
        ...(req.method === "GET"
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
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
      headers: { "Cache-Control": "no-store" },
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

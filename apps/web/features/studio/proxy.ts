import type { NextRequest } from "next/server";
import { platformFetch } from "../../lib/session";
import { sameRequestOrigin } from "../../lib/request-origin";

const uuid = "[a-f0-9-]{36}";
const allow = {
  "commerce-approvals": new RegExp(
    `^creators/${uuid}/fans/${uuid}/(?:deliver|drafts(?:/(?:sources|${uuid}(?:/(?:edit|approve))?))?)$`,
    "u",
  ),
  content: new RegExp(
    `^(?:${uuid}(?:/(?:studio(?:/(?:replies|thanks|live|scheduled/run|effects/run))?|drafts|replies|mute|thanks|replies/${uuid}/(?:consent|reaction|withdraw|review|read)|${uuid}(?:/(?:studio|review|publish|team-publish|unpublish|archive|replies))?))?)$`,
    "u",
  ),
  studio: new RegExp(
    `^(?:session|invitations/${uuid}/accept|${uuid}/(?:queue|audiences|team(?:/invite)?|corrections|packets/${uuid}(?:/(?:decide|deliveries|deliver))?|threads(?:/${uuid}(?:/(?:takeover|handback|pause|reply|draft|send-draft))?)?))$`,
    "u",
  ),
};
export function studioProxy(
  domain: "studio" | "content" | "commerce-approvals",
) {
  return async (
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> },
  ) => {
    const { path } = await context.params,
      target = path.join("/");
    if (path.some((p) => /[%\\\s/]/u.test(p)) || !allow[domain].test(target))
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
      const response = await platformFetch(
        `/v1/${domain}/${target}${request.nextUrl.search}`,
        {
          method: request.method,
          headers: {
            ...(request.method === "GET"
              ? {}
              : { "Content-Type": "application/json" }),
            ...(request.headers.get("x-qelvora-expected-account")
              ? {
                  [domain === "commerce-approvals"
                    ? "x-commerce-account-id"
                    : "x-qelvora-expected-account"]: request.headers.get(
                    "x-qelvora-expected-account",
                  )!,
                }
              : {}),
          },
          ...(request.method === "GET"
            ? {}
            : {
                body: await request.text(),
              }),
        },
      );
      return Response.json(await response.json(), {
        status: response.status,
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return Response.json(
        {
          error: {
            code: "service_unavailable",
            message: "Reconnect to continue. Your input is kept.",
          },
        },
        { status: 503 },
      );
    }
  };
}

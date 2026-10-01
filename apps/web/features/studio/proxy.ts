import type { NextRequest } from "next/server";
import { platformFetch } from "../../lib/session";

const uuid = "[a-f0-9-]{36}";
const allow = {
  content: new RegExp(
    `^(?:${uuid}(?:/(?:studio(?:/(?:replies|thanks|live|scheduled/run|effects/run))?|drafts|replies|mute|thanks|replies/${uuid}/(?:consent|reaction|withdraw|review|read)|${uuid}(?:/(?:studio|review|publish|team-publish|unpublish|archive|replies))?))?)$`,
    "u",
  ),
  studio: new RegExp(
    `^(?:session|invitations/${uuid}/accept|${uuid}/(?:queue|audiences|team(?:/invite)?|corrections|packets/${uuid}(?:/(?:decide|deliveries|deliver))?|threads(?:/${uuid}(?:/(?:takeover|handback|pause|reply|draft|send-draft))?)?))$`,
    "u",
  ),
  "commerce-approvals": new RegExp(
    `^creators/${uuid}/fans/${uuid}/(?:drafts(?:/(?:sources|${uuid}(?:/(?:edit|approve))?))?|deliver)$`,
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
    if (
      request.method !== "GET" &&
      request.headers.get("origin") !== request.nextUrl.origin
    )
      return Response.json(
        { error: { message: "Use this app to perform the action." } },
        { status: 403 },
      );
    const expectedAccount = request.headers.get("x-qelvora-expected-account");
    if (domain === "commerce-approvals" && !expectedAccount)
      return Response.json(
        {
          error: {
            code: "session_account_required",
            message: "Reopen this draft with your current account.",
          },
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    if (
      domain === "commerce-approvals" &&
      [...request.nextUrl.searchParams.keys()].some(
        (name) => name !== "beforeSequence",
      )
    )
      return Response.json(
        { error: { message: "This draft request is unavailable." } },
        { status: 400 },
      );
    try {
      const response = await platformFetch(
        `/v1/${domain}/${target}${request.nextUrl.search}`,
        {
          method: request.method,
          headers: {
            "Content-Type": "application/json",
            ...(expectedAccount
              ? { "x-qelvora-expected-account": expectedAccount }
              : {}),
            ...(domain === "commerce-approvals"
              ? { "x-commerce-account-id": expectedAccount! }
              : {}),
          },
          ...(request.method === "GET"
            ? {}
            : {
                body: await request.text(),
              }),
        },
      );
      if (domain === "commerce-approvals" && response.status === 404)
        return Response.json(
          {
            error: {
              code: "producer_unavailable",
              message:
                "Exact draft approval is unavailable in this workspace. Your input is kept.",
            },
          },
          { status: 404, headers: { "Cache-Control": "no-store" } },
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

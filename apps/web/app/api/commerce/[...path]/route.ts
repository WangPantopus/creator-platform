import { NextRequest } from "next/server";
import { platformFetch } from "../../../../lib/session";
const route =
  /^(?:capabilities|overview|spend-limit|memberships\/(?:start|reconcile|[a-f0-9-]{36}\/cancel)|pass\/(?:draft|initial|billing|quote|purchase|purchase-status|cancel|effects\/[a-f0-9-]{36}\/reconcile|slots\/[a-f0-9-]{36}\/replace)|stores\/verify|commitments\/[a-f0-9-]{36}\/release|packets(?:\/[a-f0-9-]{36}(?:\/(?:withdraw|decide|info|deliver|share|reconcile|reconcile-money|authentication|offer-choice|reauthorize))?)?|creators\/[a-f0-9-]{36}\/(?:(?:modes|tiers)(?:\/[a-f0-9-]{36})?|earnings|payout-onboarding|fans\/[a-f0-9-]{36}\/(?:access|trial|disclosure)))$/u;
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const target = path.join("/");
  if (!route.test(target) || path.some((p) => /[%\\\s/]/u.test(p)))
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
  if (target.endsWith("/payout-onboarding") && request.method !== "POST")
    return Response.json(
      { error: { message: "Use the payout verification action." } },
      { status: 405 },
    );
  const query = request.nextUrl.searchParams;
  if (
    query.size &&
    !(
      request.method === "GET" &&
      [...query].every(
        ([key, value]) =>
          query.getAll(key).length === 1 &&
          ((target === "overview" &&
            ((key === "creatorId" && /^[a-f0-9-]{36}$/u.test(value)) ||
              (["poolEarnings", "creatorEarnings"].includes(key) &&
                value === "1"))) ||
            (/^creators\/[a-f0-9-]{36}\/earnings$/u.test(target) &&
              ((key === "currency" && /^[A-Z]{3}$/u.test(value)) ||
                (key === "cursor" && /^[A-Za-z0-9_-]{1,512}$/u.test(value))))),
      )
    )
  )
    return Response.json(
      { error: { message: "This query is unavailable." } },
      { status: 400 },
    );
  try {
    const response = await platformFetch(
      `/v1/commerce/${target}${request.nextUrl.search}`,
      {
        method: request.method,
        headers: {
          ...(request.headers.has("x-commerce-account-id")
            ? {
                "x-commerce-account-id": request.headers.get(
                  "x-commerce-account-id",
                )!,
              }
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
          message:
            "The connection is unavailable. Your input has been kept; try again.",
        },
      },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;

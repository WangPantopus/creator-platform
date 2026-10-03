import { NextRequest, NextResponse } from "next/server";
import { growthContracts } from "@qelvora/api";
import { sameRequestOrigin } from "../../../../lib/request-origin";
import {
  growthRequest,
  GrowthUnavailable,
} from "../../../../features/growth/server";

const allowed =
  /^(?:home|discovery-access|notifications(?:\/[a-f0-9-]+\/read)?|preferences(?:\/creators)?|follow\/[a-f0-9-]+|devices(?:\/[a-f0-9-]+)?|shares|invites(?:\/[a-f0-9-]+)?|referrals|entry|engagement(?:\/(?:install|return)\/(?:claim|choice))?|insights|funnel|impact|activation|experiments(?:\/[a-f0-9-]+\/stop|\/variant\/[a-z0-9_]+)?|feedback|recommendations(?:\/publish)?)$/u;
async function handle(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = (await params).path.join("/");
  const postContext =
    /^creators\/[a-z0-9_]{3,30}\/posts\/[a-f0-9-]{36}\/context$/u.test(path);
  if (!allowed.test(path) && !postContext)
    return NextResponse.json(
      { error: { message: "This endpoint is unavailable." } },
      { status: 404 },
    );
  if (postContext && (request.method !== "GET" || request.nextUrl.search))
    return NextResponse.json(
      { error: { message: "This endpoint is unavailable." } },
      { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } },
    );
  if (request.method !== "GET" && !sameRequestOrigin(request))
    return NextResponse.json(
      { error: { message: "Open this action from the app." } },
      { status: 403 },
    );
  try {
    const result = await growthRequest(path + request.nextUrl.search, {
      method: request.method,
      ...(request.headers.get("X-Expected-Account-Id")
        ? {
            headers: {
              [postContext
                ? "x-qelvora-expected-account"
                : "X-Expected-Account-Id"]: request.headers.get(
                "X-Expected-Account-Id",
              )!,
            },
          }
        : {}),
      ...(request.method !== "GET" && request.method !== "DELETE"
        ? { body: await request.text() }
        : {}),
    });
    return NextResponse.json(
      postContext
        ? growthContracts.PostEntryContextResponseSchema.parse(result)
        : result,
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          ...(error instanceof GrowthUnavailable ? { code: error.code } : {}),
          message:
            error instanceof Error
              ? error.message
              : "This feature is unavailable.",
        },
      },
      {
        status: error instanceof GrowthUnavailable ? error.status : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
export const GET = handle,
  POST = handle,
  PUT = handle,
  DELETE = handle;

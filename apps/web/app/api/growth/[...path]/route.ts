import { NextRequest, NextResponse } from "next/server";
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
  if (!allowed.test(path))
    return NextResponse.json(
      { error: { message: "This endpoint is unavailable." } },
      { status: 404 },
    );
  if (request.method !== "GET" && !sameRequestOrigin(request))
    return NextResponse.json(
      { error: { message: "Open this action from the app." } },
      { status: 403 },
    );
  const expectedAccount = request.headers.get("X-Expected-Account-Id");
  const expectedSession = request.headers.get("X-Expected-Session-Id");
  if (
    /^(?:home|preferences(?:\/creators)?|notifications(?:\/[a-f0-9-]+\/read)?|engagement(?:\/(?:install|return)\/(?:claim|choice))?|feedback)$/u.test(
      path,
    ) &&
    (!expectedAccount || !expectedSession)
  )
    return NextResponse.json(
      {
        error: {
          code: "session_view_required",
          message:
            "Reopen this view with your current account before continuing.",
        },
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  try {
    const headers = new Headers();
    if (expectedAccount) headers.set("X-Expected-Account-Id", expectedAccount);
    if (expectedSession) headers.set("X-Expected-Session-Id", expectedSession);
    const result = await growthRequest(path + request.nextUrl.search, {
      method: request.method,
      headers,
      ...(request.method !== "GET" && request.method !== "DELETE"
        ? { body: await request.text() }
        : {}),
    });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
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

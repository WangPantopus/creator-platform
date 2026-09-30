import { NextRequest, NextResponse } from "next/server";
import {
  growthRequest,
  GrowthUnavailable,
} from "../../../../features/growth/server";

const allowed =
  /^(?:home|discovery-access|notifications(?:\/[a-f0-9-]+\/read)?|preferences(?:\/creators)?|follow\/[a-f0-9-]+|devices(?:\/[a-f0-9-]+)?|shares|invites|insights|funnel|impact|activation|experiments|feedback|recommendations(?:\/publish)?)$/u;
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
  if (
    request.method !== "GET" &&
    request.headers.get("origin") !== request.nextUrl.origin
  )
    return NextResponse.json(
      { error: { message: "Open this action from the app." } },
      { status: 403 },
    );
  try {
    const result = await growthRequest(path, {
      method: request.method,
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
          message:
            error instanceof Error
              ? error.message
              : "This feature is unavailable.",
        },
      },
      { status: error instanceof GrowthUnavailable ? error.status : 503 },
    );
  }
}
export const GET = handle,
  POST = handle,
  PUT = handle,
  DELETE = handle;

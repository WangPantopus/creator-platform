import { copy } from "@qelvora/copy";
import {
  growthRequest,
  GrowthUnavailable,
} from "../../../../../features/growth/server";
import {
  parseReplyExport,
  replyID,
} from "../../../../../features/growth/reply-export";

export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  try {
    const { id } = await params;
    if (!replyID(id))
      return Response.json(
        { error: { message: copy.growthCardUnavailable } },
        { status: 404, headers },
      );
    const artifact = parseReplyExport(
      await growthRequest(`public/shares/${id}/export`),
      id,
    );
    return Response.json(artifact, { headers });
  } catch (error) {
    return Response.json(
      {
        error: {
          message:
            error instanceof GrowthUnavailable
              ? error.message
              : copy.growthCardUnavailable,
        },
      },
      {
        status: error instanceof GrowthUnavailable ? error.status : 503,
        headers,
      },
    );
  }
}

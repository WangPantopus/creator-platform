import { copy } from "@qelvora/copy";
import {
  growthRequest,
  GrowthUnavailable,
} from "../../../../features/growth/server";

export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
  };
  try {
    const { id } = await params;
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(
        id,
      )
    )
      return new Response(copy.growthCardUnavailable, { status: 404, headers });
    const artifact = await growthRequest<{ id: string; text: string }>(
      `public/shares/${id}/export`,
    );
    if (artifact.id !== id)
      return new Response(copy.growthCardUnavailable, { status: 503, headers });
    return new Response(artifact.text, {
      headers: {
        ...headers,
        "Content-Disposition": `attachment; filename="reply-${id}.txt"`,
      },
    });
  } catch (error) {
    return new Response(
      error instanceof GrowthUnavailable
        ? error.message
        : copy.growthCardUnavailable,
      {
        status: error instanceof GrowthUnavailable ? error.status : 503,
        headers,
      },
    );
  }
}

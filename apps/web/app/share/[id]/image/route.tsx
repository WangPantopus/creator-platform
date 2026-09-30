import { copy, formatCopy } from "@qelvora/copy";
import { ImageResponse } from "next/og";
import {
  growthRequest,
  configuredOrigin,
} from "../../../../features/growth/server";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const data = await growthRequest<{
      state: string;
      source?: {
        creatorName: string;
        authorKind: string;
        handle: string | null;
        text: string;
        version: number;
      };
    }>(`public/shares/${id}`);
    if (data.state !== "valid" || !data.source)
      return new Response(copy.growthThisCardWasWithdrawn, {
        status: 410,
        headers: { "Cache-Control": "no-store" },
      });
    const s = data.source,
      origin = configuredOrigin();
    if (!origin)
      return new Response(copy.growthImageNeedsOrigin, { status: 503 });
    if (s.text.length > 900)
      return new Response(copy.growthImageTooLong, {
        status: 422,
        headers: { "Cache-Control": "no-store" },
      });
    return new ImageResponse(
      (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 80,
            width: "100%",
            height: "100%",
            background: "#F3E2C9",
            color: "#231C16",
          }}
        >
          <div style={{ display: "flex", fontSize: 36 }}>
            {s.authorKind === "approved_draft"
              ? formatCopy("approvedAuthor", { name: s.creatorName })
              : s.handle
                ? formatCopy("growthSharedReplyTo", {
                    name: s.creatorName,
                    handle: s.handle,
                  })
                : formatCopy("growthSharedPersonalReply", {
                    name: s.creatorName,
                  })}
          </div>
          <div
            style={{ display: "flex", fontSize: 40, whiteSpace: "pre-wrap" }}
          >
            {s.text}
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", fontSize: 22 }}
          >
            <span>
              {formatCopy("growthSignedByVersion", {
                name: s.creatorName,
                version: s.version,
              })}
            </span>
            <span>
              {origin}/share/{id}
            </span>
          </div>
        </div>
      ),
      {
        width: 1080,
        height: 1080,
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="reply-${id}.png"`,
        },
      },
    );
  } catch {
    return new Response(copy.growthCardUnavailable, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

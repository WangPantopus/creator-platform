import "server-only";
import { ImageResponse } from "next/og";
import { brand } from "@qelvora/brand";
import { copy, formatCopy } from "@qelvora/copy";
import { themes } from "@qelvora/tokens";
import { publicInvite } from "./public-invite";
import { GrowthUnavailable } from "./server";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export async function invitationCard(id: string) {
  try {
    const { creator } = await publicInvite(id);
    // A handle is the public ASCII identity. Keep arbitrary creator text out of
    // ImageResponse's automatic remote font/emoji loader; it stays on the page
    // and in metadata. This card uses only the bundled Latin font.
    const invitation = formatCopy("growthAnInvitationFrom", {
      value1: `@${creator.handle}`,
    });
    if (
      ![brand.name, invitation, copy.growthAcceptInvitation].every((s) =>
        /^[\x20-\x7e]+$/u.test(s),
      )
    )
      return new Response(null, { status: 503, headers });
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 72,
            background: themes.light["maya-surface"],
            color: themes.light["on-maya"],
          }}
        >
          <div style={{ display: "flex", fontSize: 44 }}>{brand.name}</div>
          <div
            style={{
              display: "flex",
              fontSize: 58,
              lineHeight: 1.2,
              maxWidth: 1056,
              overflowWrap: "anywhere",
            }}
          >
            {invitation}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: themes.light["maya-accent"],
            }}
          >
            {copy.growthAcceptInvitation}
          </div>
        </div>
      ),
      { width: 1200, height: 630, headers },
    );
  } catch (error) {
    return new Response(null, {
      status: error instanceof GrowthUnavailable ? error.status : 503,
      headers,
    });
  }
}

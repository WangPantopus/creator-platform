import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { Button, Seal } from "@qelvora/ui-web";
import { brand } from "@qelvora/brand";
import type { Metadata } from "next";
import {
  inviteMetadataOrigin,
  publicInvite,
} from "../../../features/growth/public-invite";
import { currentSession } from "../../../lib/session";
import { GrowthShell, Failure } from "../../../features/growth/shell";
import { EntryConsent } from "../../../features/growth/engagement";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  try {
    const { id } = await params;
    const data = await publicInvite(id);
    const title = growthFormat("growthAnInvitationFrom", {
      value1: data.creator.name,
    });
    const description = data.note || data.creator.biography || undefined;
    const origin = inviteMetadataOrigin();
    const image = origin ? `${origin}/invite/${id}/image` : undefined;
    return {
      title,
      description,
      robots: { index: false, follow: false },
      openGraph: {
        title,
        description,
        ...(image
          ? { images: [{ url: image, width: 1200, height: 630, alt: title }] }
          : {}),
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        ...(image ? { images: [image] } : {}),
      },
    };
  } catch {
    return {
      title: growthCopy.growthInvitationUnavailable,
      robots: { index: false, follow: false },
    };
  }
}
export default async function Invite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Keep identity restoration redirects outside the error presentation. A new
  // visitor goes straight to sign-in; provider review still precedes messaging.
  const session = await currentSession(`/invite/${id}`);
  try {
    const data = await publicInvite(id);
    return (
      <GrowthShell>
        <section
          className="growth-stack growth-invite qv-on-maya"
          style={{ overflowWrap: "anywhere", minWidth: 0 }}
        >
          <span className="growth-wordmark">{brand.name}</span>
          <Seal size={56} initial={Array.from(data.creator.name)[0]} />
          <span className="growth-meta">
            {growthFormat("growthAnInvitationFrom", {
              value1: data.creator.name.toUpperCase(),
            })}
          </span>
          <h1>
            {growthFormat("growthSAiCanHelpYouKeepGoing", {
              value1: data.creator.name,
            })}
          </h1>
          {data.note ? (
            <p className="growth-voice" dir="auto">
              {data.note}
            </p>
          ) : null}
          {data.creator.biography ? (
            <p className="growth-voice" dir="auto">
              {data.creator.biography}
            </p>
          ) : null}
          <Button
            href={
              session
                ? data.destination
                : `/api/auth/continue?returnTo=${encodeURIComponent(data.destination)}`
            }
            variant="ai"
            block
          >
            {growthCopy.growthAcceptInvitation}
          </Button>
          <p className="growth-help">
            {growthCopy.growthStartWithAFirstConversationOfAbout24HoursWhen}
          </p>
        </section>
        <div className="growth-stack">
          <EntryConsent
            handle={data.creator.handle}
            source="invite"
            objectId={id}
          />
        </div>
      </GrowthShell>
    );
  } catch (error) {
    return (
      <GrowthShell>
        <Failure error={error} returnTo={`/invite/${encodeURIComponent(id)}`} />
      </GrowthShell>
    );
  }
}

import { notFound } from "next/navigation";
import { IdSchema, ReturnTargetSchema } from "@qelvora/api";
import { IdentitySessionBoundary } from "../../../../features/identity/session-boundary";
import { IdentityWelcome } from "../../../../features/identity/welcome";
import { MediaSession } from "../../../../features/media/session";
import { currentSession } from "../../../../lib/session";
import { Studio } from "../../../../features/studio/Studio";
export default async function Page({
  params,
}: {
  params: Promise<{ creatorId: string; screen?: string[] }>;
}) {
  const { creatorId, screen } = await params;
  if (!IdSchema.safeParse(creatorId).success) notFound();
  const returnTo = `/studio/${creatorId}/${screen?.length ? screen.join("/") : "notes"}`;
  if (!ReturnTargetSchema.safeParse(returnTo).success) notFound();
  const session = await currentSession(returnTo);
  if (!session) return <IdentityWelcome returnTo={returnTo} arrival={null} />;
  return (
    <IdentitySessionBoundary
      key={session.accountId}
      initial={session}
      returnTo={returnTo}
    >
      <MediaSession>
        <Studio creatorId={creatorId} screen={screen ?? []} />
      </MediaSession>
    </IdentitySessionBoundary>
  );
}

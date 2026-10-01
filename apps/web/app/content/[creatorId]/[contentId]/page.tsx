import { notFound } from "next/navigation";
import { IdSchema } from "@qelvora/api";
import { IdentitySessionBoundary } from "../../../../features/identity/session-boundary";
import { IdentityWelcome } from "../../../../features/identity/welcome";
import { currentSession } from "../../../../lib/session";
import { FanContent } from "../../../../features/content/Content";
export default async function Page({
  params,
}: {
  params: Promise<{ creatorId: string; contentId: string }>;
}) {
  const { creatorId, contentId } = await params;
  if (
    !IdSchema.safeParse(creatorId).success ||
    !IdSchema.safeParse(contentId).success
  )
    notFound();
  const returnTo = `/content/${creatorId}/${contentId}`;
  const session = await currentSession(returnTo);
  if (!session) return <IdentityWelcome returnTo={returnTo} arrival={null} />;
  return (
    <IdentitySessionBoundary
      key={session.accountId}
      initial={session}
      returnTo={returnTo}
    >
      <FanContent creatorId={creatorId} contentId={contentId} />
    </IdentitySessionBoundary>
  );
}

import { StudioCallOffer } from "../../../../../../features/calls/StudioCallOffer";
import { currentSession } from "../../../../../../lib/session";
import { IdSchema } from "@qelvora/api";
import { notFound } from "next/navigation";
import { IdentitySessionBoundary } from "../../../../../../features/identity/session-boundary";
import { IdentityWelcome } from "../../../../../../features/identity/welcome";
import { MediaSession } from "../../../../../../features/media/session";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function OfferPage({
  params,
}: {
  params: Promise<{ creatorId: string; fanId: string; commitmentId: string }>;
}) {
  // Current authorization/acceptance comes from W4; URLs cannot carry a signed-act or authorization claim.
  const supplied = await params;
  if (Object.values(supplied).some((id) => !IdSchema.safeParse(id).success))
    notFound();
  const destination = {
    creatorId: supplied.creatorId.toLowerCase(),
    fanId: supplied.fanId.toLowerCase(),
    commitmentId: supplied.commitmentId.toLowerCase(),
  };
  const returnTo = `/studio/calls/${destination.creatorId}/${destination.fanId}/${destination.commitmentId}`;
  const session = await currentSession(returnTo);
  if (!session) return <IdentityWelcome returnTo={returnTo} arrival={null} />;
  return (
    <IdentitySessionBoundary
      key={`${session.accountId}:${session.sessionId}:${returnTo}`}
      initial={session}
      returnTo={returnTo}
    >
      <MediaSession>
        <StudioCallOffer {...destination} />
      </MediaSession>
    </IdentitySessionBoundary>
  );
}

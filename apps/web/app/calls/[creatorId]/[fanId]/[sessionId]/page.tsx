import { CallView } from "../../../../../features/calls/CallView";
import { currentSession } from "../../../../../lib/session";
import { SelectTime } from "../../../../../features/calls/SelectTime";
import { IdSchema } from "@qelvora/api";
import { notFound } from "next/navigation";
import { IdentitySessionBoundary } from "../../../../../features/identity/session-boundary";
import { IdentityWelcome } from "../../../../../features/identity/welcome";
import { MediaSession } from "../../../../../features/media/session";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function CallPage({
  params,
  searchParams,
}: {
  params: Promise<{ creatorId: string; fanId: string; sessionId: string }>;
  searchParams: Promise<{ offer?: string }>;
}) {
  const supplied = await params;
  if (Object.values(supplied).some((id) => !IdSchema.safeParse(id).success))
    notFound();
  const destination = {
    creatorId: supplied.creatorId.toLowerCase(),
    fanId: supplied.fanId.toLowerCase(),
    sessionId: supplied.sessionId.toLowerCase(),
  };
  const isOffer = (await searchParams).offer === "1";
  const returnTo = `/calls/${destination.creatorId}/${destination.fanId}/${destination.sessionId}${isOffer ? "?offer=1" : ""}`;
  const actor = await currentSession(returnTo);
  if (!actor) return <IdentityWelcome returnTo={returnTo} arrival={null} />;
  return (
    <IdentitySessionBoundary
      key={`${actor.accountId}:${actor.sessionId}:${returnTo}`}
      initial={actor}
      returnTo={returnTo}
    >
      <MediaSession>
        {isOffer ? (
          <SelectTime
            creatorId={destination.creatorId}
            fanId={destination.fanId}
            offerId={destination.sessionId}
            actorAccountId={actor.accountId}
            canSelect={actor.fan?.id === destination.fanId}
          />
        ) : (
          <CallView {...destination} actorAccountId={actor.accountId} />
        )}
      </MediaSession>
    </IdentitySessionBoundary>
  );
}

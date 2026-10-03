import { CallView } from "../../../../../features/calls/CallView";
import { currentSession } from "../../../../../lib/session";
import { SelectTime } from "../../../../../features/calls/SelectTime";
import { notFound } from "next/navigation";
import { IdSchema } from "@qelvora/api";
import { IdentitySessionBoundary } from "../../../../../features/identity/session-boundary";
import { IdentityWelcome } from "../../../../../features/identity/welcome";
import { MediaSession } from "../../../../../features/media/session";
export const metadata = { robots: { index: false, follow: false } };
export default async function CallPage({
  params,
  searchParams,
}: {
  params: Promise<{ creatorId: string; fanId: string; sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const destination = await params;
  if (
    ![destination.creatorId, destination.fanId, destination.sessionId].every(
      (value) => IdSchema.safeParse(value).success,
    )
  )
    notFound();
  const query = await searchParams;
  if (
    Object.keys(query).some((key) => !["offer", "theme"].includes(key)) ||
    (query.offer !== undefined && query.offer !== "1") ||
    (query.theme !== undefined &&
      (typeof query.theme !== "string" ||
        !["light", "night"].includes(query.theme)))
  )
    notFound();
  const offer = query.offer === "1";
  const returnTo = `/calls/${destination.creatorId}/${destination.fanId}/${destination.sessionId}${offer ? "?offer=1" : ""}`;
  const actor = await currentSession(returnTo);
  if (!actor) return <IdentityWelcome returnTo={returnTo} arrival={null} />;
  return (
    <IdentitySessionBoundary
      key={`${actor.accountId}:${actor.sessionId}:${returnTo}`}
      initial={actor}
      returnTo={returnTo}
    >
      <MediaSession>
        {offer ? (
          <SelectTime
            creatorId={destination.creatorId}
            fanId={destination.fanId}
            offerId={destination.sessionId}
            canSelect={actor?.fan?.id === destination.fanId}
          />
        ) : (
          <CallView {...destination} actorAccountId={actor.accountId} />
        )}
      </MediaSession>
    </IdentitySessionBoundary>
  );
}

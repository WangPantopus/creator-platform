import { CallView } from "../../../../../features/calls/CallView";
import { currentSession } from "../../../../../lib/session";
import { SelectTime } from "../../../../../features/calls/SelectTime";
export default async function CallPage({
  params,
  searchParams,
}: {
  params: Promise<{ creatorId: string; fanId: string; sessionId: string }>;
  searchParams: Promise<{ offer?: string }>;
}) {
  const actor = await currentSession();
  const destination = await params;
  if ((await searchParams).offer === "1")
    return (
      <SelectTime
        creatorId={destination.creatorId}
        fanId={destination.fanId}
        offerId={destination.sessionId}
        canSelect={actor?.fan?.id === destination.fanId}
      />
    );
  return (
    <CallView {...destination} actorAccountId={actor?.accountId ?? null} />
  );
}

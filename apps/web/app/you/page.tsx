import { IdSchema } from "@qelvora/api";
import { currentSession } from "../../lib/session";
import { IdentityWelcome } from "../../features/identity/welcome";
import { AccountScreen } from "../../features/conversation/AccountScreen";
import { IdentitySessionBoundary } from "../../features/identity/session-boundary";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function YouPage({
  searchParams,
}: {
  searchParams: Promise<{ creatorId?: string; fanId?: string }>;
}) {
  const query = await searchParams;
  const validPair =
    IdSchema.safeParse(query.creatorId).success &&
    IdSchema.safeParse(query.fanId).success;
  const returnTo = validPair
    ? `/you?creatorId=${query.creatorId}&fanId=${query.fanId}`
    : "/you";
  const session = await currentSession(returnTo);
  if (!session) return <IdentityWelcome returnTo={returnTo} arrival={null} />;
  return (
    <IdentitySessionBoundary
      key={`${session.accountId}:${returnTo}`}
      initial={session}
      returnTo={returnTo}
    >
      <AccountScreen
        creatorId={validPair ? query.creatorId : undefined}
        fanId={validPair ? query.fanId : undefined}
      />
    </IdentitySessionBoundary>
  );
}

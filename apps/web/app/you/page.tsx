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
  searchParams: Promise<{ creator?: string; fan?: string }>;
}) {
  const session = await currentSession();
  if (!session) return <IdentityWelcome returnTo="/you" arrival={null} />;
  const query = await searchParams;
  const validPair =
    IdSchema.safeParse(query.creator).success &&
    IdSchema.safeParse(query.fan).success;
  return (
    <IdentitySessionBoundary
      key={session.accountId}
      initial={session}
      returnTo="/you"
    >
      <AccountScreen
        creatorId={validPair ? query.creator : undefined}
        fanId={validPair ? query.fan : undefined}
      />
    </IdentitySessionBoundary>
  );
}

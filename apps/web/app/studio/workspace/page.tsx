import { Studio } from "../../../features/studio/Studio";
import { IdentitySessionBoundary } from "../../../features/identity/session-boundary";
import { IdentityWelcome } from "../../../features/identity/welcome";
import { currentSession } from "../../../lib/session";
export default async function Page() {
  const returnTo = "/studio/workspace";
  const session = await currentSession(returnTo);
  if (!session) return <IdentityWelcome returnTo={returnTo} arrival={null} />;
  return (
    <IdentitySessionBoundary
      key={session.accountId}
      initial={session}
      returnTo={returnTo}
    >
      <Studio />
    </IdentitySessionBoundary>
  );
}

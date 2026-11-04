import { Studio } from "../../../features/studio/Studio";
import { IdentitySessionBoundary } from "../../../features/identity/session-boundary";
import { IdentityWelcome } from "../../../features/identity/welcome";
import { signInProviders } from "../../../features/identity/sign-in-flow";
import { currentSession } from "../../../lib/session";
export default async function Page() {
  const returnTo = "/studio/workspace";
  const session = await currentSession(returnTo);
  if (!session)
    return (
      <IdentityWelcome
        returnTo={returnTo}
        arrival={null}
        providers={signInProviders()}
        development={process.env.NODE_ENV === "development"}
      />
    );
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

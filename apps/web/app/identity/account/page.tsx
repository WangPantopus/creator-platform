import { redirect } from "next/navigation";
import { currentSession } from "../../../lib/session";
import { AccountPanel } from "../../../features/identity/account";
import { IdentitySessionBoundary } from "../../../features/identity/session-boundary";
export default async function Page() {
  const session = await currentSession("/identity/account");
  if (!session) redirect("/auth/continue?returnTo=%2Fidentity%2Faccount");
  return (
    <main className="foundation">
      <IdentitySessionBoundary
        key={session.accountId}
        initial={session}
        returnTo="/identity/account"
      >
        <AccountPanel />
      </IdentitySessionBoundary>
    </main>
  );
}

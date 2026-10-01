import { redirect } from "next/navigation";
import { currentSession } from "../../../lib/session";
import { CreatorSetup } from "../../../features/identity/setup";
import { IdentitySessionBoundary } from "../../../features/identity/session-boundary";
export default async function Page() {
  const session = await currentSession("/studio/setup");
  if (!session) redirect("/auth/continue?returnTo=%2Fstudio%2Fsetup");
  return (
    <IdentitySessionBoundary
      key={session.accountId}
      initial={session}
      returnTo="/studio/setup"
    >
      <CreatorSetup initial={session} />
    </IdentitySessionBoundary>
  );
}

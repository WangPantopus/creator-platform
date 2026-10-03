import { copy } from "@qelvora/copy";
import { GrowthShell, Failure } from "../../../features/growth/shell";
import { LaunchKit } from "../../../features/growth/launch";
import { currentSession } from "../../../lib/session";
import { GrowthUnavailable } from "../../../features/growth/server";
import { IdentitySessionBoundary } from "../../../features/identity/session-boundary";
export const dynamic = "force-dynamic";
export default async function Launch() {
  const session = await currentSession("/studio/launch");
  if (!session)
    return (
      <GrowthShell studio>
        <Failure
          error={
            new GrowthUnavailable(
              401,
              "session_required",
              copy.growthSignInToContinue,
            )
          }
          returnTo="/studio/launch"
        />
      </GrowthShell>
    );
  return (
    <IdentitySessionBoundary
      key={session.sessionId}
      initial={session}
      returnTo="/studio/launch"
    >
      <GrowthShell studio>
        <LaunchKit />
      </GrowthShell>
    </IdentitySessionBoundary>
  );
}

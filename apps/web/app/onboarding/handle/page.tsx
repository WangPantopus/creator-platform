import { redirect } from "next/navigation";
import { ReturnTargetSchema } from "@qelvora/api";
import { currentSession } from "../../../lib/session";
import { HandleForm } from "../../../features/identity/handle";
import { IdentitySessionBoundary } from "../../../features/identity/session-boundary";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo: requested } = await searchParams;
  const parsed = ReturnTargetSchema.safeParse(requested ?? "/home");
  const returnTo = parsed.success ? parsed.data : "/home";
  const session = await currentSession(returnTo, true);
  if (!session)
    redirect(`/auth/continue?returnTo=${encodeURIComponent(returnTo)}`);
  return (
    <main className="foundation">
      <IdentitySessionBoundary
        key={session.accountId}
        initial={session}
        returnTo={returnTo}
      >
        <HandleForm
          returnTo={returnTo}
          initialHandle={session.fan?.handle}
          initialIntro={session.fan?.intro}
        />
      </IdentitySessionBoundary>
    </main>
  );
}

import { notFound } from "next/navigation";
import { IdSchema } from "@qelvora/api";
import { IdentitySessionBoundary } from "../../../features/identity/session-boundary";
import { IdentityWelcome } from "../../../features/identity/welcome";
import { MediaSession } from "../../../features/media/session";
import { AccountCallLookup } from "../../../features/calls/AccountCallLookup";
import { currentSession } from "../../../lib/session";

export const metadata = { robots: { index: false, follow: false } };
/** The shared dynamic segment holds a call ID on this shorter URL. */
export default async function AccountCallPage({
  params,
  searchParams,
}: {
  params: Promise<{ creatorId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { creatorId: sessionId } = await params;
  if (!IdSchema.safeParse(sessionId).success) notFound();
  const query = await searchParams;
  if (
    Object.keys(query).some((key) => key !== "theme") ||
    (query.theme !== undefined &&
      (typeof query.theme !== "string" ||
        !["light", "night"].includes(query.theme)))
  )
    notFound();
  const returnTo = `/calls/${sessionId}`;
  const session = await currentSession(returnTo);
  if (!session) return <IdentityWelcome returnTo={returnTo} arrival={null} />;
  return (
    <IdentitySessionBoundary
      key={`${session.accountId}:${session.sessionId}:${sessionId}`}
      initial={session}
      returnTo={returnTo}
    >
      <MediaSession>
        <AccountCallLookup sessionId={sessionId} />
      </MediaSession>
    </IdentitySessionBoundary>
  );
}

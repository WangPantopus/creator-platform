import { notFound } from "next/navigation";
import { IdSchema } from "@qelvora/api";
import { IdentitySessionBoundary } from "../../../../features/identity/session-boundary";
import { currentSession } from "../../../../lib/session";
import { IdentityWelcome } from "../../../../features/identity/welcome";
import { ConversationScreen } from "../../../../features/conversation/ConversationScreen";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function ThreadPage({
  params,
}: {
  params: Promise<{ creatorId: string; fanId: string }>;
}) {
  const { creatorId, fanId } = await params;
  if (
    !IdSchema.safeParse(creatorId).success ||
    !IdSchema.safeParse(fanId).success
  )
    notFound();
  const returnTo = `/threads/${creatorId}/${fanId}`;
  const session = await currentSession(returnTo);
  if (!session)
    return (
      <IdentityWelcome
        returnTo={`/threads/${creatorId}/${fanId}`}
        arrival={null}
      />
    );
  return (
    <IdentitySessionBoundary
      key={`${session.accountId}:${creatorId}:${fanId}`}
      initial={session}
      returnTo={`/threads/${creatorId}/${fanId}`}
    >
      <ConversationScreen
        creatorId={creatorId}
        fanId={fanId}
        accountId={session.accountId}
      />
    </IdentitySessionBoundary>
  );
}

import { notFound } from "next/navigation";
import { IdSchema } from "@qelvora/api";
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
  const session = await currentSession();
  if (!session)
    return (
      <IdentityWelcome
        returnTo={`/threads/${creatorId}/${fanId}`}
        arrival={null}
      />
    );
  return (
    <ConversationScreen
      key={`${session.accountId}:${creatorId}:${fanId}`}
      creatorId={creatorId}
      fanId={fanId}
      accountId={session.accountId}
    />
  );
}

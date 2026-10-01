import { notFound } from "next/navigation";
import { IdSchema } from "@qelvora/api";
import { Notice, SignedMarker } from "@qelvora/ui-web";
import { formatCopy } from "@qelvora/copy";
import { currentSession, platformFetch } from "../../../../../../lib/session";
import type {
  ConversationMessage,
  ConversationPage,
} from "../../../../../../../../packages/api/src/conversation/contracts";
import "../../../../../../features/conversation/conversation.css";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function OriginalMessage({
  params,
}: {
  params: Promise<{ creatorId: string; fanId: string; messageId: string }>;
}) {
  const { creatorId, fanId, messageId } = await params;
  if (
    ![creatorId, fanId, messageId].every((id) => IdSchema.safeParse(id).success)
  )
    notFound();
  const session = await currentSession();
  if (!session)
    return (
      <main className="conversation-consent">
        <Notice title="Session ended">
          Continue with Pantopus to read this conversation.
        </Notice>
        <a href={`/threads/${creatorId}/${fanId}`}>Conversation</a>
      </main>
    );
  const [response, timeline] = await Promise.all([
    platformFetch(
      `/v1/conversations/${creatorId}/${fanId}/messages/${messageId}`,
    ),
    platformFetch(`/v1/conversations/${creatorId}/${fanId}`),
  ]);
  if (!response.ok || !timeline.ok)
    return (
      <main className="conversation-consent">
        <Notice title="Source message unavailable">
          Openings and sources are checked against your current account.
        </Notice>
        <a href={`/threads/${creatorId}/${fanId}`}>Conversation</a>
      </main>
    );
  const message = (await response.json()) as ConversationMessage;
  const page = (await timeline.json()) as ConversationPage;
  const label = message.correction
    ? formatCopy("correctionAuthor", { name: page.creatorName })
    : {
        fan: "You",
        ai: `${page.creatorName}’s AI`,
        team: `${page.creatorName}’s team · ${message.member ?? "Authorized team member"}`,
        human_creator: page.creatorName,
        approved_draft: formatCopy("approvedAuthor", {
          name: page.creatorName,
        }),
        human_broadcast: `Note from ${page.creatorName}`,
        human_reaction: `${page.creatorName} reacted`,
        human_call: `Call with ${page.creatorName}`,
        system: "Conversation update",
      }[message.authorKind];
  return (
    <main className="conversation-consent">
      <a href={`/threads/${creatorId}/${fanId}`}>Back to conversation</a>
      <h1>Where this came from</h1>
      <span className="qv-label">{label}</span>
      <p style={{ whiteSpace: "pre-wrap" }}>{message.text}</p>
      {message.correction && (
        <a
          href={`/threads/${creatorId}/${fanId}/messages/${message.correction.originalMessageId}`}
        >
          Original AI reply · version {message.correction.originalVersion}
        </a>
      )}
      <p className="conversation-quiet">
        {message.createdAt} · {message.deliveryState}
      </p>
      {message.signedActId && (
        <SignedMarker
          name={page.creatorName}
          href={`/verify/${message.signedActId}`}
        />
      )}
    </main>
  );
}

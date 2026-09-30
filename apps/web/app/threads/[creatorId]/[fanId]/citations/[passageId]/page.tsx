import { IdSchema } from "@qelvora/api";
import { notFound } from "next/navigation";
import { Notice } from "@qelvora/ui-web";
import { currentSession, platformFetch } from "../../../../../../lib/session";
import { IdentityWelcome } from "../../../../../../features/identity/welcome";
import "../../../../../../features/conversation/conversation.css";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function CitationPage({
  params,
}: {
  params: Promise<{ creatorId: string; fanId: string; passageId: string }>;
}) {
  const { creatorId, fanId, passageId } = await params;
  if (
    ![creatorId, fanId, passageId].every((id) => IdSchema.safeParse(id).success)
  )
    notFound();
  const returnTo = `/threads/${creatorId}/${fanId}`;
  if (!(await currentSession()))
    return <IdentityWelcome returnTo={returnTo} arrival={null} />;
  let passage: {
    title: string;
    text: string;
    start: number;
    end: number;
  } | null = null;
  try {
    const response = await platformFetch(
      `/v1/conversations/${creatorId}/${fanId}/citations/${passageId}`,
    );
    if (response.ok) passage = await response.json();
  } catch {
    /* Access is checked again on every opening. */
  }
  return (
    <main className="conversation-account">
      <header>
        <a
          className="qv-icon-btn"
          href={returnTo}
          aria-label="Back to conversation"
        >
          ‹
        </a>
        <strong>Original source</strong>
      </header>
      <section>
        {passage ? (
          <>
            <h2>{passage.title}</h2>
            <p className="qv-meta">
              Original passage · {passage.start}–{passage.end}
            </p>
            <blockquote style={{ whiteSpace: "pre-wrap", margin: 0 }}>
              {passage.text}
            </blockquote>
          </>
        ) : (
          <Notice title="Source unavailable">
            No longer accessible to you. The AI’s author label and conversation
            remain available.
          </Notice>
        )}
      </section>
    </main>
  );
}

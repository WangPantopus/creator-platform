import { cookies } from "next/headers";
import { sessionCookie } from "../../../../lib/session";
import { Button, Notice } from "@qelvora/ui-web";
import { growthRequest } from "../../../../features/growth/server";
import { GrowthShell, Failure } from "../../../../features/growth/shell";
import type { Creator, Post } from "../../../../features/growth/types";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
/** Context destination; W3 owns the authenticated conversation body and consent. */
export default async function ContextualChat({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ context?: string }>;
}) {
  const { handle } = await params;
  const { context } = await searchParams;
  try {
    const { creator } = await growthRequest<{ creator: Creator }>(
      `public/creators/${encodeURIComponent(handle)}`,
    );
    let post: Post | undefined;
    if (context) {
      if (!/^[a-f0-9-]{36}$/u.test(context))
        throw new Error("This post is unavailable.");
      post = (
        await growthRequest<{ post: Post }>(
          `public/creators/${handle}/posts/${context}`,
        )
      ).post;
      if (!post.aiContextEligible)
        throw new Error("This post cannot be used as conversation context.");
    }
    const jar = await cookies();
    const signedIn = Boolean(jar.get(sessionCookie));
    const returnTo = `/creators/${handle}/chat${context ? `?context=${context}` : ""}`;
    return (
      <GrowthShell>
        <header className="growth-header">
          <a href={`/creators/${handle}`}>{creator.name}</a>
        </header>
        <div className="growth-stack">
          <h1>{creator.name}'s AI</h1>
          <p>
            You're talking to {creator.name}'s AI · {creator.name} steps in on
            request.
          </p>
          {post ? (
            <>
              <div className="qv qv-context">
                <div className="qv-context__text">
                  <span className="qv-meta">From a post</span>
                  <span>{post.title}</span>
                </div>
                <a
                  className="qv-icon-btn"
                  aria-label="Remove this post from your first message"
                  href={`/creators/${handle}/chat`}
                >
                  ×
                </a>
              </div>
            </>
          ) : null}
          <Notice
            title={
              creator.state !== "published"
                ? "AI paused"
                : "Conversation service not connected"
            }
          >
            {creator.state !== "published"
              ? `${creator.name}'s AI is paused.`
              : "Your entry context is valid. Messaging and processor consent require the conversation service."}
          </Notice>
          {!signedIn ? (
            <Button
              href={`/auth/continue?returnTo=${encodeURIComponent(returnTo)}`}
              variant="ai"
              block
            >
              Continue with Pantopus
            </Button>
          ) : null}
          <p className="growth-help">
            A first conversation lasts about 24 hours once available. No message
            has been sent.
          </p>
        </div>
      </GrowthShell>
    );
  } catch (error) {
    return (
      <GrowthShell>
        <Failure error={error} returnTo={`/creators/${handle}`} />
      </GrowthShell>
    );
  }
}

import { IdSchema, ReturnTargetSchema } from "@qelvora/api";
import { copy, formatCopy } from "@qelvora/copy";
import { currentSession } from "../../../../lib/session";
import { Button, Notice } from "@qelvora/ui-web";
import { growthRequest } from "../../../../features/growth/server";
import { GrowthShell, Failure } from "../../../../features/growth/shell";
import type { Creator, Post } from "../../../../features/growth/types";
import { ConsentScreen } from "../../../../features/conversation/ConsentScreen";
import { IdentitySessionBoundary } from "../../../../features/identity/session-boundary";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
/** Context destination; W3 owns the authenticated conversation body and consent. */
export default async function ContextualChat({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ context?: string | string[] }>;
}) {
  const { handle } = await params;
  const { context } = await searchParams;
  const directEntry = `/creators/${handle}/chat`;
  if (!ReturnTargetSchema.safeParse(directEntry).success)
    return (
      <GrowthShell>
        <Failure error={new Error("This creator is unavailable.")} />
      </GrowthShell>
    );
  const query = new URLSearchParams();
  for (const value of context === undefined
    ? []
    : Array.isArray(context)
      ? context
      : [context])
    query.append("context", value);
  const requestedEntry = `${directEntry}${query.size ? `?${query}` : ""}`;
  const returnTo = ReturnTargetSchema.safeParse(requestedEntry).success
    ? requestedEntry
    : directEntry;
  // Session restoration may redirect. Keep that control flow outside the
  // domain-error boundary so the canonical host can resume this destination.
  const session = await currentSession();
  try {
    if (
      context !== undefined &&
      (!IdSchema.safeParse(context).success ||
        !ReturnTargetSchema.safeParse(requestedEntry).success)
    )
      throw new Error("This post is unavailable.");
    const { creator } = await growthRequest<{ creator: Creator }>(
      `public/creators/${encodeURIComponent(handle)}`,
    );
    if (context !== undefined) {
      const post = (
        await growthRequest<{ post: Post }>(
          `public/creators/${handle}/posts/${context}`,
        )
      ).post;
      if (!post.aiContextEligible)
        throw new Error("This post cannot be used as conversation context.");
      // A public projection does not install W3's exact current W5/W2 context
      // custody. Never silently drop a requested post when starting a thread.
      throw new Error(
        "This post is unavailable for AI context. Remove it to open the conversation.",
      );
    }
    if (session && creator.state === "published")
      return (
        <IdentitySessionBoundary
          key={`${session.accountId}:${creator.id}`}
          initial={session}
          returnTo={returnTo}
        >
          <ConsentScreen
            creatorId={creator.id}
            name={creator.name}
            backHref={`/creators/${handle}`}
          />
        </IdentitySessionBoundary>
      );
    return (
      <GrowthShell>
        <header className="growth-header">
          <a href={`/creators/${handle}`}>{creator.name}</a>
        </header>
        <div className="growth-stack">
          <h1>{formatCopy("aiAuthor", { name: creator.name })}</h1>
          <p>{formatCopy("identityStrip", { name: creator.name })}</p>
          <Notice
            title={
              creator.state !== "published"
                ? "AI paused"
                : "Sign in to continue"
            }
          >
            {creator.state !== "published"
              ? `${creator.name}'s AI is paused.`
              : "Sign in to review who processes and can read your conversation before your first message."}
          </Notice>
          {!session ? (
            <Button
              href={`/auth/continue?returnTo=${encodeURIComponent(returnTo)}`}
              variant="ai"
              block
            >
              {copy.continueWithPantopus}
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
        <Failure error={error} returnTo={requestedEntry} />
        {context !== undefined ? (
          <Button href={directEntry} variant="quiet" block>
            {copy.removeContext}
          </Button>
        ) : null}
      </GrowthShell>
    );
  }
}

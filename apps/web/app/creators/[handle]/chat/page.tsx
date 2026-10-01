import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { IdSchema, ReturnTargetSchema } from "@qelvora/api";
import { Button, Notice } from "@qelvora/ui-web";
import { currentSession } from "../../../../lib/session";
import { IdentitySessionBoundary } from "../../../../features/identity/session-boundary";
import { ConsentScreen } from "../../../../features/conversation/ConsentScreen";
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { handle } = await params;
  const arrival = await searchParams;
  const { context } = arrival;
  const directEntry = `/creators/${handle}/chat`;
  if (!ReturnTargetSchema.safeParse(directEntry).success)
    return (
      <GrowthShell>
        <Failure
          error={new Error(growthCopy.growthThisPostIsUnavailable)}
          returnTo="/discover"
        />
      </GrowthShell>
    );
  const query = new URLSearchParams();
  for (const [name, values] of Object.entries(arrival))
    for (const value of values === undefined
      ? []
      : Array.isArray(values)
        ? values
        : [values])
      query.append(name, value);
  const requestedEntry = `${directEntry}${query.size ? `?${query}` : ""}`;
  // Reject unsupported arrival inputs before any restoration can redirect.
  // Only an explicit context-removal action may discard those inputs.
  if (
    Object.keys(arrival).some((name) => name !== "context") ||
    !ReturnTargetSchema.safeParse(requestedEntry).success ||
    (context !== undefined && !IdSchema.safeParse(context).success)
  )
    return (
      <GrowthShell>
        <Failure
          error={new Error(growthCopy.growthThisPostIsUnavailable)}
          returnTo={requestedEntry}
        />
        {context !== undefined ? (
          <Button href={directEntry} variant="quiet" block>
            {growthCopy.removeContext}
          </Button>
        ) : null}
      </GrowthShell>
    );
  const returnTo = requestedEntry;
  // Restoration redirects must stay outside the domain-error presentation.
  const session = await currentSession(returnTo);
  try {
    const { creator } = await growthRequest<{ creator: Creator }>(
      `public/creators/${encodeURIComponent(handle)}`,
    );
    let post: Post | undefined;
    if (typeof context === "string") {
      post = (
        await growthRequest<{ post: Post }>(
          `public/creators/${handle}/posts/${context}`,
        )
      ).post;
      if (!post.aiContextEligible)
        throw new Error(
          growthCopy.growthThisPostCannotBeUsedAsConversationContext,
        );
    }
    if (session && creator.state === "published" && !post)
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
          <h1>{growthFormat("growthSAi", { value1: creator.name })}</h1>
          <p>
            {growthFormat("growthYouReTalkingToSAiStepsInOnRequest", {
              value1: creator.name,
              value2: creator.name,
            })}
          </p>
          {post ? (
            <>
              <div className="qv qv-context">
                <div className="qv-context__text">
                  <span className="qv-meta">{growthCopy.growthFromAPost}</span>
                  <span>{post.title}</span>
                </div>
                <a
                  className="qv-icon-btn"
                  aria-label={growthCopy.removeContext}
                  href={`/creators/${handle}/chat`}
                >
                  ×
                </a>
              </div>
            </>
          ) : null}
          {creator.state !== "published" ? (
            <Notice title={growthCopy.growthAiPaused}>
              {growthFormat("growthSAiIsPaused", { value1: creator.name })}
            </Notice>
          ) : post ? (
            <Notice title="Post context unavailable">
              This post's conversation context is not connected yet. Remove the
              post context to continue to the current AI provider review.
            </Notice>
          ) : !session ? (
            <Notice title={growthCopy.growthSignInToContinue}>
              Sign in to review who processes and can read your conversation
              before your first message.
            </Notice>
          ) : null}
          {!session ? (
            <Button
              href={`/auth/continue?returnTo=${encodeURIComponent(returnTo)}`}
              variant="ai"
              block
            >
              {growthCopy.continueWithPantopus}
            </Button>
          ) : null}
          <p className="growth-help">
            {
              growthCopy.growthAFirstConversationLastsAbout24HoursOnceAvailableNo
            }
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
            {growthCopy.removeContext}
          </Button>
        ) : null}
      </GrowthShell>
    );
  }
}

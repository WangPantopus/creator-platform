import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { cookies } from "next/headers";
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
        throw new Error(growthCopy.growthThisPostIsUnavailable);
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
    const jar = await cookies();
    const signedIn = Boolean(jar.get("qelvora_session"));
    const returnTo = `/creators/${handle}/chat${context ? `?context=${context}` : ""}`;
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
          <Notice
            title={
              creator.state !== "published"
                ? growthCopy.growthAiPaused
                : growthCopy.growthConversationServiceNotConnected
            }
          >
            {creator.state !== "published"
              ? growthFormat("growthSAiIsPaused", { value1: creator.name })
              : growthCopy.growthYourEntryContextIsValidMessagingAndProcessorConsentRequire}
          </Notice>
          {!signedIn ? (
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
        <Failure error={error} returnTo={`/creators/${handle}`} />
      </GrowthShell>
    );
  }
}

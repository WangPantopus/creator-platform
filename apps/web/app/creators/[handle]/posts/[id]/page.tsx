import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import type { Metadata } from "next";
import { Button, Mark } from "@qelvora/ui-web";
import {
  growthRequest,
  configuredOrigin,
} from "../../../../../features/growth/server";
import { GrowthShell, Failure } from "../../../../../features/growth/shell";
import type { Creator, Post } from "../../../../../features/growth/types";
import {
  VoluntaryInvite,
  EntryConsent,
} from "../../../../../features/growth/engagement";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; id: string }>;
}): Promise<Metadata> {
  try {
    const { handle, id } = await params;
    const { post } = await growthRequest<{ post: Post }>(
      `public/creators/${encodeURIComponent(handle)}/posts/${encodeURIComponent(id)}`,
    );
    const origin = configuredOrigin();
    return {
      title: post.title,
      description: post.body.slice(0, 160),
      alternates: origin
        ? { canonical: `${origin}/creators/${handle}/posts/${id}` }
        : undefined,
    };
  } catch {
    return {
      title: growthCopy.growthPostUnavailable,
      robots: { index: false, follow: false },
    };
  }
}
export default async function PostPage({
  params,
}: {
  params: Promise<{ handle: string; id: string }>;
}) {
  const { handle, id } = await params;
  try {
    const { creator, post } = await growthRequest<{
      creator: Creator;
      post: Post;
    }>(
      `public/creators/${encodeURIComponent(handle)}/posts/${encodeURIComponent(id)}`,
    );
    return (
      <GrowthShell active="Discover">
        <header className="growth-header">
          <a href={`/creators/${handle}`}>← {creator.name}</a>
          <span className="growth-meta">{growthCopy.growthPublicPost}</span>
        </header>
        <article className="growth-stack">
          <span className="growth-note-label">{post.authorLabel}</span>
          <h1>{post.title}</h1>
          <p className="growth-voice">{post.body}</p>
          <time className="growth-meta" dateTime={post.publishedAt}>
            {new Date(post.publishedAt).toLocaleDateString("en", {
              month: "short",
              day: "numeric",
            })}
          </time>
          {post.aiContextEligible ? (
            <section
              className="qv-message qv-message--ai growth-card-body"
              style={{
                background: "var(--ai-surface)",
                border: "1px solid var(--ai-line)",
              }}
            >
              <span className="growth-mark">
                <Mark kind="ai" />
                {growthFormat("aiAuthor", { name: creator.name })}
              </span>
              <p className="growth-help">
                {
                  growthCopy.growthAskAboutThisPostTheContextStaysWithYourConversation
                }
              </p>
              <Button
                href={`/creators/${handle}/chat?context=${id}`}
                variant="ai"
                block
              >
                {growthFormat("growthAskSAiAboutThis", {
                  value1: creator.name,
                })}
              </Button>
            </section>
          ) : null}
        </article>
        <details className="growth-stack">
          <summary>{growthCopy.growthOptionalLinkChoices}</summary>
          <VoluntaryInvite handle={handle} contextId={id} />
          <EntryConsent handle={handle} source="post" objectId={id} />
        </details>
      </GrowthShell>
    );
  } catch (error) {
    return (
      <GrowthShell>
        <Failure error={error} />
      </GrowthShell>
    );
  }
}

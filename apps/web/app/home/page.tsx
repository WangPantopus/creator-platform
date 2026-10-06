import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { brand } from "@qelvora/brand";
import { growthRequest, GrowthUnavailable } from "../../features/growth/server";
import { currentSession } from "../../lib/session";
import { GrowthSessionBoundary } from "../../features/growth/private-view";
import { GrowthShell, Failure, NoData } from "../../features/growth/shell";
import type { Creator, Post } from "../../features/growth/types";
import { BrowserPostValuePrompt } from "../../features/growth/engagement";
export const dynamic = "force-dynamic";
export default async function Home() {
  const session = await currentSession("/home");
  if (!session)
    return (
      <GrowthShell>
        <Failure
          error={
            new GrowthUnavailable(
              401,
              "session_required",
              growthCopy.growthContinueWithPantopusToOpenYourAccountSCurrentState,
            )
          }
          returnTo="/home"
        />
      </GrowthShell>
    );
  let data: {
    entries: {
      id: string;
      kind: string;
      creatorName: string;
      label: string;
      preview: string;
      destination: string;
    }[];
    posts: { creator: Creator; post: Post }[];
    unread: number;
  };
  try {
    data = await growthRequest("home", {
      headers: {
        "X-Expected-Account-Id": session.accountId,
        "X-Expected-Session-Id": session.sessionId,
      },
    });
  } catch (error) {
    return (
      <GrowthShell>
        <Failure error={error} returnTo="/home" />
      </GrowthShell>
    );
  }
  return (
    <GrowthSessionBoundary initial={session} returnTo="/home">
      <GrowthShell>
        <header className="growth-header">
          <span className="growth-wordmark">{brand.name}</span>
          <a
            href="/notifications"
            aria-label={growthFormat("growthUnreadNotifications", {
              value1: data.unread,
            })}
          >
            {growthFormat("growthNotifications2", { value1: data.unread })}
          </a>
        </header>
        <div className="growth-stack">
          <h1>{growthCopy.growthYourPeople}</h1>
          <BrowserPostValuePrompt />
          {data.entries.length ? (
            data.entries.map((e) => (
              <a
                className="growth-card growth-card-body"
                key={e.id}
                href={e.destination}
              >
                <strong>
                  {e.creatorName} · {e.label}
                </strong>
                <p>{e.preview}</p>
              </a>
            ))
          ) : data.posts.length === 0 ? (
            <NoData title={growthCopy.growthPickACreatorToStart}>
              <a href="/discover">{growthCopy.growthDiscoverCreators}</a>
            </NoData>
          ) : null}
          {data.posts.length ? (
            <>
              <h2>{growthCopy.growthNewFromPeopleYouFollow}</h2>
              <p className="growth-help">{growthCopy.growthLatestFirst}</p>
              {data.posts.map(({ post, creator }) => (
                <article className="growth-card growth-card-body" key={post.id}>
                  <span className="growth-note-label">{post.authorLabel}</span>
                  <h3>{post.title}</h3>
                  <p className="growth-voice">{post.body}</p>
                  <a href={`/creators/${creator.handle}/posts/${post.id}`}>
                    {growthCopy.growthOpenPost}
                  </a>
                </article>
              ))}
            </>
          ) : null}
        </div>
      </GrowthShell>
    </GrowthSessionBoundary>
  );
}

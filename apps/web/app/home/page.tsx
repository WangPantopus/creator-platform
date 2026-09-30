import { brand } from "@qelvora/brand";
import { growthRequest } from "../../features/growth/server";
import { GrowthShell, Failure, NoData } from "../../features/growth/shell";
import type { Creator, Post } from "../../features/growth/types";
export const dynamic = "force-dynamic";
export default async function Home() {
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
    data = await growthRequest("home");
  } catch (error) {
    return (
      <GrowthShell>
        <Failure error={error} returnTo="/home" />
      </GrowthShell>
    );
  }
  return (
    <GrowthShell>
      <header className="growth-header">
        <span className="growth-wordmark">{brand.name}</span>
        <a
          href="/notifications"
          aria-label={`${data.unread} unread notifications`}
        >
          Notifications · {data.unread}
        </a>
      </header>
      <div className="growth-stack">
        <h1>Your people</h1>
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
          <NoData title="Pick a creator to start">
            <a href="/discover">Discover creators</a>
          </NoData>
        ) : null}
        {data.posts.length ? (
          <>
            <h2>New from people you follow</h2>
            <p className="growth-help">Latest first.</p>
            {data.posts.map(({ post, creator }) => (
              <article className="growth-card growth-card-body" key={post.id}>
                <span className="growth-note-label">{post.authorLabel}</span>
                <h3>{post.title}</h3>
                <p className="growth-voice">{post.body}</p>
                <a href={`/creators/${creator.handle}/posts/${post.id}`}>
                  Open post
                </a>
              </article>
            ))}
          </>
        ) : null}
      </div>
    </GrowthShell>
  );
}

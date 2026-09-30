import type { Metadata } from "next";
import { brand } from "@qelvora/brand";
import { Button, Seal } from "@qelvora/ui-web";
import {
  growthRequest,
  configuredOrigin,
} from "../../../features/growth/server";
import { GrowthShell, Failure, NoData } from "../../../features/growth/shell";
import { Follow, ShareLink } from "../../../features/growth/actions";
import type { Creator, Post } from "../../../features/growth/types";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  try {
    const { creator } = await growthRequest<{ creator: Creator }>(
      `public/creators/${encodeURIComponent((await params).handle)}`,
    );
    const origin = configuredOrigin(),
      canonical = origin ? `${origin}/creators/${creator.handle}` : undefined;
    return {
      title: `${creator.name} · ${brand.name}`,
      description: creator.biography,
      alternates: canonical ? { canonical } : undefined,
      robots: {
        index: creator.state === "published",
        follow: creator.state === "published",
      },
      openGraph: {
        title: creator.name,
        description: creator.biography,
        ...(canonical ? { url: canonical } : {}),
      },
    };
  } catch {
    return {
      title: "Creator unavailable",
      robots: { index: false, follow: false },
    };
  }
}
export default async function CreatorHome({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { handle } = await params;
  const selected = (await searchParams).section ?? "Posts";
  const section = ["Chat", "Posts", "Requests", "Access"].includes(selected)
    ? selected
    : "Posts";
  let data: { creator: Creator; posts: Post[] };
  try {
    data = await growthRequest(`public/creators/${encodeURIComponent(handle)}`);
  } catch (error) {
    return (
      <GrowthShell active="Discover">
        <Failure error={error} />
      </GrowthShell>
    );
  }
  const c = data.creator,
    origin = configuredOrigin();
  return (
    <GrowthShell active="Discover">
      <div className="growth-hero qv-on-maya">
        <nav
          className="growth-actions"
          style={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <a href="/discover" aria-label="Back to Discover">
            ←
          </a>
          <span className="growth-wordmark">{brand.name}</span>
          <ShareLink
            url={
              origin ? `${origin}/creators/${handle}` : `/creators/${handle}`
            }
            title={`${c.name}'s page`}
          />
        </nav>
        <div className="growth-portrait">{c.photoCaption}</div>
        <div>
          <span className="growth-meta" style={{ color: "var(--maya-accent)" }}>
            {c.category.toUpperCase()}
          </span>
          <h1>{c.name}</h1>
        </div>
        <p className="growth-voice">{c.biography}</p>
        <div className="growth-mark growth-rule">
          <Seal size={22} initial={c.name[0]} />
          <span className="growth-help">
            Official AI · {c.mode.replaceAll("_", " ")}
          </span>
        </div>
      </div>
      <section className="growth-stack" style={{ paddingBottom: 0, gap: 14 }}>
        {c.state === "published" ? (
          <Button
            variant="ai"
            size="lg"
            block
            href={`/creators/${handle}/chat`}
          >
            Message {c.name}'s AI
          </Button>
        ) : (
          <p>{c.name}'s AI is paused · public profile remains readable.</p>
        )}
        <p className="growth-help" style={{ textAlign: "center" }}>
          Official means {c.name} authorized this AI. It does not mean {c.name}{" "}
          read your message.
        </p>
        <Follow creatorId={c.id} handle={c.handle} />
        <nav className="growth-seg" aria-label="Creator sections">
          {["Chat", "Posts", "Requests", "Access"].map((s) => (
            <a
              key={s}
              href={`/creators/${handle}?section=${s}`}
              aria-current={s === section ? "page" : undefined}
            >
              {s}
            </a>
          ))}
        </nav>
      </section>
      <section className="growth-stack">
        {section === "Posts" ? (
          <>
            <h2>From {c.name}</h2>
            {data.posts.length ? (
              data.posts.map((p) => (
                <article className="growth-card growth-card-body" key={p.id}>
                  <span className="growth-note-label">{p.authorLabel}</span>
                  <h3>{p.title}</h3>
                  <p className="growth-voice">{p.body}</p>
                  <a href={`/creators/${handle}/posts/${p.id}`}>Open post</a>
                </article>
              ))
            ) : (
              <NoData title="No public posts yet">
                Come back when {c.name} publishes something.
              </NoData>
            )}
          </>
        ) : section === "Chat" ? (
          <>
            <h2>What {c.name}'s AI knows</h2>
            <p>{c.sourceSummary}</p>
            <p>{c.topics.join(", ")}</p>
            <p className="growth-help">{c.presence}</p>
          </>
        ) : section === "Requests" ? (
          <>
            <h2>{c.name}'s time, by request</h2>
            <p>{c.capacity}</p>
            <p className="growth-help">{c.reliability}</p>
            <p className="growth-help">
              Requests and prices come from the creator's current offer. No
              offer is connected here yet.
            </p>
          </>
        ) : (
          <>
            <h2>{c.membershipLabel ?? "Access"}</h2>
            {c.accessLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </>
        )}
      </section>
      {origin && c.state === "published" ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ProfilePage",
              mainEntity: {
                "@type": "Person",
                name: c.name,
                description: c.biography,
                url: `${origin}/creators/${c.handle}`,
              },
            }).replace(/</gu, "\\u003c"),
          }}
        />
      ) : null}
    </GrowthShell>
  );
}

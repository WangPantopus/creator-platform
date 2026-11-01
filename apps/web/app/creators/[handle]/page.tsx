import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import type { Metadata } from "next";
import { brand } from "@qelvora/brand";
import { Button, Seal } from "@qelvora/ui-web";
import {
  configuredOrigin,
  GrowthUnavailable,
} from "../../../features/growth/server";
import { GrowthShell, Failure, NoData } from "../../../features/growth/shell";
import { Follow, ShareLink } from "../../../features/growth/actions";
import type { Creator, Post } from "../../../features/growth/types";
import { publicCreatorPage } from "../../../features/growth/public-creator";
import {
  ApprovedVariant,
  VoluntaryInvite,
  EntryConsent,
} from "../../../features/growth/engagement";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  try {
    const { creator } = await publicCreatorPage((await params).handle);
    const origin = configuredOrigin(),
      canonical = origin ? `${origin}/creators/${creator.handle}` : undefined;
    return {
      title: `${creator.name} · ${brand.name}`,
      description: creator.biography || undefined,
      alternates: canonical ? { canonical } : undefined,
      robots: {
        index: creator.state === "published",
        follow: creator.state === "published",
      },
      openGraph: {
        title: creator.name,
        description: creator.biography || undefined,
        ...(canonical ? { url: canonical } : {}),
      },
    };
  } catch {
    return {
      title: growthCopy.growthCreatorUnavailable,
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
    data = await publicCreatorPage(handle);
  } catch (error) {
    if (error instanceof GrowthUnavailable && error.status === 404)
      return (
        <GrowthShell active="Discover">
          <NoData title={growthCopy.growthCreatorUnavailable}>
            <a href="/discover">{growthCopy.growthBackToDiscover}</a>
          </NoData>
        </GrowthShell>
      );
    return (
      <GrowthShell active="Discover">
        <Failure
          error={error}
          returnTo={`/creators/${encodeURIComponent(handle)}?section=${section}`}
        />
      </GrowthShell>
    );
  }
  const c = data.creator,
    origin = configuredOrigin();
  return (
    <GrowthShell active="Discover">
      <div className="growth-hero growth-public-profile qv-on-maya">
        <nav
          className="growth-actions"
          style={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <a href="/discover" aria-label={growthCopy.growthBackToDiscover}>
            ←
          </a>
          <span className="growth-wordmark">{brand.name}</span>
          <ShareLink
            url={
              origin ? `${origin}/creators/${handle}` : `/creators/${handle}`
            }
            title={growthFormat("growthSPage", { value1: c.name })}
          />
        </nav>
        <div className="growth-portrait growth-portrait--initial">
          <span className="growth-portrait-initial" aria-hidden="true">
            {Array.from(c.name.trim())[0] ?? ""}
          </span>
          {c.photoCaption ? <span dir="auto">{c.photoCaption}</span> : null}
        </div>
        <div>
          <span className="growth-meta" style={{ color: "var(--maya-accent)" }}>
            {c.category ? c.category.toUpperCase() : `@${c.handle}`}
          </span>
          <h1 dir="auto">{c.name}</h1>
        </div>
        {c.biography ? (
          <p className="growth-voice" dir="auto">
            {c.biography}
          </p>
        ) : null}
        <div className="growth-mark growth-rule">
          <Seal size={22} initial={Array.from(c.name)[0]} />
          <span className="growth-help">
            {growthFormat("growthOfficialAi", {
              value1: c.mode.replaceAll("_", " "),
            })}
          </span>
        </div>
      </div>
      <section
        className="growth-stack growth-public-profile"
        style={{ paddingBottom: 0, gap: 14 }}
      >
        {c.state === "published" ? (
          <Button
            variant="ai"
            size="lg"
            block
            href={`/creators/${handle}/chat`}
          >
            {growthFormat("growthMessageSAi", { value1: c.name })}
          </Button>
        ) : (
          <p>
            {growthFormat("growthSAiIsPausedPublicProfileRemainsReadable", {
              value1: c.name,
            })}
          </p>
        )}
        <p className="growth-help" style={{ textAlign: "center" }}>
          {growthFormat(
            "growthOfficialMeansAuthorizedThisAiItDoesNotMeanRead",
            { value1: c.name, value2: c.name },
          )}
        </p>
        <Follow creatorId={c.id} handle={c.handle} />
        <nav
          className="growth-seg"
          aria-label={growthCopy.growthCreatorSections}
        >
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
      <section className="growth-stack growth-public-profile">
        {section === "Posts" ? (
          <>
            <h2>{growthFormat("growthFrom2", { value1: c.name })}</h2>
            {data.posts.length ? (
              data.posts.map((p) => (
                <article className="growth-card growth-card-body" key={p.id}>
                  <span className="growth-note-label">{p.authorLabel}</span>
                  <h3 dir="auto">{p.title}</h3>
                  <p className="growth-voice" dir="auto">
                    {p.body}
                  </p>
                  <a href={`/creators/${handle}/posts/${p.id}`}>
                    {growthCopy.growthOpenPost}
                  </a>
                </article>
              ))
            ) : (
              <NoData title={growthCopy.growthNoPublicPostsYet}>
                {growthFormat("growthComeBackWhenPublishesSomething", {
                  value1: c.name,
                })}
              </NoData>
            )}
          </>
        ) : section === "Chat" ? (
          <>
            <h2>{growthFormat("growthWhatSAiKnows", { value1: c.name })}</h2>
            <p>{c.sourceSummary}</p>
            <p>{c.topics.join(", ")}</p>
            <p className="growth-help">{c.presence}</p>
          </>
        ) : section === "Requests" ? (
          <>
            <h2>{growthFormat("growthSTimeByRequest", { value1: c.name })}</h2>
            <p>{c.capacity}</p>
            <p className="growth-help">{c.reliability}</p>
            <p className="growth-help">
              {
                growthCopy.growthRequestsAndPricesComeFromTheCreatorSCurrentOffer
              }
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
      <ApprovedVariant handle={c.handle} />
      <details className="growth-stack">
        <summary>{growthCopy.growthOptionalLinkChoices}</summary>
        <VoluntaryInvite handle={c.handle} />
        <EntryConsent handle={c.handle} source="creator_link" />
      </details>
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

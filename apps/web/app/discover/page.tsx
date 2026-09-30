import { growthRequest } from "../../features/growth/server";
import { GrowthShell, Failure, NoData } from "../../features/growth/shell";
import type { Creator } from "../../features/growth/types";
import { Connection } from "../../features/growth/actions";
import { PassMarker, PassAccessProvider } from "../../features/growth/pass";
export const dynamic = "force-dynamic";
export default async function Discover({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { q = "", category = "" } = await searchParams;
  let data: { creators: Creator[]; hasMore: boolean };
  try {
    data = await growthRequest(
      `public/creators?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`,
    );
  } catch (error) {
    return (
      <GrowthShell active="Discover">
        <Failure error={error} />
      </GrowthShell>
    );
  }
  return (
    <GrowthShell active="Discover">
      <Connection />
      <header className="growth-header">
        <h1>Discover</h1>
      </header>
      <form
        action="/discover"
        className="growth-stack"
        style={{ paddingBottom: 0, gap: 16 }}
      >
        <label className="qv-sr" htmlFor="q">
          Search creators
        </label>
        <input
          className="qv-input"
          id="q"
          name="q"
          defaultValue={q}
          maxLength={120}
          placeholder="Search creators, crafts or questions"
        />
        <input type="hidden" name="category" value={category} />
        <button className="qv-sr" type="submit">
          Search
        </button>
        <nav className="growth-seg" aria-label="Categories">
          {["For you", "Crafts", "Music", "Food"].map((cat) => (
            <a
              href={`/discover?q=${encodeURIComponent(q)}&category=${cat === "For you" ? "" : cat}`}
              key={cat}
              aria-current={
                (category || "For you") === cat ? "page" : undefined
              }
            >
              {cat}
            </a>
          ))}
        </nav>
      </form>
      <PassAccessProvider>
        <div className="growth-stack">
          {data.creators.length ? (
            data.creators.map((c) => (
              <article className="growth-card" key={c.id}>
                <a
                  href={`/creators/${c.handle}`}
                  style={{ textDecoration: "none" }}
                >
                  <div className="growth-photo qv-on-maya">
                    <strong>{c.name}</strong>
                    <small>{c.photoCaption}</small>
                  </div>
                  <div className="growth-card-body">
                    <PassMarker creatorId={c.id} />
                    <strong>
                      {c.category} · {c.mode.replaceAll("_", " ")}
                    </strong>
                    <p className="growth-help">{c.biography}</p>
                    <p className="growth-help">
                      {c.name}'s AI can talk about: {c.topics.join(", ")}.
                    </p>
                    <p className="growth-capacity growth-rule">{c.capacity}</p>
                    <p className="growth-help">
                      {c.state === "paused"
                        ? `${c.name}'s AI is paused.`
                        : "Official AI · try a first conversation when available"}
                    </p>
                  </div>
                </a>
              </article>
            ))
          ) : (
            <NoData title="No creators found">
              Try a different need or browse a category.
            </NoData>
          )}
          <p className="growth-help">
            Public creator information · alphabetical order. Official means the
            creator authorized this AI.
          </p>
          {data.hasMore ? (
            <p className="growth-help">
              Refine your search to see more creators.
            </p>
          ) : null}
        </div>
      </PassAccessProvider>
    </GrowthShell>
  );
}

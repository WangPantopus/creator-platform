import { growthLabel } from "../../features/growth/copy";
import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
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
        <h1>{growthCopy.navDiscover}</h1>
      </header>
      <form
        action="/discover"
        className="growth-stack"
        style={{ paddingBottom: 0, gap: 16 }}
      >
        <label className="qv-sr" htmlFor="q">
          {growthCopy.growthSearchCreators}
        </label>
        <input
          className="qv-input"
          id="q"
          name="q"
          defaultValue={q}
          maxLength={120}
          placeholder={growthCopy.growthSearchCreatorsCraftsOrQuestions}
        />
        <input type="hidden" name="category" value={category} />
        <button className="qv-sr" type="submit">
          {growthCopy.growthSearch}
        </button>
        <nav className="growth-seg" aria-label={growthCopy.growthCategories}>
          {["For you", "Crafts", "Music", "Food"].map((cat) => (
            <a
              href={`/discover?q=${encodeURIComponent(q)}&category=${cat === "For you" ? "" : cat}`}
              key={growthLabel(cat)}
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
                      {growthFormat("growthSAiCanTalkAbout", {
                        value1: c.name,
                        value2: c.topics.join(", "),
                      })}
                    </p>
                    <p className="growth-capacity growth-rule">{c.capacity}</p>
                    <p className="growth-help">
                      {c.state === "paused"
                        ? growthFormat("growthSAiIsPaused", { value1: c.name })
                        : growthCopy.growthOfficialAiTryAFirstConversationWhenAvailable}
                    </p>
                  </div>
                </a>
              </article>
            ))
          ) : (
            <NoData title={growthCopy.growthNoCreatorsFound}>
              {growthCopy.growthTryADifferentNeedOrBrowseACategory}
            </NoData>
          )}
          <p className="growth-help">
            {
              growthCopy.growthPublicCreatorInformationAlphabeticalOrderOfficialMeansTheCreatorAuthorized
            }
          </p>
          {data.hasMore ? (
            <p className="growth-help">
              {growthCopy.growthRefineYourSearchToSeeMoreCreators}
            </p>
          ) : null}
        </div>
      </PassAccessProvider>
    </GrowthShell>
  );
}

import {
  growthRequest,
  configuredOrigin,
} from "../../../features/growth/server";
import { GrowthShell, Failure } from "../../../features/growth/shell";
import { ShareLink } from "../../../features/growth/actions";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
interface Shared {
  state: "valid" | "withdrawn";
  id: string;
  source?: {
    text: string;
    creatorName: string;
    authorKind: string;
    handle: string | null;
    version: number;
    signedAt: string;
    correction: string | null;
  };
}
export default async function Share({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    const data = await growthRequest<Shared>(`public/shares/${id}`);
    if (data.state === "withdrawn")
      return (
        <GrowthShell>
          <div className="growth-stack">
            <h1>This card was withdrawn.</h1>
            <p>The shared content is no longer available.</p>
          </div>
        </GrowthShell>
      );
    const source = data.source!;
    const origin = configuredOrigin(),
      url = origin ? `${origin}/share/${id}` : `/share/${id}`;
    return (
      <GrowthShell>
        <section
          className="growth-stack"
          style={{ background: "var(--surface-sunken)" }}
        >
          <article className="growth-export qv-on-maya">
            <strong>
              {source.authorKind === "approved_draft"
                ? `Prepared by AI · approved by ${source.creatorName}`
                : `${source.creatorName}${source.handle ? ` replied to ${source.handle}` : " · personal reply"}`}
            </strong>
            <p
              className={
                source.authorKind === "approved_draft" ? "" : "growth-voice"
              }
            >
              {source.text}
            </p>
            <span>
              Signed by {source.creatorName} ·{" "}
              {new Date(source.signedAt).toLocaleDateString()}
            </span>
            <a href={url}>
              Verify this immutable version {source.version}: {url}
            </a>
            {source.correction ? (
              <p>
                {source.creatorName}'s note on this reply: {source.correction}
              </p>
            ) : null}
          </article>
          <h2>Share {source.creatorName}'s reply</h2>
          <p className="growth-help">
            The author label and verification link stay on the default export.
          </p>
          <ShareLink url={url} title={`${source.creatorName}'s reply`} />
          <a className="qv-btn qv-btn--secondary" href={`/share/${id}/image`}>
            Download labeled image
          </a>
        </section>
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

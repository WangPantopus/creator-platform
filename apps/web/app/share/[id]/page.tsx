import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
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
            <h1>{growthCopy.growthThisCardWasWithdrawn}</h1>
            <p>{growthCopy.growthTheSharedContentIsNoLongerAvailable}</p>
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
                ? growthFormat("growthPreparedByAiApprovedBy", {
                    value1: source.creatorName,
                  })
                : source.handle
                  ? growthFormat("growthSharedReplyTo", {
                      name: source.creatorName,
                      handle: source.handle,
                    })
                  : growthFormat("growthSharedPersonalReply", {
                      name: source.creatorName,
                    })}
            </strong>
            <p
              className={
                source.authorKind === "approved_draft" ? "" : "growth-voice"
              }
            >
              {source.text}
            </p>
            <span>
              {growthFormat("growthSignedBy", {
                value1: source.creatorName,
                value2: new Date(source.signedAt).toLocaleDateString(),
              })}
            </span>
            <a href={url}>
              {growthFormat("growthVerifyThisImmutableVersion", {
                value1: source.version,
                value2: url,
              })}
            </a>
            {source.correction ? (
              <p>
                {growthFormat("growthSNoteOnThisReply", {
                  value1: source.creatorName,
                  value2: source.correction,
                })}
              </p>
            ) : null}
          </article>
          <h2>
            {growthFormat("growthShareSReply", { value1: source.creatorName })}
          </h2>
          <p className="growth-help">
            {growthCopy.growthTheAuthorLabelAndVerificationLinkStayOnTheDefault}
          </p>
          <ShareLink
            url={url}
            title={growthFormat("growthSReply", { value1: source.creatorName })}
          />
          <a className="qv-btn qv-btn--secondary" href={`/share/${id}/image`}>
            {growthCopy.growthDownloadLabeledImage}
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

import { copy } from "@qelvora/copy";
import { growthRequest } from "../../../../features/growth/server";
import { GrowthShell, Failure } from "../../../../features/growth/shell";
import {
  parseReplyExport,
  replyID,
} from "../../../../features/growth/reply-export";
import { ShareImages } from "../../../../features/growth/share-images";

export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function ImageExport({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  try {
    if (!replyID(id)) throw new Error(copy.growthCardUnavailable);
    const artifact = parseReplyExport(
      await growthRequest(`public/shares/${id}/export`),
      id,
    );
    return (
      <GrowthShell>
        <section className="growth-stack">
          <h1>{copy.growthDownloadLabeledImage}</h1>
          <p>{artifact.authorLabel}</p>
          <ShareImages id={id} />
          <a className="qv-btn qv-btn--secondary" href={`/share/${id}/export`}>
            {copy.growthDownloadCompleteReply}
          </a>
          <a href={`/share/${id}`}>{copy.growthBackToReply}</a>
        </section>
      </GrowthShell>
    );
  } catch (error) {
    return (
      <GrowthShell>
        <Failure error={error} returnTo={`/share/${id}`} />
      </GrowthShell>
    );
  }
}

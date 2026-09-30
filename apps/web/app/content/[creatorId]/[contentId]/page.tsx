import { notFound } from "next/navigation";
import { IdSchema } from "@qelvora/api";
import { FanContent } from "../../../../features/content/Content";
export default async function Page({
  params,
}: {
  params: Promise<{ creatorId: string; contentId: string }>;
}) {
  const { creatorId, contentId } = await params;
  if (
    !IdSchema.safeParse(creatorId).success ||
    !IdSchema.safeParse(contentId).success
  )
    notFound();
  return <FanContent creatorId={creatorId} contentId={contentId} />;
}

import { notFound } from "next/navigation";
import { IdSchema } from "@qelvora/api";
import { Studio } from "../../../../features/studio/Studio";
export default async function Page({
  params,
}: {
  params: Promise<{ creatorId: string; screen?: string[] }>;
}) {
  const { creatorId, screen } = await params;
  if (!IdSchema.safeParse(creatorId).success) notFound();
  return <Studio creatorId={creatorId} screen={screen ?? []} />;
}

import { CreatorAI } from "../../../../features/creator-ai/CreatorAI";
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const section = (await params).section?.[0] ?? "overview";
  return <CreatorAI section={section} />;
}

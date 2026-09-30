import { notFound } from "next/navigation";
import { CommerceScreen } from "../../../features/commerce/CommerceScreen";
const screens = [
  "requests",
  "spending",
  "access",
  "packet",
  "checkout",
  "status",
  "pass",
  "offers",
  "earnings",
  "pool",
  "membership",
] as const;
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ creatorId?: string; packetId?: string }>;
}) {
  const { screen } = await params;
  if (!screens.some((s) => s === screen)) notFound();
  const query = await searchParams;
  return (
    <CommerceScreen
      screen={screen}
      creatorId={query.creatorId}
      packetId={query.packetId}
    />
  );
}

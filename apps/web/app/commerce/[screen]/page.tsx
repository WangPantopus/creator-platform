import { notFound } from "next/navigation";
import { CommerceScreen } from "../../../features/commerce/CommerceScreen";
import { currentSession } from "../../../lib/session";
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
  const session = await currentSession();
  return (
    <CommerceScreen
      key={session ? `${session.accountId}:${session.sessionId}` : "signed-out"}
      session={session}
      screen={screen}
      creatorId={query.creatorId}
      packetId={query.packetId}
    />
  );
}

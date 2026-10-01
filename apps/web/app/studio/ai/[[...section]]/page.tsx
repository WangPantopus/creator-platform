import { CreatorAISession } from "../../../../features/creator-ai/session";
import { IdentitySessionBoundary } from "../../../../features/identity/session-boundary";
import { IdentityWelcome } from "../../../../features/identity/welcome";
import { currentSession } from "../../../../lib/session";
import { notFound } from "next/navigation";
import { ReturnTargetSchema } from "@qelvora/api";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const parts = (await params).section ?? [];
  const section = parts[0] ?? "overview";
  const returnTo = ["/studio/ai", ...parts.map(encodeURIComponent)].join("/");
  if (!ReturnTargetSchema.safeParse(returnTo).success) notFound();
  const session = await currentSession(returnTo);
  if (!session) return <IdentityWelcome returnTo={returnTo} arrival={null} />;
  return (
    <IdentitySessionBoundary
      key={session.accountId}
      initial={session}
      returnTo={returnTo}
    >
      <CreatorAISession section={section} />
    </IdentitySessionBoundary>
  );
}

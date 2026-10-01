import { CreatorAISession } from "../../../../features/creator-ai/session";
import { CreatorAI } from "../../../../features/creator-ai/CreatorAI";
import { headers } from "next/headers";
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
  // The owned synthetic Studio uses its explicit server actor through the BFF;
  // it does not issue or pretend to hold a production Pantopus session.
  if (
    process.env.NODE_ENV === "development" &&
    process.env.W2_DEVELOPMENT_MODE === "true" &&
    /^development:[0-9a-f-]{36}$/u.test(
      process.env.W2_DEVELOPMENT_SESSION ?? "",
    )
  ) {
    const origin = new URL(process.env.WEB_ORIGIN ?? "http://localhost:3002");
    if (
      ["localhost", "127.0.0.1"].includes(origin.hostname) &&
      (await headers()).get("host") === origin.host
    )
      return <CreatorAI section={section} />;
  }
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

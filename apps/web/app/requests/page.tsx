import { notFound } from "next/navigation";
import { copy } from "@qelvora/copy";
import { Notice } from "@qelvora/ui-web";
import { IdentitySessionBoundary } from "../../features/identity/session-boundary";
import { IdentityWelcome } from "../../features/identity/welcome";
import { CommerceScreen } from "../../features/commerce/CommerceScreen";
import { currentSession } from "../../lib/session";

export const metadata = { robots: { index: false, follow: false } };
/** Canonical fan navigation mounts the existing account-owned Requests reader. */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  if (
    Object.keys(query).some((key) => key !== "theme") ||
    (query.theme !== undefined &&
      (typeof query.theme !== "string" ||
        !["light", "night"].includes(query.theme)))
  )
    notFound();
  const returnTo = "/requests";
  const session = await currentSession(returnTo);
  if (!session) return <IdentityWelcome returnTo={returnTo} arrival={null} />;
  return (
    <IdentitySessionBoundary
      key={`${session.accountId}:${session.sessionId}`}
      initial={session}
      returnTo={returnTo}
    >
      {session.mode === "development" && (
        <div className="qv">
          <Notice title={copy.identityDevelopmentTitle}>
            {copy.identityDevelopmentBody}
          </Notice>
        </div>
      )}
      <CommerceScreen screen="requests" accountId={session.accountId} />
    </IdentitySessionBoundary>
  );
}

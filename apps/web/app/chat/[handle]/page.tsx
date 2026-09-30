import { Notice } from "@qelvora/ui-web";
import { ReturnTargetSchema } from "@qelvora/api";
import { currentSession } from "../../../lib/session";
import { IdentityWelcome } from "../../../features/identity/welcome";
import { growthRequest } from "../../../features/growth/server";
import type { Creator } from "../../../features/growth/types";
import { ConsentScreen } from "../../../features/conversation/ConsentScreen";
import { IdentitySessionBoundary } from "../../../features/identity/session-boundary";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** W3-owned entry; W7 can compose ConsentScreen in its contextual destination. */
export default async function ConversationEntry({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  if (!ReturnTargetSchema.safeParse(`/creators/${handle}/chat`).success)
    return (
      <main>
        <Notice title="Creator unavailable">
          Open this creator from Discover.
        </Notice>
      </main>
    );
  const session = await currentSession(`/creators/${handle}/chat`);
  if (!session)
    return (
      <IdentityWelcome returnTo={`/creators/${handle}/chat`} arrival={null} />
    );
  try {
    const { creator } = await growthRequest<{ creator: Creator }>(
      `public/creators/${encodeURIComponent(handle)}`,
    );
    return (
      <IdentitySessionBoundary
        key={`${session.accountId}:${creator.id}`}
        initial={session}
        returnTo={`/creators/${encodeURIComponent(handle)}/chat`}
      >
        <ConsentScreen
          creatorId={creator.id}
          name={creator.name}
          backHref={`/creators/${encodeURIComponent(handle)}`}
        />
      </IdentitySessionBoundary>
    );
  } catch {
    return (
      <main className="conversation-consent">
        <Notice title="Creator unavailable">
          Reconnect to open the creator's current profile.
        </Notice>
        <a href="/discover">Discover</a>
      </main>
    );
  }
}

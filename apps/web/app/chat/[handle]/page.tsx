import { Notice } from "@qelvora/ui-web";
import { currentSession } from "../../../lib/session";
import { IdentityWelcome } from "../../../features/identity/welcome";
import { growthRequest } from "../../../features/growth/server";
import type { Creator } from "../../../features/growth/types";
import { ConsentScreen } from "../../../features/conversation/ConsentScreen";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** W3-owned entry; W7 can compose ConsentScreen in its contextual destination. */
export default async function ConversationEntry({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/u.test(handle))
    return (
      <main>
        <Notice title="Creator unavailable">
          Open this creator from Discover.
        </Notice>
      </main>
    );
  const session = await currentSession();
  if (!session)
    return <IdentityWelcome returnTo={`/chat/${handle}`} arrival={null} />;
  try {
    const { creator } = await growthRequest<{ creator: Creator }>(
      `public/creators/${encodeURIComponent(handle)}`,
    );
    return (
      <ConsentScreen
        key={`${session.accountId}:${creator.id}`}
        creatorId={creator.id}
        name={creator.name}
        backHref={`/creators/${encodeURIComponent(handle)}`}
      />
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

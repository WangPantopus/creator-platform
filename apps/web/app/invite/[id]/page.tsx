import { Button, Seal } from "@qelvora/ui-web";
import { brand } from "@qelvora/brand";
import { growthRequest } from "../../../features/growth/server";
import { GrowthShell, Failure } from "../../../features/growth/shell";
import type { Creator } from "../../../features/growth/types";
import { EntryConsent } from "../../../features/growth/engagement";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default async function Invite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    const { id } = await params;
    const data = await growthRequest<{ creator: Creator; destination: string }>(
      `public/invites/${encodeURIComponent(id)}`,
    );
    return (
      <GrowthShell>
        <section className="growth-stack growth-invite qv-on-maya">
          <span className="growth-wordmark">{brand.name}</span>
          <Seal size={56} initial={data.creator.name[0]} />
          <span className="growth-meta">
            AN INVITATION FROM {data.creator.name.toUpperCase()}
          </span>
          <h1>{data.creator.name}'s AI can help you keep going.</h1>
          <p className="growth-voice">{data.creator.biography}</p>
          <Button href={data.destination} variant="ai" block>
            Accept invitation
          </Button>
          <p className="growth-help">
            Start with a first conversation of about 24 hours when available. No
            card needed.
          </p>
        </section>
        <div className="growth-stack">
          <EntryConsent
            handle={data.creator.handle}
            source="invite"
            objectId={id}
          />
        </div>
      </GrowthShell>
    );
  } catch (error) {
    return (
      <GrowthShell>
        <Failure error={error} />
      </GrowthShell>
    );
  }
}

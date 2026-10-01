import { redirect } from "next/navigation";
import { Notice } from "@qelvora/ui-web";
import { copy as growthCopy } from "@qelvora/copy";
import { GrowthShell } from "../../features/growth/shell";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function YouPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // W1's protected account route is available here. The richer W3 account
  // and pair/privacy graph is not installed; never discard scoped context.
  if (Object.keys(await searchParams).length) {
    return (
      <GrowthShell active="You">
        <section className="growth-stack">
          <Notice title={growthCopy.growthTemporarilyUnavailable}>
            {growthCopy.growthThisFeatureIsNotConnectedYet}
          </Notice>
        </section>
      </GrowthShell>
    );
  }
  redirect("/identity/account");
}

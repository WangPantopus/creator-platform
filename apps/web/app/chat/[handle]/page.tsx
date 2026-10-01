import { Notice } from "@qelvora/ui-web";
import { ReturnTargetSchema } from "@qelvora/api";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Older W3 links enter the same canonical session/consent/context boundary. */
export default async function ConversationEntry({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ context?: string | string[] }>;
}) {
  const { handle } = await params;
  const destination = `/creators/${handle}/chat`;
  if (!ReturnTargetSchema.safeParse(destination).success)
    return (
      <main>
        <Notice title="Creator unavailable">
          Open this creator from Discover.
        </Notice>
      </main>
    );
  const { context } = await searchParams;
  const query = new URLSearchParams();
  for (const value of context === undefined
    ? []
    : Array.isArray(context)
      ? context
      : [context])
    query.append("context", value);
  redirect(`${destination}${query.size ? `?${query}` : ""}`);
}

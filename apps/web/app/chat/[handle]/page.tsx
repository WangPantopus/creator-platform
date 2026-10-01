import { Notice } from "@qelvora/ui-web";
import { ReturnTargetSchema } from "@qelvora/api";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

/** Older links retain every arrival input at the canonical session boundary. */
export default async function ConversationEntry({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  const query = new URLSearchParams();
  for (const [name, values] of Object.entries(await searchParams))
    for (const value of values === undefined
      ? []
      : Array.isArray(values)
        ? values
        : [values])
      query.append(name, value);
  redirect(`${destination}${query.size ? `?${query}` : ""}`);
}

import { IdentityContinueSchema } from "@qelvora/api/schemas";
import { IdentityWelcome } from "../../../features/identity/welcome";
import { platformFetch } from "../../../lib/session";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; returnTo?: string }>;
}) {
  const { error, returnTo: requested } = await searchParams;
  const context = IdentityContinueSchema.safeParse({ returnTo: requested });
  const returnTo = context.success ? context.data.returnTo : "/home";
  let arrival = null;
  const handle = returnTo.match(/^\/creators\/([a-z0-9_]{3,30})(?:\/|$)/u)?.[1];
  if (handle)
    try {
      const response = await platformFetch(
        `/v1/growth/public/creators/${handle}`,
        {},
        false,
      );
      if (response.ok) {
        const { creator } = await response.json();
        if (typeof creator?.name === "string")
          arrival = {
            source: `You came from ${creator.name}'s page`,
            title: [creator.name, creator.category, creator.membershipLabel]
              .filter(Boolean)
              .join(" · "),
            creatorName: creator.name,
          };
      }
    } catch {
      /* Keep the destination without inventing creator metadata. */
    }
  return (
    <IdentityWelcome
      returnTo={returnTo}
      arrival={arrival}
      {...(error || (requested && !context.success)
        ? { error: error ?? "invalid_return" }
        : {})}
    />
  );
}

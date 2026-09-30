import { cookies } from "next/headers";
import { Notice } from "@qelvora/ui-web";
import { continuationCookie, platformFetch } from "../../../lib/session";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ continuationId?: string }>;
}) {
  const { continuationId } = await searchParams;
  const current = (await cookies()).get(continuationCookie)?.value;
  const response = await platformFetch("/v1/identity/capabilities");
  const capabilities = await response.json();
  if (
    process.env.NODE_ENV !== "development" ||
    capabilities.mode !== "development" ||
    !current ||
    current !== continuationId
  )
    return (
      <main className="foundation auth-error">
        <Notice title="Sign-in unavailable">
          Start sign-in from this app.
        </Notice>
        <a href="/auth/continue">Continue with Pantopus</a>
      </main>
    );
  return (
    <main className="foundation auth-error">
      <h1>Development identity</h1>
      <Notice title="Synthetic accounts">
        These isolated actors are for local development. Pantopus production
        sign-in is not connected.
      </Notice>
      <form method="post" action="/api/auth/complete">
        <input type="hidden" name="continuationId" value={continuationId} />
        {capabilities.developmentActors.map(
          (actor: { id: string; label: string }) => (
            <button
              key={actor.id}
              className="qv-btn qv-btn--secondary qv-btn--lg qv-btn--block"
              type="submit"
              name="code"
              value={actor.id}
            >
              {actor.label}
            </button>
          ),
        )}
      </form>
    </main>
  );
}

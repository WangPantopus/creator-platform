import { copy } from "@qelvora/copy";
import { NextRequest } from "next/server";
type Context = { params: Promise<{ token: string }> };
/** Link previews/scanners cannot change consent. The visible flow explicitly submits POST. */
export async function GET(_request: NextRequest, { params }: Context) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token))
    return new Response(copy.growthEmailLinkUnavailable, { status: 404 });
  return new Response(
    `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(copy.growthEmailPreferences)}</title><body><main><h1>${escape(copy.growthUnsubscribeTitle)}</h1><p>${escape(copy.growthUnsubscribeExplanation)}</p><form method="post"><button type="submit">${escape(copy.growthUnsubscribeAction)}</button></form></main></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
/** RFC8058 one-click POST: no session/origin dependency, no redirect/confirmation. */
export async function POST(_request: NextRequest, { params }: Context) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token))
    return new Response(copy.growthUnsubscribed, { status: 200 });
  const origin =
    process.env.QELVORA_GROWTH_API_URL ?? process.env.QELVORA_API_URL;
  if (!origin)
    return new Response(copy.growthEmailServiceUnavailable, { status: 503 });
  try {
    const response = await fetch(new URL("/v1/growth/unsubscribe", origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    return new Response(
      response.ok
        ? copy.growthUnsubscribed
        : copy.growthEmailServiceUnavailable,
      {
        status: response.ok ? 200 : 503,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch {
    return new Response(copy.growthEmailServiceUnavailable, { status: 503 });
  }
}

function escape(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

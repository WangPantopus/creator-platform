import { NextRequest, NextResponse } from "next/server";
import { applicationOrigin } from "../../../../lib/request-origin";
import { IdentityContinueSchema } from "@qelvora/api/schemas";
import { IdentityRedirectSchema } from "@qelvora/api";
import {
  continuationCookie,
  continuationReturnCookie,
  cookieOptions,
} from "../../../../lib/session";
/** Only the backend's Pantopus adapter may create a redirect; this route never creates an identity. */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const requested = query.get("returnTo") ?? "/home";
  const context = IdentityContinueSchema.safeParse({ returnTo: requested });
  const valid =
    context.success &&
    query.getAll("returnTo").length <= 1 &&
    ![...query.keys()].some((key) => key !== "returnTo");
  const returnTo = valid && context.success ? context.data.returnTo : "/home";
  let target: URL;
  try {
    if (
      process.env.NODE_ENV === "production" &&
      !(process.env.QELVORA_PUBLIC_ORIGIN ?? process.env.WEB_ORIGIN)
    )
      throw new Error("Application origin is not configured");
    target = new URL("/auth/continue", applicationOrigin(request));
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "identity_unconfigured",
          message: "Pantopus sign-in is temporarily unavailable. Try again.",
        },
      },
      { status: 503 },
    );
  }
  target.searchParams.set("returnTo", returnTo);
  if (!valid) {
    target.searchParams.set("error", "invalid_return");
    return NextResponse.redirect(target);
  }
  const backendUrl = process.env.QELVORA_API_URL;
  if (backendUrl) {
    try {
      const response = await fetch(
        new URL("/v1/identity/continue", backendUrl),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ returnTo }),
          signal: AbortSignal.timeout(5000),
          cache: "no-store",
        },
      );
      if (response.ok) {
        const result = IdentityRedirectSchema.parse(await response.json());
        if (
          result.redirectUrl &&
          (new URL(result.redirectUrl).protocol === "https:" ||
            (process.env.NODE_ENV === "development" &&
              ["localhost", "127.0.0.1"].includes(
                new URL(result.redirectUrl).hostname,
              )))
        ) {
          const redirect = NextResponse.redirect(result.redirectUrl);
          if (result.continuationId)
            redirect.cookies.set(continuationCookie, result.continuationId, {
              ...cookieOptions,
              maxAge: 300,
            });
          // Keep navigation context longer than the one-use five-minute
          // authorization challenge, so an expired callback can start again.
          redirect.cookies.set(continuationReturnCookie, returnTo, {
            ...cookieOptions,
            maxAge: 1800,
          });
          return redirect;
        }
      }
    } catch {
      /* Preserve context and surface the provider's unavailable state. */
    }
  }
  target.searchParams.set("error", "identity_unconfigured");
  return NextResponse.redirect(target);
}

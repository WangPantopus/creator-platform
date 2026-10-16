import { NextRequest, NextResponse } from "next/server";
import { IdentityRedirectSchema, ReturnTargetSchema } from "@qelvora/api";
import {
  continuationCookie,
  continuationReturnCookie,
  cookieOptions,
  platformFetch,
} from "../../../../lib/session";
import {
  forwardedFor,
  signInProviders,
  signInRetry,
} from "../../../../features/identity/sign-in-flow";

/** Starts an Apple or Google sign-in. Only the backend makes the provider URL;
 * this browser keeps the step's id so a callback can be bound to it. */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const returnTo = ReturnTargetSchema.safeParse(
    query.get("returnTo") ?? "/home",
  );
  const provider = query.get("provider");
  const known = ["provider", "returnTo", "reauthenticate"];
  if (
    !returnTo.success ||
    [...query.keys()].some(
      (key) => !known.includes(key) || query.getAll(key).length !== 1,
    ) ||
    !signInProviders().some((item) => item === provider)
  )
    return signInRetry(request, "invalid_return");
  let response: Response;
  try {
    response = await platformFetch(
      "/v1/identity/web/start",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...forwardedFor(request),
        },
        body: JSON.stringify({
          returnTo: returnTo.data,
          provider,
          ...(query.get("reauthenticate") === "1"
            ? { reauthenticate: true }
            : {}),
        }),
      },
      false,
    );
  } catch {
    return signInRetry(request, "sign_in_unavailable");
  }
  if (!response.ok) {
    const code = (await response.json().catch(() => null))?.error?.code;
    return signInRetry(
      request,
      code === "rate_limited" ? "rate_limited" : "sign_in_unavailable",
    );
  }
  const result = IdentityRedirectSchema.safeParse(await response.json());
  const target = result.success ? new URL(result.data.redirectUrl) : null;
  if (
    !target ||
    !result.data?.continuationId ||
    !(
      target.protocol === "https:" ||
      (process.env.NODE_ENV === "development" &&
        ["localhost", "127.0.0.1"].includes(target.hostname))
    )
  )
    return signInRetry(request, "sign_in_unavailable");
  const redirect = NextResponse.redirect(target, 303);
  redirect.headers.set("Cache-Control", "no-store");
  redirect.cookies.set(continuationCookie, result.data.continuationId, {
    ...cookieOptions,
    maxAge: 300,
  });
  redirect.cookies.set(continuationReturnCookie, returnTo.data, {
    ...cookieOptions,
    maxAge: 1800,
  });
  return redirect;
}

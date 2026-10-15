import { NextResponse, type NextRequest } from "next/server";
import { IdentitySignInResultSchema, ReturnTargetSchema } from "@qelvora/api";
import { applicationOrigin } from "../../lib/request-origin";
import {
  continuationCookie,
  continuationReturnCookie,
  cookieOptions,
  sessionCookie,
} from "../../lib/session";
import { requiresFanHandle } from "../../lib/identity-destination";
import { sessionCompletionResponse } from "../../lib/session-completion";
import { trustLocalSessionCookie } from "../../lib/trust-session";

/** The age step's single-use id, kept in the browser that started sign-in. */
export const ageCookie = sessionCookie.replace(
  "qelvora_session",
  "qelvora_age",
);
export const signInProviders = (): readonly ("apple" | "google")[] =>
  (process.env.QELVORA_SIGN_IN ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is "apple" | "google" =>
      ["apple", "google"].includes(value),
    );

/** The web server is the backend's caller; it names the person's address so
 * the backend's start limit counts people, not this server. */
export function forwardedFor(request: NextRequest): Record<string, string> {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return address ? { "X-Forwarded-For": address } : {};
}

/** Back to the sign-in page with a reason, keeping the saved destination.
 * Every half-finished step is forgotten. */
export function signInRetry(request: NextRequest, error: string) {
  const saved = ReturnTargetSchema.safeParse(
    request.cookies.get(continuationReturnCookie)?.value,
  );
  const target = new URL("/auth/continue", applicationOrigin(request));
  target.searchParams.set("returnTo", saved.success ? saved.data : "/home");
  target.searchParams.set("error", error);
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.delete(continuationCookie);
  response.cookies.delete(ageCookie);
  return response;
}

const reasons: Record<string, string> = {
  continuation_expired: "continuation_expired",
  age_confirmation_expired: "continuation_expired",
  rate_limited: "rate_limited",
  identity_provider_unavailable: "sign_in_unavailable",
  sign_in_unconfigured: "sign_in_unavailable",
  sign_in_provider_unavailable: "sign_in_unavailable",
  identity_unconfigured: "sign_in_unavailable",
  service_unavailable: "sign_in_unavailable",
};

/** Turns the backend's C1 sign-in result into the next browser step: the age
 * screen, the adults-only page, or the signed-in destination. */
export async function finishSignIn(request: NextRequest, response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code: string | undefined = body?.error?.code;
    if (code === "adult_eligibility_required") {
      const refused = NextResponse.redirect(
        new URL("/auth/adults-only", applicationOrigin(request)),
        303,
      );
      for (const name of [
        continuationCookie,
        continuationReturnCookie,
        ageCookie,
      ])
        refused.cookies.delete(name);
      return refused;
    }
    return signInRetry(
      request,
      (code && reasons[code]) ?? "continuation_failed",
    );
  }
  const result = IdentitySignInResultSchema.safeParse(body);
  if (!result.success) return signInRetry(request, "continuation_failed");
  if (result.data.status === "age_required") {
    const next = NextResponse.redirect(
      new URL("/auth/age", applicationOrigin(request)),
      303,
    );
    next.cookies.set(
      ageCookie,
      result.data.ageConfirmation!.ageContinuationId,
      { ...cookieOptions, maxAge: 600 },
    );
    next.cookies.delete(continuationCookie);
    return next;
  }
  const completion = result.data.completion!;
  const target = requiresFanHandle(completion.session, completion.returnTo)
    ? `/onboarding/handle?returnTo=${encodeURIComponent(completion.returnTo)}`
    : completion.returnTo;
  const done = sessionCompletionResponse(
    new URL(target, applicationOrigin(request)),
  );
  done.cookies.set(sessionCookie, completion.token, {
    ...cookieOptions,
    maxAge: 7 * 86400,
  });
  if (
    process.env.W8_LOCAL_DEVELOPMENT === "true" &&
    process.env.NODE_ENV !== "production"
  )
    done.cookies.delete(trustLocalSessionCookie);
  for (const name of [continuationCookie, continuationReturnCookie, ageCookie])
    done.cookies.delete(name);
  return done;
}

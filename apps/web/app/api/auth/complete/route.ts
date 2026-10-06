import { NextRequest, NextResponse } from "next/server";
import { IdentityCompletionSchema, ReturnTargetSchema } from "@qelvora/api";
import {
  applicationOrigin,
  sameRequestOrigin,
} from "../../../../lib/request-origin";
import {
  continuationCookie,
  continuationReturnCookie,
  sessionCookie,
  cookieOptions,
  platformFetch,
} from "../../../../lib/session";
import { trustLocalSessionCookie } from "../../../../lib/trust-session";
import { requiresFanHandle } from "../../../../lib/identity-destination";
import { sessionCompletionResponse } from "../../../../lib/session-completion";

function retry(request: NextRequest, error: string) {
  const saved = ReturnTargetSchema.safeParse(
    request.cookies.get(continuationReturnCookie)?.value,
  );
  const target = new URL("/auth/continue", applicationOrigin(request));
  target.searchParams.set("returnTo", saved.success ? saved.data : "/home");
  target.searchParams.set("error", error);
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.delete(continuationCookie);
  return response;
}

export async function POST(request: NextRequest) {
  if (!sameRequestOrigin(request))
    return Response.json(
      { error: { message: "Start sign-in from this app." } },
      { status: 403 },
    );
  const form = await request.formData();
  const continuationId = request.cookies.get(continuationCookie)?.value;
  if (!continuationId || form.get("continuationId") !== continuationId)
    return retry(request, "continuation_expired");
  return complete(request, continuationId, form.get("code"), form.get("state"));
}

export async function GET(request: NextRequest) {
  const continuationId = request.cookies.get(continuationCookie)?.value;
  const query = request.nextUrl.searchParams;
  if (
    !continuationId ||
    query.getAll("continuationId").length !== 1 ||
    query.get("continuationId") !== continuationId ||
    query.getAll("code").length !== 1 ||
    query.getAll("state").length !== 1
  )
    return retry(request, "continuation_expired");
  return complete(
    request,
    continuationId,
    query.get("code"),
    query.get("state"),
  );
}

async function complete(
  request: NextRequest,
  continuationId: string,
  code: FormDataEntryValue | null,
  state: FormDataEntryValue | null,
) {
  try {
    const response = await platformFetch(
      "/v1/identity/complete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          continuationId,
          code,
          ...(typeof state === "string" ? { state } : {}),
        }),
      },
      false,
    );
    if (!response.ok) {
      const failure = await response.json();
      const code = failure.error?.code;
      return retry(
        request,
        code === "continuation_expired" || code === "adult_eligibility_required"
          ? code
          : "continuation_failed",
      );
    }
    const result = IdentityCompletionSchema.parse(await response.json());
    const target = requiresFanHandle(result.session, result.returnTo)
      ? `/onboarding/handle?returnTo=${encodeURIComponent(result.returnTo)}`
      : result.returnTo;
    const redirect = sessionCompletionResponse(
      new URL(target, applicationOrigin(request)),
    );
    redirect.cookies.set(sessionCookie, result.token, {
      ...cookieOptions,
      maxAge: 7 * 86400,
    });
    if (
      process.env.W8_LOCAL_DEVELOPMENT === "true" &&
      process.env.NODE_ENV !== "production"
    )
      redirect.cookies.delete(trustLocalSessionCookie);
    redirect.cookies.delete(continuationCookie);
    redirect.cookies.delete(continuationReturnCookie);
    return redirect;
  } catch {
    return retry(request, "continuation_failed");
  }
}

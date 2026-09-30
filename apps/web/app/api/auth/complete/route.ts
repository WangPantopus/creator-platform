import { NextRequest, NextResponse } from "next/server";
import { IdentityCompletionSchema } from "@qelvora/api";
import {
  continuationCookie,
  sessionCookie,
  cookieOptions,
  platformFetch,
} from "../../../../lib/session";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return Response.json(
      { error: { message: "Start sign-in from this app." } },
      { status: 403 },
    );
  const form = await request.formData();
  const continuationId = request.cookies.get(continuationCookie)?.value;
  if (!continuationId || form.get("continuationId") !== continuationId)
    return NextResponse.redirect(
      new URL("/auth/continue?error=continuation_expired", request.url),
      303,
    );
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
    return NextResponse.redirect(
      new URL("/auth/continue?error=continuation_expired", request.url),
      303,
    );
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
    if (!response.ok) throw new Error("Sign-in unavailable");
    const result = IdentityCompletionSchema.parse(await response.json());
    const target = result.session.fan
      ? result.returnTo
      : `/onboarding/handle?returnTo=${encodeURIComponent(result.returnTo)}`;
    const redirect = NextResponse.redirect(new URL(target, request.url), 303);
    redirect.cookies.set(sessionCookie, result.token, {
      ...cookieOptions,
      maxAge: 7 * 86400,
    });
    redirect.cookies.delete(continuationCookie);
    return redirect;
  } catch {
    return NextResponse.redirect(
      new URL("/auth/continue?error=continuation_failed", request.url),
      303,
    );
  }
}

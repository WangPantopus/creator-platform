import { NextRequest, NextResponse } from "next/server";
import { applicationOrigin } from "../../../../../lib/request-origin";
import { completeProviderCallback } from "../complete";

const shaped = (value: FormDataEntryValue | null, limit: number) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= limit &&
  /^[A-Za-z0-9._~-]+$/u.test(value);

/** Apple answers with a cross-site form post, which carries no SameSite=Lax
 * cookie. Hand the code and state to the same-site GET below, which does. */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const target = new URL(
    "/api/auth/callback/apple",
    applicationOrigin(request),
  );
  const code = form?.get("code") ?? null;
  const state = form?.get("state") ?? null;
  if (form?.get("error") || !shaped(code, 4096) || !shaped(state, 128))
    target.searchParams.set("error", "access_denied");
  else {
    target.searchParams.set("code", code as string);
    target.searchParams.set("state", state as string);
  }
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export function GET(request: NextRequest) {
  return completeProviderCallback(request);
}

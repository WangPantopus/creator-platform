import { NextRequest } from "next/server";
import { sameRequestOrigin } from "../../../../lib/request-origin";
import { platformFetch } from "../../../../lib/session";
import {
  ageCookie,
  finishSignIn,
  signInRetry,
} from "../../../../features/identity/sign-in-flow";

/** The age step. Only the date travels; the backend keeps the result. */
export async function POST(request: NextRequest) {
  if (!sameRequestOrigin(request))
    return Response.json(
      { error: { message: "Start sign-in from this app." } },
      { status: 403 },
    );
  const ageContinuationId = request.cookies.get(ageCookie)?.value;
  if (!ageContinuationId) return signInRetry(request, "continuation_expired");
  const form = await request.formData().catch(() => null);
  const birthDate = form?.get("birthDate");
  if (typeof birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(birthDate))
    return signInRetry(request, "continuation_failed");
  try {
    return await finishSignIn(
      request,
      await platformFetch(
        "/v1/identity/age",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ageContinuationId, birthDate }),
        },
        false,
      ),
    );
  } catch {
    return signInRetry(request, "sign_in_unavailable");
  }
}

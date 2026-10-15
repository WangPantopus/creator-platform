import type { NextRequest } from "next/server";
import { continuationCookie, platformFetch } from "../../../../lib/session";
import {
  finishSignIn,
  signInRetry,
} from "../../../../features/identity/sign-in-flow";

/** The provider's way back, as a same-site GET. The step must have started
 * in this browser (its cookie), which stops a forced sign-in into someone
 * else's account; the backend checks state, code and nonce. */
export async function completeProviderCallback(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const continuationId = request.cookies.get(continuationCookie)?.value;
  if (query.has("error")) return signInRetry(request, "continuation_failed");
  if (
    !continuationId ||
    query.getAll("code").length !== 1 ||
    query.getAll("state").length !== 1
  )
    return signInRetry(request, "continuation_expired");
  try {
    return await finishSignIn(
      request,
      await platformFetch(
        "/v1/identity/web/complete",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            continuationId,
            code: query.get("code"),
            state: query.get("state"),
          }),
        },
        false,
      ),
    );
  } catch {
    return signInRetry(request, "sign_in_unavailable");
  }
}

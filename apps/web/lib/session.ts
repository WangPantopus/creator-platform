import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { SessionSchema } from "@qelvora/api";

// Cookies are shared across ports on a hostname. Isolate explicitly configured
// loopback development apps so a peer worktree cannot replace/end this session.
function developmentCookieSuffix() {
  if (process.env.NODE_ENV === "production") return "";
  const configured =
    process.env.QELVORA_PUBLIC_ORIGIN ?? process.env.WEB_ORIGIN;
  if (!configured) return "";
  const origin = new URL(configured);
  return ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
    ? `_${origin.port || (origin.protocol === "https:" ? "443" : "80")}`
    : "";
}
const cookieSuffix = developmentCookieSuffix();
export const sessionCookie = `qelvora_session${cookieSuffix}`;
export const continuationCookie = `qelvora_continuation${cookieSuffix}`;
export const continuationReturnCookie = `qelvora_auth_return${cookieSuffix}`;
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
export async function platformFetch(
  path: string,
  init: RequestInit = {},
  authenticated = true,
) {
  // Runtime configuration and identity availability must never be frozen into
  // an unavailable page when a deployable bundle is built without secrets.
  await connection();
  const base = process.env.QELVORA_API_URL;
  if (!base)
    return Response.json(
      {
        error: {
          code: "identity_unconfigured",
          message: "Pantopus sign-in is not connected yet.",
        },
      },
      { status: 503 },
    );
  const token = authenticated
    ? (await cookies()).get(sessionCookie)?.value
    : undefined;
  return fetch(new URL(path, base), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
}
export async function currentSession(returnTo?: string, resumeHandle = false) {
  let expired = false;
  try {
    const response = await platformFetch("/v1/identity/session");
    if (response.ok) return SessionSchema.parse(await response.json());
    expired = response.status === 401;
  } catch {
    return null;
  }
  // Server Components cannot set a rotated cookie. A bounded Route Handler
  // performs restoration before returning to the registered destination.
  if (expired && returnTo && (await cookies()).has(sessionCookie))
    redirect(
      `/api/auth/restore?returnTo=${encodeURIComponent(returnTo)}${resumeHandle ? "&resumeHandle=1" : ""}`,
    );
  return null;
}

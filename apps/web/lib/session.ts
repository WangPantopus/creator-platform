import { cookies } from "next/headers";
import { connection } from "next/server";
import { SessionSchema } from "@qelvora/api";

// Cookies are shared across ports on a hostname. Keep explicitly configured
// loopback worktrees from replacing or ending each other's identity sessions.
// This follows W1's published cf851a5 cookie contract.
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
  // W1's request-time boundary keeps a build without secrets from freezing
  // identity availability before the deployment's runtime configuration exists.
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
export async function currentSession() {
  try {
    const response = await platformFetch("/v1/identity/session");
    return response.ok ? SessionSchema.parse(await response.json()) : null;
  } catch {
    return null;
  }
}

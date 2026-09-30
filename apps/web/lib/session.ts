import { cookies } from "next/headers";
import { SessionSchema } from "@qelvora/api";

export const sessionCookie = "qelvora_session";
export const continuationCookie = "qelvora_continuation";
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

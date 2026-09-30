import "server-only";
import { cookies } from "next/headers";
import { sessionCookie } from "../../lib/session";

export class GrowthUnavailable extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function growthRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const origin =
    process.env.QELVORA_GROWTH_API_URL ?? process.env.QELVORA_API_URL;
  if (!origin)
    throw new GrowthUnavailable(
      503,
      "growth_unconfigured",
      "This feature is not connected yet.",
    );
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const publicRead = path.startsWith("public/");
  const jar = publicRead ? null : await cookies();
  const session = jar?.get(sessionCookie)?.value;
  if (publicRead) headers.delete("Authorization");
  if (session) headers.set("Authorization", `Bearer ${session}`);
  if (
    process.env.QELVORA_GROWTH_DEVELOPMENT === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    const actor = jar?.get("w7_development_actor")?.value;
    if (actor === "fan" || actor === "creator")
      headers.set("x-w7-development-actor", actor);
  }
  let response: Response;
  try {
    response = await fetch(new URL(`/v1/growth/${path}`, origin), {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new GrowthUnavailable(
      503,
      "growth_offline",
      "The service is unavailable. Please try again.",
    );
  }
  const body = await response.json();
  if (!response.ok)
    throw new GrowthUnavailable(
      response.status,
      body.error?.code ?? "growth_unavailable",
      body.error?.message ?? "This feature is unavailable.",
    );
  return body as T;
}
export function configuredOrigin() {
  try {
    const value = process.env.QELVORA_PUBLIC_ORIGIN;
    if (!value) return null;
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

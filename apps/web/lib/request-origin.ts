import type { NextRequest } from "next/server";

/** NextURL normalizes loopback aliases; compare the exact configured origin before that rewrite. */
export function applicationOrigin(request: NextRequest) {
  const configured =
    process.env.QELVORA_PUBLIC_ORIGIN ?? process.env.WEB_ORIGIN;
  if (!configured) return request.nextUrl.origin;
  const target = new URL(configured);
  if (
    target.pathname !== "/" ||
    target.search ||
    target.hash ||
    target.username ||
    target.password ||
    !["http:", "https:"].includes(target.protocol)
  )
    throw new Error("Configure one exact application origin.");
  if (process.env.NODE_ENV === "production" && target.protocol !== "https:")
    throw new Error("The production application origin requires HTTPS.");
  return target.origin;
}
export function sameRequestOrigin(request: NextRequest) {
  const supplied = request.headers.get("origin");
  if (!supplied) return false;
  try {
    const source = new URL(supplied);
    if (
      source.origin !== supplied ||
      !["http:", "https:"].includes(source.protocol)
    )
      return false;
    return source.origin === applicationOrigin(request);
  } catch {
    return false;
  }
}

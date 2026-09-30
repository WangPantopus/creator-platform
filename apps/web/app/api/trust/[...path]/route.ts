import { NextRequest, NextResponse } from "next/server";

const readable =
  /^(capabilities|help|status|session|cases|cases\/[0-9a-f-]{36}|my-cases|inbox|access-history|privacy\/jobs|privacy\/jobs\/[0-9a-f-]{36}(\/download)?|operations\/(metrics|audits))$/i;
const writable =
  /^(reports|blocks|feedback|cases\/[0-9a-f-]{36}\/(access|decisions|appeals|effects\/retry)|privacy\/jobs|privacy\/jobs\/[0-9a-f-]{36}\/retry|dev\/session|dev\/logout)$/i;
async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const target = path.join("/");
  if (!(request.method === "GET" ? readable : writable).test(target))
    return NextResponse.json(
      {
        error: {
          code: "not_found",
          message: "This trust endpoint is unavailable.",
        },
      },
      { status: 404 },
    );
  if (
    request.method === "POST" &&
    (request.headers.get("origin") !== request.nextUrl.origin ||
      !request.headers.get("content-type")?.startsWith("application/json"))
  )
    return NextResponse.json(
      {
        error: {
          code: "origin_denied",
          message: "Reload this page before taking this action.",
        },
      },
      { status: 403 },
    );
  const development =
    process.env.W8_LOCAL_DEVELOPMENT === "true" &&
    process.env.NODE_ENV !== "production";
  if (target.startsWith("dev/") && !development)
    return NextResponse.json(
      {
        error: { code: "not_found", message: "This endpoint is unavailable." },
      },
      { status: 404 },
    );
  if (target === "dev/logout") {
    const response = NextResponse.json({ signedOut: true });
    response.cookies.delete("w8_local_session");
    return response;
  }
  const configured = process.env.W8_API_URL;
  if (!configured)
    return NextResponse.json(
      {
        error: {
          code: "trust_unconfigured",
          message: "The trust service is not connected yet.",
        },
      },
      { status: 503 },
    );
  const base = new URL(configured);
  if (
    base.protocol !== "https:" &&
    !(
      development &&
      base.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(base.hostname)
    )
  )
    return NextResponse.json(
      {
        error: {
          code: "transport_unavailable",
          message: "The trust service needs its secure connection.",
        },
      },
      { status: 503 },
    );
  const url = new URL(`/v1/trust/${target}`, base);
  for (const key of ["queue", "cursor", "number"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) url.searchParams.set(key, value);
  }
  const token = request.cookies.get(
    development ? "w8_local_session" : "qelvora_session",
  )?.value;
  try {
    const body = request.method === "POST" ? await request.text() : undefined;
    if (body && Buffer.byteLength(body) > 65536)
      return NextResponse.json(
        {
          error: {
            code: "request_too_large",
            message: "Shorten this request.",
          },
        },
        { status: 413 },
      );
    const result = await fetch(url, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data = await result.json();
    if (target === "dev/session" && result.ok) {
      const response = NextResponse.json({ localDevelopment: true });
      response.cookies.set("w8_local_session", String(data.token), {
        httpOnly: true,
        sameSite: "strict",
        secure: false,
        path: "/",
        maxAge: 3600,
      });
      return response;
    }
    const response = NextResponse.json(data, {
      status: result.status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
    for (const header of ["x-correlation-id", "content-disposition"]) {
      const value = result.headers.get(header);
      if (value) response.headers.set(header, value);
    }
    return response;
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "trust_unavailable",
          message:
            "The trust service is unavailable. Your input is kept; retry the same action.",
        },
      },
      { status: 503 },
    );
  }
}
export const GET = forward;
export const POST = forward;

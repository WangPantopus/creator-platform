import { NextRequest, NextResponse } from "next/server";
import { sameRequestOrigin } from "../../../../lib/request-origin";
import { platformFetch, sessionCookie } from "../../../../lib/session";
import { trustLocalSessionCookie } from "../../../../lib/trust-session";

const readable =
  /^(capabilities|help|status|session|cases|cases\/[0-9a-f-]{36}|my-cases|inbox|access-history|privacy\/jobs|privacy\/jobs\/[0-9a-f-]{36}(\/download(\/(identity|conversation|agent|commerce|content|media|growth|trust))?)?|operations\/(metrics|audits))$/i;
const writable =
  /^(reports|blocks|feedback|cases\/[0-9a-f-]{36}\/(access|decisions|appeals|effects\/retry)|privacy\/jobs|privacy\/jobs\/[0-9a-f-]{36}\/retry|dev\/session|dev\/logout)$/i;

function downloadFailure(request: NextRequest, target: string, code: unknown) {
  // Keep API errors as JSON. A clicked download is a document navigation and
  // needs a recovery page; returning401 JSON there becomes a browser error.
  if (
    request.method !== "GET" ||
    request.headers.get("sec-fetch-dest") !== "document" ||
    !/^privacy\/jobs\/[0-9a-f-]{36}\/download(?:\/[^/]+)?$/iu.test(target)
  )
    return undefined;
  const reason =
    code === "fresh_verification_required"
      ? "verify"
      : code === "export_expired"
        ? "expired"
        : "unavailable";
  // Next normalizes loopback aliases. A relative Location preserves the
  // browser's exact origin and its host-bound sign-in cookies.
  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: `/support/privacy?download=${reason}`,
      "Cache-Control": "no-store",
    },
  });
}
async function endCanonicalSession(request: NextRequest) {
  if (!request.cookies.has(sessionCookie)) return;
  // Cookie removal alone leaves an issued socket token valid. Reuse W1's
  // current-token-only, idempotent logout before ending this local session.
  const result = await platformFetch("/v1/identity/logout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(request.headers.get("X-Expected-Account-Id")
        ? {
            "X-Expected-Account-Id": request.headers.get(
              "X-Expected-Account-Id",
            )!,
          }
        : {}),
      ...(request.headers.get("X-Expected-Session-Id")
        ? {
            "X-Expected-Session-Id": request.headers.get(
              "X-Expected-Session-Id",
            )!,
          }
        : {}),
      ...(request.headers.get("x-correlation-id")
        ? { "X-Correlation-Id": request.headers.get("x-correlation-id")! }
        : {}),
    },
    body: "{}",
    signal: request.signal,
  });
  const data = await result.json();
  if (!result.ok)
    return NextResponse.json(data, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  if (data.done !== true)
    throw new Error("Canonical sign-out was not confirmed.");
}
function signOutUnavailable() {
  return NextResponse.json(
    {
      error: {
        code: "signout_unavailable",
        message:
          "Sign-out could not be confirmed. Retry before changing your account.",
      },
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
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
    (!sameRequestOrigin(request) ||
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
    try {
      const refused = await endCanonicalSession(request);
      if (refused) return refused;
    } catch {
      return signOutUnavailable();
    }
    const response = NextResponse.json({ signedOut: true });
    response.cookies.delete(trustLocalSessionCookie);
    response.cookies.delete(sessionCookie);
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
  // The explicit local selector is a development-only override. Otherwise use
  // the same server-held session as the conversation that supplied the report.
  const token =
    (development
      ? request.cookies.get(trustLocalSessionCookie)?.value
      : undefined) || request.cookies.get(sessionCookie)?.value;
  const expectedAccount = request.headers.get("X-Expected-Account-Id");
  const expectedSession = request.headers.get("X-Expected-Session-Id");
  if (
    request.method === "POST" &&
    !target.startsWith("dev/") &&
    (!expectedAccount ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(expectedAccount))
  )
    return NextResponse.json(
      {
        error: {
          code: "session_account_changed",
          message: "Refresh your account before taking this action.",
        },
      },
      { status: 409 },
    );
  try {
    const streaming = /^privacy\/jobs\/[0-9a-f-]{36}\/download\/[^/]+$/iu.test(
      target,
    );
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
        ...(request.headers.get("x-correlation-id")
          ? { "X-Correlation-Id": request.headers.get("x-correlation-id")! }
          : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(expectedAccount
          ? { "X-Expected-Account-Id": expectedAccount }
          : {}),
        ...(expectedSession
          ? { "X-Expected-Session-Id": expectedSession }
          : {}),
      },
      ...(body ? { body } : {}),
      cache: "no-store",
      signal: streaming
        ? AbortSignal.any([request.signal, AbortSignal.timeout(300_000)])
        : AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });
    if (streaming && result.ok && result.body) {
      const headers = new Headers({
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      for (const name of [
        "content-type",
        "content-length",
        "content-disposition",
        "x-correlation-id",
      ]) {
        const value = result.headers.get(name);
        if (value) headers.set(name, value);
      }
      return new NextResponse(result.body, { status: result.status, headers });
    }
    const data = await result.json();
    if (!result.ok) {
      const recovery = downloadFailure(request, target, data?.error?.code);
      if (recovery) return recovery;
    }
    if (target === "dev/session" && result.ok) {
      try {
        const refused = await endCanonicalSession(request);
        if (refused) return refused;
      } catch {
        return signOutUnavailable();
      }
      const response = NextResponse.json({ localDevelopment: true });
      response.cookies.set(trustLocalSessionCookie, String(data.token), {
        httpOnly: true,
        sameSite: "strict",
        secure: false,
        path: "/",
        maxAge: 3600,
      });
      response.cookies.delete(sessionCookie);
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
    const recovery = downloadFailure(request, target, "trust_unavailable");
    if (recovery) return recovery;
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

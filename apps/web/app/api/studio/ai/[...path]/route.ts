import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { SessionSchema } from "@qelvora/api";
import { platformFetch, sessionCookie } from "../../../../../lib/session";
import { sameRequestOrigin } from "../../../../../lib/request-origin";
export const runtime = "nodejs";
const allowed =
  /^(?:state|draft|interview|status|sources(?:\/[0-9a-f-]{36})?|sponsors|license|corrections|style-card|preview|comparisons|evaluations(?:\/cancel)?|publish|pause|versions(?:\/[0-9a-f-]{36}\/rollback)?|export)$/u;
async function bridge(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const path = (await context.params).path.join("/");
  if (!allowed.test(path))
    return Response.json(
      {
        error: {
          code: "route_unavailable",
          message: "This Studio action is unavailable.",
        },
      },
      { status: 404 },
    );
  if (request.method !== "GET" && !sameRequestOrigin(request))
    return Response.json(
      {
        error: {
          code: "origin_invalid",
          message: "Open this action from Studio.",
        },
      },
      { status: 403 },
    );
  const cookieStore = await cookies();
  let token = cookieStore.get(sessionCookie)?.value;
  const isLocal = ["localhost", "127.0.0.1"].includes(
    new URL(request.url).hostname,
  );
  const development =
    process.env.NODE_ENV === "development" &&
    process.env.W2_DEVELOPMENT_MODE === "true" &&
    isLocal;
  // Loopback Studio has an explicitly selected synthetic server actor. Browser
  // cookies are shared across localhost ports and may belong to a peer runtime.
  if (development) token = process.env.W2_DEVELOPMENT_SESSION;
  if (!token)
    return Response.json(
      {
        error: {
          code: "session_required",
          message: "Continue with Pantopus to configure your AI.",
        },
      },
      { status: 401 },
    );
  let session: ReturnType<typeof SessionSchema.parse> | null = null;
  if (!development) {
    try {
      const response = await platformFetch("/v1/identity/session");
      if (response.status === 401 || response.status === 403)
        return Response.json(
          {
            error: {
              code: "session_required",
              message: "Continue with Pantopus to configure your AI.",
            },
          },
          { status: 401 },
        );
      if (!response.ok) throw new Error("Session authority unavailable");
      session = SessionSchema.parse(await response.json());
    } catch {
      return Response.json(
        {
          error: {
            code: "identity_unavailable",
            message: "Pantopus sign-in is temporarily unavailable. Try again.",
          },
        },
        { status: 503 },
      );
    }
  }
  const creatorId = development
    ? process.env.W2_CREATOR_ID
    : session?.creator?.id;
  if (!creatorId || !/^[0-9a-f-]{36}$/u.test(creatorId))
    return Response.json(
      {
        error: {
          code: "creator_required",
          message: "Finish creator identity setup before opening My AI.",
        },
      },
      { status: 403 },
    );
  const accountId = development
    ? token.replace(/^development:/u, "")
    : session?.accountId;
  const expectedActor = request.headers.get("X-Studio-Actor");
  if (
    (request.method !== "GET" || expectedActor) &&
    expectedActor !== `${accountId}:${creatorId}`
  )
    return Response.json(
      {
        error: {
          code: "studio_actor_changed",
          message:
            "Your creator session changed. Reload Studio before continuing.",
        },
      },
      { status: 409 },
    );
  const base = process.env.W2_API_URL ?? process.env.QELVORA_API_URL;
  if (!base)
    return Response.json(
      {
        error: {
          code: "ai_unconfigured",
          message:
            "Creator AI is not connected yet. Your local draft is preserved.",
        },
      },
      { status: 503 },
    );
  if (
    !["https:"].includes(new URL(base).protocol) &&
    !(
      process.env.NODE_ENV === "development" &&
      ["localhost", "127.0.0.1"].includes(new URL(base).hostname)
    )
  )
    return Response.json(
      {
        error: {
          code: "api_transport_invalid",
          message: "Studio needs a secure backend connection.",
        },
      },
      { status: 503 },
    );
  try {
    const body = request.method === "GET" ? undefined : await request.text();
    if (body && new TextEncoder().encode(body).length > 1_100_000)
      return Response.json(
        {
          error: {
            code: "source_large",
            message: "Use a text file up to 1 MB.",
          },
        },
        { status: 413 },
      );
    const query = new URL(request.url).searchParams;
    let suffix = "";
    if (query.size) {
      const before = query.get("before");
      if (
        path !== "versions" ||
        query.size !== 1 ||
        query.getAll("before").length !== 1 ||
        !before ||
        !/^[1-9][0-9]{0,8}$/u.test(before)
      )
        return Response.json(
          {
            error: {
              code: "invalid_query",
              message: "Choose a valid version history page.",
            },
          },
          { status: 400 },
        );
      suffix = `?before=${before}`;
    }
    const response = await fetch(
      `${base}/v1/agent/${creatorId}/${path}${suffix}`,
      {
        method: request.method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(request.headers.get("Idempotency-Key")
            ? { "Idempotency-Key": request.headers.get("Idempotency-Key")! }
            : {}),
        },
        ...(body ? { body } : {}),
        cache: "no-store",
        signal: AbortSignal.any([
          request.signal,
          AbortSignal.timeout(
            path === "export"
              ? 300_000
              : path === "preview" || path === "style-card"
                ? 120_000
                : 15_000,
          ),
        ]),
        redirect: "error",
      },
    );
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...(path === "export"
          ? {
              "Content-Disposition":
                "attachment; filename=creator-ai-export.json",
            }
          : {}),
      },
    });
  } catch {
    return Response.json(
      {
        error: {
          code: "ai_unavailable",
          message:
            "Your AI service is unavailable. Your draft input is preserved; try again.",
        },
      },
      { status: 503 },
    );
  }
}
export const GET = bridge;
export const POST = bridge;
export const PUT = bridge;

import { cookies } from "next/headers";
import { currentSession, sessionCookie } from "../../../../../lib/session";
export const runtime = "nodejs";
const allowed =
  /^(?:state|draft|interview|status|sources(?:\/[0-9a-f-]{36})?|sponsors|license|corrections|style-card|preview|comparisons|evaluations(?:\/cancel)?|publish|pause|versions\/[0-9a-f-]{36}\/rollback|export)$/u;
async function bridge(
  request: Request,
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
  const origin = `${new URL(request.url).protocol}//${request.headers.get("host") ?? new URL(request.url).host}`;
  if (request.method !== "GET" && request.headers.get("origin") !== origin)
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
  if (!token && development) token = process.env.W2_DEVELOPMENT_SESSION;
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
  const session = development ? null : await currentSession();
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
    const response = await fetch(`${base}/v1/agent/${creatorId}/${path}`, {
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
          path === "preview" || path === "style-card" ? 120_000 : 15_000,
        ),
      ]),
      redirect: "error",
    });
    return new Response(await response.text(), {
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

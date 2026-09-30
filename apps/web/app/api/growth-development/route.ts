import { NextRequest, NextResponse } from "next/server";
export async function POST(request: NextRequest) {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.QELVORA_GROWTH_DEVELOPMENT !== "true" ||
    !["localhost", "127.0.0.1"].includes(request.nextUrl.hostname)
  )
    return new Response("Not found", { status: 404 });
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return new Response("Forbidden", { status: 403 });
  const body = await request.json();
  if (body.action === "actor") {
    if (!["fan", "creator", "signed_out"].includes(body.actor))
      return new Response("Invalid actor", { status: 400 });
    const response = NextResponse.json({ saved: true });
    if (body.actor === "signed_out")
      response.cookies.delete("w7_development_actor");
    else
      response.cookies.set("w7_development_actor", body.actor, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: 3600,
      });
    return response;
  }
  const actions: Record<string, string> = {
    publish: "publish",
    post: "post",
    insight: "insight",
    "close-insights": "close-insights",
  };
  const target = actions[String(body.action)];
  if (!target) return new Response("Not found", { status: 404 });
  const response = await fetch(
    new URL(`/development/${target}`, process.env.QELVORA_GROWTH_API_URL),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body.input ?? {}),
      signal: AbortSignal.timeout(5000),
    },
  );
  return new Response(await response.text(), {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}

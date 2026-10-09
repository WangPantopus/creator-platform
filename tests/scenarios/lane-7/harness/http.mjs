// A small HTTP layer for the lane 7 fake API: routes, JSON bodies, the real
// API's error shape, a request log and fault injection. No dependencies.
import { randomUUID } from "node:crypto";

export class Failure extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const compile = (pattern) =>
  new RegExp(
    "^" + pattern.replace(/:(\w+)/gu, (_, name) => `(?<${name}>[^/]+)`) + "/?$",
    "u",
  );

export class Router {
  routes = [];
  add(method, pattern, handler) {
    this.routes.push({ method, pattern: compile(pattern), handler });
  }
  find(method, path) {
    for (const route of this.routes) {
      const match = route.pattern.exec(path);
      if (match && route.method === method)
        return { handler: route.handler, params: { ...match.groups } };
    }
    return null;
  }
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000)
      throw new Failure(413, "body_too_large", "Too large.");
    chunks.push(chunk);
  }
  if (!size) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Failure(400, "invalid_json", "The request body is not JSON.");
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Faults are set through the control API: { match, method?, status?,
 * delayMs?, drop?, remaining? }. `drop` destroys the socket, as a dead
 * network does; `remaining` counts requests that still receive the fault. */
function applyFault(world, req, path) {
  for (const fault of world.faults) {
    if (fault.remaining === 0) continue;
    if (fault.method && fault.method !== req.method) continue;
    if (!new RegExp(fault.match, "u").test(path)) continue;
    if (fault.remaining > 0) fault.remaining -= 1;
    return fault;
  }
  return null;
}

export function createHandler(world, router) {
  return async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url, "http://harness.invalid");
    const requestId = randomUUID();
    const entry = {
      n: ++world.requestCount,
      at: new Date().toISOString(),
      method: req.method,
      path: url.pathname,
      status: 0,
      ms: 0,
      account: null,
    };
    world.log.push(entry);
    if (world.log.length > 5000) world.log.shift();
    const finish = (status, body) => {
      entry.status = status;
      entry.ms = Date.now() - started;
      if (res.destroyed) return;
      const text = body === undefined ? "" : JSON.stringify(body);
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
      });
      res.end(text);
    };
    try {
      const control = url.pathname.startsWith("/__harness/");
      const fault = control ? null : applyFault(world, req, url.pathname);
      if (fault?.delayMs) await sleep(fault.delayMs);
      if (fault?.drop) {
        entry.status = -1;
        entry.ms = Date.now() - started;
        req.socket.destroy();
        return;
      }
      if (fault?.status)
        throw new Failure(
          fault.status,
          fault.code ?? "harness_fault",
          fault.message ?? "The harness injected this failure.",
        );
      const found = router.find(req.method, url.pathname);
      if (!found)
        throw new Failure(
          404,
          "harness_not_served",
          // The real API's words; the code and the log say the harness is the one that does not serve it.
          "This endpoint is unavailable.",
        );
      const ctx = {
        world,
        req,
        res,
        url,
        params: found.params,
        query: Object.fromEntries(url.searchParams),
        body: ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
          ? await readBody(req)
          : undefined,
        entry,
      };
      const result = await found.handler(ctx);
      if (result?.status !== undefined && "json" in result)
        finish(result.status, result.json);
      else finish(200, result);
    } catch (error) {
      if (error instanceof Failure)
        finish(error.status, {
          error: { code: error.code, message: error.message, requestId },
        });
      else {
        console.error(error);
        finish(500, {
          error: { code: "harness_error", message: String(error), requestId },
        });
      }
    }
  };
}

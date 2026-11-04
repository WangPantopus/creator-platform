// Lane 7 fake API. Run: node tests/scenarios/lane-7/harness/server.mjs [--port 56473] [--keep-alive]
// Stands in for the Qelvora API so the phone apps can run signed in on a
// simulator or an emulator without the full stack. It binds to loopback only.
// --keep-alive drops the `Connection: close` on every answer: sockets then stay
// open and close after 5 s idle, as the real API's do, so a check can see an app
// that sends a request on a socket the server has already closed.
import http from "node:http";
import { Router, clientOf, createHandler } from "./http.mjs";
import { createWorld } from "./world.mjs";
import { accept } from "./ws.mjs";
import * as commerce from "./routes/commerce.mjs";
import * as content from "./routes/content.mjs";
import * as control from "./routes/control.mjs";
import * as conversation from "./routes/conversation.mjs";
import * as growth from "./routes/growth.mjs";
import * as identity from "./routes/identity.mjs";
import * as trust from "./routes/trust.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const port = Number(flag("--port", "56473"));
const keepAlive = args.includes("--keep-alive");

export const world = createWorld();
const router = new Router();
for (const routes of [
  identity,
  growth,
  conversation,
  content,
  commerce,
  trust,
  control,
])
  routes.register(router);

const server = http.createServer(createHandler(world, router, { keepAlive }));
// The real API's idle close (local-server.ts, production.ts).
server.keepAliveTimeout = 5000;

// The live thread connection: the app subscribes with a cursor, the server
// replays every frame after it, then pushes new ones (the real gateway does
// the same, with close code 1008 for a refused subscription). Like the
// gateway, it re-checks the session every 2 s while the socket is open.
server.on("upgrade", (req, socket) => {
  const entry = {
    n: ++world.requestCount,
    at: new Date().toISOString(),
    method: "WS",
    path: "/v1/realtime",
    status: 101,
    ms: 0,
    account: null,
    client: clientOf(req),
  };
  world.log.push(entry);
  let auth;
  try {
    if (new URL(req.url, "http://x").pathname !== "/v1/realtime")
      throw Object.assign(new Error("x"), { status: 404 });
    auth = identity.authenticate({ world, req, entry });
  } catch (error) {
    entry.status = error.status ?? 401;
    socket.end(
      `HTTP/1.1 ${entry.status} Refused\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`,
    );
    return;
  }
  const connection = accept(req, socket);
  if (!connection) return;
  world.sockets.add(connection);
  const subscriptions = new Map();
  // gateway.ts (drain): a refusal closes the socket with 1008, and D-11 with
  // 4403. Only a refusal is logged: the check is the server's, not the app's.
  const recheck = setInterval(() => {
    const check = { ...entry, at: new Date().toISOString(), account: null };
    try {
      identity.authenticate({ world, req, entry: check });
    } catch (error) {
      clearInterval(recheck);
      world.log.push({
        ...check,
        n: ++world.requestCount,
        status: error.status ?? 401,
      });
      if (error.code === "adult_eligibility_required")
        connection.close(4403, "adult_eligibility_required");
      else connection.close(1008, "Conversation unavailable");
    }
  }, 2000);
  recheck.unref();
  connection.onMessage = (text) => {
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return connection.close(1008, "Subscription refused");
    }
    const thread = world.threads.get(`${message?.creatorId}/${message?.fanId}`);
    if (
      message?.kind !== "subscribe" ||
      !Number.isInteger(message.cursor) ||
      !thread ||
      thread.fanAccountId !== auth.account.id
    )
      return connection.close(1008, "Subscription refused");
    if (!subscriptions.has(thread.id) && subscriptions.size >= 64)
      return connection.close(1008, "Subscription limit");
    // Resuming the same thread replaces its listener. Otherwise the Map drops
    // the old cleanup callback while the thread retains a duplicate listener.
    subscriptions.get(thread.id)?.();
    for (const frame of thread.frames)
      if (frame.cursor > message.cursor) connection.send(JSON.stringify(frame));
    const listener = (frame) => connection.send(JSON.stringify(frame));
    thread.listeners.add(listener);
    subscriptions.set(thread.id, () => thread.listeners.delete(listener));
  };
  connection.onClose = () => {
    clearInterval(recheck);
    for (const stop of subscriptions.values()) stop();
    world.sockets.delete(connection);
  };
});

server.listen(port, "127.0.0.1", () =>
  console.log(
    `lane 7 harness listening on http://127.0.0.1:${port}${keepAlive ? " (keep-alive)" : ""}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const connection of world.sockets)
      connection.close(1001, "Harness stopping");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  });

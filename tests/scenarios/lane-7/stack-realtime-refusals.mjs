// D-11 at the realtime gateway, on lane 7's disposable real API (`stack up`),
// with no device. A session flagged under 18 between a connection's upgrade
// and its subscribe is refused by the subscribe with 4403
// "adult_eligibility_required" (gateway.ts), before the first 2-second check
// runs; one flagged while subscribed is refused by that check, the same way.
// Any other refused subscribe still closes 1008, and a current one stays open.
// The flag is the backend's own refusal (stack-flag.mjs).
//   LANE7_STACK_API=http://127.0.0.1:57501 LANE7_STACK_POSTGRES=qelvora-laned11-postgres \
//     node tests/scenarios/lane-7/stack-realtime-refusals.mjs
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import * as L from "./lib.mjs";
import { stackFlag } from "./stack-flag.mjs";

const { WebSocket } = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
)("ws");
const api = process.env.LANE7_STACK_API ?? "http://127.0.0.1:56471";
const flag = stackFlag(
  process.env.LANE7_STACK_POSTGRES ?? "qelvora-lane7-postgres",
);
const MAYA = "20000000-0000-4000-8000-000000000001";
const FAN_ONE = "10000000-0000-4000-8000-000000000001";

async function call(method, path, body, token) {
  const response = await fetch(api + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, json: await response.json() };
}
/** A new session of fan one, through the development identity. */
async function signIn() {
  const begun = await call("POST", "/v1/identity/continue", {
    returnTo: "/home",
  });
  const done = await call("POST", "/v1/identity/complete", {
    continuationId: begun.json.continuationId,
    code: FAN_ONE,
  });
  return { token: done.json.token, fan: done.json.session.fan.id };
}
/** Opens the live connection and runs `then` once it is open. Resolves with
 * the server's close (code, reason, ms after opening), or null when the
 * connection is still open after `ms`. */
function connection(token, then, ms = 4000) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${api.replace(/^http/u, "ws")}/v1/realtime`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let opened = 0;
    const timer = setTimeout(() => {
      resolve(null);
      socket.close(1000);
    }, ms);
    socket.on("open", () => {
      opened = Date.now();
      then(socket);
    });
    socket.on("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString(), at: Date.now() - opened });
    });
    socket.on("error", reject);
  });
}
const subscribe = (socket, fanId) =>
  socket.send(
    JSON.stringify({ kind: "subscribe", creatorId: MAYA, fanId, cursor: 0 }),
  );
const shown = (closed) =>
  closed
    ? `${closed.code} "${closed.reason}" after ${closed.at} ms`
    : "still open";

{
  const { token, fan } = await signIn();
  const closed = await connection(token, (socket) => subscribe(socket, fan));
  L.step(
    "api",
    "a current subscribe stays open",
    closed === null,
    shown(closed),
  );
}
{
  const { token } = await signIn();
  const closed = await connection(token, (socket) =>
    subscribe(socket, randomUUID()),
  );
  L.step(
    "api",
    'another refused subscribe still closes 1008 "Subscription refused"',
    closed?.code === 1008 && closed.reason === "Subscription refused",
    shown(closed),
  );
}
{
  const { token, fan } = await signIn();
  let flagged = 0;
  const closed = await connection(token, (socket) => {
    flagged = flag(FAN_ONE);
    subscribe(socket, fan);
  });
  // The first 2-second check runs 2000 ms after the upgrade.
  L.step(
    "api",
    "flagged between upgrade and subscribe: the subscribe closes 4403",
    closed?.code === 4403 &&
      closed.reason === "adult_eligibility_required" &&
      closed.at < 1900,
    `${shown(closed)}; ${flagged} session(s) flagged`,
  );
  const after = await call("GET", "/v1/identity/session", undefined, token);
  L.step(
    "api",
    "and the session is ended",
    after.status === 401,
    `${after.status} ${after.json?.error?.code}`,
  );
}
{
  const { token, fan } = await signIn();
  let flagged = 0;
  const closed = await connection(
    token,
    (socket) => {
      subscribe(socket, fan);
      setTimeout(() => {
        flagged = flag(FAN_ONE);
      }, 300);
    },
    5000,
  );
  L.step(
    "api",
    "flagged while subscribed: the 2-second check closes 4403",
    closed?.code === 4403 && closed.reason === "adult_eligibility_required",
    `${shown(closed)}; ${flagged} session(s) flagged`,
  );
}
L.finish();

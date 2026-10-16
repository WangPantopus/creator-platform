// Run with both apps stopped. Exercises the running fake API's actual HTTP/WS
// entry points, including a process-like disconnect without a WebSocket close.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { once } from "node:events";
import * as L from "./lib.mjs";

const requireBackend = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
);
const WebSocket = requireBackend("ws");
const outcomes = [];
for (const scenario of ["close", "repeat-subscribe", "process-stop"]) {
  await L.harness("POST", "/__harness/reset");
  const caps = await L.harness("GET", "/v1/identity/capabilities");
  const actor = caps.developmentActors.find((value) =>
    value.label.includes("Devon"),
  );
  const begun = await L.harness("POST", "/v1/identity/continue", {
    returnTo: "/home",
  });
  const identity = await L.harness("POST", "/v1/identity/complete", {
    continuationId: begun.continuationId,
    code: actor.id,
  });
  const socket = new WebSocket("ws://127.0.0.1:56473/v1/realtime", {
    headers: { Authorization: `Bearer ${identity.token}` },
  });
  await once(socket, "open");
  const subscription = JSON.stringify({
    kind: "subscribe",
    creatorId: "c1000000-0000-4000-8000-000000000001",
    fanId: identity.session.fan.id,
    cursor: 0,
  });
  socket.send(subscription);
  if (scenario === "repeat-subscribe") socket.send(subscription);
  await L.sleep(150);
  const before = (await L.state()).threads.find(
    (thread) => thread.creator === "maya" && thread.account === "devon",
  ).listeners;
  const closed = once(socket, "close");
  if (scenario === "process-stop") socket.terminate();
  else socket.close();
  await closed;
  await L.sleep(500);
  const after = (await L.state()).threads.find(
    (thread) => thread.creator === "maya" && thread.account === "devon",
  ).listeners;
  const result = { scenario, before, after, pass: before === 1 && after === 0 };
  outcomes.push(result);
  console.log(JSON.stringify(result));
}
// No authentication response, token or header is included in the report.
assert.ok(
  outcomes.every((result) => result.pass),
  "Each live connection has one subscription and leaves none after exit",
);

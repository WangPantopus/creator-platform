// node tests/scenarios/lane-2/e2-8-sockets.mjs [--connections 8] [--seconds 1800]
// Two real fan sessions: unexpected drops fail; planned token rotations are logged.
import {
  api,
  call,
  preflight,
  fan,
  observer,
  numberOption,
  check,
  emit,
  sleep,
  dbCounts,
} from "./load-support.mjs";
import {
  socketFor,
  closeSockets,
  socketCounts,
  opened,
  renewSockets,
  memoryTrend,
} from "./load-sockets.mjs";

await preflight();
const target = numberOption("--connections", 8, 500);
const seconds = numberOption("--seconds", 1800, 3600);
const refreshSeconds = numberOption("--refresh-seconds", 600, 600);
const fans = [await fan(1), await fan(2)];
for (const person of fans)
  person.threadId = (
    await call(api, "GET", person.path, { token: person.token })
  ).json?.threadId;
if (fans.some((person) => !person.threadId))
  throw new Error("Thread snapshot unavailable");
const metrics = await observer();
const before = await metrics(),
  databaseBefore = dbCounts();
const denied = [
  socketFor(null),
  socketFor(fans[0], { origin: "https://invalid.example" }),
  socketFor(fans[1], { fanId: fans[0].id }),
];
await sleep(5000);
check(
  "signed-out and wrong-origin upgrades refused",
  denied.slice(0, 2).every((r) => r.upgradeStatus === 401),
  { statuses: denied.slice(0, 2).map((r) => r.upgradeStatus) },
);
check(
  "wrong fan subscription refused without frames",
  denied[2].closeCode === 1008 && denied[2].frames === 0,
  { closeCode: denied[2].closeCode, frames: denied[2].frames },
);
await closeSockets(denied);
const records = [],
  samples = [];
let interrupted = false;
const stop = () => {
  interrupted = true;
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  for (let i = 0; i < target; i++) {
    records.push(socketFor(fans[i % 2]));
    await sleep(250);
  }
  await opened(records);
  let currentRecords = [...records];
  const start = Date.now();
  let refreshedAt = start;
  while (Date.now() - start < seconds * 1000 && !interrupted) {
    await sleep(
      Math.min(10000, Math.max(1, seconds * 1000 - (Date.now() - start))),
    );
    const current = await metrics();
    const counts = socketCounts(records);
    const sample = {
      elapsedSeconds: Math.round((Date.now() - start) / 1000),
      rss: current.memoryBytes.rss,
      heapUsed: current.memoryBytes.heapUsed,
      ...counts,
      active: current.signals.realtime_connections_active ?? 0,
      subscriptions: current.signals.realtime_subscriptions_active ?? 0,
    };
    samples.push(sample);
    emit("socket_sample", sample);
    if (counts.live !== target || Object.keys(counts.closes).length) {
      emit("soak_stopped", {
        reason:
          "unexpected socket loss; the requested population did not survive",
      });
      break;
    }
    if (
      Date.now() - refreshedAt >= refreshSeconds * 1000 &&
      Date.now() - start < seconds * 1000
    ) {
      currentRecords = await renewSockets(currentRecords, fans);
      records.push(...currentRecords);
      refreshedAt = Date.now();
    }
  }
  const counts = socketCounts(records);
  const completed =
    !interrupted &&
    Date.now() - start >= seconds * 1000 &&
    counts.live === target &&
    Object.keys(counts.closes).length === 0;
  check(
    "requested socket population survived with only planned renewals",
    completed,
    { target, requestedSeconds: seconds, ...counts },
  );
  check("frames stayed scoped and ordered", counts.badFrames === 0, {
    badFrames: counts.badFrames,
    frames: counts.frames,
  });
  check(
    "every connection received an authorized replay",
    records.slice(0, target).every((r) => r.frames > 0),
    {
      withFrames: records.slice(0, target).filter((r) => r.frames > 0).length,
      target,
    },
  );
  const subscribed = samples.every(
    (s) => s.subscriptions === target && s.active === target,
  );
  check("server observed all authorized subscriptions", subscribed, {
    samples: samples.length,
  });
  memoryTrend(samples, completed && subscribed && seconds >= 1800);
} finally {
  await closeSockets(records);
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
}
await sleep(5000);
const after = await metrics(),
  databaseAfter = dbCounts();
check(
  "socket counters return to baseline",
  after.signals.realtime_connections_active ===
    (before.signals.realtime_connections_active ?? 0) &&
    after.signals.realtime_subscriptions_active ===
      (before.signals.realtime_subscriptions_active ?? 0),
  {
    active: after.signals.realtime_connections_active,
    subscriptions: after.signals.realtime_subscriptions_active,
  },
);
check(
  // Background generation may append terminal events; it must not duplicate the accepted work.
  "no extra messages, jobs or duplicate sequences during socket reads",
  ["messages", "generations", "duplicateSequences"].every(
    (field) => databaseBefore[field] === databaseAfter[field],
  ),
  { before: databaseBefore, after: databaseAfter },
);
check(
  "backend recovers after socket load",
  (await call(api, "GET", "/health/live")).status === 200,
);

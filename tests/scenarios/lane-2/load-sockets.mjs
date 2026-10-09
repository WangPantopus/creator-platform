import {
  WebSocket,
  MAYA_CREATOR_ID,
  sleep,
  refreshSession,
  emit,
  check,
  quantile,
} from "./load-support.mjs";

// Record protocol outcomes without writing session tokens, frames or fan text.
export function socketFor(person, options = {}) {
  const record = {
    socket: null,
    opened: false,
    frames: 0,
    badFrames: 0,
    cursor: options.cursor ?? 0,
    closeCode: null,
    upgradeStatus: null,
  };
  const socket = new WebSocket("ws://127.0.0.1:56421/v1/realtime", {
    headers: {
      ...(person?.token ? { Authorization: `Bearer ${person.token}` } : {}),
      Origin: options.origin ?? "http://localhost:56422",
    },
    handshakeTimeout: 10000,
  });
  record.socket = socket;
  socket.on("open", () => {
    record.opened = true;
    socket.send(
      JSON.stringify({
        kind: "subscribe",
        creatorId: MAYA_CREATOR_ID,
        fanId: options.fanId ?? person?.id,
        cursor: options.cursor ?? 0,
      }),
    );
  });
  socket.on("message", (raw) => {
    record.frames++;
    try {
      const frame = JSON.parse(raw.toString());
      if (
        !Number.isInteger(frame.cursor) ||
        frame.cursor <= record.cursor ||
        frame.threadId !== person?.threadId
      )
        record.badFrames++;
      record.cursor = frame.cursor;
    } catch {
      record.badFrames++;
    }
  });
  socket.on("close", (code) => {
    record.closeCode = code;
  });
  socket.on("unexpected-response", (_request, response) => {
    record.upgradeStatus = response.statusCode;
    response.resume();
    socket.terminate();
  });
  socket.on("error", () => {});
  return record;
}
export async function closeSockets(records) {
  for (const r of records)
    if (r.socket.readyState === WebSocket.OPEN) r.socket.close();
  await sleep(500);
  for (const r of records)
    if (r.socket.readyState !== WebSocket.CLOSED) r.socket.terminate();
}
export const socketCounts = (records) => ({
  opened: records.filter((r) => r.opened).length,
  live: records.filter((r) => r.socket.readyState === WebSocket.OPEN).length,
  frames: records.reduce((sum, r) => sum + r.frames, 0),
  badFrames: records.reduce((sum, r) => sum + r.badFrames, 0),
  closes: records.reduce((counts, r) => {
    if (r.closeCode !== null && !r.planned)
      counts[r.closeCode] = (counts[r.closeCode] ?? 0) + 1;
    return counts;
  }, {}),
});

export async function opened(records) {
  const deadline = Date.now() + 10000;
  while (
    records.some((r) => !r.opened && r.closeCode === null) &&
    Date.now() < deadline
  )
    await sleep(100);
}
export async function renewSockets(current, fans) {
  const started = Date.now();
  // Only an already healthy population may rotate; earlier drops keep their failure status.
  if (current.some((r) => r.socket.readyState !== WebSocket.OPEN))
    throw new Error("Unexpected loss before planned renewal");
  for (const r of current) r.planned = true;
  await closeSockets(current);
  for (const person of fans) await refreshSession(person);
  const next = current.map((prior, i) =>
    socketFor(fans[i % fans.length], { cursor: prior.cursor }),
  );
  await opened(next);
  emit("planned_session_renewal", {
    connections: next.length,
    gapMs: Date.now() - started,
    ...socketCounts(next),
  });
  return next;
}

export function memoryTrend(samples, qualified) {
  const stable = samples.filter((s) => s.elapsedSeconds >= 60);
  const third = Math.floor(stable.length / 3);
  if (!qualified || third < 3) {
    emit("NOT_RUN", {
      name: "30-minute memory trend",
      reason: "completed duration or surviving population insufficient",
    });
    return;
  }
  // Lower heap samples after warmup reduce ordinary GC noise; RSS is reported separately.
  const first = quantile(
    stable.slice(0, third).map((s) => s.heapUsed),
    0.2,
  );
  const last = quantile(
    stable.slice(-third).map((s) => s.heapUsed),
    0.2,
  );
  check(
    "heap growth stayed within 16 MiB diagnostic allowance",
    last - first <= 16 * 1024 * 1024,
    {
      first,
      last,
      growthBytes: last - first,
      limitation: "measurement heuristic, not a launch bar or proof of no leak",
    },
  );
}

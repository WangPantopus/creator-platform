// node tests/scenarios/lane-2/e2-8-public.mjs [--seconds 15] [--max-readers 16]
// Public API reads on the real --growth stack; bounded ramp stops on 5xx/timeouts.
import {
  preflight,
  numberOption,
  timed,
  check,
  emit,
  quantile,
  dbCounts,
  sleep,
} from "./load-support.mjs";

await preflight();
const seconds = numberOption("--seconds", 15, 120);
const maximum = numberOption("--max-readers", 16, 100);
const path = "/v1/growth/public/creators/maya";
const baseline = await timed(path);
if (
  !check(
    "published public creator baseline",
    baseline.status === 200 && baseline.json?.creator?.id,
    { status: baseline.status, ms: baseline.ms },
  )
)
  process.exit(1);
const before = dbCounts();
const missing = await timed("/v1/growth/public/creators/lane2missing");
check("missing creator is 404", missing.status === 404, {
  status: missing.status,
});
for (const readers of [...new Set([1, 4, 8, 16, maximum])]
  .sort((a, b) => a - b)
  .filter((n) => n <= maximum)) {
  const end = performance.now() + seconds * 1000;
  const durations = [],
    statuses = {},
    errors = {};
  let wrongCreator = 0;
  await Promise.all(
    Array.from({ length: readers }, async () => {
      while (performance.now() < end) {
        const response = await timed(path, { timeoutMs: 10000 });
        statuses[response.status] = (statuses[response.status] ?? 0) + 1;
        durations.push(response.ms);
        const code = response.json?.error?.code;
        if (code) errors[code] = (errors[code] ?? 0) + 1;
        if (
          response.status === 200 &&
          response.json?.creator?.id !== baseline.json.creator.id
        )
          wrongCreator++;
      }
    }),
  );
  const failed = Object.keys(statuses).some(
    (status) => !["200", "429"].includes(status),
  );
  check("public load returns data or 429", !failed && wrongCreator === 0, {
    readers,
    seconds,
    requests: durations.length,
    statuses,
    errors,
    wrongCreator,
    p50Ms: quantile(durations, 0.5),
    p95Ms: quantile(durations, 0.95),
    p99Ms: quantile(durations, 0.99),
  });
  if (failed) {
    emit("ramp_stopped", {
      reason: "5xx, timeout or unexpected status; protect the shared machine",
    });
    break;
  }
  await sleep(3000);
}
await sleep(5000);
const recovery = await timed(path);
check("public read recovers after load", recovery.status === 200, {
  status: recovery.status,
  ms: recovery.ms,
});
const after = dbCounts();
check(
  "public reads did not create messages, jobs or events",
  JSON.stringify(before) === JSON.stringify(after),
  { before, after },
);

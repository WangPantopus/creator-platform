// How many requests does each app send while a thread sits open? The number
// work package 7.8 (polling) must bring down. Informational: it reports, it
// does not pass or fail.
//   node tests/scenarios/lane-7/baseline-requests.mjs [ios|android] [seconds]
import * as L from "./lib.mjs";

const seconds = Number(process.argv[3] ?? 60);
const THREAD =
  "/threads/c1000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001";
const stopHarness = await L.ensureHarness();

for (const p of L.platforms(process.argv[2])) {
  L.stop(p);
  await L.harness("POST", "/__harness/reset");
  L.launch(p, "--reset", "--actor", "devon", "--to", THREAD);
  await L.waitForText(p, /Maya/u);
  await L.sleep(10000);
  const since = (await L.log()).at(-1)?.n ?? 0;
  await L.sleep(seconds * 1000);
  const stats = await L.harness(
    "GET",
    `/__harness/stats?seconds=${seconds}&client=${p}`,
  );
  const entries = await L.log(since, p);
  console.log(
    `${p}: ${stats.total} requests in ${seconds} s = ${stats.perMinute} a minute, thread open and idle`,
  );
  for (const [route, count] of Object.entries(stats.routes).sort(
    (a, b) => b[1] - a[1],
  ))
    console.log(`   ${String(count).padStart(4)}  ${route}`);
  console.log(
    `   live connections opened: ${entries.filter((e) => e.method === "WS").length}`,
  );
}
stopHarness();

// The "under-18 latency" follow-up of WP 7.8: how long after an account is
// flagged under 18 the app shows the adults-only state, on Home (only the
// 30-second session check meets the flag there) and in an open thread (its
// other reads meet it too). It measures and has no target: the founder decides.
// The fake API ends the session at the account's next authenticated request.
//   node tests/scenarios/lane-7/e7-8-under-18-latency.mjs [ios|android] [runs]
import * as L from "./lib.mjs";

const THREAD =
  "/threads/c1000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001";
const TITLE = /This app is for adults/u;
const args = process.argv.slice(2);
const platformArg = ["ios", "android"].includes(args[0])
  ? args.shift()
  : undefined;
const runs = Number(args[0] ?? 3);
const mark = async () => (await L.log()).at(-1)?.n ?? 0;
const stopHarness = await L.ensureHarness();

for (const p of L.platforms(platformArg)) {
  for (const [where, to, ready] of [
    ["on Home", "/home", /Your people/u],
    ["in a thread", THREAD, /Pinholes in celadon/u],
  ]) {
    const results = [];
    for (let i = 0; i < runs; i += 1) {
      L.stop(p);
      await L.harness("POST", "/__harness/reset");
      L.launch(p, "--reset", "--actor", "devon", "--to", to);
      await L.waitForText(p, ready, 30000);
      // Each run flags the account at a different moment of the 30 s cycle.
      await L.sleep(3000 + Math.round((i * 30000) / runs));
      const since = await mark();
      const from = Date.now();
      await L.harness("POST", "/__harness/accounts/devon", { adult: false });
      const shown = await L.waitForText(p, TITLE, 45000);
      const screen = (Date.now() - from) / 1000;
      const refused = (await L.log(since, p)).find((e) => e.status === 403);
      const server = refused ? (Date.parse(refused.at) - from) / 1000 : null;
      results.push({ shown: shown.ok, screen, server, path: refused?.path });
    }
    const shownAll = results.every((r) => r.shown);
    L.step(
      p,
      `under-18 ${where}: shown after ${results.map((r) => (r.shown ? `${r.screen.toFixed(1)} s` : "never")).join(", ")}`,
      shownAll,
      `first refused request after ${results.map((r) => (r.server === null ? "none" : `${r.server.toFixed(1)} s (${L.shape(r.path)})`)).join(", ")}`,
    );
  }
  L.stop(p);
}
stopHarness();
L.finish();

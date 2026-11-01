// WP 7.8 on both apps: a thread that sits open asks little of the server, an
// answer is painted from its frames (C5) instead of a page fetch per sentence,
// offline is said honestly and catches up once, and the background sends nothing.
//   node tests/scenarios/lane-7/e7-8-polling.mjs [ios|android] [P1 P2 P3 P4]
import * as L from "./lib.mjs";

const MAYA = "c1000000-0000-4000-8000-000000000001";
const THREAD = `/threads/${MAYA}/f1000000-0000-4000-8000-000000000001`;
const PAGE = new RegExp(
  `^/v1/conversations/${MAYA}/f1000000-0000-4000-8000-000000000001$`,
  "u",
);
const IDLE_LIMIT = Number(process.env.LANE7_IDLE_LIMIT ?? 12); // a minute, thread open and idle
const args = process.argv.slice(2);
const platformArg = ["ios", "android"].includes(args[0])
  ? args.shift()
  : undefined;
const run = (id) => !args.length || args.includes(id);
const mark = async () => (await L.log()).at(-1)?.n ?? 0;
const flat = (text) => text.replaceAll(/\s*\n\s*/gu, " ");
const between = (entries, from, to) =>
  entries.filter((e) => Date.parse(e.at) > from && Date.parse(e.at) < to);
const generating = async () =>
  (await L.state()).threads.find(
    (t) => t.creator === "maya" && t.account === "devon",
  )?.generating;
const stopHarness = await L.ensureHarness();

for (const p of L.platforms(platformArg)) {
  L.stop(p);
  await L.harness("POST", "/__harness/reset");
  await L.harness("POST", "/__harness/faults", { rules: [] });
  L.launch(p, "--reset", "--actor", "devon", "--to", THREAD);
  await L.waitForText(p, /Pinholes in celadon/u, 30000);
  await L.sleep(10000);

  if (run("P1")) {
    const since = await mark();
    await L.sleep(60000);
    const entries = await L.log(since, p);
    const routes = {};
    for (const e of entries)
      routes[`${e.method} ${L.shape(e.path)}`] =
        (routes[`${e.method} ${L.shape(e.path)}`] ?? 0) + 1;
    L.step(
      p,
      `P1 thread open and idle: ${entries.length} requests in 60 s (at most ${IDLE_LIMIT})`,
      entries.length <= IDLE_LIMIT,
      Object.entries(routes)
        .sort((a, b) => b[1] - a[1])
        .map(([r, n]) => `${n} ${r}`)
        .join("; "),
    );
  }

  if (run("P2")) {
    // The fan's other device asks; the answer streams into this open thread.
    await L.harness("POST", "/__harness/flags", {
      replyDelayMs: 300,
      sentenceDelayMs: 2500,
    });
    const since = await mark();
    await L.harness("POST", "/__harness/threads/maya/ask", {
      text: "What cone do you fire to?",
    });
    let started = false;
    for (let i = 0; i < 80; i += 1) {
      const now = await generating();
      if (now) started = true;
      if (started && !now) break;
      await L.sleep(250);
    }
    const middle = await L.waitForText(p, /from here\. Your clay body/u, 15000);
    await L.sleep(3000);
    const pages = L.seen(await L.log(since, p), {
      method: "GET",
      path: PAGE,
    }).length;
    L.step(
      p,
      `P2 an answer of 3 sentences: ${pages} page fetches (at most 2: the asking message and the answer's end)`,
      pages <= 2,
    );
    L.step(
      p,
      "P2 the sentences read as the server wrote them",
      middle.ok &&
        (flat(middle.text).match(/That depends on a few things/gu) ?? [])
          .length === 1,
    );
  }

  if (run("P3")) {
    // Offline: every request is dropped and the live connection ends.
    await L.harness("POST", "/__harness/faults", {
      rules: [{ match: "^/v1/", drop: true }],
    });
    await L.harness("POST", "/__harness/sockets/close", {});
    const from = Date.now();
    const offline = await L.waitForText(p, /You're offline/u, 30000);
    L.step(
      p,
      "P3 offline: the saved conversation stays, labelled, and says sends wait",
      offline.ok &&
        /Pinholes in celadon/u.test(offline.text) &&
        /Reconnect to send/u.test(offline.text),
    );
    await L.harness("POST", "/__harness/threads/maya/reply", {
      text: "Caught up after the network came back.",
    });
    await L.sleep(30000);
    const attempts = between(await L.log(0, p), from, Date.now());
    L.step(
      p,
      `P3 offline for 30 s: ${attempts.length} attempts, backing off (at most 12), no send`,
      attempts.length <= 12 &&
        !attempts.some(
          (e) => e.method === "POST" && /\/messages$/u.test(e.path),
        ),
    );
    await L.harness("POST", "/__harness/faults", { rules: [] });
    const back = await L.waitForText(
      p,
      /Caught up after the network came back/u,
      40000,
    );
    await L.sleep(3000);
    const again = flat(L.screenText(p, "P3-after"));
    L.step(
      p,
      "P3 back online: the reply made meanwhile appears once, and the label goes",
      back.ok &&
        (again.match(/Caught up after the network/gu) ?? []).length === 1 &&
        !/You're offline/u.test(again),
    );
  }

  if (run("P4")) {
    // To the background for a minute and back.
    const from = Date.now();
    L.background(p, 60000);
    const to = Date.now();
    const quiet = between(await L.log(0, p), from + 3000, to - 1000);
    L.step(
      p,
      `P4 a minute in the background: ${quiet.length} requests`,
      quiet.length === 0,
      quiet.map((e) => `${e.method} ${L.shape(e.path)}`).join("; "),
    );
  }
  L.stop(p);
}
await L.harness("POST", "/__harness/faults", { rules: [] });
stopHarness();
L.finish();

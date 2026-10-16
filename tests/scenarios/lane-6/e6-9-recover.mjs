// E6.9 part 3: a background tab, a sleeping page, a stalled server and an idle minute.
// Maya's owner (development actor three) in Chrome at 390 px; a fan (actor one)
// through the real API. Fakes: the development identity, the model fake, and in
// E6.9-6 the browser's background signal (headless Chrome always reports a page as
// visible, so the script sets document.hidden and sends visibilitychange). E6.9-7
// stops Chrome and all its processes for 20 s as a sleeping laptop would, and E6.9-8
// stops the stack's backend process for about 10 s (SIGSTOP, then SIGCONT) once no AI
// reply is in flight. E6.9-13 holds a database lock (a slow database stand-in). E6.9-12
// stops the backend and starts it again with `stack.mjs up` (about a minute).
//   node tests/scenarios/lane-6/e6-9-recover.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as L from "./e6-9-lib.mjs";
const { step, expect, until, hidden, MAYA, WEB } = L;
const fan = await L.stackFan();
const browser = await L.launch();
const owner = await L.phone(browser);
const A = owner.page,
  log = L.requestLog(A);
await L.signIn(A, 3, `/studio/${MAYA}/notes`);

await step(
  "E6.9-6",
  "a background tab stops reading; its return reads once",
  async () => {
    await A.goto(`${WEB}/studio/${MAYA}/notes`);
    await A.getByText(/^REPLIES ·/u).waitFor();
    await until(A, async () => !(await hidden(A)), 30_000, "Notes shown");
    await A.waitForTimeout(2_000);
    const background = (state) =>
      A.evaluate((state) => {
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => state === "hidden",
        });
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => state,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      }, state);
    await background("hidden");
    const from = Date.now();
    await A.waitForTimeout(20_000);
    const away = L.count(log, from);
    const studioAway = Object.entries(away.byPath).filter(
      ([p]) => p !== "/api/platform/identity/session",
    );
    expect(await hidden(A), "Studio still shown while in the background");
    expect(
      !studioAway.length,
      `background reads: ${JSON.stringify(away.byPath)}`,
    );
    const back = Date.now();
    await background("visible");
    const shown = await until(
      A,
      async () =>
        !(await hidden(A)) && (await A.locator(".w5-note-list").isVisible()),
      8_000,
      "Notes again",
    );
    await A.waitForTimeout(3_000);
    const returned = L.count(log, back).byPath;
    expect(
      returned["/api/studio/live"] === 1 &&
        returned["/api/content/:id/studio"] === 1,
      `on return ${JSON.stringify(returned)}`,
    );
    return `20 s away: ${JSON.stringify(away.byPath)} (lane 1 only); back in ${shown} ms with ${JSON.stringify(returned)}`;
  },
);
await step(
  "E6.9-7",
  "after the page sleeps 20 s it recovers and catches up",
  async () => {
    await A.goto(`${WEB}/studio/${MAYA}/threads/${fan.id}`);
    await until(A, async () => !(await hidden(A)), 30_000, "thread shown");
    await A.waitForTimeout(2_000);
    const text = `E6.9 asleep ${L.run} ${Date.now()}`;
    // Proof that the page really slept: a 100 ms counter stops meanwhile.
    await A.evaluate(() => {
      window.e69 = { ticks: 0, from: Date.now() };
      setInterval(() => window.e69.ticks++, 100);
    });
    // The whole browser sleeps: Chrome and every process it started stop.
    const cdp = await browser.newBrowserCDPSession();
    const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
    const children = (pid) => {
      try {
        return execFileSync("pgrep", ["-P", pid], { encoding: "utf8" })
          .split("\n")
          .filter(Boolean);
      } catch {
        return []; // pgrep exits 1 when a process has no children
      }
    };
    const tree = (pid) => [pid, ...children(pid).flatMap(tree)];
    const pids = tree(String(processInfo.find((p) => p.type === "browser").id));
    execFileSync("kill", ["-STOP", ...pids]);
    try {
      await new Promise((r) => setTimeout(r, 5_000));
      await fan.say(text);
      await new Promise((r) => setTimeout(r, 15_000));
    } finally {
      execFileSync("kill", ["-CONT", ...pids]);
    }
    const slept = await A.evaluate(
      () => Date.now() - window.e69.from - window.e69.ticks * 100,
    );
    expect(slept >= 15_000, `the page ran while "asleep" (${slept} ms lost)`);
    const ms = await until(
      A,
      async () => !(await hidden(A)) && (await A.getByText(text).isVisible()),
      15_000,
      "Studio with the message sent during sleep",
    );
    return `slept ${Math.round(slept / 1000)} s; shown with the message sent meanwhile ${ms} ms after waking`;
  },
);
await step(
  "E6.9-8",
  "a stalled server hides Studio, keeps the draft, recovers",
  async () => {
    await fan.quiet();
    const draft = A.locator("textarea").first();
    await draft.fill(`Unsent words ${L.run}`);
    const pids = JSON.parse(
      readFileSync(
        `${process.env.TMPDIR}/qelvora-stack/lane6/pids.json`,
        "utf8",
      ),
    );
    const pid = String(pids.backend.pid);
    execFileSync("kill", ["-STOP", pid]);
    let hid, recovered;
    try {
      hid = await until(
        A,
        () => A.getByText("Reconnect to Studio").isVisible(),
        8_000,
        "Reconnect to Studio",
      );
      await A.waitForTimeout(6_000);
    } finally {
      execFileSync("kill", ["-CONT", pid]);
    }
    recovered = await until(
      A,
      async () => !(await hidden(A)),
      15_000,
      "recovery",
    );
    const kept = await draft.inputValue();
    expect(kept === `Unsent words ${L.run}`, `draft now "${kept}"`);
    return `hidden ${hid} ms after the stall; back ${recovered} ms after it ended; draft kept`;
  },
);
await step(
  "E6.9-13",
  "opening Studio while its roles check hangs: told within 6 s, then shown",
  async () => {
    // A stand-in for a slow database: the roles check waits on a held lock
    // for 12 s while the page itself (served without that table) loads.
    const second = await owner.context.newPage();
    const held = L.lockFor("creator.team_membership", 12_000);
    await new Promise((r) => setTimeout(r, 300));
    const from = Date.now();
    await second.goto(`${WEB}/studio/${MAYA}/notes`);
    await second
      .getByText("Reconnect to continue.", { exact: false })
      .first()
      .waitFor({ timeout: 15_000 });
    const told = Date.now() - from;
    await held;
    const shown = await until(
      second,
      () => second.getByText(/^REPLIES ·/u).isVisible(),
      20_000,
      "Notes after the lock",
    );
    await second.close();
    expect(told <= 8_000, `told after ${told} ms`);
    return `told after ${told} ms (page load included); Notes ${shown} ms after the lock ended`;
  },
);
await step(
  "E6.9-9",
  "an idle minute: renewals keep Studio shown and read nothing",
  async () => {
    await A.goto(`${WEB}/studio/${MAYA}/notes`);
    await until(A, async () => !(await hidden(A)), 30_000, "Notes shown");
    await A.waitForTimeout(3_000);
    const from = Date.now();
    let gaps = 0;
    while (Date.now() - from < 65_000) {
      if ((await hidden(A)) || !(await A.locator(".w5-note-list").isVisible()))
        gaps++;
      await A.waitForTimeout(250);
    }
    const seen = L.count(log, from).byPath;
    expect(!gaps, `Studio hidden in ${gaps} samples`);
    expect(
      (seen["/api/studio/live"] ?? 0) >= 2 && !seen["/api/content/:id/studio"],
      JSON.stringify(seen),
    );
    return `65 s: ${JSON.stringify(seen)}, never hidden`;
  },
);
await step(
  "E6.9-12",
  "a backend restart: Studio hides, then returns by itself",
  async () => {
    await A.goto(`${WEB}/studio/${MAYA}/notes`);
    await A.getByText(/^REPLIES ·/u).waitFor({ timeout: 30_000 });
    await A.evaluate(() => (window.e69 = "same page"));
    const file = `${process.env.TMPDIR}/qelvora-stack/lane6/pids.json`;
    execFileSync("kill", [
      String(JSON.parse(readFileSync(file, "utf8")).backend.pid),
    ]);
    const hid = await until(
      A,
      () => A.getByText("Reconnect to Studio").isVisible(),
      10_000,
      "Reconnect to Studio",
    );
    const restarted = Date.now();
    execFileSync(
      process.execPath,
      [
        "infra/local/stack.mjs",
        "up",
        "--lane",
        "6",
        "--provider",
        "anthropic",
        "--growth",
      ],
      {
        cwd: new URL("../../../", import.meta.url),
        env: { ...process.env, CI: "1" },
        stdio: "ignore",
      },
    );
    const up = Date.now() - restarted;
    const back = await until(
      A,
      async () =>
        !(await hidden(A)) && (await A.locator(".w5-note-list").isVisible()),
      20_000,
      "Notes after the restart",
    );
    expect((await A.evaluate(() => window.e69)) === "same page", "reloaded");
    return `hidden ${hid} ms after the backend stopped; stack back in ${Math.round(up / 1000)} s; Notes shown ${back} ms later, same page`;
  },
);
await L.finish(browser);

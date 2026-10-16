// A7 / E3A.8: does the web thread paint an approved AI sentence from its
// WebSocket frame, or refetch the page first? Installed Chrome (headless)
// signs in as development actor one, opens Maya's thread and sends questions
// through the composer. Every frame is timestamped as it arrives and every
// change of the thread's text as it appears, on one clock; thread-page fetches
// are counted per answer. One answer loses the network in the middle and must
// still end with exactly the server's text. Fakes: development identity and
// the stack's model fake (slowed so sentences arrive apart).
//   node infra/local/stack.mjs up --lane 3 --no-ai --no-smoke   (with the web app)
//   node tests/scenarios/lane-3/a7-paint-frames.mjs [--answers 5] [--out run.json]
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import {
  MODEL,
  ACTORS,
  MAYA_CREATOR_ID,
  call,
  closeDb,
  ensureMaya,
  flag,
  openFan,
  percentile,
  reporter,
  sleep,
  sql,
} from "./lib.mjs";

const WEB = flag("--web", "http://localhost:56432");
const answers = Number(flag("--answers", "5"));
const { step, finish } = reporter();
const { chromium } = createRequire(
  new URL("../../../apps/web/package.json", import.meta.url),
)("@playwright/test");

await call(MODEL, "POST", "/__control", { body: { mode: "ok", delayMs: 700 } });
step("Maya's AI is live", true, await ensureMaya(20_000_000));
const { fan } = await openFan(ACTORS.fanOne, "a7fan");
const threadPath = `/threads/${MAYA_CREATOR_ID}/${fan.id}`;
const apiPage = `/api/conversations/${MAYA_CREATOR_ID}/${fan.id}`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const t0 = Date.now();
const now = () => Date.now() - t0;
const frames = [];
const paints = [];
const fetches = [];
page.on("websocket", (ws) =>
  ws.on("framereceived", (event) => {
    try {
      const frame = JSON.parse(String(event.payload));
      if (frame.kind) frames.push({ at: now(), ...frame });
    } catch {
      // Not a frame.
    }
  }),
);
page.on("request", (request) => {
  const url = new URL(request.url());
  if (request.method() === "GET" && url.pathname === apiPage)
    fetches.push({ at: now() });
});
await page.exposeFunction("__painted", (text) =>
  paints.push({ at: now(), text }),
);

await page.goto(
  `${WEB}/auth/continue?returnTo=${encodeURIComponent(threadPath)}`,
);
await page.getByRole("link", { name: "Continue with Pantopus" }).click();
await page.getByRole("button", { name: "Development actor one" }).click();
await page.waitForURL((url) => url.pathname === threadPath, {
  timeout: 60_000,
});
await page.locator("textarea").waitFor({ timeout: 60_000 });
await page.evaluate(() => {
  const root = document.querySelector("main") ?? document.body;
  let last = "";
  new MutationObserver(() => {
    const text = root.innerText;
    if (text !== last) {
      last = text;
      window.__painted(text);
    }
  }).observe(root, { subtree: true, childList: true, characterData: true });
});
step("fan signed in on the web thread", true, threadPath);

const results = [];
for (let i = 0; i < answers + 1; i++) {
  const drop = i === answers; // the last one loses the network mid-answer
  const question = `Paint check ${i + 1}: how thick should a glaze coat be?`;
  const mark = {
    frames: frames.length,
    fetches: fetches.length,
    paints: paints.length,
  };
  const screenBefore = await page.locator("main").innerText();
  await page.locator("textarea").fill(question);
  await page.getByRole("button", { name: "Send message" }).click();
  let accepted = null;
  for (let waited = 0; waited < 60_000 && !accepted; waited += 100) {
    accepted = frames
      .slice(mark.frames)
      .find((f) => f.kind === "accepted" && f.text === question);
    if (!accepted) await sleep(100);
  }
  const g = accepted?.generationId;
  if (drop) {
    for (let waited = 0; waited < 60_000; waited += 100) {
      if (frames.some((f) => f.generationId === g && f.kind === "sentence"))
        break;
      await sleep(100);
    }
    await context.setOffline(true);
    await sleep(2500);
    await context.setOffline(false);
  }
  // The gateway may close the socket mid-answer (finding 5); a client that
  // reconnects resumes from its cursor and may never see the final frame, so
  // the answer's end is read from the database.
  let end = null;
  for (let waited = 0; waited < 180_000 && !end; waited += 200) {
    const [row] = g
      ? await sql("SELECT state FROM creator.generation WHERE id=$1", [g])
      : [];
    if (["delivered", "interrupted"].includes(row?.state))
      end = {
        kind: row.state,
        at:
          frames.find(
            (f) =>
              f.generationId === g &&
              ["delivered", "interrupted"].includes(f.kind),
          )?.at ?? now(),
      };
    else await sleep(200);
  }
  await sleep(2500); // let the reconciling fetch land
  const sentences = frames.filter(
    (f) => f.generationId === g && f.kind === "sentence",
  );
  // Every answer from the fake repeats the same sentences, so a sentence is
  // painted when its count on screen goes up after its frame arrived.
  const count = (text, part) => text.split(part).length - 1;
  const latencies = sentences.map((s) => {
    const part = s.text.trim();
    const before = [...paints].reverse().find((p) => p.at < s.at);
    const seen = before ? count(before.text, part) : 0;
    const shown = paints.find(
      (p) => p.at >= s.at && count(p.text, part) > seen,
    );
    return shown ? shown.at - s.at : null;
  });
  const during = fetches
    .slice(mark.fetches)
    .filter((f) => !end || f.at <= end.at + 2500);
  const server = (
    await sql(
      "SELECT m.text FROM creator.generation g JOIN creator.message m ON m.id=g.ai_message_id WHERE g.id=$1",
      [g],
    )
  )[0]?.text;
  const screen = await page.locator("main").innerText();
  // The fake gives every answer the same text: after answer i it shows i times.
  // The fake gives every answer the same text: one more on screen than before.
  const shownTimes = (text) =>
    server ? text.split(server.trim()).length - 1 : 0;
  const occurrences = shownTimes(screen);
  const expected = shownTimes(screenBefore) + 1;
  results.push({
    drop,
    end: end?.kind ?? "none",
    sentences: sentences.length,
    latencies,
    fetches: during.length,
    occurrences,
  });
  step(
    drop
      ? "network lost mid-answer: the screen ends with the server's text once"
      : `answer ${i + 1}`,
    Boolean(end) && occurrences === expected,
    `${end?.kind ?? "no end"}; ${sentences.length} sentence frames; paint after frame ${latencies.map((l) => (l == null ? "never" : `${l} ms`)).join(", ")}; ${during.length} page fetches; server text on screen ${occurrences}x (expected ${expected}x)`,
  );
}

const normal = results.filter((r) => !r.drop);
const all = normal.flatMap((r) => r.latencies);
const summary = {
  when: new Date().toISOString(),
  paint: {
    p50: percentile(all, 50),
    p95: percentile(all, 95),
    never: all.filter((v) => v == null).length,
  },
  fetchesPerAnswer: normal.map((r) => r.fetches),
  results,
};
process.stdout.write(
  `\nsentence painted after its frame: p50 ${summary.paint.p50} ms, p95 ${summary.paint.p95} ms (${summary.paint.never} never) | page fetches per answer ${summary.fetchesPerAnswer.join(", ")}\n`,
);
const out = flag("--out");
if (out) writeFileSync(out, JSON.stringify(summary, null, 2));
await browser.close();
await closeDb();
finish();

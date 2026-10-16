// E3B.5 on the web thread (B5): under the AI answer it came from, the fan is
// asked "Want me to remember this? Only if you say yes."; Remember makes it
// memory and shows "Remembered: …", which "Don't remember this" undoes; Don't
// remember stores nothing; a sensitive item records its own consent. Installed
// Chrome (headless) drives the real web app against lane 3's stack with the
// memory proposal writer applied (see the lane 3 status, B5). A scripted model
// edge (lane 3's port 56438) answers extraction and sensitivity, which the
// model fake does not do. Fakes: development identity, model fake, this edge.
//   node tests/scenarios/lane-3/e3b5-memory-web.mjs
import { createRequire } from "node:module";
import { createServer, request } from "node:http";
import {
  MODEL,
  ACTORS,
  MAYA_CREATOR_ID,
  call,
  closeDb,
  ensureMaya,
  flag,
  openFan,
  reporter,
  sleep,
  sql,
} from "./lib.mjs";

const WEB = flag("--web", "http://localhost:56432");
const EDGE_PORT = Number(flag("--edge-port", "56438"));
const { step, finish } = reporter();
const { chromium } = createRequire(
  new URL("../../../apps/web/package.json", import.meta.url),
)("@playwright/test");
const QUESTION = "Want me to remember this? Only if you say yes.";
const FACTS = {
  "I fire my glazes at cone 6 in an electric kiln.": {
    kind: "fact",
    text: "Fires glazes at cone 6 in an electric kiln.",
    semanticKey: "firing temperature",
    sensitiveCategory: null,
  },
  "My studio is in my garage.": {
    kind: "fact",
    text: "Works in a garage studio.",
    semanticKey: "studio location",
    sensitiveCategory: null,
  },
  "I was diagnosed with diabetes last year.": {
    kind: "fact",
    text: "Has diabetes.",
    semanticKey: "health condition",
    sensitiveCategory: "health",
  },
};
const edge = createServer((req, res) => {
  const parts = [];
  req.on("data", (c) => parts.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(parts);
    let body = null;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      // Forwarded unchanged.
    }
    const fields = Object.keys(body?.text?.format?.schema?.properties ?? {});
    const input = JSON.stringify(body?.input ?? "");
    const answer = (object) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "resp_e3b5_web",
          object: "response",
          model: body.model,
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: JSON.stringify(object) }],
            },
          ],
          usage: {
            input_tokens: 60,
            output_tokens: 30,
            total_tokens: 90,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 },
          },
        }),
      );
    };
    if (
      req.url.startsWith("/v1/responses") &&
      fields.length === 1 &&
      fields[0] === "items"
    ) {
      const found = Object.entries(FACTS).find(([message]) =>
        input.includes(`fan: ${message}`),
      );
      return answer({ items: found ? [found[1]] : [] });
    }
    if (
      req.url.startsWith("/v1/responses") &&
      fields.includes("category") &&
      fields.includes("uncertain")
    )
      return answer({
        category: /diabetes/u.test(input) ? "health" : null,
        uncertain: false,
      });
    const target = new URL(MODEL);
    const upstream = request(
      {
        host: target.hostname,
        port: target.port,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: target.host },
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    upstream.end(raw);
  });
});
await new Promise((resolve, reject) => {
  edge.once("error", reject);
  edge.listen(EDGE_PORT, "127.0.0.1", resolve);
});

await call(MODEL, "POST", "/__control", { body: { mode: "ok", delayMs: 100 } });
step("Maya's AI is live", true, await ensureMaya(20_000_000));
const { fan } = await openFan(ACTORS.fanOne, "e3b5web");
const threadPath = `/threads/${MAYA_CREATOR_ID}/${fan.id}`;
const memory = (key) =>
  sql(
    "SELECT state, consent_id IS NOT NULL AS consented FROM creator.memory WHERE fan_id=$1 AND semantic_key=$2",
    [fan.id, key],
  );

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
await page.goto(
  `${WEB}/auth/continue?returnTo=${encodeURIComponent(threadPath)}`,
);
await page.getByRole("link", { name: "Continue with Pantopus" }).click();
await page.getByRole("button", { name: "Development actor one" }).click();
await page.waitForURL((url) => url.pathname === threadPath, {
  timeout: 60_000,
});
await page.locator("textarea").waitFor({ timeout: 60_000 });
step("fan signed in on the web thread", true, threadPath);

async function send(text) {
  await page.locator("textarea").fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
}
const prompt = (text) =>
  page.locator("section.conversation-memory-prompt div", { hasText: text });

// Remember.
await send("I fire my glazes at cone 6 in an electric kiln.");
const asked = prompt("Fires glazes at cone 6 in an electric kiln.");
await asked.waitFor({ timeout: 90_000 }).catch(() => {});
step(
  "the fan is asked under the answer, with the fixed question",
  (await asked.count()) === 1 && (await asked.innerText()).includes(QUESTION),
  (await asked.count())
    ? (await asked.innerText()).replace(/\s+/gu, " ")
    : "no prompt",
);
await asked.getByRole("button", { name: "Remember" }).click();
const chip = page.getByText(
  "Remembered: Fires glazes at cone 6 in an electric kiln.",
);
await chip.waitFor({ timeout: 15_000 }).catch(() => {});
step(
  "Remember makes it memory and shows it as remembered",
  (await chip.count()) === 1 &&
    (await memory("firing temperature"))[0]?.state === "remembered",
  JSON.stringify(await memory("firing temperature")),
);
await page
  .locator("section.conversation-memory-prompt p", {
    hasText: "Remembered: Fires glazes",
  })
  .getByRole("button", { name: "Don’t remember this" })
  .click();
await sleep(1500);
step(
  "Don't remember this undoes it at once",
  (await memory("firing temperature")).length === 0 &&
    (await page.getByText("Remembered: Fires glazes").count()) === 0,
  JSON.stringify(await memory("firing temperature")),
);

// Don't remember.
await send("My studio is in my garage.");
const garage = prompt("Works in a garage studio.");
await garage.waitFor({ timeout: 90_000 }).catch(() => {});
await garage.getByRole("button", { name: "Don’t remember" }).click();
await sleep(1500);
step(
  "Don't remember stores nothing and the question goes away",
  (await memory("studio location")).length === 0 &&
    (await prompt("Works in a garage studio.").count()) === 0,
  JSON.stringify(await memory("studio location")),
);

// Sensitive.
await send("I was diagnosed with diabetes last year.");
const health = prompt("Has diabetes.");
await health.waitFor({ timeout: 90_000 }).catch(() => {});
await health.getByRole("button", { name: "Remember" }).click();
await sleep(1500);
const [stored] = await memory("health condition");
step(
  "a sensitive item records its own consent when the fan says yes (INV-23)",
  stored?.state === "remembered" && stored.consented,
  JSON.stringify(stored ?? null),
);

const screenshot = flag("--screenshot");
if (screenshot) await page.screenshot({ path: screenshot, fullPage: false });
await browser.close();
edge.close();
await closeDb();
finish();

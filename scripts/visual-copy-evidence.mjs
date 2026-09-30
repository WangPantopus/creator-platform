/** Retains the explicit Packet-heading behavioral correction without editing original artboards. */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";
const server = spawn(process.execPath, ["scripts/visual-reference.mjs"], {
  stdio: "ignore",
});
let browser;
try {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if (
        (await fetch("http://127.0.0.1:3101/phase4a-fan-core/Welcome.dc.html"))
          .ok
      )
        break;
    } catch {
      /* Startup only. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
  await fs.mkdir("tests/visual/evidence/packet-heading", { recursive: true });
  for (const theme of ["light", "night"])
    for (const [group, name] of [
      ["phase4a-fan-core", "Packet"],
      ["phase5-prototypes", "StepIn"],
    ])
      for (const original of [true, false]) {
        const canvas = JSON.parse(
          await fs.readFile(`design/${group}/canvas.json`, "utf8"),
        );
        const { w: width, h: height } = canvas.boards[`${name}.dc.html`];
        const page = await browser.newPage({
          viewport: { width, height },
          deviceScaleFactor: 1,
          reducedMotion: "reduce",
        });
        await page.goto(
          `http://127.0.0.1:3101/${group}/${name}.dc.html?step=${name === "StepIn" ? 1 : 0}&original=${original ? 1 : 0}`,
        );
        await page.locator("x-dc > div").waitFor();
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          animations: "disabled",
          path: `tests/visual/evidence/packet-heading/${name}-${theme}-${original ? "original-heading" : "corrected-heading"}.png`,
        });
        await page.close();
      }
} finally {
  await browser?.close();
  server.kill();
}

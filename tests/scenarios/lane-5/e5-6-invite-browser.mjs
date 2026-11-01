// Real installed Chrome, full stock stack. Run after e5-6-invites.mjs on a
// fresh fan (no handle yet). Fakes: development identity/license/model only.
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ACTORS } from "../lane-2/lib.mjs";
import { expect, step, skip, finish } from "./lib.mjs";
const fixture = JSON.parse(
  readFileSync("/tmp/qelvora-lane5-invite-fixture.json", "utf8"),
);
const actor = process.argv.includes("--fan-two")
  ? ACTORS.fanTwo
  : ACTORS.fanOne;
const require = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
);
const { Pool } = require("pg");
const db = new Pool({
  connectionString:
    "postgresql://postgres:foundation-test-only@127.0.0.1:56450/creator_stack",
  max: 2,
});
const web = "http://localhost:56452";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  colorScheme: "light",
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await step(
    "E5.6-browser-note",
    "the real invitation renders exact Unicode and markup as plain text",
    async () => {
      await page.goto(`${web}/invite/${fixture.id}`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page
        .getByRole("link", { name: "Accept invitation", exact: true })
        .waitFor();
      expect(
        (await page
          .locator(".growth-invite .growth-voice")
          .first()
          .textContent()) === fixture.note,
        "note changed",
      );
      expect(
        (await page.locator(".growth-invite script").count()) === 0,
        "note created a script",
      );
      expect(
        (await page.evaluate(() => window.__invite_markup)) === undefined,
        "note executed",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "note overflowed",
      );
      const description = await page
        .locator('meta[property="og:description"]')
        .getAttribute("content");
      expect(description === fixture.note, "preview lost the creator's note");
      await page.screenshot({
        path: "/tmp/qelvora-lane5-invite-page.png",
        fullPage: true,
      });
    },
  );
  await step(
    "E5.6-browser-card",
    "the link has a real PNG preview; expired and revoked previews are unavailable",
    async () => {
      const image = await page
        .locator('meta[property="og:image"]')
        .getAttribute("content");
      expect(image === `${web}/invite/${fixture.id}/image`, String(image));
      const r = await context.request.get(image, { timeout: 90000 });
      expect(r.status() === 200, `image ${r.status()}: ${await r.text()}`);
      expect(r.headers()["content-type"].includes("image/png"), "not a PNG");
      expect(
        r.headers()["cache-control"].includes("no-store"),
        "preview stored despite revocation",
      );
      const bytes = await r.body();
      expect(
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        "invalid PNG",
      );
      writeFileSync("/tmp/qelvora-lane5-invite-card.png", bytes);
      for (const id of [fixture.revokedId, fixture.expiredId]) {
        const gone = await context.request.get(`${web}/invite/${id}/image`);
        expect(gone.status() === 404, `unavailable image ${gone.status()}`);
      }
    },
  );
  await step(
    "E5.6-four-screens",
    "a new fan reaches and sends the first message in four product screens",
    async () => {
      try {
        // Screen 1: invitation. The development provider selection is an explicit
        // outer-edge fake, counted separately from the four Qelvora product screens.
        await page
          .getByRole("link", { name: "Accept invitation", exact: true })
          .click();
        await page
          .getByRole("heading", { name: "Development identity", exact: true })
          .waitFor({ timeout: 90000 });
        await page.locator(`button[value="${actor}"]`).click();
        // Screen 2: choose the handle, through the real identity form.
        await page
          .getByRole("heading", {
            name: "How creators will know you",
            exact: true,
          })
          .waitFor({ timeout: 90000 });
        await page.waitForLoadState("networkidle", { timeout: 30000 });
        await page
          .getByLabel("Handle", { exact: true })
          .fill(
            actor === ACTORS.fanOne ? "invite_first_fan" : "invite_first_fan2",
          );
        const [saved] = await Promise.all([
          page.waitForResponse((r) =>
            new URL(r.url()).pathname.endsWith("/identity/fan-profile"),
          ),
          page.getByRole("button", { name: "Continue", exact: true }).click(),
        ]);
        expect(
          saved.status() === 200,
          `profile ${saved.status()}: ${await saved.text()}`,
        );
        // Screen 3: provider and privacy review remains mandatory.
        await page
          .getByRole("heading", {
            name: "Before your first message",
            exact: true,
          })
          .waitFor({ timeout: 90000 });
        await page
          .getByRole("button", { name: "Start with Maya's AI", exact: true })
          .click();
        // Screen 4: the actual thread and its normal send action.
        await page
          .getByRole("textbox", { name: "Message Maya's AI", exact: true })
          .waitFor({ timeout: 90000 });
        const text = "How can I keep a pottery mug handle comfortable?";
        await page
          .getByRole("textbox", { name: "Message Maya's AI", exact: true })
          .fill(text);
        const [sent] = await Promise.all([
          page.waitForResponse(
            (r) =>
              r.request().method() === "POST" &&
              new URL(r.url()).pathname.endsWith("/messages"),
            { timeout: 90000 },
          ),
          page
            .getByRole("button", { name: "Send message", exact: true })
            .click(),
        ]);
        expect(
          [200, 202].includes(sent.status()),
          `send ${sent.status()}: ${await sent.text()}`,
        );
        await page
          .locator(".qv-bubble--fan")
          .getByText(text, { exact: true })
          .or(page.locator(".qv-bubble--fan").filter({ hasText: text }))
          .first()
          .waitFor({ timeout: 90000 });
        const state = (
          await db.query(
            "SELECT count(*)::int AS n FROM creator.message m JOIN creator.fan_profile f ON f.id=m.fan_id WHERE f.account_id=$1 AND m.author_kind='fan'",
            [actor],
          )
        ).rows[0];
        expect(state.n === 1, JSON.stringify(state));
        await page.screenshot({
          path: "/tmp/qelvora-lane5-invite-first-message.png",
          fullPage: true,
        });
        return "invitation → handle → provider review → thread; plus one development-provider screen; one stored fan message";
      } catch (error) {
        console.log(
          `ENTRY FAILURE at ${new URL(page.url()).pathname}: ${(await page.locator("body").innerText()).slice(0, 3000)}`,
        );
        await page.screenshot({
          path: "/tmp/qelvora-lane5-invite-entry-failure.png",
          fullPage: true,
        });
        throw error;
      }
    },
  );
  await step(
    "E5.6-browser-errors",
    "no browser application exceptions",
    async () => expect(errors.length === 0, errors.join("\n")),
  );
  skip(
    "E5.6-note-form",
    "author the note through a creator form",
    "new form copy is awaiting the founder; note was authored through the real creator API",
  );
} finally {
  await browser.close();
  await db.end();
}
process.exit(finish());

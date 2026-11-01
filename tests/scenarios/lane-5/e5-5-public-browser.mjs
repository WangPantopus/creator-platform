// Real Chrome + the full stock stack on lane 5. Run after e5-5-public-page.mjs
// and a host restart (that scenario intentionally exhausts the API rate limit).
// Uses installed Chrome; never downloads a browser. Text-size override simulates
// a browser user stylesheet. Fakes are the stack's identity/license/model edge.
import { chromium } from "@playwright/test";
import { ACTORS, call, signIn } from "../lane-2/lib.mjs";
import { expect, step, skip, finish } from "./lib.mjs";
const api = "http://127.0.0.1:56451",
  web = "http://localhost:56452";
const { token } = await signIn(api, ACTORS.maya, "/studio/ai");
const save = async (displayName, handle = "maya") => {
  const r = await call(api, "POST", "/v1/identity/creator-profile", {
    token,
    body: { handle, displayName },
  });
  expect(r.status === 200, `${r.status} ${r.text}`);
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  colorScheme: "light",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const visit = async (path) => {
  await page.goto(web + path, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.locator(".growth").waitFor({ timeout: 30000 });
};
const fits = async () => {
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(
    geometry.scroll <= geometry.width + 1,
    `horizontal overflow: ${JSON.stringify(geometry)}`,
  );
};
try {
  await step(
    "E5.5-browser-empty",
    "a visitor sees Maya, her AI label and useful empty states without an account",
    async () => {
      await visit("/creators/maya");
      expect(
        (await page.locator("h1").textContent()) === "Maya",
        "creator name missing",
      );
      expect(
        await page.getByText("@maya", { exact: true }).isVisible(),
        "missing category has no handle fallback",
      );
      expect(
        await page
          .getByText("No public posts yet", { exact: true })
          .isVisible(),
        "empty posts have no explanation",
      );
      expect(
        await page
          .getByText("Official AI · companion", { exact: true })
          .isVisible(),
        "AI identity missing",
      );
      expect(
        await page
          .getByRole("link", { name: "Message Maya's AI", exact: true })
          .isVisible(),
        "chat entry missing",
      );
      expect(
        (await page.locator(".growth-portrait-initial").textContent()) === "M",
        "missing photo has no initial",
      );
      await fits();
      await page.screenshot({
        path: "/tmp/qelvora-lane5-public-light.png",
        fullPage: true,
      });
      return "public page, initial, handle, AI label, chat entry and empty posts visible";
    },
  );
  const name = "🧑🏽‍🎨 陶芸 <script>window.__lane5_markup=true</script> مرحبا";
  await step(
    "E5.5-browser-text",
    "unicode and markup in the real profile name remain plain text",
    async () => {
      await save(name, "maya_public_text");
      await visit("/creators/maya_public_text");
      expect(
        (await page.locator("h1").textContent()) === name,
        "profile text changed",
      );
      expect(
        (await page.locator("h1 script").count()) === 0,
        "markup became a script element",
      );
      expect(
        (await page.evaluate(() => window.__lane5_markup)) === undefined,
        "profile markup executed",
      );
      await fits();
      return "exact multilingual text in heading; no created script or execution";
    },
  );
  await step(
    "E5.5-browser-night-large",
    "Night and a 200% base font fit at phone width with an 80-character name",
    async () => {
      await save("W".repeat(80), "maya_public_text");
      await page.setViewportSize({ width: 320, height: 844 });
      await page.emulateMedia({ colorScheme: "dark" });
      await visit("/creators/maya_public_text");
      await page.addStyleTag({
        content: "html { font-size: 200% !important; }",
      });
      expect(
        (await page.evaluate(() => document.documentElement.dataset.theme)) ===
          "night",
        "Night theme not applied",
      );
      expect(
        (await page.locator("h1").textContent()).length === 80,
        "long name truncated",
      );
      await fits();
      await page.screenshot({
        path: "/tmp/qelvora-lane5-public-night-large.png",
        fullPage: true,
      });
      return "320 px, Night, 200% base font; full name visible without horizontal overflow";
    },
  );
  await step(
    "E5.5-browser-unavailable",
    "a former handle offers a way back to Discover",
    async () => {
      await visit("/creators/maya");
      expect(
        await page
          .getByText("Creator unavailable", { exact: true })
          .isVisible(),
        "unavailable state missing",
      );
      expect(
        await page
          .getByRole("link", { name: "Back to Discover", exact: true })
          .isVisible(),
        "missing way back",
      );
      await fits();
      await page.screenshot({
        path: "/tmp/qelvora-lane5-public-unavailable.png",
        fullPage: true,
      });
    },
  );
  skip(
    "E5.5-browser-bio",
    "authored biography and photo caption",
    "the real authoring endpoint is not built; no fake public projection used",
  );
  await step(
    "E5.5-browser-errors",
    "the browser reports no application exceptions",
    async () => {
      expect(errors.length === 0, errors.join("\n"));
    },
  );
} finally {
  await save("Maya");
  await browser.close();
}
process.exit(finish());

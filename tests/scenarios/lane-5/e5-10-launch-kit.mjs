// Real stock server, PostgreSQL and installed Chrome. Edge fakes: development
// identity/license/model. No clipboard, HTTP, creator or publication stub.
import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { ACTORS, MAYA_CREATOR_ID, call, signIn } from "../lane-2/lib.mjs";
import { expect, step, skip, finish } from "./lib.mjs";
const require = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
);
const { Pool } = require("pg");
const db = new Pool({
  connectionString:
    "postgresql://postgres:foundation-test-only@127.0.0.1:56450/creator_stack",
  max: 2,
});
const api = "http://127.0.0.1:56451",
  web = "http://localhost:56452";
const creator = await signIn(api, ACTORS.maya, "/studio/ai");
const fan = await signIn(api, ACTORS.fanOne);
const status = (r, code) => expect(r.status === code, `${r.status} ${r.text}`);
const read = (token = creator.token) =>
  call(api, "GET", "/v1/growth/launch", { token });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = [];
let browserReady = false;
const browserStep = (id, label, run) =>
  browserReady
    ? step(id, label, run)
    : skip(
        id,
        label,
        "web proxy does not allow /launch; dependent browser workflow not run",
      );
page.on("pageerror", (e) => errors.push(e.message));
try {
  await step(
    "E5.10-owner",
    "only the actual creator can read the kit; concurrent reads change no invitation",
    async () => {
      status(await read(null), 401);
      status(await read(fan.token), 403);
      const count = async () =>
        (await db.query("SELECT count(*)::int AS n FROM growth.invite")).rows[0]
          .n;
      const before = await count();
      for (const r of await Promise.all(
        Array.from({ length: 4 }, () => read()),
      )) {
        status(r, 200);
        expect(
          r.json.publicPage?.path === "/creators/maya" &&
            r.json.canInvite === true,
          r.text,
        );
      }
      expect((await count()) === before, "reading created an invitation");
      return "anonymous 401; fan 403; four current creator results; invitation count unchanged";
    },
  );
  await step(
    "E5.10-state",
    "real pause/resume changes invitation availability without hiding the public page",
    async () => {
      const state = await call(
        api,
        "GET",
        `/v1/agent/${MAYA_CREATOR_ID}/state`,
        { token: creator.token },
      );
      status(state, 200);
      const command = (path) =>
        call(api, "POST", path, {
          token: creator.token,
          headers: { "Idempotency-Key": randomUUID() },
        });
      status(await command(`/v1/agent/${MAYA_CREATOR_ID}/pause`), 200);
      try {
        const paused = await read();
        status(paused, 200);
        expect(
          paused.json.publicPage?.path === "/creators/maya" &&
            !paused.json.canInvite,
          paused.text,
        );
      } finally {
        status(
          await command(
            `/v1/agent/${MAYA_CREATOR_ID}/versions/${state.json.liveVersion.id}/rollback`,
          ),
          200,
        );
      }
      expect(
        (await read()).json.canInvite,
        "resume did not restore availability",
      );
    },
  );
  if (!process.argv.includes("--api-only"))
    await step(
      "E5.10-browser",
      "a creator opens the public page and the four real preparation links",
      async () => {
        await page.goto(
          `${web}/api/auth/continue?returnTo=%2Fstudio%2Flaunch`,
          {
            timeout: 90000,
          },
        );
        await page.locator(`button[value="${ACTORS.maya}"]`).click();
        await page.waitForURL(
          (u) => ["/onboarding/handle", "/studio/launch"].includes(u.pathname),
          { timeout: 90000 },
        );
        if (new URL(page.url()).pathname === "/onboarding/handle") {
          await page.getByLabel("Handle", { exact: true }).waitFor();
          await page.waitForLoadState("networkidle");
          await page
            .getByLabel("Handle", { exact: true })
            .fill("maya_launch_fan");
          await page
            .getByRole("button", { name: "Continue", exact: true })
            .click();
        }
        const bridge = await context.request.get(`${web}/api/growth/launch`);
        if (bridge.status() === 404) {
          await page.screenshot({
            path: "/tmp/qelvora-lane5-launch-blocked.png",
            fullPage: true,
          });
          throw new Error(`web proxy 404: ${await bridge.text()}`);
        }
        await page
          .getByRole("button", { name: "Share link", exact: true })
          .waitFor({ timeout: 90000 });
        const publicLink = page.locator('a[href="/creators/maya"]');
        expect((await publicLink.count()) === 1, "public link missing");
        const steps = page.locator("ol li a");
        const paths = await steps.evaluateAll((nodes) =>
          nodes.map((n) => n.getAttribute("href")),
        );
        expect(
          JSON.stringify(paths) ===
            JSON.stringify([
              "/studio/setup",
              "/studio/ai/sources",
              "/studio/ai/test",
              "/notifications/settings",
            ]),
          JSON.stringify(paths),
        );
        for (const path of ["/creators/maya", ...paths]) {
          const r = await context.request.get(web + path, { timeout: 90000 });
          expect(r.status() === 200, `${path}: ${r.status()}`);
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          "mobile overflow",
        );
        await page.screenshot({
          path: "/tmp/qelvora-lane5-launch-kit.png",
          fullPage: true,
        });
        browserReady = true;
        return "public page and four destinations return 200; 390px page fits";
      },
    );
  if (!process.argv.includes("--api-only"))
    await step(
      "E5.10-links",
      "the four preparation links work even while public sharing is disconnected",
      async () => {
        const paths = await page
          .locator("ol li a")
          .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")));
        expect(
          JSON.stringify(paths) ===
            JSON.stringify([
              "/studio/setup",
              "/studio/ai/sources",
              "/studio/ai/test",
              "/notifications/settings",
            ]),
          JSON.stringify(paths),
        );
        for (const path of paths) {
          const r = await context.request.get(web + path, { timeout: 90000 });
          expect(r.status() === 200, `${path}: ${r.status()}`);
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          "mobile overflow",
        );
        await page.screenshot({
          path: "/tmp/qelvora-lane5-launch-checklist.png",
          fullPage: true,
        });
        return "four 200 destinations; mobile layout fits";
      },
    );
  await browserStep(
    "E5.10-copy",
    "share copies the current public URL without creating an invitation",
    async () => {
      const count = async () =>
        (await db.query("SELECT count(*)::int AS n FROM growth.invite")).rows[0]
          .n;
      const before = await count();
      await page
        .getByRole("button", { name: "Share link", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Link copied." })
        .waitFor();
      expect(
        (await page.evaluate(() => navigator.clipboard.readText())) ===
          `${web}/creators/maya`,
        "clipboard differs",
      );
      expect(
        (await count()) === before,
        "public sharing created an invitation",
      );
    },
  );
  await browserStep(
    "E5.10-pause",
    "pausing AI keeps the public page readable and disables new invitations",
    async () => {
      const state = await call(
        api,
        "GET",
        `/v1/agent/${MAYA_CREATOR_ID}/state`,
        { token: creator.token },
      );
      status(state, 200);
      const command = (path) =>
        call(api, "POST", path, {
          token: creator.token,
          headers: { "Idempotency-Key": randomUUID() },
        });
      status(await command(`/v1/agent/${MAYA_CREATOR_ID}/pause`), 200);
      try {
        const paused = await read();
        status(paused, 200);
        expect(
          paused.json.publicPage.path === "/creators/maya" &&
            !paused.json.canInvite,
          paused.text,
        );
        // The tab still holds the published state. The share action must re-read.
        await page
          .getByRole("button", { name: "Share link", exact: true })
          .click();
        await page
          .getByRole("status")
          .filter({ hasText: "Link copied." })
          .waitFor();
        expect(
          await page
            .getByRole("button", {
              name: "Create and copy invitation",
              exact: true,
            })
            .isDisabled(),
          "stale invitation action stayed enabled",
        );
      } finally {
        status(
          await command(
            `/v1/agent/${MAYA_CREATOR_ID}/versions/${state.json.liveVersion.id}/rollback`,
          ),
          200,
        );
      }
      expect(
        (await read()).json.canInvite,
        "resume did not restore invitation availability",
      );
    },
  );
  await browserStep(
    "E5.10-clipboard-retry",
    "denied clipboard permission reports failure; granting it lets the same action succeed",
    async () => {
      const cdp = await browser.newBrowserCDPSession();
      const { browserContextIds } = await cdp.send("Target.getBrowserContexts");
      const permission = (setting) =>
        cdp.send("Browser.setPermission", {
          permission: { name: "clipboard-write" },
          setting,
          origin: web,
          browserContextId: browserContextIds[0],
        });
      await permission("denied");
      await page
        .getByRole("button", { name: "Share link", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: /denied|permission/i })
        .waitFor();
      await permission("granted");
      await page
        .getByRole("button", { name: "Share link", exact: true })
        .click();
      await page
        .getByRole("status")
        .filter({ hasText: "Link copied." })
        .waitFor();
      expect(
        (await page.evaluate(() => navigator.clipboard.readText())) ===
          `${web}/creators/maya`,
        "retry copied wrong URL",
      );
      expect(errors.length === 0, errors.join("; "));
    },
  );
  skip(
    "E5.10-native-sheet",
    "native operating-system share sheet",
    "installed headless Chrome provides clipboard; physical-device share sheet not run",
  );
} finally {
  await browser.close();
  await db.end();
}
process.exitCode = finish();

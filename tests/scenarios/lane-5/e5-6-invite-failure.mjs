// Full lane 5 stack, after e5-6-invites.mjs. Real Chrome clipboard permission
// denial and real PostgreSQL pause; no implementation or owner mocks.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ACTORS, call, signIn } from "../lane-2/lib.mjs";
import { expect, step, finish } from "./lib.mjs";
const fixture = JSON.parse(
  readFileSync("/tmp/qelvora-lane5-invite-fixture.json", "utf8"),
);
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
if (!process.argv.includes("--clipboard-only"))
  await step(
    "E5.6-database-outage",
    "invitation reads fail closed during database loss and recover",
    async () => {
      const read = () =>
        fetch(`http://127.0.0.1:56451/v1/growth/public/invites/${fixture.id}`, {
          signal: AbortSignal.timeout(3500),
        });
      expect((await read()).status === 200, "could not read before outage");
      let outcome;
      try {
        execFileSync("docker", ["pause", "qelvora-lane5-postgres"]);
        try {
          const r = await read();
          outcome = `HTTP ${r.status}`;
          expect(r.status >= 500, `outage returned ${r.status}`);
        } catch (error) {
          if (error.name !== "TimeoutError") throw error;
          outcome = "timeout without serving the invitation";
        }
      } finally {
        execFileSync("docker", ["unpause", "qelvora-lane5-postgres"]);
      }
      expect((await read()).status === 200, "did not recover");
      return `${outcome}, then recovered 200`;
    },
  );
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(30000);
try {
  await step(
    "E5.6-clipboard-retry",
    "a denied copy and a successful retry reuse one invitation at the active-link limit",
    async () => {
      // Free one test slot through the real owner action after a failed run.
      const active = (
        await db.query(
          "SELECT id FROM growth.invite WHERE created_by=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY expires_at DESC",
          [ACTORS.maya],
        )
      ).rows;
      if (active.length >= 20) {
        const owner = await signIn(
          "http://127.0.0.1:56451",
          ACTORS.maya,
          "/studio/ai",
        );
        const spare = active.find((row) => row.id !== fixture.id);
        const removed = await call(
          "http://127.0.0.1:56451",
          "DELETE",
          `/v1/growth/invites/${spare.id}`,
          { token: owner.token },
        );
        expect(removed.status === 200, removed.text);
      }
      await page.goto(`${web}/api/auth/continue?returnTo=%2Fstudio%2Flaunch`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.locator(`button[value="${ACTORS.maya}"]`).click();
      await page.waitForURL(
        (url) =>
          ["/onboarding/handle", "/studio/launch"].includes(url.pathname),
        { timeout: 90000 },
      );
      if (new URL(page.url()).pathname === "/onboarding/handle") {
        await page
          .getByRole("heading", {
            name: "How creators will know you",
            exact: true,
          })
          .waitFor({ timeout: 90000 });
        await page.waitForLoadState("networkidle");
        await page
          .getByLabel("Handle", { exact: true })
          .fill("maya_launch_fan");
        await page
          .getByRole("button", { name: "Continue", exact: true })
          .click();
      }
      const button = page.getByRole("button", {
        name: "Create and copy invitation",
        exact: true,
      });
      await button.waitFor({ timeout: 90000 });
      await page.waitForLoadState("networkidle");
      const cdp = await browser.newBrowserCDPSession();
      const { browserContextIds } = await cdp.send("Target.getBrowserContexts");
      expect(browserContextIds.length === 1, "unexpected browser context");
      await cdp.send("Browser.setPermission", {
        permission: { name: "clipboard-write" },
        setting: "denied",
        origin: web,
        browserContextId: browserContextIds[0],
      });
      const response = () =>
        page.waitForResponse(
          (r) =>
            r.request().method() === "POST" &&
            new URL(r.url()).pathname === "/api/growth/invites",
        );
      const [first] = await Promise.all([response(), button.click()]);
      expect(
        first.status() === 200,
        `first ${first.status()}: ${await first.text()}`,
      );
      const made = await first.json();
      await page
        .getByRole("status")
        .filter({ hasText: /denied|permission/i })
        .waitFor();
      await cdp.send("Browser.setPermission", {
        permission: { name: "clipboard-write" },
        setting: "granted",
        origin: web,
        browserContextId: browserContextIds[0],
      });
      const [second] = await Promise.all([response(), button.click()]);
      expect(
        second.status() === 200,
        `retry ${second.status()}: ${await second.text()}`,
      );
      expect(
        (await second.json()).id === made.id,
        "copy retry created another link",
      );
      await page
        .getByRole("status")
        .filter({ hasText: "Invitation copied. Expires" })
        .waitFor();
      const row = (
        await db.query(
          "SELECT count(*)::int AS n FROM growth.invite WHERE id=$1",
          [made.id],
        )
      ).rows[0];
      expect(row.n === 1, JSON.stringify(row));
      return "clipboard denied then granted; two web-proxy 200s reused one stored link";
    },
  );
} finally {
  await browser.close();
  await db.end();
}
process.exit(finish());

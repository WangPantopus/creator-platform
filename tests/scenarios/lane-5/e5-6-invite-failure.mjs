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
      const note = "Come talk pottery. 陶芸 <b>plain text</b> مرحبا 🧑🏽‍🎨";
      const input = page.getByLabel("Your invitation note (optional)", {
        exact: true,
      });
      await input.fill(note);
      expect(
        (await input.getAttribute("maxlength")) === "600",
        "missing 600-character form bound",
      );
      expect(
        await page
          .getByText(
            "This note is public to anyone with the link. Up to 600 characters.",
            { exact: true },
          )
          .isVisible(),
        "public note hint missing",
      );
      await page.screenshot({
        path: "/tmp/qelvora-lane5-invite-form.png",
        fullPage: true,
      });
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
          "SELECT count(*)::int AS n, min(note) AS note FROM growth.invite WHERE id=$1",
          [made.id],
        )
      ).rows[0];
      expect(row.n === 1 && row.note === note, JSON.stringify(row));
      const publicPage = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      await publicPage.goto(`${web}/invite/${made.id}`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      expect(
        (await publicPage
          .locator(".growth-invite .growth-voice")
          .first()
          .textContent()) === note,
        "form note differs on public invitation",
      );
      expect(
        (await publicPage.locator(".growth-invite .growth-voice b").count()) ===
          0,
        "form note rendered markup",
      );
      await publicPage.screenshot({
        path: "/tmp/qelvora-lane5-invite-form-public.png",
        fullPage: true,
      });
      await publicPage.close();
      return "clipboard denied then granted; two web-proxy 200s reused one stored link; approved form copy, exact stored/public Unicode note, plain markup and 600-character bound";
    },
  );
  await step(
    "E5.6-form-edit",
    "600-character input and editing after copy failure keep separate link contents",
    async () => {
      const owner = await signIn(
        "http://127.0.0.1:56451",
        ACTORS.maya,
        "/studio/launch",
      );
      const active = (
        await db.query(
          "SELECT id FROM growth.invite WHERE created_by=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY expires_at",
          [ACTORS.maya],
        )
      ).rows;
      for (const row of active
        .filter((row) => row.id !== fixture.id)
        .slice(0, 3)) {
        expect(
          (
            await call(
              "http://127.0.0.1:56451",
              "DELETE",
              `/v1/growth/invites/${row.id}`,
              { token: owner.token },
            )
          ).status === 200,
          "could not free own test slots",
        );
      }
      const input = page.getByLabel("Your invitation note (optional)", {
        exact: true,
      });
      const button = page.getByRole("button", {
        name: "Create and copy invitation",
        exact: true,
      });
      const cdp = await browser.newBrowserCDPSession();
      const { browserContextIds } = await cdp.send("Target.getBrowserContexts");
      await cdp.send("Browser.setPermission", {
        permission: { name: "clipboard-write" },
        setting: "denied",
        origin: web,
        browserContextId: browserContextIds[0],
      });
      const create = async () => {
        const [r] = await Promise.all([
          page.waitForResponse(
            (r) =>
              r.request().method() === "POST" &&
              new URL(r.url()).pathname === "/api/growth/invites",
          ),
          button.click(),
        ]);
        expect(
          r.status() === 200,
          `form create ${r.status()}: ${await r.text()}`,
        );
        await page.waitForFunction(() =>
          Array.from(document.querySelectorAll("button")).some(
            (button) =>
              button.textContent.trim() === "Create and copy invitation" &&
              !button.disabled,
          ),
        );
        return r.json();
      };
      await input.fill("a".repeat(620));
      expect(
        (await input.inputValue()).length === 600,
        "browser failed to enforce 600 limit",
      );
      const boundary = await create();
      await page
        .getByRole("status")
        .filter({ hasText: /denied|permission/i })
        .waitFor();
      const changed = "Changed after the copy failed. 陶芸";
      await input.fill(changed);
      const edit = await create();
      await page
        .getByRole("status")
        .filter({ hasText: /denied|permission/i })
        .waitFor();
      expect(
        boundary.id !== edit.id,
        "editing reused the old content-bound ID",
      );
      const rows = (
        await db.query(
          "SELECT id,note FROM growth.invite WHERE id=ANY($1::uuid[])",
          [[boundary.id, edit.id]],
        )
      ).rows;
      expect(
        rows.find((row) => row.id === boundary.id)?.note === "a".repeat(600),
        "old link words changed",
      );
      expect(
        rows.find((row) => row.id === edit.id)?.note === changed,
        "edited note not stored",
      );
      await cdp.send("Browser.setPermission", {
        permission: { name: "clipboard-write" },
        setting: "granted",
        origin: web,
        browserContextId: browserContextIds[0],
      });
      expect(
        (await create()).id === edit.id,
        "unchanged edited retry made another ID",
      );
      await page
        .getByRole("status")
        .filter({ hasText: "Invitation copied. Expires" })
        .waitFor();
      await input.fill("");
      const optional = await create();
      expect(
        (
          await db.query("SELECT note FROM growth.invite WHERE id=$1", [
            optional.id,
          ])
        ).rows[0].note === "",
        "optional empty note failed",
      );
      return "600 accepted; edit after failure made a distinct ID; unchanged retry reused it; blank note accepted";
    },
  );
  await step(
    "E5.6-create-failure",
    "a real database lock fails creation; the same form request succeeds once after release",
    async () => {
      const owner = await signIn(
        "http://127.0.0.1:56451",
        ACTORS.maya,
        "/studio/launch",
      );
      const spare = (
        await db.query(
          "SELECT id FROM growth.invite WHERE created_by=$1 AND revoked_at IS NULL AND expires_at>now() AND id<>$2 ORDER BY expires_at LIMIT 1",
          [ACTORS.maya, fixture.id],
        )
      ).rows[0];
      expect(
        (
          await call(
            "http://127.0.0.1:56451",
            "DELETE",
            `/v1/growth/invites/${spare.id}`,
            { token: owner.token },
          )
        ).status === 200,
        "could not free test slot",
      );
      const input = page.getByLabel("Your invitation note (optional)", {
        exact: true,
      });
      const button = page.getByRole("button", {
        name: "Create and copy invitation",
        exact: true,
      });
      await input.fill("Retry after the database is available. 陶芸");
      const response = () =>
        page.waitForResponse(
          (r) =>
            r.request().method() === "POST" &&
            new URL(r.url()).pathname === "/api/growth/invites",
          { timeout: 30000 },
        );
      const lock = await db.connect();
      let firstBody;
      try {
        await lock.query("BEGIN");
        await lock.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`growth.invites:${ACTORS.maya}`],
        );
        const [failed] = await Promise.all([response(), button.click()]);
        firstBody = failed.request().postDataJSON();
        expect(
          failed.status() === 503,
          `locked create ${failed.status()}: ${await failed.text()}`,
        );
        await page.waitForFunction(() =>
          Array.from(document.querySelectorAll("button")).some(
            (button) =>
              button.textContent.trim() === "Create and copy invitation" &&
              !button.disabled,
          ),
        );
        expect(
          (
            await db.query(
              "SELECT count(*)::int n FROM growth.invite WHERE id=$1",
              [firstBody.id],
            )
          ).rows[0].n === 0,
          "failed create persisted a link",
        );
      } finally {
        await lock.query("ROLLBACK");
        lock.release();
      }
      const [retried] = await Promise.all([response(), button.click()]);
      expect(
        retried.status() === 200,
        `retry ${retried.status()}: ${await retried.text()}`,
      );
      expect(
        JSON.stringify(retried.request().postDataJSON()) ===
          JSON.stringify(firstBody),
        "form retry changed ID or note",
      );
      const made = await retried.json();
      expect(made.id === firstBody.id, "server changed the retry ID");
      const rows = (
        await db.query("SELECT note FROM growth.invite WHERE id=$1", [made.id])
      ).rows;
      expect(
        rows.length === 1 && rows[0].note === firstBody.note,
        "retry lost or duplicated the public note",
      );
      return "real lock produced 503 and no row; same ID/note retried to 200 and one row";
    },
  );
} finally {
  await browser.close();
  await db.end();
}
process.exit(finish());

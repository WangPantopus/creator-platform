// Team triage is off for the pilot: the web Studio's Team screen offers Drafting,
// Publishing and Scheduling, never Triage, when Maya invites or edits a member,
// and a member who already holds Triage still displays with it. Run on a fresh
// stack, on its own or after team-triage-off.mjs:
//   node infra/local/stack.mjs up --lane N --base-port P
//   PILOT_BASE_PORT=P node tests/scenarios/pilot/team-triage-off-web.mjs [--shots DIR]
// The real web app in Chrome, the real backend and PostgreSQL. Fakes: the
// development identity, and a SQL row standing in for a membership made before
// triage went off. --shots saves the Team screen in Light and Night to DIR.
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  MAYA,
  WEB,
  account,
  expect,
  fan,
  finish,
  legacyMember,
  roles,
  run,
  step,
} from "./lib.mjs";

const { chromium } = createRequire(
  new URL("../../../package.json", import.meta.url),
)("@playwright/test");
const shots = process.argv.includes("--shots")
  ? process.argv[process.argv.indexOf("--shots") + 1]
  : null;
const TEAM = `/studio/${MAYA}/team`;
const SEEDED = account(4);

const two = await fan(2);
await legacyMember(2, ["drafter", "triage"]);
const browser = await chromium.launch({ channel: "chrome", headless: true });

/** Maya signed in on a phone-width page, on her current Team screen. */
async function team(night = false) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: night ? "dark" : "light",
  });
  const page = await context.newPage();
  await page.goto(`${WEB}/auth/continue?returnTo=${encodeURIComponent(TEAM)}`);
  await page.getByText("Continue with Pantopus").first().click();
  await page
    .getByRole("button", { name: "Development actor three", exact: true })
    .click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), {
    timeout: 60_000,
  });
  if (new URL(page.url()).pathname === "/onboarding/handle") {
    await page.locator("#handle").fill(`pilot3${run}`);
    await page.locator("button.handle-continue").click();
    await page.waitForURL((u) => u.pathname !== "/onboarding/handle");
  }
  if (new URL(page.url()).pathname !== TEAM) await page.goto(WEB + TEAM);
  await page
    .getByRole("button", { name: `Edit roles for ${SEEDED}` })
    .waitFor({ timeout: 30_000 });
  return page;
}
const choices = (fieldset) =>
  fieldset.locator("label.w5-check strong").allTextContents();

const page = await team();
await step(
  "W1",
  "the invitation form offers Drafting, Publishing and Scheduling, never Triage",
  async () => {
    const invite = page.locator("fieldset", {
      has: page.getByText("Invite a team member", { exact: true }),
    });
    const offered = await choices(invite);
    expect(
      offered.join("|") === "Drafting|Publishing|Scheduling",
      `offered ${offered.join(", ")}`,
    );
    expect(
      (await page.getByText("Triage", { exact: true }).count()) === 0 &&
        (await page.getByText("Reads and routes the queue").count()) === 0,
      "a Triage choice is on the page",
    );
    return offered.join(", ");
  },
);
await step(
  "W2",
  "the seeded member who holds Triage still displays with it",
  async () => {
    const row = page.locator(".w5-team-member", { hasText: SEEDED });
    const shown = (await row.locator("p").first().textContent()) ?? "";
    expect(shown.split(" · ").includes("triage"), `shows "${shown}"`);
    return `"${SEEDED}" shows "${shown}"`;
  },
);
if (shots)
  await page.screenshot({
    path: join(shots, "web-team-light.png"),
    fullPage: true,
  });
await step(
  "W3",
  "editing that member offers no Triage and starts from the roles it can keep",
  async () => {
    await page
      .getByRole("button", { name: `Edit roles for ${SEEDED}` })
      .click();
    const editor = page.locator("fieldset", {
      has: page.getByText(`Review roles for ${SEEDED}`, { exact: true }),
    });
    await editor.waitFor();
    const offered = await choices(editor);
    expect(
      offered.join("|") === "Drafting|Publishing|Scheduling",
      `offered ${offered.join(", ")}`,
    );
    const checked = [];
    for (const label of offered)
      if (
        await editor
          .getByRole("checkbox", { name: `${label} role for ${SEEDED}` })
          .isChecked()
      )
        checked.push(label);
    expect(checked.join("|") === "Drafting|Publishing", `checked ${checked}`);
    const reviewed = await editor.getByText("Reviewed roles:").textContent();
    expect(reviewed.includes("triage"), `"${reviewed}"`);
    if (shots)
      await editor.screenshot({ path: join(shots, "web-editor-light.png") });
    await editor.getByRole("button", { name: "Close role editor" }).click();
    return `offered ${offered.join(", ")}; checked ${checked.join(", ")}; "${reviewed}"`;
  },
);
await step(
  "W4",
  "saving a member who holds Triage drops it, and the server accepts the change",
  async () => {
    const label = `@${two.handle}`;
    await page.getByRole("button", { name: "Refresh team" }).click();
    const edit = page.getByRole("button", { name: `Edit roles for ${label}` });
    await edit.waitFor();
    await page.waitForFunction(
      (name) =>
        [...document.querySelectorAll("button")].some(
          (b) => b.getAttribute("aria-label") === name && !b.disabled,
        ),
      `Edit roles for ${label}`,
    );
    await edit.click();
    await page
      .getByRole("checkbox", { name: `Scheduling role for ${label}` })
      .check();
    await page.getByRole("button", { name: "Save roles" }).click();
    await page
      .getByText("Role change saved. Current access is being checked.")
      .waitFor({ timeout: 30_000 });
    const now = await roles(2);
    expect(now === "drafter,scheduler", `roles became ${now}`);
    const row = page.locator(".w5-team-member", { hasText: label });
    await row.getByText("drafter · scheduler").waitFor({ timeout: 30_000 });
    return `saved ${now}`;
  },
);
if (shots) {
  const night = await team(true);
  await night.screenshot({
    path: join(shots, "web-team-night.png"),
    fullPage: true,
  });
}
await finish(browser);

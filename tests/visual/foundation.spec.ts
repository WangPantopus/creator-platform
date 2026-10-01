import { test, expect } from "@playwright/test";
const origin = process.env.VISUAL_APP_ORIGIN ?? "http://localhost:3000";
const referenceOrigin =
  process.env.VISUAL_REFERENCE_ORIGIN ?? "http://127.0.0.1:3101";

// Approved artboards are catalog fixtures. Runtime routes depend on real public
// creator/arrival authority and must never fabricate Maya to satisfy snapshots.
const foundations = [
  {
    name: "welcome",
    group: "phase4a-fan-core",
    id: "Welcome",
    path: "/design/screens/phase4a-fan-core/Welcome?raw=1",
    width: 390,
    height: 844,
  },
  {
    name: "creator-home",
    group: "phase4a-fan-core",
    id: "Main",
    path: "/design/screens/phase4a-fan-core/Main?raw=1",
    width: 390,
    height: 1560,
  },
  {
    name: "handle-preview",
    group: "phase4a-fan-core",
    id: "Handle",
    path: "/design/screens/phase4a-fan-core/Handle?raw=1",
    width: 390,
    height: 844,
  },
];
for (const theme of ["light", "night"] as const)
  for (const screen of foundations) {
    test(`${screen.name} catalog matches approved design in ${theme}`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({
        width: screen.width,
        height: screen.height,
      });
      await page.emulateMedia({
        colorScheme: theme === "night" ? "dark" : "light",
      });
      const reference = await context.newPage();
      await reference.setViewportSize({
        width: screen.width,
        height: screen.height,
      });
      await reference.goto(
        `${referenceOrigin}/${screen.group}/${screen.id}.dc.html`,
      );
      await reference.locator("x-dc").getByRole("heading").first().waitFor();
      await reference.evaluate((mode) => {
        document.documentElement.dataset.theme = mode;
      }, theme);
      await reference.evaluate(() => document.fonts.ready);
      const expected = await reference.screenshot({
        animations: "disabled",
        caret: "initial",
      });
      expect(expected).toMatchSnapshot(`${screen.name}.${theme}.png`, {
        maxDiffPixels: 0,
      });
      await page.goto(
        `${origin}${screen.path}${screen.path.includes("?") ? "&" : "?"}theme=${theme}`,
      );
      await page.getByRole("heading").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `test-results/${screen.name}-${theme}-implementation.png`,
        animations: "disabled",
        caret: "initial",
      });
      const actual = await page.screenshot({
        animations: "disabled",
        caret: "initial",
      });
      await test
        .info()
        .attach("implementation", { body: actual, contentType: "image/png" });
      await test
        .info()
        .attach("reference", { body: expected, contentType: "image/png" });
      expect(
        Buffer.compare(actual, expected),
        "Implementation pixels must match the independent reference exactly",
      ).toBe(0);
      await reference.close();
    });
  }
test("unconfigured Pantopus sign-in does not create a local identity and preserves arrival", async ({
  page,
}) => {
  await page.goto(`${origin}/auth/continue`);
  await expect(
    page.getByRole("button", {
      name: "Remove this post from your first message",
    }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Continue with Pantopus", exact: true })
    .click();
  await expect(page).toHaveURL(/error=identity_unconfigured/);
  await expect(page.getByRole("alert")).toContainText("Pantopus sign-in");
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/home");
  await page.goto(
    `${origin}/auth/continue?returnTo=%2Fcreators%2Fmaya%2Frequests`,
  );
  await page
    .getByRole("link", { name: "Continue with Pantopus", exact: true })
    .click();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(
    "/creators/maya/requests",
  );
  await page.goto(`${origin}/onboarding/handle`);
  await expect(page).toHaveURL(/auth\/continue/);
});

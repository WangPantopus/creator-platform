import { visualWebURL, visualReferenceURL } from "../../playwright.config";
import { test, expect } from "@playwright/test";
import { compareCatalog } from "./compare";
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
    test(`${screen.name} design preview preserves the source in ${theme}`, async ({
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
        `${visualReferenceURL}/${screen.group}/${screen.id}.dc.html`,
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
        // Allow two isolated rasterization pixels across Chromium host builds.
        // The fresh source/implementation comparison below remains stricter.
        maxDiffPixels: 2,
      });
      await page.goto(
        `${visualWebURL}${screen.path}${screen.path.includes("?") ? "&" : "?"}theme=${theme}`,
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
      // Compare decoded pixels rather than PNG compression/metadata bytes.
      // Keep the same narrow renderer-rounding bounds as the full catalog.
      const comparison = compareCatalog(actual, expected);
      expect(comparison.maxChannelDelta).toBeLessThanOrEqual(2);
      expect(comparison.pixels).toBeLessThanOrEqual(64);
      await reference.close();
    });
  }
test("unconfigured Pantopus sign-in does not create a local identity and preserves arrival", async ({
  page,
}) => {
  await page.goto(`${visualWebURL}/auth/continue`);
  await page
    .getByRole("link", { name: "Continue with Pantopus", exact: true })
    .click();
  await expect(page).toHaveURL(/error=identity_unconfigured/);
  await expect(page.getByRole("alert")).toContainText("Pantopus sign-in");
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/home");
  await page.goto(
    `${visualWebURL}/auth/continue?returnTo=%2Fcreators%2Fmaya%2Frequests`,
  );
  await page
    .getByRole("link", { name: "Continue with Pantopus", exact: true })
    .click();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(
    "/creators/maya/requests",
  );
  await page.goto(`${visualWebURL}/onboarding/handle`);
  await expect(page).toHaveURL(/auth\/continue/);
});

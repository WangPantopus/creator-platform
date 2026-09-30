import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { compareCatalog } from "./compare";
const origin = `http://localhost:${process.env.WEB_VISUAL_PORT ?? 3000}`;
const referenceOrigin = `http://127.0.0.1:${process.env.REFERENCE_PORT ?? 3101}`;
const design = path.join(process.cwd(), "design");
const groups = [
  "phase4a-fan-core",
  "phase4b-fan-account",
  "phase4c-studio-phone",
  "phase4d-studio-desktop",
  "phase4e-4i",
  "phase5-prototypes",
];
const screens = groups.flatMap((group) => {
  const canvas = JSON.parse(
    fs.readFileSync(path.join(design, group, "canvas.json"), "utf8"),
  ) as { order: string[]; boards: Record<string, { w: number; h: number }> };
  return canvas.order.map((file) => ({ group, file, ...canvas.boards[file]! }));
});
for (const theme of ["light", "night"] as const) {
  test(`${process.env.VISUAL_SCREENS ?? "all 64 exported screens"} preserve the reference in ${theme}`, async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    const reference = await context.newPage();
    for (const screen of screens.filter(
      (screen) =>
        !process.env.VISUAL_SCREENS ||
        process.env.VISUAL_SCREENS.split(",").includes(
          screen.file.replace(".dc.html", ""),
        ),
    )) {
      const errors: string[] = [];
      const capture = (error: Error) => errors.push(error.message);
      page.on("pageerror", capture);
      await page.setViewportSize({ width: screen.w, height: screen.h });
      await reference.setViewportSize({ width: screen.w, height: screen.h });
      await reference.goto(
        `${referenceOrigin}/${screen.group}/${screen.file}?step=${process.env.VISUAL_STEP ?? 0}`,
      );
      await reference.locator("x-dc > div").first().waitFor();
      await reference.evaluate((mode) => {
        document.documentElement.dataset.theme = mode;
      }, theme);
      await reference.evaluate(() => document.fonts.ready);
      // Hiding the caret mutates inline styles and can race React hydration.
      const expected = await reference.screenshot({
        animations: "disabled",
        caret: "initial",
      });
      await page.goto(
        `${origin}/design/screens/${screen.group}/${screen.file.replace(".dc.html", "")}?raw=1&theme=${theme}&step=${process.env.VISUAL_STEP ?? 0}`,
      );
      await page.locator(".preview-board > div").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      expect(
        errors,
        `${screen.file} must render without client errors`,
      ).toEqual([]);
      const actual = await page.screenshot({
        animations: "disabled",
        caret: "initial",
      });
      const comparison = compareCatalog(actual, expected);
      if (comparison.pixels !== 0) {
        await test.info().attach(`${screen.file}-implementation`, {
          body: actual,
          contentType: "image/png",
        });
        await test.info().attach(`${screen.file}-reference`, {
          body: expected,
          contentType: "image/png",
        });
        await test.info().attach(`${screen.file}-rounding-diff`, {
          body: comparison.diff,
          contentType: "image/png",
        });
        await test.info().attach(`${screen.file}-rounding-count`, {
          body: Buffer.from(
            JSON.stringify({
              pixels: comparison.pixels,
              maxChannelDelta: comparison.maxChannelDelta,
            }),
          ),
          contentType: "application/json",
        });
      }
      expect
        .soft(
          comparison.maxChannelDelta,
          `${screen.group}/${screen.file} channel delta in ${theme}`,
        )
        .toBeLessThanOrEqual(2);
      expect
        .soft(
          comparison.pixels,
          `${screen.group}/${screen.file} differing pixels in ${theme}`,
        )
        .toBeLessThanOrEqual(64);
      page.off("pageerror", capture);
    }
    await reference.close();
  });
  test(`${process.env.VISUAL_COMPONENT ?? "all 53 component compositions"} preserves the reference in ${theme}`, async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 920, height: 1800 });
    const reference = await context.newPage();
    await reference.setViewportSize({ width: 920, height: 1800 });
    const components = fs
      .readdirSync(path.join(design, "design-system/project/components"))
      .filter(
        (name) =>
          name !== "Cover" &&
          fs.existsSync(
            path.join(
              design,
              "design-system/project/components",
              name,
              "preview.html",
            ),
          ),
      );
    expect(components).toHaveLength(53);
    for (const name of components.filter(
      (name) =>
        !process.env.VISUAL_COMPONENT || name === process.env.VISUAL_COMPONENT,
    )) {
      await reference.goto(`${referenceOrigin}/component/${name}`);
      await reference.locator("#root > *").first().waitFor();
      await reference.evaluate((mode) => {
        document.documentElement.dataset.theme = mode;
      }, theme);
      await reference.evaluate(() => document.fonts.ready);
      const expected = await reference.screenshot({
        animations: "disabled",
        caret: "initial",
        fullPage: true,
      });
      await page.goto(
        `${origin}/design/components/${name}?raw=1&theme=${theme}`,
      );
      await page.locator("main > div > *").first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      const actual = await page.screenshot({
        animations: "disabled",
        caret: "initial",
        fullPage: true,
      });
      const comparison = compareCatalog(actual, expected);
      if (comparison.pixels !== 0) {
        await test.info().attach(`${name}-implementation`, {
          body: actual,
          contentType: "image/png",
        });
        await test.info().attach(`${name}-reference`, {
          body: expected,
          contentType: "image/png",
        });
        await test.info().attach(`${name}-rounding-diff`, {
          body: comparison.diff,
          contentType: "image/png",
        });
        await test.info().attach(`${name}-rounding-count`, {
          body: Buffer.from(
            JSON.stringify({
              pixels: comparison.pixels,
              maxChannelDelta: comparison.maxChannelDelta,
            }),
          ),
          contentType: "application/json",
        });
      }
      expect
        .soft(comparison.maxChannelDelta, `${name} channel delta in ${theme}`)
        .toBeLessThanOrEqual(2);
      expect
        .soft(comparison.pixels, `${name} differing pixels in ${theme}`)
        .toBeLessThanOrEqual(64);
    }
    await reference.close();
  });
}

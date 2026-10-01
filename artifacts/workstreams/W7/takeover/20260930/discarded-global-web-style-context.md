# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: catalog.spec.ts >> all 64 exported screens preserve the reference in light
- Location: tests/visual/catalog.spec.ts:23:7

# Error details

```
Error: phase4a-fan-core/Invite.dc.html channel delta in light

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 2
Received:    216
```

```
Error: phase4a-fan-core/Invite.dc.html differing pixels in light

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 64
Received:    19172
```

# Page snapshot

```yaml
- generic [active] [ref=f63e1]:
  - main [ref=f63e2]:
    - generic [ref=f63e4]:
      - generic [ref=f63e5]:
        - generic [ref=f63e6]: T-21 · CARD 1 OF 4 · 0 RIGHT
        - button "Restart" [ref=f63e7] [cursor=pointer]
      - generic [ref=f63e8]:
        - heading "Who wrote this message?" [level=1] [ref=f63e9]
        - paragraph [ref=f63e10]: Answer within a second. The pass bar is the one set for T-21 in the source docs.
        - generic [ref=f63e11]:
          - generic [ref=f63e12]: Maya's AI
          - generic [ref=f63e18]: Crawling usually means the coat is too thick.
        - generic [ref=f63e20]:
          - button "Maya's AI" [ref=f63e21] [cursor=pointer]
          - button "AI, approved by Maya" [ref=f63e22] [cursor=pointer]
          - button "Maya herself" [ref=f63e23] [cursor=pointer]
          - button "Maya's team" [ref=f63e24] [cursor=pointer]
  - alert [ref=f63e25]
```

# Test source

```ts
  2   | import path from "node:path";
  3   | import { test, expect } from "@playwright/test";
  4   | import { compareCatalog } from "./compare";
  5   | const origin = `http://localhost:${process.env.WEB_VISUAL_PORT ?? 3000}`;
  6   | const referenceOrigin = `http://127.0.0.1:${process.env.REFERENCE_PORT ?? 3101}`;
  7   | const design = path.join(process.cwd(), "design");
  8   | const groups = [
  9   |   "phase4a-fan-core",
  10  |   "phase4b-fan-account",
  11  |   "phase4c-studio-phone",
  12  |   "phase4d-studio-desktop",
  13  |   "phase4e-4i",
  14  |   "phase5-prototypes",
  15  | ];
  16  | const screens = groups.flatMap((group) => {
  17  |   const canvas = JSON.parse(
  18  |     fs.readFileSync(path.join(design, group, "canvas.json"), "utf8"),
  19  |   ) as { order: string[]; boards: Record<string, { w: number; h: number }> };
  20  |   return canvas.order.map((file) => ({ group, file, ...canvas.boards[file]! }));
  21  | });
  22  | for (const theme of ["light", "night"] as const) {
  23  |   test(`${process.env.VISUAL_SCREENS ?? "all 64 exported screens"} preserve the reference in ${theme}`, async ({
  24  |     page,
  25  |     context,
  26  |   }) => {
  27  |     test.setTimeout(180_000);
  28  |     const reference = await context.newPage();
  29  |     for (const screen of screens.filter(
  30  |       (screen) =>
  31  |         !process.env.VISUAL_SCREENS ||
  32  |         process.env.VISUAL_SCREENS.split(",").includes(
  33  |           screen.file.replace(".dc.html", ""),
  34  |         ),
  35  |     )) {
  36  |       const errors: string[] = [];
  37  |       const capture = (error: Error) => errors.push(error.message);
  38  |       page.on("pageerror", capture);
  39  |       await page.setViewportSize({ width: screen.w, height: screen.h });
  40  |       await reference.setViewportSize({ width: screen.w, height: screen.h });
  41  |       await reference.goto(
  42  |         `${referenceOrigin}/${screen.group}/${screen.file}?step=${process.env.VISUAL_STEP ?? 0}`,
  43  |       );
  44  |       await reference.locator("x-dc > div").first().waitFor();
  45  |       await reference.evaluate((mode) => {
  46  |         document.documentElement.dataset.theme = mode;
  47  |       }, theme);
  48  |       await reference.evaluate(() => document.fonts.ready);
  49  |       // Hiding the caret mutates inline styles and can race React hydration.
  50  |       const expected = await reference.screenshot({
  51  |         animations: "disabled",
  52  |         caret: "initial",
  53  |       });
  54  |       await page.goto(
  55  |         `${origin}/design/screens/${screen.group}/${screen.file.replace(".dc.html", "")}?raw=1&theme=${theme}&step=${process.env.VISUAL_STEP ?? 0}`,
  56  |       );
  57  |       await page.locator(".preview-board > div").first().waitFor();
  58  |       await page.evaluate(() => document.fonts.ready);
  59  |       expect(
  60  |         errors,
  61  |         `${screen.file} must render without client errors`,
  62  |       ).toEqual([]);
  63  |       const actual = await page.screenshot({
  64  |         animations: "disabled",
  65  |         caret: "initial",
  66  |       });
  67  |       const comparison = compareCatalog(actual, expected);
  68  |       if (comparison.pixels !== 0) {
  69  |         await test.info().attach(`${screen.file}-implementation`, {
  70  |           body: actual,
  71  |           contentType: "image/png",
  72  |         });
  73  |         await test.info().attach(`${screen.file}-reference`, {
  74  |           body: expected,
  75  |           contentType: "image/png",
  76  |         });
  77  |         await test.info().attach(`${screen.file}-rounding-diff`, {
  78  |           body: comparison.diff,
  79  |           contentType: "image/png",
  80  |         });
  81  |         await test.info().attach(`${screen.file}-rounding-count`, {
  82  |           body: Buffer.from(
  83  |             JSON.stringify({
  84  |               pixels: comparison.pixels,
  85  |               maxChannelDelta: comparison.maxChannelDelta,
  86  |             }),
  87  |           ),
  88  |           contentType: "application/json",
  89  |         });
  90  |       }
  91  |       expect
  92  |         .soft(
  93  |           comparison.maxChannelDelta,
  94  |           `${screen.group}/${screen.file} channel delta in ${theme}`,
  95  |         )
  96  |         .toBeLessThanOrEqual(2);
  97  |       expect
  98  |         .soft(
  99  |           comparison.pixels,
  100 |           `${screen.group}/${screen.file} differing pixels in ${theme}`,
  101 |         )
> 102 |         .toBeLessThanOrEqual(64);
      |          ^ Error: phase4a-fan-core/Invite.dc.html differing pixels in light
  103 |       page.off("pageerror", capture);
  104 |     }
  105 |     await reference.close();
  106 |   });
  107 |   test(`${process.env.VISUAL_COMPONENT ?? "all 53 component compositions"} preserves the reference in ${theme}`, async ({
  108 |     page,
  109 |     context,
  110 |   }) => {
  111 |     test.setTimeout(180_000);
  112 |     await page.setViewportSize({ width: 920, height: 1800 });
  113 |     const reference = await context.newPage();
  114 |     await reference.setViewportSize({ width: 920, height: 1800 });
  115 |     const components = fs
  116 |       .readdirSync(path.join(design, "design-system/project/components"))
  117 |       .filter(
  118 |         (name) =>
  119 |           name !== "Cover" &&
  120 |           fs.existsSync(
  121 |             path.join(
  122 |               design,
  123 |               "design-system/project/components",
  124 |               name,
  125 |               "preview.html",
  126 |             ),
  127 |           ),
  128 |       );
  129 |     expect(components).toHaveLength(53);
  130 |     for (const name of components.filter(
  131 |       (name) =>
  132 |         !process.env.VISUAL_COMPONENT || name === process.env.VISUAL_COMPONENT,
  133 |     )) {
  134 |       await reference.goto(`${referenceOrigin}/component/${name}`);
  135 |       await reference.locator("#root > *").first().waitFor();
  136 |       await reference.evaluate((mode) => {
  137 |         document.documentElement.dataset.theme = mode;
  138 |       }, theme);
  139 |       await reference.evaluate(() => document.fonts.ready);
  140 |       const expected = await reference.screenshot({
  141 |         animations: "disabled",
  142 |         caret: "initial",
  143 |         fullPage: true,
  144 |       });
  145 |       await page.goto(
  146 |         `${origin}/design/components/${name}?raw=1&theme=${theme}`,
  147 |       );
  148 |       await page.locator("main > div > *").first().waitFor();
  149 |       await page.evaluate(() => document.fonts.ready);
  150 |       const actual = await page.screenshot({
  151 |         animations: "disabled",
  152 |         caret: "initial",
  153 |         fullPage: true,
  154 |       });
  155 |       const comparison = compareCatalog(actual, expected);
  156 |       if (comparison.pixels !== 0) {
  157 |         await test.info().attach(`${name}-implementation`, {
  158 |           body: actual,
  159 |           contentType: "image/png",
  160 |         });
  161 |         await test.info().attach(`${name}-reference`, {
  162 |           body: expected,
  163 |           contentType: "image/png",
  164 |         });
  165 |         await test.info().attach(`${name}-rounding-diff`, {
  166 |           body: comparison.diff,
  167 |           contentType: "image/png",
  168 |         });
  169 |         await test.info().attach(`${name}-rounding-count`, {
  170 |           body: Buffer.from(
  171 |             JSON.stringify({
  172 |               pixels: comparison.pixels,
  173 |               maxChannelDelta: comparison.maxChannelDelta,
  174 |             }),
  175 |           ),
  176 |           contentType: "application/json",
  177 |         });
  178 |       }
  179 |       expect
  180 |         .soft(comparison.maxChannelDelta, `${name} channel delta in ${theme}`)
  181 |         .toBeLessThanOrEqual(2);
  182 |       expect
  183 |         .soft(comparison.pixels, `${name} differing pixels in ${theme}`)
  184 |         .toBeLessThanOrEqual(64);
  185 |     }
  186 |     await reference.close();
  187 |   });
  188 | }
  189 | 
```
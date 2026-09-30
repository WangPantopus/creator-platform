import { defineConfig } from "@playwright/test";
const webOrigin = process.env.VISUAL_WEB_ORIGIN ?? "http://localhost:3000";
const referenceOrigin =
  process.env.VISUAL_REFERENCE_ORIGIN ?? "http://127.0.0.1:3101";
export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: false,
  workers: 1,
  snapshotPathTemplate: "{testDir}/baselines/{arg}{ext}",
  use: {
    browserName: "chromium",
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    headless: true,
  },
  webServer: [
    {
      command: "node scripts/visual-reference.mjs",
      url: `${referenceOrigin}/phase4a-fan-core/Welcome.dc.html`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm --filter @qelvora/web exec next dev -p ${new URL(webOrigin).port || 3000} --hostname localhost`,
      url: `${webOrigin}/auth/continue`,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
  reporter: [["list"], ["html", { open: "never" }]],
});

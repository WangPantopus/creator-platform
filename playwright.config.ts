import { defineConfig } from "@playwright/test";
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
      url: "http://127.0.0.1:3101/phase4a-fan-core/Welcome.dc.html",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm --filter @qelvora/web dev",
      url: "http://localhost:3000/auth/continue",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
  reporter: [["list"], ["html", { open: "never" }]],
});

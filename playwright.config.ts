import { defineConfig } from "@playwright/test";
const port = Number(process.env.CREATOR_VISUAL_PORT ?? 3000);
const referencePort = Number(process.env.REFERENCE_PORT ?? 3101);
const origin = `http://localhost:${port}`;
export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: false,
  workers: 1,
  snapshotPathTemplate: "{testDir}/baselines/{arg}{ext}",
  use: {
    baseURL: origin,
    browserName: "chromium",
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    headless: true,
  },
  webServer: [
    {
      command: "node scripts/visual-reference.mjs",
      url: `http://127.0.0.1:${referencePort}/phase4a-fan-core/Welcome.dc.html`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm --filter @qelvora/web exec next dev --port ${port}`,
      url: `${origin}/auth/continue`,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
  reporter: [["list"], ["html", { open: "never" }]],
});

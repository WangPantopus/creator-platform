import { defineConfig } from "@playwright/test";
const appOrigin = process.env.VISUAL_APP_ORIGIN ?? "http://localhost:3000";
const appPort = Number(new URL(appOrigin).port || 80);
const referenceOrigin =
  process.env.VISUAL_REFERENCE_ORIGIN ?? "http://127.0.0.1:3101";
const referencePort = Number(new URL(referenceOrigin).port || 80);
export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: false,
  workers: 1,
  snapshotPathTemplate: "{testDir}/baselines/{arg}{ext}",
  use: {
    baseURL: appOrigin,
    browserName: "chromium",
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    headless: true,
  },
  webServer: [
    {
      command: `node scripts/visual-reference.mjs`,
      env: { REFERENCE_PORT: String(referencePort) },
      url: `${referenceOrigin}/phase4a-fan-core/Welcome.dc.html`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm --filter @qelvora/web exec next dev --webpack -p ${appPort}`,
      url: `${appOrigin}/auth/continue`,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
  reporter: [["list"], ["html", { open: "never" }]],
});

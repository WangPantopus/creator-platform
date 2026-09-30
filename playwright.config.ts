import { defineConfig } from "@playwright/test";
const webPort = Number(process.env.WEB_VISUAL_PORT ?? 3000);
const referencePort = Number(process.env.REFERENCE_PORT ?? 3101);
for (const port of [webPort, referencePort])
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Visual checks require valid, separately leased ports.");
const webOrigin = `http://localhost:${webPort}`;
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
      url: `http://127.0.0.1:${referencePort}/phase4a-fan-core/Welcome.dc.html`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm --filter @qelvora/web exec next dev -p ${webPort}`,
      url: `${webOrigin}/auth/continue`,
      env: {
        WEB_ORIGIN: webOrigin,
        QELVORA_PUBLIC_ORIGIN: "",
        QELVORA_API_URL: "",
        QELVORA_GROWTH_API_URL: "",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
  reporter: [["list"], ["html", { open: "never" }]],
});

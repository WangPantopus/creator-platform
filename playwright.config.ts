import { defineConfig } from "@playwright/test";
const webPort = Number(process.env.CREATOR_VISUAL_WEB_PORT ?? 3000);
const referencePort = Number(process.env.REFERENCE_PORT ?? 3101);
for (const port of [webPort, referencePort])
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Visual checks require a valid unprivileged port.");
export const visualWebURL = `http://localhost:${webPort}`;
export const visualReferenceURL = `http://127.0.0.1:${referencePort}`;
export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: false,
  workers: 1,
  snapshotPathTemplate: "{testDir}/baselines/{arg}{ext}",
  use: {
    baseURL: visualWebURL,
    browserName: "chromium",
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    headless: true,
  },
  webServer: [
    {
      command: "node scripts/visual-reference.mjs",
      url: `${visualReferenceURL}/phase4a-fan-core/Welcome.dc.html`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm --filter @qelvora/web exec next dev -p ${webPort}`,
      url: `${visualWebURL}/auth/continue`,
      env: { QELVORA_API_URL: "" },
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
  reporter: [["list"], ["html", { open: "never" }]],
});

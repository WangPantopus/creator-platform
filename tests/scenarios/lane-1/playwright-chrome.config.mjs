// Runs existing Playwright suites against a running lane stack with the
// system Chrome (no browser download), e.g. the auth contract:
//   VISUAL_APP_ORIGIN=http://localhost:56412 pnpm exec playwright test \
//     -c tests/scenarios/lane-1/playwright-chrome.config.mjs auth-contract
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../../visual",
  workers: 1,
  use: {
    baseURL: process.env.VISUAL_APP_ORIGIN,
    browserName: "chromium",
    channel: "chrome",
    headless: true,
  },
});

// E4.9 in a real browser: the fan reads each offer's delivery window in words.
// A 1-hour offer says "Within 1 hour or a full refund" on Maya's access screen
// ("By request") and in the request form's choice of how she answers; a 72-hour
// offer still says "Within 72 hours". System Chrome through Playwright with a
// throwaway profile; needs the stack's web app. Fakes: development identity,
// software passkey (no card is used).
//   node tests/scenarios/lane-4/e4-9-offer-hours-web.mjs
import { chromium } from "@playwright/test";
import {
  ACCOUNT,
  CREATOR,
  ORIGIN,
  asCreator,
  asFan,
  expect,
  finish,
  offer,
  pauseOffer,
  step,
} from "./lib.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
await asFan(ACCOUNT.fanTwo);
// Titles unique to this run: earlier runs leave their offers paused, and the
// request form lists paused offers too.
const run = Date.now().toString(36).slice(-5);
const offers = [
  {
    hours: 1,
    title: `Quick look ${run}`,
    rule: "Within 1 hour or a full refund · 5 of 5 left this week",
  },
  {
    hours: 72,
    title: `Written reply ${run}`,
    rule: "Within 72 hours or a full refund · 5 of 5 left this week",
  },
];
for (const o of offers)
  o.mode = (
    await offer(maya, {
      title: o.title,
      amount: 3100,
      deliveryHours: o.hours,
      weeklyLimit: 5,
    })
  ).body;
const shown = (said) => said.map((s) => `"${s}"`).join(" / ");

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext({
    locale: "en-US",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/auth/continue?returnTo=%2Fcommerce%2Frequests`);
  await page.getByRole("link", { name: "Continue with Pantopus" }).click();
  await page
    .getByRole("button", { name: "Development actor two", exact: true })
    .click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 60000,
  });
  await step(
    "E4.9-W1",
    "Maya's access screen: a 1-hour offer reads 'Within 1 hour'; 72 hours as before",
    async () => {
      await page.goto(`${ORIGIN}/commerce/access?creatorId=${CREATOR.maya}`);
      const said = [];
      for (const o of offers) {
        const card = page.locator("section.commerce-card", {
          has: page.getByRole("heading", { name: o.title, exact: true }),
        });
        await card.waitFor({ timeout: 60000 });
        said.push((await card.locator("p").innerText()).trim());
      }
      expect(
        JSON.stringify(said) === JSON.stringify(offers.map((o) => o.rule)),
        shown(said),
      );
      return shown(said);
    },
  );
  await step(
    "E4.9-W2",
    "the request form's choice of how Maya answers says the same",
    async () => {
      await page.goto(`${ORIGIN}/commerce/packet?creatorId=${CREATOR.maya}`);
      const said = [];
      for (const o of offers) {
        const choice = page.locator("label.qv-mode", {
          has: page.locator(".qv-mode__title", { hasText: o.title }),
        });
        await choice.waitFor({ timeout: 60000 });
        said.push((await choice.locator(".qv-mode__meta").innerText()).trim());
      }
      expect(
        JSON.stringify(said) === JSON.stringify(offers.map((o) => o.rule)),
        shown(said),
      );
      return shown(said);
    },
  );
} finally {
  await browser.close();
  for (const o of offers) await pauseOffer(maya, o.mode.id);
}
await finish();

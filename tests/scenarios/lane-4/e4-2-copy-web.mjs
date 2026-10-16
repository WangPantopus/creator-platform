// E4.2 in a real browser, and the creator's Offers page: the copy the founder
// approved for WP 4.12 (decisions 6 and 7, 2026-10-16). After "Let AI answer"
// the fan reads "Maya suggests asking Maya's AI · nothing charged", with an
// "Ask Maya's AI" button that opens their conversation with her; a plain
// decline still reads "passed on this one", with no button; while a question
// waits, the step reads "Answer by". Maya's Offers table says the refund rule in
// one "Delivery" column ("Within 3 days of accepting, or a full refund"). In
// Night, and 320 CSS pixels wide (a 200% text zoom on a phone-sized window),
// nothing is cut off. System Chrome through Playwright with throwaway profiles;
// needs the stack's web app. Fakes: card processor, development identity,
// software passkey.
//   node tests/scenarios/lane-4/e4-2-copy-web.mjs
import { chromium } from "@playwright/test";
import {
  ACCOUNT,
  CREATOR,
  ORIGIN,
  asCreator,
  asFan,
  decide,
  expect,
  finish,
  http,
  key,
  offer,
  setLimit,
  step,
  submit,
  withdraw,
} from "./lib.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const offers = [
  {
    body: { title: "Written reply (3 days)", amount: 5000, deliveryHours: 72 },
    rule: "Within 3 days of accepting, or a full refund",
  },
  {
    body: { title: "Quick look (1 hour)", amount: 3100, deliveryHours: 1 },
    rule: "Within 1 hour of accepting, or a full refund",
  },
  {
    body: {
      title: "Written reply (36 hours)",
      amount: 3200,
      deliveryHours: 36,
    },
    rule: "Within 36 hours of accepting, or a full refund",
  },
];
for (const o of offers)
  o.mode = (await offer(maya, { ...o.body, weeklyLimit: 5 })).body;
const decided = async (action, extra = {}) => {
  const id = (await submit(fan, offers[0].mode)).body.packet.id;
  const done = await decide(maya, id, { action, ...extra });
  expect(done.status === 200, `${action}: ${done.status} ${done.code}`);
  return id;
};
const aiAnswered = await decided("ai_answer");
const declined = await decided("decline");
const asked = await decided("more_info", { text: "Which clay body?" });

const browser = await chromium.launch({ channel: "chrome", headless: true });
/** A throwaway browser profile signed in with the development identity. */
async function signedIn(button, options = {}) {
  const context = await browser.newContext({ locale: "en-US", ...options });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/auth/continue?returnTo=%2Fcommerce%2Frequests`);
  await page.getByRole("link", { name: "Continue with Pantopus" }).click();
  await page.getByRole("button", { name: button, exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 60000,
  });
  return page;
}
const open = async (page, path, text) => {
  await page.goto(`${ORIGIN}${path}`);
  await page.getByText(text, { exact: true }).first().waitFor({
    timeout: 60000,
  });
  return page.locator("main").innerText();
};
/** Everything fits: no sideways scroll, and each text sits inside the window. */
async function fits(page, texts) {
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(
    width.scroll <= width.inner,
    `scrolls sideways: ${JSON.stringify(width)}`,
  );
  for (const text of texts) {
    const box = await page
      .getByText(text, { exact: true })
      .first()
      .boundingBox();
    expect(
      box && box.x >= 0 && box.x + box.width <= width.inner + 0.5,
      `"${text}" is cut off: ${JSON.stringify(box)}`,
    );
  }
  return `${width.inner} px wide, no sideways scroll`;
}
const AI_LINE = "Maya suggests asking Maya's AI · nothing charged";
const BUTTON = "Ask Maya's AI";

try {
  const fanPage = await signedIn("Development actor two", {
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
  });
  await step(
    "E4.2-W1",
    "after 'Let AI answer' the fan reads the approved line and a button to Maya's AI",
    async () => {
      const text = await open(
        fanPage,
        `/commerce/status?packetId=${aiAnswered}`,
        AI_LINE,
      );
      const href = await fanPage
        .getByRole("link", { name: BUTTON, exact: true })
        .getAttribute("href");
      expect(
        href === `/threads/${CREATOR.maya}/${fan.fanId}`,
        `button goes to ${href}`,
      );
      expect(
        !text.includes("passed on this one"),
        "the decline line shows too",
      );
      return `"${AI_LINE}"; "${BUTTON}" opens ${href}`;
    },
  );
  await step(
    "E4.2-W2",
    "a plain decline still reads 'passed on this one', with no button",
    async () => {
      const text = await open(
        fanPage,
        `/commerce/status?packetId=${declined}`,
        "Maya passed on this one · nothing charged",
      );
      const buttons = await fanPage
        .getByRole("link", { name: BUTTON, exact: true })
        .count();
      expect(
        buttons === 0 && !text.includes("suggests asking"),
        `${buttons} buttons`,
      );
      return "passed on this one; no button";
    },
  );
  await step(
    "E4.2-W3",
    "the request list says the same, under Closed",
    async () => {
      await open(fanPage, "/commerce/requests", "Closed");
      await fanPage
        .getByRole("button", { name: "Closed", exact: true })
        .click();
      const ai = fanPage
        .locator(`a[href="/commerce/status?packetId=${aiAnswered}"]`)
        .getByText(AI_LINE, { exact: true });
      const plain = fanPage
        .locator(`a[href="/commerce/status?packetId=${declined}"]`)
        .getByText("Maya passed on this one · nothing charged", {
          exact: true,
        });
      await ai.waitFor({ timeout: 30000 });
      await plain.waitFor({ timeout: 30000 });
      return "each row reads its own line";
    },
  );
  await step(
    "E4.2-W4",
    "while a question waits, the step reads 'Answer by', not 'Decision due'",
    async () => {
      const text = await open(
        fanPage,
        `/commerce/status?packetId=${asked}`,
        "Answer by",
      );
      expect(
        !text.includes("Decision due") && text.includes("Which clay body?"),
        "the old label or the question is missing",
      );
      return "'Answer by' beside the question";
    },
  );
  await step(
    "E4.2-W5",
    "the button opens the fan's conversation with Maya's AI",
    async () => {
      await open(fanPage, `/commerce/status?packetId=${aiAnswered}`, AI_LINE);
      await fanPage.getByRole("link", { name: BUTTON, exact: true }).click();
      await fanPage.waitForURL(
        (url) => url.pathname === `/threads/${CREATOR.maya}/${fan.fanId}`,
        { timeout: 60000 },
      );
      await fanPage.getByText("Maya's AI").first().waitFor({ timeout: 60000 });
      return new URL(fanPage.url()).pathname;
    },
  );
  const fanNight = await signedIn("Development actor two", {
    viewport: { width: 320, height: 700 },
    colorScheme: "dark",
  });
  await step(
    "E4.2-W6",
    "in Night at 320 px the line and the button fit",
    async () => {
      await open(fanNight, `/commerce/status?packetId=${aiAnswered}`, AI_LINE);
      const theme = await fanNight.evaluate(
        () => document.documentElement.dataset.theme,
      );
      expect(theme === "night", `theme ${theme}`);
      return `Night; ${await fits(fanNight, [AI_LINE, BUTTON])}`;
    },
  );
  const mayaPage = await signedIn("Development actor three", {
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
  });
  await step(
    "E4.2-W7",
    "Maya's Offers table says the refund rule in one Delivery column",
    async () => {
      const text = await open(mayaPage, "/commerce/offers", offers[0].rule);
      const headings = await mayaPage
        .locator(".commerce-offer-heading [role=columnheader]")
        .allInnerTexts();
      expect(
        JSON.stringify(headings) ===
          JSON.stringify(["Mode", "Price", "Delivery", "Per week", "State"]),
        `headings ${JSON.stringify(headings)}`,
      );
      for (const o of offers)
        expect(text.includes(o.rule), `missing "${o.rule}"`);
      expect(
        !/Refund if late|Full refund|\b72 h\b/u.test(text),
        "the old column is still there",
      );
      return `${headings.join(" | ")}; ${offers.map((o) => `"${o.rule}"`).join(", ")}`;
    },
  );
  const mayaNight = await signedIn("Development actor three", {
    viewport: { width: 320, height: 700 },
    colorScheme: "dark",
  });
  await step("E4.2-W8", "in Night at 320 px every rule fits", async () => {
    await open(mayaNight, "/commerce/offers", offers[0].rule);
    return `Night; ${await fits(
      mayaNight,
      offers.map((o) => o.rule),
    )}`;
  });
} finally {
  await browser.close();
}
await step(
  "E4.2-W9",
  "the fan withdraws the waiting request; Maya retires the offers",
  async () => {
    const gone = await withdraw(fan, asked);
    expect(gone.status === 200, `withdraw ${gone.status} ${gone.code}`);
    for (const o of offers) {
      const answer = await http(
        "POST",
        `/v1/commerce/creators/${CREATOR.maya}/modes/${o.mode.id}`,
        maya.token,
        {
          kind: "written_reply",
          publicAmount: null,
          currency: "USD",
          decisionHours: 48,
          durationSeconds: null,
          shareable: false,
          weeklyLimit: 5,
          ...o.body,
          state: "paused",
          version: o.mode.version,
          idempotencyKey: key("retire"),
        },
      );
      expect(answer.status === 200, `retire ${answer.status} ${answer.code}`);
    }
    return "released; three offers paused";
  },
);
await finish();

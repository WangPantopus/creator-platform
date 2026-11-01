// Operate the real Requests page against an owned local stack and existing
// submitted/accepted commerce fixtures. Creates no offers, decisions or payments.
// Development identity and the loopback fake Stripe processor are outer edges.
// See docs/operations/request-queue-navigation-2026-10-22.md for setup boundaries.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { API, closeDb, flag, sql } from "../lane-3/lib.mjs";

const web = flag(
  "--web",
  process.env.QELVORA_WEB_URL ?? "http://localhost:56462",
);
const stripe = flag(
  "--stripe",
  process.env.LANE4_FAKE_STRIPE ?? "http://127.0.0.1:56444",
);
const database = flag("--db", process.env.QELVORA_STACK_DATABASE_URL);
const actor = flag("--actor", "Development actor three");
const submittedId = flag("--submitted");
const acceptedId = flag("--accepted");
const output = flag(
  "--out",
  join(tmpdir(), `qelvora-requests-${randomUUID()}`),
);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
assert(
  uuid.test(submittedId ?? "") && uuid.test(acceptedId ?? ""),
  "Pass existing --submitted and --accepted packet UUIDs.",
);
assert(submittedId !== acceptedId, "Use two distinct packet fixtures.");
assert(database, "Pass the owned local stack's --db URL.");
for (const [label, value, protocols] of [
  ["API", API, ["http:"]],
  ["web", web, ["http:"]],
  ["processor", stripe, ["http:"]],
  ["database", database, ["postgres:", "postgresql:"]],
]) {
  const url = new URL(value);
  assert(
    protocols.includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.port &&
      !url.search &&
      !url.hash,
    `${label} must be an explicit loopback URL without query or fragment overrides.`,
  );
}
process.env.LANE4_ADMIN_DB = database;
process.env.LANE4_FAKE_STRIPE = stripe;
const { sweep } = await import("../lane-4/sweep.mjs");
mkdirSync(output, { recursive: true, mode: 0o700 });

async function snapshot(id) {
  const response = await fetch(`${stripe}/__state`, {
    signal: AbortSignal.timeout(5000),
  });
  assert(response.ok, "The owned fake processor must answer.");
  const provider = await response.json();
  const [packet] = await sql(
    "SELECT * FROM creator.commerce_packet WHERE id=$1",
    [id],
  );
  assert(packet, "The supplied packet must exist in this database.");
  return {
    packet,
    ledger: await sql(
      "SELECT * FROM creator.commerce_ledger WHERE packet_id=$1 ORDER BY created_at,id",
      [id],
    ),
    commitment: await sql(
      "SELECT * FROM creator.commerce_commitment WHERE packet_id=$1 ORDER BY id",
      [id],
    ),
    effects: await sql(
      "SELECT * FROM creator.commerce_effect WHERE packet_id=$1 ORDER BY id",
      [id],
    ),
    intents: provider.intents.filter((item) => item.metadata.packet_id === id),
  };
}

let browser;
const observations = [];
const results = [];
async function step(name, action) {
  try {
    await action();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
    console.log(`FAIL ${name}: ${error.message}`);
  }
}
try {
  const before = {
    submitted: await snapshot(submittedId),
    accepted: await snapshot(acceptedId),
  };
  assert(
    before.submitted.packet.state === "submitted" &&
      before.submitted.packet.payment_state === "requires_capture",
    "The submitted fixture must have an actual held payment.",
  );
  assert(
    before.accepted.packet.state === "accepted" &&
      before.accepted.commitment[0]?.state === "due",
    "The accepted fixture must have an actual due commitment.",
  );
  assert(
    before.submitted.packet.creator_id === before.accepted.packet.creator_id,
    "Both fixtures must belong to the same creator.",
  );
  const creatorId = before.submitted.packet.creator_id;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 320, height: 700 },
  ]) {
    for (const colorScheme of ["light", "dark"]) {
      const context = await browser.newContext({
        locale: "en-US",
        viewport,
        colorScheme,
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${web}/auth/continue?returnTo=%2Fstudio`);
      await page.getByRole("link", { name: "Continue with Pantopus" }).click();
      await page.getByRole("button", { name: actor, exact: true }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
        timeout: 60000,
      });
      const writes = [];
      page.on("request", (request) => {
        if (
          !["GET", "HEAD", "OPTIONS"].includes(request.method()) &&
          new URL(request.url()).pathname.startsWith("/api/")
        ) {
          writes.push({
            method: request.method(),
            path: new URL(request.url()).pathname,
          });
        }
      });
      for (const [kind, section, buttonLabel, key] of [
        ["submitted", "To decide", "Open", "Enter"],
        ["accepted", "Due", "Deliver", "Space"],
      ]) {
        const packet = before[kind].packet;
        const label = `${viewport.width}-${colorScheme}-${kind}`;
        await step(label, async () => {
          await page.goto(`${web}/studio/${creatorId}/requests`);
          const card = page
            .locator(".w5-queue-section")
            .filter({
              has: page.getByRole("heading", { name: section, exact: true }),
            })
            .locator("article.qv-queue")
            .filter({ hasText: packet.disclosure.summary });
          await card.waitFor({ timeout: 60000 });
          assert.equal(
            await card.count(),
            1,
            "Each fixture needs a unique disclosure summary within its queue section.",
          );
          const button = card.getByRole("button", {
            name: buttonLabel,
            exact: true,
          });
          assert.equal(await button.count(), 1);
          assert.equal(
            await card.getByRole("button", { name: /Decline/u }).count(),
            0,
          );
          assert.equal(
            await page.locator(".w5-requests button button").count(),
            0,
          );
          assert(
            await button.evaluate(
              (node) => !node.parentElement.closest("button"),
            ),
          );
          const layout = await card.evaluate((node) => {
            const bounds = node.getBoundingClientRect();
            return {
              viewport: window.innerWidth,
              pageWidth: document.documentElement.scrollWidth,
              card: { x: bounds.x, right: bounds.right },
              text: Array.from(
                node.querySelectorAll(
                  ".qv-queue__handle, .qv-meta, .qv-due, .qv-queue__summary",
                ),
              ).map((text) => {
                const box = text.getBoundingClientRect();
                return {
                  x: box.x,
                  right: box.right,
                  width: box.width,
                  scroll: text.scrollWidth,
                };
              }),
            };
          });
          assert(
            layout.pageWidth <= layout.viewport,
            "The page must not scroll horizontally.",
          );
          assert(
            layout.card.x >= 0 && layout.card.right <= layout.viewport,
            "The card must fit in the viewport.",
          );
          assert(
            layout.text.every(
              (node) =>
                node.x >= layout.card.x &&
                node.right <= layout.card.right &&
                node.scroll <= Math.ceil(node.width),
            ),
            "All card text must fit without clipping.",
          );
          await page.screenshot({
            path: join(output, `${label}-queue.png`),
            fullPage: true,
          });
          await button.focus();
          await page.keyboard.press(key);
          await page.waitForURL(
            (url) =>
              url.pathname === `/studio/${creatorId}/packets/${packet.id}`,
            { timeout: 60000 },
          );
          await page
            .getByRole("heading", { name: packet.snapshot.title, exact: true })
            .waitFor({ timeout: 60000 });
          await page
            .locator(".w5-fan-text")
            .filter({ hasText: packet.disclosure.summary })
            .waitFor();
          await page.getByText("Instead", { exact: true }).click();
          assert.equal(
            await page
              .getByRole("button", { name: "Decline", exact: true })
              .count(),
            1,
          );
          assert.equal(
            writes.length,
            0,
            "Opening a packet must not write through the API.",
          );
          assert.equal(
            errors.length,
            0,
            "The page must have no uncaught runtime errors.",
          );
          await page.screenshot({
            path: join(output, `${label}-detail.png`),
            fullPage: true,
          });
          observations.push({
            label,
            packetId: packet.id,
            layout,
            key,
            writes: writes.length,
            errors: errors.length,
          });
        });
      }
      await context.close();
    }
  }
  const after = {
    submitted: await snapshot(submittedId),
    accepted: await snapshot(acceptedId),
  };
  await step("navigation preserves payment and commitment state", async () => {
    assert.deepEqual(after, before);
    assert.equal(after.submitted.intents.length, 1);
    assert.equal(after.submitted.intents[0].status, "requires_capture");
    assert.equal(after.accepted.intents.length, 1);
    assert.equal(after.accepted.intents[0].status, "succeeded");
  });
  await step("existing money invariant sweep", async () => {
    const report = await sweep();
    for (const line of report.lines) console.log(`  ${line}`);
    assert.equal(report.failures, 0);
  });
  writeFileSync(
    join(output, "results.json"),
    JSON.stringify({ observations, before, after, results }, null, 2),
    { mode: 0o600 },
  );
  const failures = results.filter((result) => !result.passed).length;
  console.log(
    `${results.length - failures}/${results.length} steps passed; local evidence: ${output}`,
  );
  process.exitCode = failures ? 1 : 0;
} finally {
  await browser?.close();
  await closeDb();
}

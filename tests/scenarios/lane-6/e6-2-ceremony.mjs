// E6.2 signing ceremony: cancelling it, a refused biometric and an expired
// assertion each keep the Note's text and publish nothing; signing again then
// publishes exactly once. The expiry is moved in this stack's own database.
//   node tests/scenarios/lane-6/e6-2-ceremony.mjs
import * as L from "./e6-2-lib.mjs";
const { step, expect, sql, MAYA, WEB } = L;

const browser = await L.launch();
const { page, cdp, authenticatorId } = await L.phone(browser);
await L.approvedProof();
await L.signIn(page, 3, `/studio/${MAYA}/today`);
await L.registerPasskey(page);
const device = (method, params) =>
  cdp.send(`WebAuthn.${method}`, { authenticatorId, ...params });
const passkey = () =>
  page.getByRole("button", { name: "Sign with your passkey" });
/** Open a new Note from Today, write it and open the exact review. */
async function review(text) {
  await page.goto(`${WEB}/studio/${MAYA}/today`);
  await page.getByRole("link", { name: "New Note" }).click();
  await page.locator("#note-text").fill(text);
  await page.getByRole("button", { name: "Review and sign" }).click();
  await passkey().waitFor();
}
const state = async (text) => {
  const [row] = await sql(
    `SELECT i.id,i.state,(SELECT count(*)::int FROM creator.content_publication p WHERE p.content_id=i.id) AS published,
       (SELECT count(*)::int FROM creator.signed_act a WHERE a.subject_id=i.id) AS acts
     FROM creator.content_index i JOIN creator.content_revision r ON r.content_id=i.id AND r.version=i.version
     WHERE i.creator_id=$1 AND r.document->>'text'=$2`,
    [MAYA, text],
  );
  return row;
};
/** Close the review and read the composer: the words must still be there. */
async function kept(text) {
  await page.getByRole("button", { name: "Close" }).click();
  const value = await page.locator("#note-text").inputValue();
  expect(value === text, `composer holds "${value.slice(0, 40)}"`);
}

const early = `Cancelled before the device ${L.run}`;
await step(
  "E6.2-11a",
  "Cancel before the device is asked keeps the text",
  async () => {
    await review(early);
    await device("setAutomaticPresenceSimulation", { enabled: false });
    await passkey().click();
    await page.getByRole("button", { name: "Cancel signing" }).click();
    await page
      .getByText("Signing cancelled. No publication was started.")
      .waitFor();
    await device("setAutomaticPresenceSimulation", { enabled: true });
    const row = await state(early);
    const [challenge] = await sql(
      "SELECT used_at,expires_at-now() AS left FROM creator.signed_challenge WHERE subject_id=$1",
      [row.id],
    );
    expect(row.state === "draft" && row.acts === 0, JSON.stringify(row));
    await kept(early);
    // Cancelled mid-request: the browser never learned the challenge, which then
    // expires unused (it signs nothing without the device's assertion).
    return `draft, 0 acts; server challenge ${challenge ? (challenge.used_at ? "closed" : "left to expire unused") : "never created"}`;
  },
);
const cancelled = `Cancelled ceremony ${L.run}`;
await step(
  "E6.2-11",
  "Cancel signing while the device is asked keeps the text",
  async () => {
    await review(cancelled);
    await device("setAutomaticPresenceSimulation", { enabled: false });
    const asked = page.waitForResponse(
      (r) => r.url().includes("/signed-acts/begin") && r.ok(),
    );
    await passkey().click();
    await asked;
    await page.getByRole("button", { name: "Cancel signing" }).click();
    await page
      .getByText("Signing cancelled. No publication was started.")
      .waitFor();
    await device("setAutomaticPresenceSimulation", { enabled: true });
    const row = await state(cancelled);
    const [challenge] = await sql(
      "SELECT used_at FROM creator.signed_challenge WHERE subject_id=$1",
      [row.id],
    );
    expect(
      row.state === "draft" && row.published === 0 && row.acts === 0,
      JSON.stringify(row),
    );
    expect(challenge?.used_at, "the challenge is still usable");
    await kept(cancelled);
    return "draft kept, 0 signed acts, the challenge is closed, the composer holds the text";
  },
);
await step(
  "E6.2-12",
  "signing again after the cancel publishes once",
  async () => {
    await page.getByRole("button", { name: "Review and sign" }).click();
    await passkey().click();
    await page.waitForURL((u) => u.pathname.endsWith("/today"));
    const row = await state(cancelled);
    expect(
      row.state === "published" && row.published === 1 && row.acts === 1,
      JSON.stringify(row),
    );
    return "published, 1 publication, 1 signed act";
  },
);
const refused = `Refused biometric ${L.run}`;
await step("E6.2-13", "a refused biometric keeps the text", async () => {
  await review(refused);
  await device("setUserVerified", { isUserVerified: false });
  await passkey().click();
  await page
    .locator(
      ".signed-act-review [role=alert], .signed-act-review [role=status]",
    )
    .first()
    .waitFor();
  const message = await page.locator(".signed-act-review").innerText();
  await device("setUserVerified", { isUserVerified: true });
  const row = await state(refused);
  expect(row.state === "draft" && row.acts === 0, JSON.stringify(row));
  await kept(refused);
  return `draft, 0 acts; the sheet said: ${message.split("\n").at(-1)}`;
});
const expired = `Expired assertion ${L.run}`;
await step(
  "E6.2-14",
  "an expired assertion asks again without losing the text",
  async () => {
    await review(expired);
    // The assertion reaches the server after its challenge expired.
    await page.route("**/signed-acts/verify", async (route) => {
      const { challengeId } = route.request().postDataJSON();
      await sql(
        "UPDATE creator.signed_challenge SET expires_at=now()-interval '1 second' WHERE id=$1",
        [challengeId],
      );
      await route.continue();
    });
    await passkey().click();
    await page.getByText("This signing request is unavailable.").waitFor();
    await page.unroute("**/signed-acts/verify");
    const row = await state(expired);
    expect(row.state === "draft" && row.acts === 0, JSON.stringify(row));
    expect(await passkey().isEnabled(), "cannot sign again");
    await passkey().click();
    await page.waitForURL((u) => u.pathname.endsWith("/today"));
    const after = await state(expired);
    expect(
      after.state === "published" && after.published === 1 && after.acts === 1,
      JSON.stringify(after),
    );
    return "refused while expired, the same sheet signs again, 1 publication";
  },
);
await L.finish(browser);

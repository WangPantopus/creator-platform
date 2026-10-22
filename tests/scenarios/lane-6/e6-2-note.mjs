// E6.2 main path and boundaries: Maya lands on Today, starts a Note in one tap,
// signs it with her passkey, and an eligible fan (a member) sees it in the thread
// contract (C4) while a non-member does not; then empty, maximum-length, emoji and
// right-to-left Notes, and a double tap. Run against the lane 6 stack:
//   node tests/scenarios/lane-6/e6-2-note.mjs
import * as L from "./e6-2-lib.mjs";
const { step, expect, sql, MAYA, WEB } = L;

const browser = await L.launch();
const { page } = await L.phone(browser);
const [member, outsider] = [await L.fan(1), await L.fan(2)];
await L.endMemberships(outsider.id);
await L.member(member.id, await L.tier("Kiln Club"));
await L.approvedProof();
await L.signIn(page, 3, `/studio/${MAYA}`);
await L.registerPasskey(page);
const today = () => page.getByRole("heading", { name: "Today", level: 1 });
const notes = () =>
  sql(
    "SELECT i.id,i.state,i.version,p.signed_act_id,r.document->>'text' AS text FROM creator.content_index i JOIN creator.content_revision r ON r.content_id=i.id AND r.version=i.version LEFT JOIN creator.content_publication p ON p.content_id=i.id AND p.version=i.version WHERE i.creator_id=$1 AND i.kind='note' ORDER BY i.created_at",
    [MAYA],
  );
/** One tap from Today, write, then "Review and sign" and the passkey. */
async function sign(text, { double = false } = {}) {
  await page.goto(`${WEB}/studio/${MAYA}/today`);
  await page.getByRole("link", { name: "New Note" }).click();
  expect(
    (await page.locator(".w5-tabs [aria-current='page']").innerText()) ===
      "Today",
    "the composer does not keep Today selected",
  );
  expect(
    (await page.locator(".w5-editor .qv-author").innerText()).includes(
      "Maya · to all members",
    ),
    "the preview differs from the published audience label",
  );
  await page.locator("#note-text").fill(text);
  const review = page.getByRole("button", { name: "Review and sign" });
  await (double ? review.dblclick() : review.click());
  const passkey = page.getByRole("button", { name: "Sign with your passkey" });
  await (double ? passkey.dblclick() : passkey.click());
  await page.waitForURL((u) => u.pathname.endsWith("/today"));
  await today().waitFor();
}

await step("E6.2-1", "Studio opens on Today", async () => {
  await page.goto(`${WEB}/studio/${MAYA}`);
  await today().waitFor();
  const firstTab = page.locator(".w5-tabs a").first();
  expect(
    (await firstTab.innerText()) === "Today" &&
      (await firstTab.getAttribute("aria-current")) === "page" &&
      (await firstTab.getAttribute("href")) === `/studio/${MAYA}/today`,
    "Today is not the first, selected Studio tab",
  );
  await page.goto(`${WEB}/studio/${MAYA}/notes`);
  await page.getByRole("heading", { name: "Notes", level: 1 }).waitFor();
  await page.locator(".w5-tabs [aria-current='page']").click();
  await today().waitFor();
  await page.goto(`${WEB}/studio/workspace`);
  const href = await page
    .getByRole("link", { name: /Maya/ })
    .first()
    .getAttribute("href");
  expect(href === `/studio/${MAYA}/today`, `workspace links to ${href}`);
  return `/studio/{id} and the workspace open Today; Notes keeps Today selected and its tab returns there`;
});
const before = (await notes()).length;
const words =
  "Opened the kiln this morning.\n\nThe celadon came out the color of shallow water.";
await step("E6.2-2", "one tap starts a Note; sign; back on Today", async () => {
  await sign(words);
  await page.getByText(words).waitFor();
  const left = await page
    .locator(".qv-note__body > p")
    .first()
    .evaluate((e) => {
      const range = document.createRange();
      range.setStart(e.firstChild, 0);
      range.setEnd(e.firstChild, 1);
      return (
        range.getBoundingClientRect().left - e.getBoundingClientRect().left
      );
    });
  expect(left < 4, `English Note starts ${left} px from the left`);
  const body = page.locator(".qv-note__body > p").first();
  expect(
    (await body.innerText()) === words,
    "the Note lost its paragraph breaks",
  );
  const whitespace = await body.evaluate((e) => getComputedStyle(e).whiteSpace);
  expect(whitespace === "pre-wrap", `paragraph white-space: ${whitespace}`);
  const all = await notes();
  const last = all.at(-1);
  expect(
    all.length === before + 1 && last.state === "published",
    `${all.length - before} new, ${last?.state}`,
  );
  const [act] = await sql(
    "SELECT act_type,account_id FROM creator.signed_act WHERE id=$1",
    [last.signed_act_id],
  );
  expect(
    act?.act_type === "broadcast" && act.account_id === L.account(3),
    JSON.stringify(act),
  );
  return `published v${last.version}, signed act ${act.act_type} by Maya; Today shows it`;
});
const published = (await notes()).at(-1);
await step("E6.2-3", "a member sees the Note in the thread (C4)", async () => {
  const seen = (await L.presence(member.token)).items.find(
    (i) => i.id === published.id,
  );
  expect(
    seen?.authorKind === "human_broadcast" && seen.glyph === "broadcast",
    JSON.stringify(seen)?.slice(0, 200),
  );
  expect(
    seen.text === words && seen.signedActId === published.signed_act_id,
    "text or signature differs",
  );
  return `"${seen.authorLabel}" · ${seen.audience.label} · signed`;
});
await step(
  "E6.2-4",
  "a non-member and a signed-out visitor do not",
  async () => {
    const other = await L.presence(outsider.token);
    expect(
      other.status === 200 && !other.items.some((i) => i.id === published.id),
      "non-member sees it",
    );
    const out = await L.api("GET", `/v1/content/${MAYA}/presence`);
    expect(out.status === 401, `signed out ${out.status}`);
    return `non-member 200 without it, signed out ${out.status}`;
  },
);
await step(
  "E6.2-5",
  "empty and whitespace-only Notes cannot be signed",
  async () => {
    await page.goto(`${WEB}/studio/${MAYA}/compose?from=today`);
    const review = page.getByRole("button", { name: "Review and sign" });
    await page.locator("#note-text").waitFor();
    expect(await review.isDisabled(), "enabled when empty");
    await page.locator("#note-text").fill("   \n  ");
    expect(await review.isDisabled(), "enabled for whitespace");
    return "Review and sign stays disabled";
  },
);
await step("E6.2-6", "the editor stops at 20,000 characters", async () => {
  await page.locator("#note-text").fill("陶".repeat(19_999) + "🔥");
  const value = await page.locator("#note-text").inputValue();
  expect(
    value.length <= 20_000 && !/[\ud800-\udbff]$/.test(value),
    `length ${value.length}`,
  );
  return `typed 20,001 code units, kept ${value.length} with no broken emoji`;
});
const longest = "陶".repeat(19_992) + "🔥 مرحبا";
await step(
  "E6.2-7",
  "a 20,000-character Note signs and reaches the member",
  async () => {
    await sign(longest);
    const last = (await notes()).at(-1);
    expect(
      last.state === "published" && last.text === longest,
      `${last.state} ${last.text?.length}`,
    );
    const seen = (await L.presence(member.token)).items.find(
      (i) => i.id === last.id,
    );
    expect(seen?.text === longest, "member text differs");
    return `${longest.length} code units, ${Buffer.byteLength(longest)} bytes, identical for the fan`;
  },
);
await step(
  "E6.2-8",
  "one character over is refused by the server",
  async () => {
    const r = await L.api(
      "POST",
      `/v1/content/${MAYA}/drafts`,
      await L.apiSession(3),
      {
        id: crypto.randomUUID(),
        expectedVersion: 0,
        idempotencyKey: `lane6-${L.run}-over`,
        document: {
          kind: "note",
          title: "",
          text: "a".repeat(20_001),
          audience: { kind: "members" },
          media: [],
          nameToken: false,
          showAudienceCount: false,
          aiUseIntent: false,
          scheduledAt: null,
          quote: null,
          packetId: null,
        },
      },
    );
    expect(r.status === 400, `status ${r.status}`);
    return `${r.status} ${r.json?.error?.code}`;
  },
);
const mixed = "مرحبا بالجميع، الفرن مفتوح 🔥\nKiln opens at nine 🌊 · שלום";
await step(
  "E6.2-9",
  "emoji and right-to-left text keep their order and direction",
  async () => {
    await page.goto(`${WEB}/studio/${MAYA}/compose?from=today`);
    await page.locator("#note-text").fill(mixed);
    const dir = await page
      .locator("#note-text")
      .evaluate((e) => [e.dir, getComputedStyle(e).unicodeBidi]);
    expect(dir[0] === "auto" && dir[1] === "plaintext", dir.join());
    await sign(mixed);
    const seen = (await L.presence(member.token)).items.find(
      (i) => i.text === mixed,
    );
    expect(seen, "member does not see the exact text");
    // Published Notes preserve paragraph breaks and take direction from each
    // paragraph; the first, Arabic, character starts at the right.
    const p = page.locator(".qv-note__body > p").first();
    const shown = await p.evaluate((e) => {
      const range = document.createRange();
      range.setStart(e.firstChild, 0);
      range.setEnd(e.firstChild, 1);
      const box = e.getBoundingClientRect();
      return [e.innerText, box.right - range.getBoundingClientRect().right];
    });
    expect(
      shown[0] === mixed && shown[1] < 4,
      `${shown[1]} px from the right: ${shown[0]}`,
    );
    await page.screenshot({
      path: `${process.env.LANE6_OUT ?? "/tmp"}/e6-2-rtl-today.png`,
    });
    return "editor dir=auto; Today's Note aligns per paragraph; fan text identical";
  },
);
await step("E6.2-10", "a double tap publishes one Note", async () => {
  const text = `Double tap check ${L.run}`;
  const count = (await notes()).length;
  await sign(text, { double: true });
  const made = (await notes()).filter((n) => n.text === text);
  const acts = await sql(
    "SELECT count(*)::int AS n FROM creator.signed_challenge WHERE subject_id=$1",
    [made[0]?.id],
  );
  expect(
    (await notes()).length === count + 1 &&
      made.length === 1 &&
      made[0].state === "published",
    `${made.length} Notes`,
  );
  expect(acts[0].n === 1, `${acts[0].n} signing ceremonies`);
  const seen = (await L.presence(member.token)).items.filter(
    (i) => i.text === text,
  );
  expect(seen.length === 1, `fan sees ${seen.length}`);
  return "1 Note, 1 ceremony, 1 publication, the fan sees it once";
});
await L.finish(browser);

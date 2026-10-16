// E6.2 two tabs on one Note draft: a stale tab is told and keeps its words, and
// two tabs signing the same revision publish one Note.
//   node tests/scenarios/lane-6/e6-2-tabs.mjs
import * as L from "./e6-2-lib.mjs";
const { step, expect, sql, MAYA, WEB } = L;

const browser = await L.launch();
const first = await L.phone(browser);
await L.approvedProof();
await L.signIn(first.page, 3, `/studio/${MAYA}/today`);
await L.registerPasskey(first.page);
const second = await L.secondTab(first.page.context(), first);
const [a, b] = [first.page, second.page];
const text = (tab) => tab.locator("#note-text");
const button = (tab, name) => tab.getByRole("button", { name });
const words = {
  a1: `Tab A first ${L.run}`,
  a2: `Tab A edit ${L.run}`,
  b1: `Tab B words ${L.run}`,
};
const revisions = (id) =>
  sql(
    `SELECT i.state,i.version,r.document->>'text' AS text,(SELECT count(*)::int FROM creator.content_publication p WHERE p.content_id=i.id) AS published
     FROM creator.content_index i JOIN creator.content_revision r ON r.content_id=i.id AND r.version=i.version WHERE i.id=$1`,
    [id],
  ).then((rows) => rows[0]);
let id;
await step(
  "E6.2-15",
  "a stale tab is told about the newer revision and keeps its words",
  async () => {
    await a.goto(`${WEB}/studio/${MAYA}/compose?from=today`);
    await text(a).fill(words.a1);
    await button(a, "Save draft").click();
    await a.getByText("Draft revision 1 saved").waitFor();
    [{ id }] = await sql(
      "SELECT content_id AS id FROM creator.content_revision WHERE document->>'text'=$1",
      [words.a1],
    );
    await b.goto(`${WEB}/studio/${MAYA}/compose/${id}`);
    await b.waitForFunction(
      (w) => document.querySelector("#note-text")?.value === w,
      words.a1,
    );
    await text(a).fill(words.a2);
    await button(a, "Save draft").click();
    await a.getByText("Draft revision 2 saved").waitFor();
    await text(b).fill(words.b1);
    await button(b, "Save draft").click();
    await b
      .getByText("A newer revision is saved. Your local edits are kept.")
      .waitFor();
    expect((await text(b).inputValue()) === words.b1, "tab B lost its words");
    const row = await revisions(id);
    expect(row.version === 2 && row.text === words.a2, JSON.stringify(row));
    return "tab B refused at revision 1, still holds its words; revision 2 is tab A's";
  },
);
await step(
  "E6.2-16",
  "the stale tab keeps its edits on the new revision; then tab A is stale",
  async () => {
    await button(b, "Review saved draft").click();
    await b
      .getByRole("button", { name: "Keep my edits on this revision" })
      .click();
    await button(b, "Save draft").click();
    await b.getByText("Draft revision 3 saved").waitFor();
    await button(a, "Review and sign").click();
    await a
      .getByText("A newer revision is saved. Your local edits are kept.")
      .waitFor();
    expect((await text(a).inputValue()) === words.a2, "tab A lost its words");
    const row = await revisions(id);
    expect(
      row.version === 3 && row.text === words.b1 && row.state === "draft",
      JSON.stringify(row),
    );
    return "revision 3 is tab B's; tab A cannot sign revision 2 and keeps its words";
  },
);
await step(
  "E6.2-17",
  "both tabs sign the same revision: one Note is published",
  async () => {
    await button(a, "Review saved draft").click();
    await a.getByRole("button", { name: "Load saved revision" }).click();
    await button(a, "Review and sign").click();
    await button(a, "Sign with your passkey").waitFor();
    await button(b, "Review and sign").click();
    const bSheet = await button(b, "Sign with your passkey")
      .waitFor({ timeout: 15_000 })
      .then(
        () => true,
        () => false,
      );
    await button(a, "Sign with your passkey").click();
    await a.waitForURL((u) => u.pathname.endsWith("/today"));
    let told = "tab B could not open a second review";
    if (bSheet) {
      await button(b, "Sign with your passkey").click();
      await b.locator(".signed-act-review [role=alert]").waitFor();
      told = (await b.locator(".signed-act-review [role=alert]").innerText())
        .split("\n")
        .at(-1);
    } else
      told += `: ${(await b.locator("[role=alert]").first().innerText()).split("\n").at(-1)}`;
    const row = await revisions(id);
    const acts = await sql(
      "SELECT count(*)::int AS n FROM creator.content_publication WHERE content_id=$1",
      [id],
    );
    expect(
      row.state === "published" && row.text === words.b1 && acts[0].n === 1,
      JSON.stringify(row),
    );
    return `1 publication of revision ${row.version}; tab B: ${told}`;
  },
);
await L.finish(browser);

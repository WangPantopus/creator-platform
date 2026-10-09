// E5.1 (part 2): a Note's life in the thread: duplicates, edit, delete, paging,
// hostile text, wrong person. Block 400-699.
// Run: node tests/scenarios/lane-5/e5-1-lifecycle.mjs
import { randomUUID } from "node:crypto";
import {
  closeDb,
  expect,
  finish,
  http,
  key,
  noteDocument,
  publishNote,
  saveDraft,
  seedCreator,
  seedFan,
  seedMembership,
  seedTier,
  signAct,
  signAndPublish,
  sql,
  step,
} from "./lib.mjs";

const B = 400;
const maya = await seedCreator(B, "maya_life", "Maya");
const rival = await seedCreator(B + 1, "rival_life", "Rival");
const tier = await seedTier(maya.id, "Kiln Club");
const rivalTier = await seedTier(rival.id, "Rival Club");
const ana = await seedFan(B + 10, "ana_life");
const ben = await seedFan(B + 11, "ben_life");
await seedMembership(maya.id, ana.id, tier);
await seedMembership(maya.id, ben.id, tier);
await seedMembership(rival.id, ben.id, rivalTier);
const members = { kind: "members" };
const read = (fan, creator = maya, query = "") =>
  http("GET", `/v1/content/${creator.id}/presence${query}`, fan.token);
const count = async (table, id, extra = "") =>
  Number(
    (
      await sql(
        `SELECT count(*) AS n FROM creator.${table} WHERE content_id=$1 ${extra}`,
        [id],
      )
    ).rows[0].n,
  );

await step(
  "E5.1-duplicate",
  "publishing twice with the same request makes one Note, one effect",
  async () => {
    const id = randomUUID();
    const { version, document } = await saveDraft(
      maya,
      id,
      0,
      "Kiln opens Friday.",
      members,
    );
    const signedActId = await signAct(maya, {
      actType: "broadcast",
      subjectId: id,
      content: {
        kind: "content_publication",
        creatorId: maya.id,
        version,
        document,
      },
    });
    const body = { version, signedActId, idempotencyKey: key("publish") };
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        http("POST", `/v1/content/${maya.id}/${id}/publish`, maya.token, body),
      ),
    );
    expect(
      results.every(
        (r) => r.status === 200 && r.body.signedActId === signedActId,
      ),
      `statuses ${results.map((r) => r.status)}`,
    );
    expect(
      (await read(ana)).body.items.filter((i) => i.id === id).length === 1,
      "thread shows more than one",
    );
    expect((await count("content_publication", id)) === 1, "publication rows");
    expect(
      (await count("content_effect", id, "AND type='published'")) === 1,
      "published effects",
    );
    const signAgain = await signAct(maya, {
      actType: "broadcast",
      subjectId: id,
      content: {
        kind: "content_publication",
        creatorId: maya.id,
        version,
        document,
      },
    }).then(
      () => "signed",
      (e) => e.message,
    );
    expect(
      signAgain.includes("draft_changed"),
      `a second signing should be refused, got ${signAgain.slice(0, 120)}`,
    );
    const replay = await http(
      "POST",
      `/v1/content/${maya.id}/${id}/publish`,
      maya.token,
      { version, signedActId, idempotencyKey: key("publish") },
    );
    expect(
      replay.status >= 400,
      `the used signature under a new key was accepted: ${replay.status}`,
    );
    expect(
      (await count("content_publication", id)) === 1,
      "refused publish still wrote a row",
    );
    return `5 parallel identical publishes, 1 Note; a second signing refused (draft_changed); the used signature replayed under a new key refused ${replay.status}`;
  },
);

await step(
  "E5.1-edit",
  "an edit takes the Note out of the thread until re-signed, then v2 replaces v1",
  async () => {
    const note = await publishNote(maya, "Open at ten.", members);
    expect(
      (await read(ana)).body.items.some((i) => i.text === "Open at ten."),
      "v1 visible",
    );
    const draft = await saveDraft(maya, note.id, 1, "Open at nine.", members);
    const during = (await read(ana)).body.items.map((i) => i.text);
    expect(
      !during.includes("Open at ten.") && !during.includes("Open at nine."),
      `visible during edit: ${during}`,
    );
    const v2 = await signAndPublish(
      maya,
      note.id,
      draft.version,
      draft.document,
    );
    expect(v2.response.status === 200, `republish ${v2.response.status}`);
    const after = (await read(ana)).body.items.filter((i) => i.id === note.id);
    expect(
      after.length === 1 &&
        after[0].text === "Open at nine." &&
        after[0].version === 2,
      `after ${JSON.stringify(after)}`,
    );
    expect(
      after[0].signedActId === v2.signedActId,
      "thread must point at the new signature",
    );
    const row = (
      await sql("SELECT version,state FROM creator.content_index WHERE id=$1", [
        note.id,
      ])
    ).rows[0];
    expect(row.version === 2 && row.state === "published", "database row");
  },
);

await step(
  "E5.1-delete",
  "unpublishing removes the Note from every thread",
  async () => {
    const note = await publishNote(maya, "Temporary news.", members);
    expect(
      (await read(ben)).body.items.some((i) => i.id === note.id),
      "visible first",
    );
    const gone = await http(
      "POST",
      `/v1/content/${maya.id}/${note.id}/unpublish`,
      maya.token,
      { version: 1, idempotencyKey: key("unpublish") },
    );
    expect(
      gone.status === 200,
      `unpublish ${gone.status} ${JSON.stringify(gone.body)}`,
    );
    expect(
      !(await read(ben)).body.items.some((i) => i.id === note.id),
      "still visible after unpublish",
    );
    expect(
      !(await read(ana)).body.items.some((i) => i.id === note.id),
      "still visible to the other member",
    );
  },
);

await step(
  "E5.1-wrong-person",
  "a fan or another creator cannot publish, unpublish or read a draft",
  async () => {
    const draftId = randomUUID();
    const { version } = await saveDraft(
      maya,
      draftId,
      0,
      "Secret draft text.",
      members,
    );
    expect(
      !JSON.stringify((await read(ana)).body).includes("Secret draft"),
      "draft leaked into the thread",
    );
    const asFan = await http(
      "POST",
      `/v1/content/${maya.id}/${draftId}/publish`,
      ana.token,
      { version, signedActId: randomUUID(), idempotencyKey: key("p") },
    );
    expect(asFan.status >= 400, `a fan publishing got ${asFan.status}`);
    const note = await publishNote(maya, "Rival cannot remove this.", members);
    const asRival = await http(
      "POST",
      `/v1/content/${maya.id}/${note.id}/unpublish`,
      rival.token,
      { version: 1, idempotencyKey: key("u") },
    );
    expect(asRival.status >= 400, `a rival unpublishing got ${asRival.status}`);
    expect(
      (await read(ana)).body.items.some((i) => i.id === note.id),
      "Note must survive",
    );
    const crossed = await read(ana, rival);
    expect(
      crossed.status >= 400 || crossed.body.items.length === 0,
      "a non-member of Rival Club saw Rival items",
    );
    const own = await read(ben, rival);
    expect(own.body.items.length === 0, "Rival has published nothing");
  },
);

await step(
  "E5.1-hostile-text",
  "markup, emoji, right-to-left, a name token and 20,000 characters arrive as plain text",
  async () => {
    const hostile =
      "<script>alert(1)</script> 🔥 שלום עולם مرحبا {name} &amp; ok";
    const long = "é".repeat(20000);
    const a = await publishNote(maya, hostile, members, { nameToken: true });
    const b = await publishNote(maya, long, members);
    const items = (await read(ana, maya, "?limit=50")).body.items;
    const got = items.find((i) => i.id === a.id);
    expect(
      got.text === hostile.replaceAll("{name}", "ana_life"),
      `text ${got.text}`,
    );
    expect(
      items.find((i) => i.id === b.id).text === long,
      "20,000 characters changed",
    );
    const over = await http(
      "POST",
      `/v1/content/${maya.id}/drafts`,
      maya.token,
      {
        id: randomUUID(),
        expectedVersion: 0,
        document: noteDocument("x".repeat(20001), members),
        idempotencyKey: key("d"),
      },
    );
    expect(over.status === 400, `20,001 characters got ${over.status}`);
  },
);

await step(
  "E5.1-paging",
  "limit and the cursor walk every Note once, oldest first within a page",
  async () => {
    const ids = [];
    for (let i = 0; i < 7; i++)
      ids.push((await publishNote(maya, `Paged note ${i}`, members)).id);
    const seen = [];
    let before = "";
    for (let guard = 0; guard < 20; guard++) {
      const r = await read(ben, maya, `?limit=3${before}`);
      expect(r.status === 200 && r.body.items.length <= 3, `page ${r.status}`);
      const times = r.body.items.map((i) => i.occurredAt);
      expect(
        times.every((t, k) => k === 0 || times[k - 1] <= t),
        "page not oldest first",
      );
      seen.push(...r.body.items.map((i) => i.id));
      if (!r.body.nextBefore) break;
      before = `&before=${encodeURIComponent(r.body.nextBefore)}`;
    }
    expect(new Set(seen).size === seen.length, "an item repeated across pages");
    expect(
      ids.every((id) => seen.includes(id)),
      "an item was skipped",
    );
    for (const bad of ["?limit=0", "?limit=51", "?before=yesterday"]) {
      const r = await read(ben, maya, bad);
      expect(r.status === 400, `${bad} should be refused, got ${r.status}`);
    }
  },
);
await closeDb();
process.exit(finish());

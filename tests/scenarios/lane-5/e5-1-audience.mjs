// E5.1 (part 1): who sees a creator's Note in their thread, and who does not.
// Block 100-399. Run: node tests/scenarios/lane-5/e5-1-audience.mjs
import { randomUUID } from "node:crypto";
import {
  blockFan,
  closeDb,
  deleteFan,
  endMembership,
  expect,
  finish,
  http,
  publishNote,
  restrictFan,
  seedCreator,
  seedFan,
  seedMembership,
  seedTier,
  sql,
  step,
} from "./lib.mjs";

const B = 100;
const maya = await seedCreator(B, "maya_e51", "Maya");
const kiln = await seedTier(maya.id, "Kiln Club");
const gold = await seedTier(maya.id, "Gold");
const fans = {};
for (const [name, n] of Object.entries({
  member: 1,
  member2: 2,
  outsider: 3,
  blocked: 4,
  restricted: 5,
  deleted: 6,
  leaver: 7,
  joiner: 8,
  goldOnly: 9,
  muted: 10,
  noThread: 11,
  kilnOnly: 12,
}))
  fans[name] = await seedFan(B + n, `${name.toLowerCase()}_e51`);
const member = {};
for (const name of [
  "member",
  "member2",
  "blocked",
  "restricted",
  "deleted",
  "leaver",
  "muted",
  "noThread",
  "kilnOnly",
])
  member[name] = await seedMembership(maya.id, fans[name].id, kiln);
member.goldOnly = await seedMembership(maya.id, fans.goldOnly.id, gold);
const read = (fan, query = "") =>
  http("GET", `/v1/content/${maya.id}/presence${query}`, fan.token);
const texts = (response) => (response.body?.items ?? []).map((i) => i.text);

const note = await publishNote(maya, "Kiln opens Friday, members first.", {
  kind: "members",
});
await step(
  "E5.1-main",
  "a members Note reaches a member's thread, labeled with its audience and glyph",
  async () => {
    expect(note.response.status === 200, `publish ${note.response.status}`);
    const r = await read(fans.member);
    expect(
      r.status === 200 && r.body.items.length === 1,
      `got ${JSON.stringify(r.body)}`,
    );
    const item = r.body.items[0];
    expect(
      item.authorKind === "human_broadcast" && item.glyph === "broadcast",
      "kind or glyph",
    );
    expect(
      item.authorLabel === "Maya · to all members",
      `label ${item.authorLabel}`,
    );
    expect(
      item.audience.label === "all members" && item.audience.kind === "members",
      "audience",
    );
    expect(
      item.signedActId === note.signedActId,
      "signed act differs from the one the creator made",
    );
    const row = (
      await sql("SELECT state FROM creator.content_index WHERE id=$1", [
        note.id,
      ])
    ).rows[0];
    expect(row.state === "published", "database state");
    return item.authorLabel;
  },
);
await step(
  "E5.1-other-member",
  "a second member sees the same single Note",
  async () => {
    const r = await read(fans.member2);
    expect(
      r.body.items.length === 1 && r.body.items[0].id === note.id,
      "second member",
    );
  },
);
await step(
  "E5.1-outsider",
  "a fan who is not a member gets nothing",
  async () => {
    const r = await read(fans.outsider);
    expect(
      r.status === 200 && r.body.items.length === 0,
      `got ${JSON.stringify(r.body)}`,
    );
  },
);
await step(
  "E5.1-signed-out",
  "a signed-out visitor is refused and sees nothing",
  async () => {
    const r = await http("GET", `/v1/content/${maya.id}/presence`);
    expect(r.status === 401, `status ${r.status}`);
    expect(!JSON.stringify(r.body).includes("Kiln opens"), "leaked text");
  },
);
await step(
  "E5.1-blocked",
  "a member Maya's trust blocked gets nothing",
  async () => {
    await blockFan(fans.blocked, maya.id);
    const r = await read(fans.blocked);
    expect(r.status >= 400, `status ${r.status}`);
    expect(!JSON.stringify(r.body).includes("Kiln opens"), "leaked text");
    return `refused ${r.status} ${r.body?.error?.code}`;
  },
);
await step("E5.1-restricted", "a restricted member gets nothing", async () => {
  await restrictFan(fans.restricted, maya.id);
  const r = await read(fans.restricted);
  expect(
    r.status >= 400 && !JSON.stringify(r.body).includes("Kiln opens"),
    `status ${r.status}`,
  );
});
await step(
  "E5.1-deleted",
  "a member whose account was deleted gets nothing",
  async () => {
    await deleteFan(fans.deleted);
    const r = await read(fans.deleted);
    expect(
      r.status >= 400 && !JSON.stringify(r.body).includes("Kiln opens"),
      `status ${r.status}`,
    );
    return `refused ${r.status} ${r.body?.error?.code}`;
  },
);
await step(
  "E5.1-no-thread",
  "a member with no conversation yet still has the Note waiting",
  async () => {
    const threads = (
      await sql(
        "SELECT count(*)::int AS n FROM creator.thread WHERE creator_id=$1 AND fan_id=$2",
        [maya.id, fans.noThread.id],
      )
    ).rows[0].n;
    expect(threads === 0, "this fan should have no thread");
    const r = await read(fans.noThread);
    expect(
      r.body.items.length === 1,
      "Note missing for a fan without a thread",
    );
  },
);
await step(
  "E5.1-leaves",
  "a member who leaves later stops seeing the Note",
  async () => {
    expect((await read(fans.leaver)).body.items.length === 1, "before leaving");
    await endMembership(member.leaver.membership, member.leaver.grant);
    const r = await read(fans.leaver);
    expect(
      r.status === 200 && r.body.items.length === 0,
      `after leaving ${JSON.stringify(r.body)}`,
    );
  },
);
await step(
  "E5.1-joins",
  "a fan who joins later sees the Note from then on",
  async () => {
    expect((await read(fans.joiner)).body.items.length === 0, "before joining");
    await seedMembership(maya.id, fans.joiner.id, kiln);
    const r = await read(fans.joiner);
    expect(r.body.items.length === 1, "after joining");
    return "sees Notes posted before joining (default: current membership decides)";
  },
);
await step(
  "E5.1-tiers",
  "a Note to one tier reaches that tier only, and names it",
  async () => {
    const gn = await publishNote(maya, "Gold glaze recipes.", {
      kind: "tiers",
      ids: [gold],
    });
    expect(gn.response.status === 200, `publish ${gn.response.status}`);
    const g = await read(fans.goldOnly);
    // A members Note reaches every current member of any tier, so the Gold member sees both.
    expect(
      g.body.items.length === 2,
      `gold member sees ${g.body.items.length}`,
    );
    const goldNote = g.body.items.find((i) => i.text === "Gold glaze recipes.");
    expect(
      goldNote?.authorLabel === "Maya · to Gold members",
      `gold label ${goldNote?.authorLabel}`,
    );
    expect(
      goldNote.audience.kind === "tiers" &&
        goldNote.audience.label === "Gold members",
      "tier audience",
    );
    const k = await read(fans.kilnOnly);
    expect(
      !texts(k).includes("Gold glaze recipes."),
      "kiln member saw the Gold Note",
    );
    expect(
      texts(k).length === 1,
      "kiln member should see only the members Note",
    );
  },
);
await step(
  "E5.1-muted",
  "a member who muted Notes sees none; unmuting brings them back",
  async () => {
    const mute = await http(
      "POST",
      `/v1/content/${maya.id}/mute`,
      fans.muted.token,
      { muted: true },
    );
    expect(mute.status === 200, `mute ${mute.status}`);
    expect((await read(fans.muted)).body.items.length === 0, "muted");
    await http("POST", `/v1/content/${maya.id}/mute`, fans.muted.token, {
      muted: false,
    });
    expect((await read(fans.muted)).body.items.length === 1, "unmuted");
  },
);
await step(
  "E5.1-unknown-creator",
  "a creator id that does not exist is refused",
  async () => {
    const r = await http(
      "GET",
      `/v1/content/${randomUUID()}/presence`,
      fans.member.token,
    );
    expect(r.status >= 400, `status ${r.status}`);
    return `refused ${r.status} ${r.body?.error?.code}`;
  },
);
await closeDb();
process.exit(finish());

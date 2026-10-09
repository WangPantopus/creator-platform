// E5.2: the creator reacts to a fan's reply; that fan, and only that fan, sees
// "Maya reacted to your reply" in their thread. Block 700-999.
// Run: node tests/scenarios/lane-5/e5-2-reactions.mjs
import { randomUUID } from "node:crypto";
import {
  allowReply,
  closeDb,
  expect,
  finish,
  http,
  key,
  publishNote,
  react,
  replyToNote,
  seedCreator,
  seedFan,
  seedMembership,
  seedTier,
  signAct,
  skip,
  sql,
  step,
} from "./lib.mjs";

const B = 700;
const maya = await seedCreator(B, "maya_react", "Maya");
const rival = await seedCreator(B + 1, "rival_react", "Rival");
const tier = await seedTier(maya.id, "Kiln Club");
const f = {};
for (const [name, n] of Object.entries({ ana: 10, ben: 11, cy: 12, dee: 13 }))
  f[name] = await seedFan(B + n, `${name}_react`);
for (const name of ["ana", "ben", "cy"])
  await seedMembership(maya.id, f[name].id, tier);
const read = (fan) => http("GET", `/v1/content/${maya.id}/presence`, fan.token);
const reactions = (r) =>
  r.body.items.filter((i) => i.authorKind === "human_reaction");
const count = async (table, replyId, extra = "") =>
  Number(
    (
      await sql(
        `SELECT count(*) AS n FROM creator.${table} WHERE ${table === "content_reaction" ? "reply_id" : "content_id"}=$1 ${extra}`,
        [replyId],
      )
    ).rows[0].n,
  );

const note = await publishNote(maya, "Thanks for firing with me this week.", {
  kind: "members",
});
const ana = await replyToNote(
  f.ana,
  maya.id,
  note.id,
  "The crackle tip worked! My secret: cone 6.",
);
const ben = await replyToNote(
  f.ben,
  maya.id,
  note.id,
  "My kiln keeps tripping the breaker, help.",
);
const cy = await replyToNote(
  f.cy,
  maya.id,
  note.id,
  "Pending reply nobody has reviewed.",
);
await allowReply(ana.replyId);
await allowReply(ben.replyId);

await step(
  "E5.2-main",
  "Maya reacts to Ana's reply; Ana sees 'Maya reacted to your reply' as a human_reaction",
  async () => {
    const done = await react(maya, ana.replyId, ana.version, "heart");
    expect(
      done.response.status === 200,
      `react ${done.response.status} ${JSON.stringify(done.response.body)}`,
    );
    const replay = await done.send();
    expect(
      replay.status === 200 && replay.body.signedActId === done.signedActId,
      `the same request replayed got ${replay.status}`,
    );
    const r = reactions(await read(f.ana));
    expect(r.length === 1, `reaction items: ${r.length}`);
    const item = r[0];
    expect(
      item.authorLabel === "Maya reacted to your reply" &&
        item.glyph === "heart",
      `label ${item.authorLabel}`,
    );
    expect(
      item.reaction === "heart" &&
        item.replyId === ana.replyId &&
        item.noteId === note.id,
      "links",
    );
    expect(item.signedActId === done.signedActId, "signature");
    const row = (
      await sql(
        "SELECT kind,signed_act_id FROM creator.content_reaction WHERE reply_id=$1",
        [ana.replyId],
      )
    ).rows[0];
    expect(row.signed_act_id === done.signedActId, "database signature");
    return item.authorLabel;
  },
);
await step(
  "E5.2-privacy",
  "no other fan sees Ana's reaction or any text of Ana's reply (INV-24)",
  async () => {
    for (const [name, fan] of [
      ["ben", f.ben],
      ["cy", f.cy],
      ["dee", f.dee],
    ]) {
      const bodies = [
        JSON.stringify((await read(fan)).body),
        JSON.stringify(
          (await http("GET", `/v1/content/${maya.id}/replies`, fan.token)).body,
        ),
        JSON.stringify(
          (await http("GET", `/v1/content/${maya.id}`, fan.token)).body,
        ),
      ];
      for (const b of bodies)
        expect(
          !b.includes("crackle") &&
            !b.includes("cone 6") &&
            !b.includes(ana.replyId),
          `${name} saw Ana's reply or reaction`,
        );
    }
    expect(
      reactions(await read(f.ben)).length === 0,
      "Ben has no reaction yet",
    );
  },
);
await step(
  "E5.2-duplicate",
  "a second reaction to the same reply is refused (a replay of the first request was already shown to be a no-op)",
  async () => {
    const again = await react(maya, ana.replyId, ana.version, "thanks");
    expect(
      again.response.status >= 400 &&
        again.response.body?.error?.code === "reaction_exists",
      `second reaction got ${again.response.status} ${again.response.body?.error?.code}`,
    );
    expect(
      (await count("content_reaction", ana.replyId)) === 1,
      "reaction rows",
    );
    expect(
      (await count("content_effect", note.id, "AND type='reaction'")) <= 1,
      "effects",
    );
    expect(
      reactions(await read(f.ana)).length === 1,
      "thread shows more than one",
    );
  },
);
await step(
  "E5.2-race",
  "two reactions at once to Ben's reply: one wins, one row, one item",
  async () => {
    const sigs = await Promise.all([
      signAct(maya, {
        actType: "reaction",
        subjectId: ben.replyId,
        content: {
          kind: "content_reaction",
          creatorId: maya.id,
          replyVersion: ben.version,
          reaction: "heart",
        },
      }),
      signAct(maya, {
        actType: "reaction",
        subjectId: ben.replyId,
        content: {
          kind: "content_reaction",
          creatorId: maya.id,
          replyVersion: ben.version,
          reaction: "heart",
        },
      }),
    ]);
    const both = await Promise.all(
      sigs.map((s) => react(maya, ben.replyId, ben.version, "heart", s)),
    );
    const codes = both.map((b) => b.response.status).sort();
    expect(codes[0] === 200 && codes[1] >= 400, `statuses ${codes}`);
    expect(
      (await count("content_reaction", ben.replyId)) === 1,
      "reaction rows",
    );
    expect(reactions(await read(f.ben)).length === 1, "Ben's thread");
    return `statuses ${codes}`;
  },
);
await step(
  "E5.2-pending-reply",
  "a reply still awaiting review cannot be reacted to",
  async () => {
    const signed = await signAct(maya, {
      actType: "reaction",
      subjectId: cy.replyId,
      content: {
        kind: "content_reaction",
        creatorId: maya.id,
        replyVersion: cy.version,
        reaction: "heart",
      },
    }).then(
      (id) => id,
      (e) => e.message,
    );
    expect(
      typeof signed === "string" && signed.includes("reply_changed"),
      `signing should be refused: ${String(signed).slice(0, 100)}`,
    );
    const sent = await react(
      maya,
      cy.replyId,
      cy.version,
      "heart",
      randomUUID(),
    );
    expect(sent.response.status >= 400, `react got ${sent.response.status}`);
    expect(
      (await count("content_reaction", cy.replyId)) === 0,
      "a reaction row was written",
    );
    expect(reactions(await read(f.cy)).length === 0, "Cy sees a reaction");
  },
);
await step(
  "E5.2-wrong-person",
  "a fan or a rival creator cannot react in Maya's name",
  async () => {
    const asFan = await http(
      "POST",
      `/v1/content/${maya.id}/replies/${ana.replyId}/reaction`,
      f.ben.token,
      {
        version: ana.version,
        kind: "heart",
        signedActId: randomUUID(),
        idempotencyKey: key("x"),
      },
    );
    expect(asFan.status >= 400, `fan got ${asFan.status}`);
    const asRival = await http(
      "POST",
      `/v1/content/${maya.id}/replies/${ben.replyId}/reaction`,
      rival.token,
      {
        version: ben.version,
        kind: "heart",
        signedActId: randomUUID(),
        idempotencyKey: key("y"),
      },
    );
    expect(asRival.status >= 400, `rival got ${asRival.status}`);
  },
);
await step(
  "E5.2-deleted-reply",
  "when Ana withdraws her reply the reaction leaves her thread and cannot be re-sent",
  async () => {
    const gone = await http(
      "POST",
      `/v1/content/${maya.id}/replies/${ana.replyId}/withdraw`,
      f.ana.token,
      { version: ana.version, idempotencyKey: key("w") },
    );
    expect(
      gone.status === 200,
      `withdraw ${gone.status} ${JSON.stringify(gone.body)}`,
    );
    expect(
      reactions(await read(f.ana)).length === 0,
      "reaction still shown for a withdrawn reply",
    );
    const late = await react(
      maya,
      ana.replyId,
      ana.version + 1,
      "heart",
      randomUUID(),
    );
    expect(
      late.response.status >= 400,
      `late reaction got ${late.response.status}`,
    );
  },
);
skip(
  "E5.2-undo",
  "an undone reaction",
  "the content module cannot undo a reaction (insert-only table, no route), so there is nothing to undo; raised as a decision for the founder",
);
await closeDb();
process.exit(finish());

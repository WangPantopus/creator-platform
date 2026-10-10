// Real HTTP + PostgreSQL. Only identity, software passkey, owner outcome
// fixtures, gateway and retry-clock placement are fake. Block 4200-4299.
// Run normally, restart run-host.sh without resetting the DB, then --restart.
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import {
  allowReply,
  clearPushes,
  closeDb,
  expect,
  finish,
  gateway,
  http,
  inbox,
  key,
  publishNote,
  pushes,
  react,
  replyToNote,
  runEffects,
  seedCreator,
  seedFan,
  seedMembership,
  seedTier,
  setPreferences,
  skip,
  sql,
  step,
  waitFor,
} from "./lib.mjs";

const require = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
);
const { Pool } = require("pg");
const runtime = new Pool({
  connectionString:
    "postgresql://creator_runtime:foundation-test-only@127.0.0.1:56450/creator_foundation_lane5",
  max: 1,
});
const delivery = async (replyId) =>
  (
    await sql(
      `SELECT d.id,d.state,d.attempts,d.notification_id FROM growth.delivery d
   JOIN growth.notification n ON n.id=d.notification_id JOIN growth.event_inbox e ON e.id=n.event_id
   WHERE d.channel='push' AND n.type='reaction' AND e.envelope->>'aggregateId'=$1`,
      [replyId],
    )
  ).rows[0];
const due = async (id) =>
  sql(
    "UPDATE growth.delivery SET available_at=now() WHERE id=$1 AND state='queued'",
    [id],
  );
const sentFor = async (row) =>
  (await pushes()).filter((p) => p.notificationId === row.notification_id);
const available = async (c, r, a) =>
  (
    await runtime.query(
      "SELECT creator.content_reaction_available($1,$2,$3) AS ok",
      [c, r, a],
    )
  ).rows[0].ok;

if (process.argv.includes("--restart")) {
  await step(
    "E5.2-restart",
    "restart suppresses withdrawn work and sends live work once",
    async () => {
      const rows = (
        await sql(`SELECT r.id,r.withdrawn_at FROM creator.content_reply r
      JOIN creator.creator_profile c ON c.id=r.creator_id
      JOIN creator.fan_profile f ON f.id=r.fan_id
      WHERE c.handle='maya_withdraw' AND f.handle IN ('restart_live_wd','restart_gone_wd')`)
      ).rows;
      expect(rows.length === 2, `restart replies ${rows.length}`);
      for (const row of rows) await due((await delivery(row.id)).id);
      for (const row of rows) {
        const wanted = row.withdrawn_at ? "suppressed" : "sent";
        const d = await waitFor(wanted, async () => {
          const d = await delivery(row.id);
          return d?.state === wanted && d;
        });
        expect(
          (await sentFor(d)).length === (row.withdrawn_at ? 0 : 1),
          `${wanted} submissions`,
        );
      }
      return "withdrawn=suppressed/0 submissions; live=sent/1; real new host process";
    },
  );
  await runtime.end();
  await closeDb();
  process.exit(finish());
}

const maya = await seedCreator(4200, "maya_withdraw", "Maya");
const other = await seedCreator(4201, "other_withdraw", "Other");
const tier = await seedTier(maya.id, "Kiln Club");
const fans = {};
for (const [i, name] of [
  "retry",
  "race",
  "review",
  "missing",
  "restart_live",
  "restart_gone",
  "wrong",
].entries()) {
  fans[name] = await seedFan(4210 + i, `${name}_wd`);
  await seedMembership(maya.id, fans[name].id, tier);
  await setPreferences(fans[name]);
}
const note = await publishNote(maya, "Reply to this Note.", {
  kind: "members",
});
await waitFor(
  "Note push deliveries settled",
  async () =>
    (
      await sql(
        "SELECT count(*)::int AS n FROM growth.delivery WHERE channel='push' AND state IN ('queued','leased')",
      )
    ).rows[0].n === 0,
);
await clearPushes();
const replies = {};
for (const [name, fan] of Object.entries(fans)) {
  replies[name] = await replyToNote(
    fan,
    maya.id,
    note.id,
    `Private glazes ${name} contents.`,
  );
  await allowReply(replies[name].replyId);
}
const withdraw = (
  name,
  actor = fans[name],
  command = { version: replies[name].version, idempotencyKey: key("withdraw") },
) =>
  http(
    "POST",
    `/v1/content/${maya.id}/replies/${replies[name].replyId}/withdraw`,
    actor.token,
    command,
  );
const queue = async (name) => {
  await gateway("down");
  const r = await react(maya, replies[name].replyId, replies[name].version);
  expect(r.response.status === 200, `react ${JSON.stringify(r.response)}`);
  return waitFor("failed first delivery", async () => {
    const d = await delivery(replies[name].replyId);
    return d?.state === "queued" && d.attempts >= 1 && d;
  });
};
const suppress = async (name, d) => {
  await gateway("up");
  await due(d.id);
  await waitFor(
    "suppressed",
    async () => (await delivery(replies[name].replyId))?.state === "suppressed",
  );
  expect(
    (await sentFor(d)).length === 0,
    "withdrawn reply submitted to gateway",
  );
  expect(
    !(await inbox(fans[name])).some((n) => n.id === d.notification_id),
    "withdrawn reply listed",
  );
};

await step(
  "E5.2-retry-withdraw",
  "wrong fan refused; author's repeated withdrawal suppresses retry",
  async () => {
    const d = await queue("retry");
    expect(
      await available(maya.id, replies.retry.replyId, fans.retry.accountId),
      "live reaction unavailable",
    );
    const wrong = await withdraw("retry", fans.wrong);
    expect(wrong.status === 403, `wrong fan ${JSON.stringify(wrong)}`);
    expect(
      await available(maya.id, replies.retry.replyId, fans.retry.accountId),
      "wrong fan changed reply",
    );
    const command = {
      version: replies.retry.version,
      idempotencyKey: key("repeat"),
    };
    const results = await Promise.all([
      withdraw("retry", fans.retry, command),
      withdraw("retry", fans.retry, command),
    ]);
    expect(
      results.every((r) => r.status === 200),
      JSON.stringify(results),
    );
    const row = (
      await sql(
        "SELECT version,text,withdrawn_at FROM creator.content_reply WHERE id=$1",
        [replies.retry.replyId],
      )
    ).rows[0];
    expect(
      row.version === 2 && row.text === "[Reply withdrawn]" && row.withdrawn_at,
      "reply not withdrawn once",
    );
    expect(
      !(await available(maya.id, replies.retry.replyId, fans.retry.accountId)),
      "withdrawn reaction available",
    );
    await suppress("retry", d);
    await Promise.all([runEffects(maya), runEffects(maya), runEffects(maya)]);
    expect((await sentFor(d)).length === 0, "repeat effects submitted");
    return "wrong fan 403; repeated owner 200/200; version 2; suppressed, zero submissions";
  },
);

await step(
  "E5.2-final-check-race",
  "withdraw after preparation but before final submission check",
  async () => {
    await gateway("up");
    await gateway("hold");
    try {
      const r = await react(maya, replies.race.replyId, replies.race.version);
      expect(r.response.status === 200, `react ${r.response.status}`);
      await waitFor(
        "gateway paused before final check",
        async () =>
          (await (await fetch("http://127.0.0.1:56453/status")).json())
            .waiting === 1,
      );
      expect(
        (await delivery(replies.race.replyId)).state === "leased",
        "not leased",
      );
      expect((await withdraw("race")).status === 200, "withdraw refused");
    } finally {
      await gateway("release");
    }
    const d = await delivery(replies.race.replyId);
    await suppress("race", d);
    return "leased live work paused; withdrawal committed; final check suppressed it";
  },
);

await step(
  "E5.2-review-change",
  "current review must still allow this exact reply version",
  async () => {
    const d = await queue("review");
    await sql(
      "UPDATE creator.content_reply_review SET state='flagged' WHERE reply_id=$1",
      [replies.review.replyId],
    );
    expect(
      !(await available(
        maya.id,
        replies.review.replyId,
        fans.review.accountId,
      )),
      "flagged reply available",
    );
    await suppress("review", d);
    return "reviewer outcome fixture changed allowed to flagged; suppressed, zero submissions";
  },
);

await step(
  "E5.2-reader-failure",
  "a missing reader waits without submission and recovers once",
  async () => {
    const d = await queue("missing");
    await sql(
      "ALTER FUNCTION creator.content_reaction_available(uuid,uuid,uuid) RENAME TO content_reaction_available_offline",
    );
    try {
      await gateway("up");
      await due(d.id);
      await waitFor("failed reader attempt", async () => {
        const next = await delivery(replies.missing.replyId);
        return next?.state === "queued" && next.attempts > d.attempts;
      });
      expect((await sentFor(d)).length === 0, "reader failure submitted");
    } finally {
      await sql(
        "ALTER FUNCTION creator.content_reaction_available_offline(uuid,uuid,uuid) RENAME TO content_reaction_available",
      );
    }
    await due(d.id);
    await waitFor(
      "reader recovery sent",
      async () => (await delivery(replies.missing.replyId))?.state === "sent",
    );
    await Promise.all([runEffects(maya), runEffects(maya)]);
    expect((await sentFor(d)).length === 1, "recovery not exactly once");
    expect(
      !JSON.stringify(await pushes()).includes("Private glazes"),
      "reply text leaked",
    );
    return "missing function: queued/0; restored function: sent/1, no reply text";
  },
);

await step(
  "E5.2-reader-bounds",
  "wrong IDs, recipient, creator and missing reaction return only false",
  async () => {
    const r = replies.missing.replyId;
    expect(
      await available(maya.id, r, fans.missing.accountId),
      "live expected true",
    );
    for (const args of [
      [other.id, r, fans.missing.accountId],
      [maya.id, r, fans.wrong.accountId],
      [maya.id, randomUUID(), fans.missing.accountId],
      [maya.id, replies.wrong.replyId, fans.wrong.accountId],
      [null, r, fans.missing.accountId],
      [maya.id, null, fans.missing.accountId],
      [maya.id, r, null],
    ])
      expect(
        (await available(...args)) === false,
        `unavailable bound ${JSON.stringify(args)}`,
      );
    // Same physical runtime connection: function restores settings, and grants no
    // ability to read the private reply or assume its purpose role.
    const client = await runtime.connect();
    try {
      await client.query("BEGIN");
      const sentinel = randomUUID();
      await client.query(
        "SELECT set_config('content.reaction_reply_id',$1,true)",
        [sentinel],
      );
      await client.query(
        "SELECT creator.content_reaction_available($1,$2,$3)",
        [maya.id, r, fans.missing.accountId],
      );
      expect(
        (
          await client.query(
            "SELECT current_setting('content.reaction_reply_id') AS v",
          )
        ).rows[0].v === sentinel,
        "scope leaked",
      );
      expect(
        (
          await client.query(
            "SELECT text FROM creator.content_reply WHERE id=$1",
            [r],
          )
        ).rowCount === 0,
        "worker read private text",
      );
      await client.query("ROLLBACK");
      let denied = false;
      try {
        await client.query("SET ROLE creator_content_reaction_notice");
      } catch (e) {
        denied = e.code === "42501";
      }
      expect(denied, "runtime can assume reader role");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    const grants = (
      await sql(`SELECT has_column_privilege('creator_content_reaction_notice','creator.content_reply','text','SELECT') AS text,
    has_table_privilege('creator_content_reaction_notice','creator.content_reply','UPDATE') AS write,
    has_function_privilege('growth_worker','creator.content_reaction_available(uuid,uuid,uuid)','EXECUTE') AS other_role`)
    ).rows[0];
    expect(
      !grants.text && !grants.write && !grants.other_role,
      JSON.stringify(grants),
    );
    return "7 wrong/null/unreacted bindings=false; private rows=0; SET ROLE denied; no text/write/other-role grant";
  },
);

await step(
  "E5.2-restart-prepare",
  "persist one live and one withdrawn retry for a real process restart",
  async () => {
    for (const name of ["restart_live", "restart_gone"]) {
      const d = await queue(name);
      await sql(
        "UPDATE growth.delivery SET available_at=now()+interval '1 hour' WHERE id=$1 AND state='queued'",
        [d.id],
      );
    }
    expect(
      (await withdraw("restart_gone")).status === 200,
      "withdraw restart reply",
    );
    return "two queued deliveries committed; one reply withdrawn; restart and run --restart";
  },
);
skip(
  "E5.2-inflight-bytes",
  "withdraw after the final check or after provider acceptance",
  "a boolean read cannot retract already submitted bytes; tap rechecks current state",
);
skip(
  "E5.2-stock-reader",
  "full stock host with integrator registration and privacy review",
  "pending SQL is applied only to this disposable scenario database",
);
await runtime.end();
await closeDb();
process.exit(finish());

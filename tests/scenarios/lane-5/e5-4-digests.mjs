// Stock server/PostgreSQL; development identity/license/model are edge fakes.
// No made-up aggregate owner or seeded digest counts.
import { createRequire } from "node:module";
import { ACTORS, MAYA_CREATOR_ID, call, signIn } from "../lane-2/lib.mjs";
import { expect, step, skip, finish } from "./lib.mjs";
const require = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
);
const { Pool } = require("pg");
const db = new Pool({
  connectionString:
    "postgresql://postgres:foundation-test-only@127.0.0.1:56450/creator_stack",
  max: 2,
});
const api = "http://127.0.0.1:56451";
try {
  const creator = await signIn(api, ACTORS.maya, "/studio/impact");
  const fan = await signIn(api, ACTORS.fanOne);
  await step(
    "E5.4-digest-owner",
    "digest and activation reads require the actual creator",
    async () => {
      for (const name of ["impact", "activation"]) {
        const own = await call(api, "GET", `/v1/growth/${name}`, {
          token: creator.token,
        });
        const wrong = await call(api, "GET", `/v1/growth/${name}`, {
          token: fan.token,
        });
        const anon = await call(api, "GET", `/v1/growth/${name}`);
        expect(
          own.status === 200 && wrong.status === 403 && anon.status === 401,
          `${name}: ${own.status}/${wrong.status}/${anon.status}`,
        );
        expect(
          own.json[name] === null,
          `${name} unexpectedly has an owner-produced record`,
        );
      }
      return "both endpoints: creator 200/null, fan 403, anonymous 401";
    },
  );
  await step(
    "E5.4-digest-connection",
    "inspect real published AI and persisted digest jobs without inventing zero counts",
    async () => {
      const published = (
        await db.query(
          "SELECT count(*)::int n FROM creator.ai_version WHERE creator_id=$1 AND state='live' AND published_at IS NOT NULL",
          [MAYA_CREATOR_ID],
        )
      ).rows[0].n;
      const jobs = (
        await db.query(
          "SELECT count(*)::int n FROM growth.activation_job WHERE creator_id=$1",
          [MAYA_CREATOR_ID],
        )
      ).rows[0].n;
      const impact = (
        await db.query(
          "SELECT count(*)::int n FROM growth.impact WHERE creator_id=$1",
          [MAYA_CREATOR_ID],
        )
      ).rows[0].n;
      expect(published > 0, "real AI publication missing");
      expect(
        jobs === 0 && impact === 0,
        `unexpected records jobs=${jobs} impact=${impact}`,
      );
      return `${published} actual live AI version; no activation job or impact record; publication/aggregate connections absent`;
    },
  );
  for (const [id, what] of [
    [
      "counts",
      "closed-week counts equal actual conversation/reply/Note totals",
    ],
    ["quiet", "quiet week and time zone/window boundaries"],
    ["activation", "72-hour publication job, useful outcomes and replay"],
    ["consent", "Thanks withdrawal, digest delivery and unsubscribe"],
    [
      "failure",
      "lease race, crash, restart and owner outage with actual aggregates",
    ],
  ])
    skip(
      `E5.4-digest-${id}`,
      what,
      "stock host does not connect weeklyImpactSource, activationSource, Thanks permission or delivery provider; no fake owner is substituted",
    );
} finally {
  await db.end();
}
process.exitCode = finish();

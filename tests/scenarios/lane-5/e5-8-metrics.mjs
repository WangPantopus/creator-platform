// Full stock HTTP/PostgreSQL. No fabricated metric rows or cohort assignment.
import { randomUUID } from "node:crypto";
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
  const creator = await signIn(api, ACTORS.maya, "/studio/measurement");
  const fan = await signIn(api, ACTORS.fanOne);
  const entry = {
    id: randomUUID(),
    source: "creator_link",
    handle: "maya",
    objectId: null,
    surface: "web",
    consent: true,
  };
  await step(
    "E5.8-consented-entry",
    "a real opted-in arrival is stored once on retry; changed reuse refused",
    async () => {
      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          call(api, "POST", "/v1/growth/entry", {
            token: fan.token,
            body: entry,
          }),
        ),
      );
      expect(
        results.every((r) => r.status === 200),
        results.map((r) => `${r.status} ${r.text}`).join(),
      );
      const changed = await call(api, "POST", "/v1/growth/entry", {
        token: fan.token,
        body: { ...entry, source: "direct" },
      });
      expect(
        changed.status === 409,
        `changed ID ${changed.status}: ${changed.text}`,
      );
      expect(
        (
          await db.query(
            "SELECT count(*)::int n FROM growth.entry_attribution WHERE id=$1",
            [entry.id],
          )
        ).rows[0].n === 1,
        "arrival attribution duplicated",
      );
      return "three 200s; one attribution row; changed retry 409";
    },
  );
  await step(
    "E5.8-emitter-gap",
    "real arrival and follow actions must each create their pilot event",
    async () => {
      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          call(api, "PUT", `/v1/growth/follow/${MAYA_CREATOR_ID}`, {
            token: fan.token,
            body: { following: true },
          }),
        ),
      );
      expect(
        results.every((r) => r.status === 200),
        results.map((r) => `${r.status} ${r.text}`).join(),
      );
      const follows = (
        await db.query(
          "SELECT count(*)::int n FROM growth.follow WHERE account_id=$1 AND creator_id=$2",
          [ACTORS.fanOne, MAYA_CREATOR_ID],
        )
      ).rows[0].n;
      expect(follows === 1, `stored follows ${follows}`);
      const rows = (
        await db.query(
          "SELECT type,count(*)::int n FROM growth.metric WHERE account_id=$1 AND creator_id=$2 AND type IN ('arrival','follow') GROUP BY type",
          [ACTORS.fanOne, MAYA_CREATOR_ID],
        )
      ).rows;
      expect(
        rows.some((r) => r.type === "arrival" && r.n >= 1) &&
          rows.some((r) => r.type === "follow" && r.n === 1),
        `one real follow and opted-in entry exist, but metric rows=${JSON.stringify(rows)}; owner emitters and cohort assignment are not connected`,
      );
    },
  );
  await step(
    "E5.8-owner-view",
    "only the creator reads measurement; five-person privacy rule remains",
    async () => {
      const own = await call(api, "GET", "/v1/growth/funnel", {
        token: creator.token,
      });
      const wrong = await call(api, "GET", "/v1/growth/funnel", {
        token: fan.token,
      });
      const anon = await call(api, "GET", "/v1/growth/funnel");
      expect(
        own.status === 200 && wrong.status === 403 && anon.status === 401,
        `${own.status}/${wrong.status}/${anon.status}`,
      );
      expect(
        own.json.minimumDistinctActors === 5 && own.json.counts.length === 0,
        JSON.stringify(own.json),
      );
      return "creator 200, fan 403, anonymous 401; minimum five; no invented counts";
    },
  );
  await step(
    "E5.8-client-claim",
    "a browser cannot claim a useful-answer outcome",
    async () => {
      const before = (
        await db.query("SELECT count(*)::int n FROM growth.metric")
      ).rows[0].n;
      const response = await call(api, "POST", "/v1/growth/metrics", {
        token: fan.token,
        body: {
          id: randomUUID(),
          type: "useful_answer",
          creatorId: MAYA_CREATOR_ID,
        },
      });
      expect(
        response.status === 404,
        `unexpected client outcome endpoint ${response.status}`,
      );
      expect(
        (await db.query("SELECT count(*)::int n FROM growth.metric")).rows[0]
          .n === before,
        "client outcome persisted",
      );
      return "no browser outcome endpoint; metric count unchanged";
    },
  );
  skip(
    "E5.8-sixteen",
    "all sixteen events once per real action, including race/restart",
    "owner emitters and pilot cohort assignment missing",
  );
  skip(
    "E5.8-pilot-ten",
    "ten real fans, matching hand counts and privacy-approved aggregate",
    "cohort owner and privacy review pending; no manufactured records or weaker suppression",
  );
} finally {
  await db.end();
}
process.exitCode = finish();

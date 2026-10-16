// E4.9, C8 and the founder's decision 5 (lane-4-decisions.md, taken as the
// proposed default on 2026-10-16): the public summary says "Maya usually
// decides in {range}" from her decision record, the middle half (25th to 75th
// percentile) of how long fans waited over the last 90 days, rounded to hours
// or days, and only once there are five outcomes. An accept or a decline is
// timed when Maya made it, and an expiry at its deadline, not when the system
// got to it. A withdrawal is the fan's and does not count. Nothing about a
// request, a fan or how many there were is in the summary. Without the record
// the field stays empty.
//
// The record needs a migration that is not registered yet
// (schema-decision-record.sql). Like the share-status scenario, this applies it
// to the stack's own database after the backend has started, and removes it
// at the end: it changes catalogue pins the integrator regenerates on
// registration. To make the range exact, Maya's earlier outcomes are moved
// back past the 90 days while the steps run, and put back afterwards. Waits
// are made by moving each request's start, and a deadline, in this stack's own
// database. Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-9-decides-in.mjs
import { readFileSync } from "node:fs";
import {
  ACCOUNT,
  API,
  CREATOR,
  accept,
  asCreator,
  asFan,
  decide,
  expect,
  finish,
  offer,
  packetRow,
  setLimit,
  sleep,
  sql,
  step,
  submit,
  withdraw,
} from "./lib.mjs";
import { startScheduler, stopScheduler } from "./scheduler.mjs";

const migration = new URL(
  "../../../apps/backend/src/modules/commerce/schema-decision-record.sql",
  import.meta.url,
);
const present = async () =>
  (
    await sql(
      "SELECT to_regprocedure('creator.commerce_decision_range(uuid)') IS NOT NULL AS present",
    )
  )[0].present;
/** Stand-in for the migration's registration, in this stack's own database. */
async function applyRecord() {
  if (!(await present())) await sql(readFileSync(migration, "utf8"));
}
/** Removes it again, so the stack's backend can restart until it is registered. */
async function removeRecord() {
  await sql(`BEGIN;
DROP FUNCTION IF EXISTS creator.commerce_decision_range(uuid);
DROP POLICY IF EXISTS decision_record ON creator.commerce_packet;
DROP POLICY IF EXISTS decision_record ON creator.commerce_effect;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='creator_commerce_decision_read') THEN
  SET LOCAL ROLE creator_owner;
  REVOKE ALL ON creator.commerce_packet,creator.commerce_effect,creator.fan_profile,creator.creator_profile FROM creator_commerce_decision_read;
  REVOKE USAGE ON SCHEMA creator FROM creator_commerce_decision_read;
  RESET ROLE;
  DROP ROLE creator_commerce_decision_read;
 END IF;
END $$;
COMMIT;`);
}

const summary = async (creatorId = CREATOR.maya) => {
  const answer = await fetch(
    `${API}/v1/commerce/creators/${creatorId}/summary`,
  );
  return { status: answer.status, body: await answer.json() };
};
const HOUR = 3600;
/** The middle half in words, restated here from the decision: hours while
 * the slower end is under 48 hours, days beyond; never under one. */
function words(low, high) {
  const hours = high < 48 * HOUR;
  const unit = hours ? HOUR : 24 * HOUR;
  const [a, b] = [low, high].map((s) => Math.max(1, Math.round(s / unit)));
  const word = hours ? "hour" : "day";
  return a === b
    ? `${a} ${word}${a === 1 ? "" : "s"}`
    : `${a} to ${b} ${word}s`;
}
/** percentile_cont: linear between the two nearest of the sorted waits. */
function percentile(sorted, q) {
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}
/** What the rule gives for these waits, in seconds. */
function sentence(waits) {
  if (waits.length < 5) return "";
  const sorted = [...waits].sort((a, b) => a - b);
  return `Maya usually decides in ${words(percentile(sorted, 0.25), percentile(sorted, 0.75))}`;
}

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
await stopScheduler();
await startScheduler(2000);
const mode = (
  await offer(maya, { weeklyLimit: 20, title: "Written reply (decides in)" })
).body;
const began = (await sql("SELECT now() AS at"))[0].at;

/** A request whose hold landed `hours` ago (its start moved back). */
async function waitedFor(hours) {
  const id = (await submit(fan, mode)).body.packet.id;
  await sql(
    "UPDATE creator.commerce_packet SET submitted_at=now()-($2*interval '1 hour') WHERE id=$1",
    [id, hours],
  );
  return id;
}
async function until(what, check, ms = 60000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`${what}: not within ${ms / 1000} s`);
    await sleep(500);
  }
}

let others = [];
await step(
  "D5-1",
  "without the decision record the field stays empty, never an invented range",
  async () => {
    expect(!(await present()), "the record is already there");
    const { status, body } = await summary();
    expect(status === 200 && body.reliability === "", JSON.stringify(body));
    return `200; reliability "${body.reliability}"`;
  },
);
try {
  await applyRecord();
  // Maya's earlier outcomes, moved back past the 90 days for the steps below.
  others = (
    await sql(
      "SELECT id FROM creator.commerce_packet WHERE creator_id=$1 AND submitted_at IS NOT NULL AND state IN ('accepted','declined','expired','withdrawn','draft') AND created_at<$2",
      [CREATOR.maya, began],
    )
  ).map((r) => r.id);
  await sql(
    "UPDATE creator.commerce_effect SET created_at=created_at-interval '120 days' WHERE packet_id=ANY($1::uuid[]) AND provider_key ~ ':(capture|release):[0-9]+$'",
    [others],
  );
  await sql(
    "UPDATE creator.commerce_packet SET decision_at=decision_at-interval '120 days' WHERE id=ANY($1::uuid[])",
    [others],
  );

  const waits = [];
  await step("D5-2", "four outcomes are not enough: still empty", async () => {
    expect(
      (await accept(maya, await waitedFor(2))).status === 200,
      "accept at 2 h",
    );
    expect(
      (await accept(maya, await waitedFor(6))).status === 200,
      "accept at 6 h",
    );
    expect(
      (await decide(maya, await waitedFor(20), { action: "decline" }))
        .status === 200,
      "decline at 20 h",
    );
    // An expiry is timed at its deadline (40 h), not when it was released (50 h).
    const lapsed = await waitedFor(50);
    await sql(
      "UPDATE creator.commerce_packet SET decision_at=submitted_at+interval '40 hours' WHERE id=$1",
      [lapsed],
    );
    await until(
      "the expiry",
      async () => (await packetRow(lapsed)).state === "expired",
    );
    waits.push(2 * HOUR, 6 * HOUR, 20 * HOUR, 40 * HOUR);
    const { body } = await summary();
    expect(body.reliability === "", `"${body.reliability}"`);
    return `2 h, 6 h, 20 h accepted or declined, and an expiry at its 40 h deadline: reliability "${body.reliability}"`;
  });
  await step(
    "D5-3",
    "the fifth outcome: 'Maya usually decides in 6 to 40 hours' (the expiry counted at its deadline)",
    async () => {
      expect(
        (await decide(maya, await waitedFor(70), { action: "decline" }))
          .status === 200,
        "decline at 70 h",
      );
      waits.push(70 * HOUR);
      const want = sentence(waits);
      const { body } = await summary();
      const atRelease = sentence([2, 6, 20, 50, 70].map((h) => h * HOUR));
      expect(
        want === "Maya usually decides in 6 to 40 hours" &&
          body.reliability === want,
        `"${body.reliability}", want "${want}"`,
      );
      return `"${body.reliability}" (counted when released, it would read "${atRelease}")`;
    },
  );
  await step(
    "D5-4",
    "a withdrawal is the fan's, not a decision: the range does not move",
    async () => {
      const id = await waitedFor(100);
      expect((await withdraw(fan, id)).status === 200, "withdraw");
      await until(
        "the withdrawal",
        async () => (await packetRow(id)).state === "withdrawn",
      );
      const { body } = await summary();
      const counted = sentence([...waits, 100 * HOUR]);
      expect(
        body.reliability === sentence(waits),
        `"${body.reliability}" (counting it would read "${counted}")`,
      );
      return `"${body.reliability}" (counting it would read "${counted}")`;
    },
  );
  await step(
    "D5-5",
    "the 90 days: an outcome 89 days ago counts, one 91 days ago does not",
    async () => {
      const [last] = await sql(
        "SELECT p.id FROM creator.commerce_packet p WHERE p.mode_id=$1 AND p.state='declined' ORDER BY p.created_at DESC LIMIT 1",
        [mode.id],
      );
      const move = (days) =>
        sql(
          "UPDATE creator.commerce_effect e SET created_at=now()-($2*interval '1 day') FROM creator.commerce_packet p WHERE p.id=$1 AND e.packet_id=p.id AND e.provider_key=p.id::text||':release:'||p.authorization_attempt",
          [last.id, days],
        );
      const start = (days) =>
        sql(
          "UPDATE creator.commerce_packet SET submitted_at=now()-($2*interval '1 day')-interval '70 hours' WHERE id=$1",
          [last.id, days],
        );
      await start(89);
      await move(89);
      const inside = (await summary()).body.reliability;
      await start(91);
      await move(91);
      const outside = (await summary()).body.reliability;
      expect(
        inside === sentence(waits) && outside === "",
        `89 days: "${inside}"; 91 days: "${outside}"`,
      );
      return `89 days: "${inside}"; 91 days: "${outside}" (four left)`;
    },
  );
  await step(
    "D5-6",
    "nothing private: no count, no request, no fan; a creator with no record reads empty",
    async () => {
      const { body } = await summary();
      const text = JSON.stringify(body);
      const leaks = ["outcomes", "count", "packet", fan.fanId].filter((n) =>
        text.includes(n),
      );
      const devon = await summary(CREATOR.devon);
      const grants = (
        await sql(
          "SELECT has_function_privilege('creator_runtime','creator.commerce_decision_range(uuid)','EXECUTE') AS runtime, has_function_privilege('public','creator.commerce_decision_range(uuid)','EXECUTE') AS everyone",
        )
      )[0];
      expect(
        !leaks.length &&
          devon.status === 200 &&
          devon.body.reliability === "" &&
          grants.runtime &&
          !grants.everyone,
        `leaks ${leaks}; Devon ${devon.status} "${devon.body.reliability}"; ${JSON.stringify(grants)}`,
      );
      return `no leaks; Devon "${devon.body.reliability}"; executable by the runtime login only`;
    },
  );
} finally {
  await sql(
    "UPDATE creator.commerce_effect SET created_at=created_at+interval '120 days' WHERE packet_id=ANY($1::uuid[]) AND provider_key ~ ':(capture|release):[0-9]+$'",
    [others],
  );
  await sql(
    "UPDATE creator.commerce_packet SET decision_at=decision_at+interval '120 days' WHERE id=ANY($1::uuid[])",
    [others],
  );
  await removeRecord();
}
await step(
  "D5-7",
  "the record removed again: empty, and the summary still answers",
  async () => {
    const { status, body } = await summary();
    expect(
      !(await present()) && status === 200 && body.reliability === "",
      `${status} "${body.reliability}"`,
    );
    return `${status}; reliability "${body.reliability}"`;
  },
);
await finish();

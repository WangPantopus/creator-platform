// E4.12, the WP 4.1 database guard in depth: beyond a capture row for an
// unaccepted request (e4-12-who-may.mjs steps 8 and 9), no write can add a
// second capture to an accepted request, point a capture at another
// request's hold, turn another money operation into a capture, or re-arm an
// old capture, while the backend's own claims and settlements still pass.
// Every attempt is made as the backend's runtime login acting for Maya and
// rolled back. Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-12-capture-guard.mjs
import { createRequire } from "node:module";
import {
  ACCOUNT,
  ADMIN_DB,
  CREATOR,
  RUNTIME_DB,
  accept,
  asCreator,
  asFan,
  expect,
  finish,
  http,
  offer,
  packetRow,
  setLimit,
  sql,
  step,
  stripeState,
  submit,
  withdraw,
} from "./lib.mjs";

const pg = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
)("pg");
const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fanA = await asFan(ACCOUNT.fanOne);
const fanB = await asFan(ACCOUNT.fanTwo);
for (const fan of [fanA, fanB]) await setLimit(fan, 1_000_000);
const mode = (await offer(maya)).body;
const p1 = (await submit(fanA, mode)).body.packet;
const p2 = (await submit(fanB, mode)).body.packet;
const capture = async (id) =>
  (
    await sql(
      "SELECT * FROM creator.commerce_effect WHERE packet_id=$1 AND operation='capture'",
      [id],
    )
  )[0];
const effectOf = async (id, operation) =>
  (
    await sql(
      "SELECT id FROM creator.commerce_effect WHERE packet_id=$1 AND operation=$2",
      [id, operation],
    )
  )[0].id;

/** Run one write as `login` (acting for Maya unless the owner), always rolled back. */
async function attempt(text, values, login = RUNTIME_DB) {
  const client = new pg.Client({ connectionString: login });
  await client.connect();
  try {
    await client.query("BEGIN");
    if (login === RUNTIME_DB)
      await client.query("SELECT set_config('app.account_id',$1,true)", [
        ACCOUNT.maya,
      ]);
    const result = await client.query(text, values);
    return result.rowCount
      ? `allowed (${result.rowCount} row)`
      : "matched no row";
  } catch (error) {
    return `refused: ${error.code}`;
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}
const insertCapture = (p, keyAttempt, intentId) =>
  attempt(
    "INSERT INTO creator.commerce_effect(creator_id,fan_id,packet_id,operation,provider_key,request) VALUES($1,$2,$3,'capture',$4,$5)",
    [
      p.creator_id,
      p.fan_id,
      p.id,
      `${p.id}:capture:${keyAttempt}`,
      JSON.stringify({
        intentId,
        amount: p.snapshot.amount,
        currency: p.snapshot.currency,
      }),
    ],
  );

await step(
  "G-0",
  "Maya accepts request 1 through the API: the guard lets the real capture through",
  async () => {
    const done = await accept(maya, p1.id);
    const p = await packetRow(p1.id);
    expect(
      done.status === 200 &&
        p.state === "accepted" &&
        (await capture(p1.id)).state === "done",
      `${done.status} ${p.state}`,
    );
    return `request 1 ${p.state}/${p.payment_state}; request 2 ${(await packetRow(p2.id)).state}`;
  },
);
await step(
  "G-1",
  "a second capture row for the accepted request, under any other key, is refused",
  async () => {
    const p = await packetRow(p1.id);
    const result = await insertCapture(p, 2, p.intent_ref);
    expect(result.startsWith("refused: 23514"), result);
    return result;
  },
);
await step(
  "G-2",
  "the accepted request's capture cannot be pointed at fan B's hold",
  async () => {
    const own = await capture(p1.id);
    const other = (await packetRow(p2.id)).intent_ref;
    const result = await attempt(
      "UPDATE creator.commerce_effect SET request=jsonb_set(request,'{intentId}',to_jsonb($2::text)),state='pending' WHERE id=$1",
      [own.id, other],
    );
    expect(result.startsWith("refused: 23514"), result);
    return result;
  },
);
await step(
  "G-3",
  "fan B's authorization cannot be turned into a capture",
  async () => {
    const result = await attempt(
      "UPDATE creator.commerce_effect SET operation='capture' WHERE id=$1",
      [await effectOf(p2.id, "authorize")],
    );
    expect(result.startsWith("refused: 23514"), result);
    return result;
  },
);
let planted;
await step(
  "G-4",
  "a capture row older than the guard cannot be re-armed for an unaccepted request",
  async () => {
    // Setup in this stack's own database: plant a finished capture row for
    // request 2 the way one could exist from before the guard (triggers off for
    // this one write), then try to make it claimable again.
    const owner = new pg.Client({ connectionString: ADMIN_DB });
    await owner.connect();
    const p = await packetRow(p2.id);
    await owner.query("BEGIN");
    await owner.query("SET LOCAL session_replication_role=replica");
    planted = (
      await owner.query(
        "INSERT INTO creator.commerce_effect(creator_id,fan_id,packet_id,operation,provider_key,request,state,error_code) VALUES($1,$2,$3,'capture',$4,$5,'failed','planted_before_guard') RETURNING id",
        [
          p.creator_id,
          p.fan_id,
          p.id,
          `${p.id}:capture:planted`,
          JSON.stringify({
            intentId: p.intent_ref,
            amount: p.snapshot.amount,
            currency: p.snapshot.currency,
          }),
        ],
      )
    ).rows[0].id;
    await owner.query("COMMIT");
    await owner.end();
    const runtime = await attempt(
      "UPDATE creator.commerce_effect SET state='pending',next_at=now() WHERE id=$1",
      [planted],
    );
    const asOwner = await attempt(
      "UPDATE creator.commerce_effect SET state='pending',next_at=now() WHERE id=$1",
      [planted],
      ADMIN_DB,
    );
    await sql("DELETE FROM creator.commerce_effect WHERE id=$1", [planted]);
    expect(
      runtime.startsWith("refused: 23514") &&
        asOwner.startsWith("refused: 23514"),
      `${runtime} / ${asOwner}`,
    );
    return `runtime ${runtime}; owner ${asOwner}; planted row removed`;
  },
);
await step(
  "G-5",
  "re-arming the accepted request's own capture is allowed and settles with no second capture",
  async () => {
    const captures = (await stripeState()).calls.filter(
      (c) => c.op === "capture",
    ).length;
    const own = await capture(p1.id);
    await sql(
      "UPDATE creator.commerce_effect SET state='pending',next_at=now()-interval '1 second' WHERE id=$1",
      [own.id],
    );
    const settled = await http(
      "POST",
      `/v1/commerce/packets/${p1.id}/reconcile`,
      fanA.token,
      {},
    );
    const after = (await stripeState()).calls.filter(
      (c) => c.op === "capture",
    ).length;
    expect(
      settled.status === 200 &&
        (await capture(p1.id)).state === "done" &&
        after === captures,
      `${settled.status} ${(await capture(p1.id)).state}, capture calls ${captures} -> ${after}`,
    );
    return `reconciled, capture effect done, processor capture calls unchanged (${after})`;
  },
);
await step(
  "G-6",
  "fan B withdraws request 2: released, never captured",
  async () => {
    const done = await withdraw(fanB, p2.id);
    const p = await packetRow(p2.id);
    expect(
      done.status === 200 && p.state === "withdrawn",
      `${done.status} ${p.state}`,
    );
    return `${p.state}/${p.payment_state}`;
  },
);
await finish();

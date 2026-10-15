// E4.12 who may do what: every person other than the right one is refused, the
// same way every time, and nothing behind the refusal moves; a signed accept
// cannot be replayed onto another request; and the database itself refuses a
// capture row for a request nobody accepted, even written directly as the
// backend's own login (the WP 4.1 guard; this case fails on a database
// without it). Fakes: card processor, development identity, software passkeys.
//   node tests/scenarios/lane-4/e4-12-who-may.mjs
import { createRequire } from "node:module";
import {
  ACCOUNT,
  CREATOR,
  RUNTIME_DB,
  ADMIN_DB,
  acceptCommand,
  asCreator,
  asFan,
  decide,
  expect,
  finish,
  http,
  intentsFor,
  key,
  ledger,
  offer,
  packet,
  packetRow,
  setLimit,
  signAct,
  signIn,
  step,
  submit,
  withdraw,
} from "./lib.mjs";

const pg = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
)("pg");
const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const devon = await asCreator(ACCOUNT.devon, CREATOR.devon);
const team = await signIn(ACCOUNT.team);
const fanA = await asFan(ACCOUNT.fanOne);
const fanB = await asFan(ACCOUNT.fanTwo);
for (const fan of [fanA, fanB]) await setLimit(fan, 1_000_000);
const mode = (await offer(maya, { weeklyLimit: 5 })).body;
const p1 = (await submit(fanA, mode)).body.packet;
const p2 = (await submit(fanB, mode)).body.packet;

/** The request, its ledger and the processor are exactly as they were. */
async function unchanged(id, label) {
  const before = {
    row: await packetRow(id),
    rows: (await ledger(id)).length,
    intents: JSON.stringify(await intentsFor(id)),
  };
  return async (response) => {
    const after = {
      row: await packetRow(id),
      rows: (await ledger(id)).length,
      intents: JSON.stringify(await intentsFor(id)),
    };
    expect(
      [401, 403, 404, 409].includes(response.status),
      `${label}: status ${response.status} ${JSON.stringify(response.body)}`,
    );
    expect(
      after.row.state === before.row.state &&
        after.row.version === before.row.version &&
        after.rows === before.rows &&
        after.intents === before.intents,
      `${label}: something moved`,
    );
    return `${response.status} ${response.code}`;
  };
}
const refused = async (id, label, call) =>
  (await unchanged(id, label))(await call());

await step("E4.12-0", "two fans each hold one request with Maya", async () => {
  expect(
    p1?.state === "submitted" && p2?.state === "submitted",
    `${p1?.state} / ${p2?.state}`,
  );
  return `${p1.id.slice(0, 8)} (fan A), ${p2.id.slice(0, 8)} (fan B)`;
});
await step(
  "E4.12-1",
  "fan B cannot read, withdraw, decide, authenticate or re-authorize fan A's request",
  async () => {
    const seen = [
      await refused(p1.id, "read", () => packet(fanB, p1.id)),
      await refused(p1.id, "withdraw", () => withdraw(fanB, p1.id)),
      await refused(p1.id, "decline", () =>
        decide(fanB, p1.id, { action: "decline" }),
      ),
      await refused(p1.id, "authentication", () =>
        http(
          "POST",
          `/v1/commerce/packets/${p1.id}/authentication`,
          fanB.token,
          {},
        ),
      ),
      await refused(p1.id, "reauthorize", () =>
        http("POST", `/v1/commerce/packets/${p1.id}/reauthorize`, fanB.token, {
          version: p1.version,
          idempotencyKey: key(),
          paymentMethodId: "pm_cardVisa",
        }),
      ),
    ];
    return seen.join(", ");
  },
);
await step(
  "E4.12-2",
  "a signed-out visitor is refused everywhere with 401",
  async () => {
    const seen = [
      await refused(p1.id, "read", () => packet(null, p1.id)),
      await refused(p1.id, "withdraw", () => withdraw(null, p1.id)),
      await refused(p1.id, "decide", () =>
        decide(null, p1.id, { action: "decline" }),
      ),
    ];
    const sent = await http("POST", "/v1/commerce/packets", undefined, {
      ...p1,
      idempotencyKey: key(),
    });
    expect(
      seen.every((s) => s.startsWith("401")) && sent.status === 401,
      `${seen} / submit ${sent.status}`,
    );
    return seen.join(", ");
  },
);
await step(
  "E4.12-3",
  "creator B (Devon) cannot read, decide or sign an acceptance of Maya's request",
  async () => {
    const seen = [
      await refused(p1.id, "read", () => packet(devon, p1.id)),
      await refused(p1.id, "decline", () =>
        decide(devon, p1.id, { action: "decline" }),
      ),
    ];
    const own = await signAct(devon, acceptCommand(p1), {
      creatorId: CREATOR.devon,
    });
    const asMaya = await signAct(devon, acceptCommand(p1), {
      creatorId: CREATOR.maya,
    });
    expect(
      !own.signedActId && !asMaya.signedActId,
      "Devon obtained a signature for Maya's request",
    );
    return `${seen.join(", ")}; signing ${own.refused.status} ${own.refused.code} / ${asMaya.refused.status} ${asMaya.refused.code}`;
  },
);
await step(
  "E4.12-4",
  "Maya's team member and fan A cannot accept; Maya cannot withdraw the fan's request",
  async () => {
    const seen = [
      await refused(p1.id, "team accept", () =>
        decide(team, p1.id, { action: "reply_myself" }),
      ),
      await refused(p1.id, "fan accept", () =>
        decide(fanA, p1.id, { action: "reply_myself" }),
      ),
      await refused(p1.id, "creator withdraw", () => withdraw(maya, p1.id)),
    ];
    const teamSign = await http(
      "POST",
      `/v1/identity/${CREATOR.maya}/signed-acts/begin`,
      team.token,
      { command: acceptCommand(p1) },
    );
    expect(
      teamSign.status >= 400,
      `team member began a signature as Maya: ${teamSign.status}`,
    );
    return `${seen.join(", ")}; team signing ${teamSign.status} ${teamSign.code}`;
  },
);
await step(
  "E4.12-5",
  "an under-18 account is stopped at sign-in, before any request or hold",
  async () => {
    const outcome = await signIn(ACCOUNT.minor).then(
      () => "signed in",
      (error) => error.message,
    );
    expect(
      outcome.includes("403") && outcome.includes("adult_eligibility_required"),
      outcome,
    );
    return "403 adult_eligibility_required";
  },
);
let signedForP1;
await step(
  "E4.12-6",
  "Maya's signed accept for request 1 is refused on request 2 and stays unspent",
  async () => {
    signedForP1 = (await signAct(maya, acceptCommand(await packetRow(p1.id))))
      .signedActId;
    expect(signedForP1, "Maya could not sign");
    const moved = await refused(p2.id, "replayed accept", () =>
      decide(maya, p2.id, { action: "reply_myself", signedActId: signedForP1 }),
    );
    const used = await decide(maya, p1.id, {
      action: "reply_myself",
      signedActId: signedForP1,
    });
    expect(
      used.status === 200 && (await packetRow(p1.id)).state === "accepted",
      `the unspent signature then failed on request 1: ${used.status} ${used.code}`,
    );
    return `on request 2: ${moved}; on request 1: accepted`;
  },
);
await step("E4.12-7", "the spent signature cannot accept again", async () => {
  return refused(p1.id, "second use", () =>
    decide(maya, p1.id, { action: "reply_myself", signedActId: signedForP1 }),
  );
});

/** Write a capture request for request 2 straight into the table, then roll it back. */
async function strayCapture(url, account) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    if (account)
      await client.query("SELECT set_config('app.account_id',$1,true)", [
        account,
      ]);
    const p = await packetRow(p2.id);
    await client.query(
      "INSERT INTO creator.commerce_effect(creator_id,fan_id,packet_id,operation,provider_key,request) VALUES($1,$2,$3,'capture',$4,$5)",
      [
        p.creator_id,
        p.fan_id,
        p.id,
        `${p.id}:capture:${p.authorization_attempt}`,
        JSON.stringify({
          intentId: p.intent_ref,
          amount: p.snapshot.amount,
          currency: p.snapshot.currency,
        }),
      ],
    );
    return "the row was accepted";
  } catch (error) {
    return `refused: ${error.code} ${error.message}`;
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
}
await step(
  "E4.12-8",
  "the database refuses a capture row for an unaccepted request from the runtime login",
  async () => {
    const result = await strayCapture(RUNTIME_DB, ACCOUNT.maya);
    expect(
      result.startsWith("refused"),
      `${result} (state ${(await packetRow(p2.id)).state}, as creator_runtime acting for Maya)`,
    );
    return result;
  },
);
await step("E4.12-9", "and from the owner login", async () => {
  const result = await strayCapture(ADMIN_DB);
  expect(result.startsWith("refused"), `${result} (as the database owner)`);
  return result;
});
await step(
  "E4.12-10",
  "fan B withdraws request 2: released, nothing ever captured",
  async () => {
    const done = await withdraw(fanB, p2.id);
    const p = await packetRow(p2.id);
    const [intent] = await intentsFor(p2.id);
    expect(
      done.status === 200 &&
        p.state === "withdrawn" &&
        intent.status === "canceled" &&
        intent.amount_received === 0,
      `${done.status} ${p.state} ${intent?.status}`,
    );
    return `${p.state}/${p.payment_state}; processor ${intent.status}`;
  },
);
await finish();

// E4.7 repeat and race over HTTP: five simultaneous submits with one key make
// one request and one hold; the same key with a different body conflicts; two
// tabs (two keys) make two requests that are both counted; five simultaneous
// accepts with one signature capture once; an accept racing a decline, and an
// accept racing the fan's withdrawal, each leave exactly one winner with the
// money agreeing. The sweep checks the whole state at the end.
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-7-repeat-race.mjs
import {
  ACCOUNT,
  CREATOR,
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
  packetRow,
  setLimit,
  signAct,
  sql,
  step,
  stripeState,
  submit,
  submitBody,
  withdraw,
} from "./lib.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const mode = (await offer(maya, { weeklyLimit: 20 })).body;
const requestsFor = async (body) =>
  (
    await sql(
      "SELECT id FROM creator.commerce_packet WHERE fan_id=$1 AND mode_id=$2 AND disclosure->>'summary'=$3",
      [fan.fanId, mode.id, body.disclosure.summary],
    )
  ).map((r) => r.id);
const captureCalls = async (id) => {
  const [intent] = await intentsFor(id);
  return (await stripeState()).calls.filter(
    (c) => c.op === "capture" && c.ref === intent.id && !c.replayed,
  ).length;
};
const together = (n, run) => Promise.all(Array.from({ length: n }, run));

await step(
  "E4.7-4",
  "five simultaneous submits with one key: one request, one hold, five equal answers",
  async () => {
    const body = submitBody(fan, mode, {
      disclosure: {
        ...submitBody(fan, mode).disclosure,
        summary: `Five taps ${key()}`,
      },
    });
    const answers = await together(5, () =>
      http("POST", "/v1/commerce/packets", fan.token, body),
    );
    const ids = new Set(answers.map((a) => a.body?.packet?.id));
    const made = await requestsFor(body);
    expect(
      answers.every((a) => a.status === 200) &&
        ids.size === 1 &&
        made.length === 1 &&
        (await intentsFor(made[0])).length === 1,
      `${answers.map((a) => a.status)}; ${made.length} requests`,
    );
    return `5 × 200, one request ${made[0].slice(0, 8)}, one hold`;
  },
);
await step(
  "E4.7-5",
  "the same key with a different body is refused and places nothing",
  async () => {
    const body = submitBody(fan, mode, {
      disclosure: {
        ...submitBody(fan, mode).disclosure,
        summary: `Key reuse ${key()}`,
      },
    });
    await http("POST", "/v1/commerce/packets", fan.token, body);
    const changed = await http("POST", "/v1/commerce/packets", fan.token, {
      ...body,
      disclosure: {
        ...body.disclosure,
        summary: `${body.disclosure.summary} (changed)`,
      },
    });
    const otherCard = await http("POST", "/v1/commerce/packets", fan.token, {
      ...body,
      paymentMethodId: "pm_cardVisaOther",
    });
    const made =
      (await requestsFor(body)).length +
      (
        await requestsFor({
          disclosure: { summary: `${body.disclosure.summary} (changed)` },
        })
      ).length;
    expect(
      changed.code === "idempotency_conflict" &&
        otherCard.code === "idempotency_conflict" &&
        made === 1,
      `${changed.status} ${changed.code} / ${otherCard.status} ${otherCard.code}; ${made} requests`,
    );
    return `${changed.status} ${changed.code} (summary), ${otherCard.status} ${otherCard.code} (card); still one request`;
  },
);
await step(
  "E4.7-6",
  "two tabs (two keys) sending the same request: two requests, both held and counted",
  async () => {
    const summary = `Two tabs ${key()}`;
    const answers = await together(2, () =>
      submit(fan, mode, {
        disclosure: { ...submitBody(fan, mode).disclosure, summary },
      }),
    );
    const made = await requestsFor({ disclosure: { summary } });
    expect(
      answers.every((a) => a.body?.packet?.state === "submitted") &&
        made.length === 2,
      `${made.length} requests`,
    );
    return "2 requests, 2 holds (each tab is its own request; both count against the limit and the week's capacity)";
  },
);
await step(
  "E4.7-7",
  "five simultaneous accepts with one signature and one key: captured once",
  async () => {
    const id = (await submit(fan, mode)).body.packet.id;
    const p = await packetRow(id);
    const { signedActId } = await signAct(maya, acceptCommand(p));
    const body = {
      action: "reply_myself",
      version: p.version,
      signedActId,
      idempotencyKey: key("accept"),
    };
    const answers = await together(5, () =>
      http("POST", `/v1/commerce/packets/${id}/decide`, maya.token, body),
    );
    const rows = (await ledger(id)).map((r) => r.kind).join(" ");
    expect(
      answers.every((a) => a.status === 200) &&
        (await captureCalls(id)) === 1 &&
        rows === "hold capture",
      `${answers.map((a) => a.status)}; ${await captureCalls(id)} captures; ${rows}`,
    );
    return `5 × 200, 1 capture at the processor, ledger ${rows}`;
  },
);
await step(
  "E4.7-8",
  "an accept and a decline at the same instant (two devices): one winner, the money agrees",
  async () => {
    const id = (await submit(fan, mode)).body.packet.id;
    const p = await packetRow(id);
    const { signedActId } = await signAct(maya, acceptCommand(p));
    const [yes, no] = await Promise.all([
      decide(maya, id, {
        action: "reply_myself",
        signedActId,
        version: p.version,
      }),
      decide(maya, id, { action: "decline", version: p.version }),
    ]);
    const after = await packetRow(id);
    const rows = (await ledger(id)).map((r) => r.kind).join(" ");
    const won =
      after.state === "accepted"
        ? "accept"
        : after.state === "declined"
          ? "decline"
          : "none";
    expect(
      (won === "accept" && rows === "hold capture") ||
        (won === "decline" && rows === "hold release"),
      `${after.state} ${rows}`,
    );
    return `winner: ${won} (accept ${yes.status}${yes.code ? ` ${yes.code}` : ""}, decline ${no.status}${no.code ? ` ${no.code}` : ""}); ledger ${rows}`;
  },
);
await step(
  "E4.7-9",
  "an accept and the fan's withdrawal at the same instant: one winner, the money agrees",
  async () => {
    const id = (await submit(fan, mode)).body.packet.id;
    const p = await packetRow(id);
    const { signedActId } = await signAct(maya, acceptCommand(p));
    const [yes, out] = await Promise.all([
      decide(maya, id, {
        action: "reply_myself",
        signedActId,
        version: p.version,
      }),
      withdraw(fan, id),
    ]);
    const after = await packetRow(id);
    const rows = (await ledger(id)).map((r) => r.kind).join(" ");
    const won =
      after.state === "accepted"
        ? "accept"
        : after.state === "withdrawn"
          ? "withdrawal"
          : "none";
    expect(
      (won === "accept" && rows === "hold capture") ||
        (won === "withdrawal" && rows === "hold release"),
      `${after.state} ${rows}`,
    );
    return `winner: ${won} (accept ${yes.status}${yes.code ? ` ${yes.code}` : ""}, withdraw ${out.status}${out.code ? ` ${out.code}` : ""}); ledger ${rows}`;
  },
);
// The open requests made here are withdrawn, so their holds end.
for (const { id } of await sql(
  "SELECT id FROM creator.commerce_packet WHERE mode_id=$1 AND state='submitted'",
  [mode.id],
))
  await withdraw(fan, id);
await finish();

// E4.9 and C8, the public summary: a signed-out visitor reads what Maya offers
// and how much of this week is left, and it always equals the capacity row the
// server enforces: a hold takes a slot, a decline returns it, a full week says
// when it opens; a paused offer disappears; nothing about a fan or a request is
// ever in it; an unknown creator is not found. The sentence is the fixed copy,
// and its delivery window reads "1 hour", "2 hours", "48 hours" or "3 days".
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-9-public-summary.mjs
import {
  ACCOUNT,
  API,
  CREATOR,
  asCreator,
  asFan,
  decide,
  expect,
  finish,
  http,
  offer,
  pauseOffer,
  setLimit,
  sql,
  step,
  submit,
} from "./lib.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const mode = (
  await offer(maya, {
    amount: 7300,
    weeklyLimit: 2,
    title: "Written reply (public summary)",
  })
).body;
const read = async () => {
  const answer = await fetch(
    `${API}/v1/commerce/creators/${CREATOR.maya}/summary`,
  );
  return {
    status: answer.status,
    cache: answer.headers.get("cache-control"),
    body: await answer.json(),
  };
};
const mine = (summary) => summary.offers.find((o) => o.modeId === mode.id);
const row = async () =>
  (
    await sql(
      "SELECT capacity_limit,reserved,used FROM creator.commerce_capacity WHERE mode_id=$1",
      [mode.id],
    )
  )[0] ?? { capacity_limit: 2, reserved: 0, used: 0 };
const enforced = async () => {
  const r = await row();
  return r.capacity_limit - r.used - r.reserved;
};

let first;
await step(
  "E4.9-7",
  "a signed-out visitor reads the summary; it equals what is enforced",
  async () => {
    first = await read();
    const o = mine(first.body);
    expect(
      first.status === 200 &&
        first.cache === "no-store" &&
        o &&
        o.left === (await enforced()) &&
        o.cap === 2 &&
        o.amount === 7300,
      `${first.status} ${JSON.stringify(o)}`,
    );
    expect(
      /^Maya answers .+ within .+ · \d+ of \d+ left this week\.$/u.test(
        first.body.capacity,
      ) && first.body.reliability === "",
      first.body.capacity,
    );
    return `${o.left} of ${o.cap} left (row agrees); "${first.body.capacity}"; reliability empty until the record exists`;
  },
);
let held;
await step(
  "E4.9-8",
  "a hold takes a slot: the summary and its version change with it",
  async () => {
    held = (await submit(fan, mode)).body.packet.id;
    const after = await read();
    expect(
      mine(after.body).left === 1 &&
        (await enforced()) === 1 &&
        after.body.version !== first.body.version,
      `${mine(after.body).left}`,
    );
    return "1 of 2 left; new version";
  },
);
await step(
  "E4.9-9",
  "a full week reads 0 left and says when it opens again",
  async () => {
    await submit(fan, mode);
    const full = mine((await read()).body);
    const monday = new Date(full.opensAt);
    expect(
      full.left === 0 &&
        (await enforced()) === 0 &&
        monday.getUTCDay() === 1 &&
        monday.getUTCHours() === 0,
      JSON.stringify(full),
    );
    return `0 left; opens ${full.opensAt}`;
  },
);
await step(
  "E4.9-10",
  "a decline returns the slot, at once, in the summary too",
  async () => {
    expect(
      (await decide(maya, held, { action: "decline" })).status === 200,
      "decline",
    );
    const back = mine((await read()).body);
    expect(
      back.left === 1 && back.opensAt === null && (await enforced()) === 1,
      JSON.stringify(back),
    );
    return "1 of 2 left again";
  },
);
await step(
  "E4.9-11",
  "nothing about a fan or a request appears; a paused offer disappears; an unknown creator is not found",
  async () => {
    const text = JSON.stringify((await read()).body);
    const leaks = ["fan", "packet", "handle", fan.fanId, held].filter(
      (needle) => text.includes(needle),
    );
    const paused = await http(
      "POST",
      `/v1/commerce/creators/${CREATOR.maya}/modes/${mode.id}`,
      maya.token,
      {
        title: mode.title ?? "Written reply (public summary)",
        kind: "written_reply",
        amount: 7300,
        publicAmount: null,
        currency: "USD",
        decisionHours: 48,
        deliveryHours: 72,
        durationSeconds: null,
        weeklyLimit: 2,
        shareable: false,
        state: "paused",
        version: mode.version,
        idempotencyKey: `pause-${mode.id}`,
      },
    );
    const gone = !mine((await read()).body);
    const unknown = await fetch(
      `${API}/v1/commerce/creators/20000000-0000-4000-8000-0000000000ff/summary`,
    );
    expect(
      !leaks.length && paused.status === 200 && gone && unknown.status === 404,
      `leaks ${leaks}, pause ${paused.status} ${paused.code}, gone ${gone}, unknown ${unknown.status}`,
    );
    return "no fan or request data; the paused offer is gone; unknown creator 404";
  },
);
await step(
  "E4.9-12",
  "the sentence says '1 hour' for a 1-hour offer; 2 hours, 48 hours and 3 days read as before",
  async () => {
    const said = [];
    for (const hours of [1, 2, 48, 72]) {
      // The cheapest offer leads the sentence: the minimum price, and a title
      // that sorts before any other scenario's.
      const made = (
        await offer(maya, {
          title: `A reply within ${hours} h (public summary)`,
          amount: 50,
          deliveryHours: hours,
          weeklyLimit: 1,
        })
      ).body;
      try {
        const summary = (await read()).body;
        expect(
          summary.offers[0]?.modeId === made.id,
          `another offer leads the sentence: ${summary.offers[0]?.title}`,
        );
        said.push(summary.capacity);
      } finally {
        await pauseOffer(maya, made.id);
      }
    }
    const want = ["1 hour", "2 hours", "48 hours", "3 days"].map(
      (d) =>
        `Maya answers written replies within ${d} · 1 of 1 left this week.`,
    );
    expect(
      JSON.stringify(said) === JSON.stringify(want),
      said.map((s) => `"${s}"`).join(" / "),
    );
    return said.map((s) => `"${s}"`).join(" / ");
  },
);
for (const { id } of await sql(
  "SELECT id FROM creator.commerce_packet WHERE mode_id=$1 AND state='submitted'",
  [mode.id],
))
  await http("POST", `/v1/commerce/packets/${id}/withdraw`, fan.token, {
    version: (
      await sql("SELECT version FROM creator.commerce_packet WHERE id=$1", [id])
    )[0].version,
    idempotencyKey: `w-${id}`,
  });
await finish();

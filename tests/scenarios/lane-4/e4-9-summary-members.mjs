// E4.9 and C8 with who can ask (WP 4.5 on the WP 4.9 summary): an offer for
// members whose tier includes requests says so in the public summary and an
// offer any fan can ask for does not; the headline sentence describes an offer
// any fan can ask for even when a members-only one is cheaper; opening the
// offer to any fan changes the summary and its version; with only members-only
// offers the headline still describes the first one. Maya's other offers are
// hidden in this stack's own database first, so the summary holds only these.
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-9-summary-members.mjs
import {
  ACCOUNT,
  API,
  CREATOR,
  asCreator,
  expect,
  finish,
  http,
  key,
  offer,
  sql,
  step,
} from "./lib.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
await sql(
  "UPDATE creator.commerce_mode SET state='hidden' WHERE creator_id=$1 AND state<>'hidden'",
  [CREATOR.maya],
);
const members = (
  await offer(maya, {
    amount: 6200,
    weeklyLimit: 3,
    title: "Written reply (members, summary)",
    eligibility: ["request"],
  })
).body;
const open = (
  await offer(maya, {
    amount: 7300,
    weeklyLimit: 2,
    title: "Written reply (anyone, summary)",
  })
).body;
const read = async () => {
  const answer = await fetch(
    `${API}/v1/commerce/creators/${CREATOR.maya}/summary`,
  );
  return { status: answer.status, body: await answer.json() };
};
const find = (summary, mode) =>
  summary.offers.find((o) => o.modeId === mode.id);
/** Save the offer again with these changes, from its current version. */
async function edit(mode, overrides) {
  const current = (
    await sql("SELECT version FROM creator.commerce_mode WHERE id=$1", [
      mode.id,
    ])
  )[0].version;
  const answer = await http(
    "POST",
    `/v1/commerce/creators/${CREATOR.maya}/modes/${mode.id}`,
    maya.token,
    {
      title: mode.title,
      kind: mode.kind,
      amount: Number(mode.amount),
      publicAmount: null,
      currency: mode.currency,
      decisionHours: mode.decision_hours,
      deliveryHours: mode.delivery_hours,
      durationSeconds: null,
      weeklyLimit: mode.weekly_limit,
      shareable: false,
      state: "offered",
      version: current,
      idempotencyKey: key("mode-edit"),
      ...overrides,
    },
  );
  expect(answer.status === 200, `edit ${answer.status} ${answer.code}`);
}

let before;
await step(
  "E4.9-12",
  "a members-only offer says so in the summary; an offer any fan can ask for does not",
  async () => {
    before = await read();
    const m = find(before.body, members);
    const o = find(before.body, open);
    expect(
      before.status === 200 &&
        before.body.offers.length === 2 &&
        before.body.offers[0].modeId === members.id &&
        m?.membersOnly === true &&
        o?.membersOnly === false,
      `${before.status} ${JSON.stringify(before.body.offers)}`,
    );
    return `two offers, cheapest first; members-only ${m.membersOnly}, anyone ${o.membersOnly}`;
  },
);
await step(
  "E4.9-13",
  "the headline describes the offer any fan can ask for, though the members-only one is cheaper",
  async () => {
    expect(
      /^Maya answers written replies within .+ · 2 of 2 left this week\.$/u.test(
        before.body.capacity,
      ),
      before.body.capacity,
    );
    return `"${before.body.capacity}" (the open offer: 2 of 2; the members-only one has 3)`;
  },
);
await step(
  "E4.9-14",
  "opening the members-only offer to any fan changes the summary, its version and the headline",
  async () => {
    await edit(members, { eligibility: [] });
    const after = await read();
    expect(
      find(after.body, members)?.membersOnly === false &&
        after.body.version !== before.body.version &&
        /· 3 of 3 left this week\.$/u.test(after.body.capacity),
      `${JSON.stringify(find(after.body, members))} ${after.body.capacity}`,
    );
    return `members-only false; new version; headline "${after.body.capacity}"`;
  },
);
await step(
  "E4.9-15",
  "with only members-only offers, the headline still describes the first one",
  async () => {
    await edit(members, { eligibility: ["request"] });
    await edit(open, { eligibility: ["request"] });
    const only = await read();
    expect(
      only.body.offers.every((o) => o.membersOnly) &&
        only.body.offers[0].modeId === members.id &&
        /· 3 of 3 left this week\.$/u.test(only.body.capacity),
      `${JSON.stringify(only.body.offers.map((o) => o.membersOnly))} ${only.body.capacity}`,
    );
    return `both members-only; headline "${only.body.capacity}"`;
  },
);
// Hide this run's offers, so fans and the next summary do not keep seeing them.
for (const mode of [members, open]) await edit(mode, { state: "hidden" });
await finish();

// E4.12 who may ask (T-07, WP 4.5): an offer can be for members whose tier
// includes requests. A fan whose access is only AI messages (a trial, or a
// pass, which can never carry requests: INV-07) is refused before any hold, at
// submit and again at a card retry; a member is held once; when the membership
// ends the same fan is refused again and the request already made stays as it
// was. Only Maya can change who can ask; an edit without the field keeps it, an
// empty list opens the offer to any fan, an unknown value is refused, a repeat
// changes it once and of two edits at once one wins. Memberships and the pass
// are stand-in grant rows written into this stack's own database, shaped as
// billing and the pass write them (source, capabilities, a valid window); the
// fan's spend limit row is cleared there first.
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-12-eligibility.mjs
import {
  ACCOUNT,
  CREATOR,
  asCreator,
  asFan,
  expect,
  finish,
  http,
  intentsFor,
  key,
  offer,
  packetRow,
  setLimit,
  signIn,
  sql,
  step,
  stripeState,
  submit,
  withdraw,
} from "./lib.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanThree);
await sql("DELETE FROM creator.commerce_spend_limit WHERE fan_id=$1", [
  fan.fanId,
]);
await setLimit(fan, 1_000_000);
// Stand-in grants from earlier runs end first, so this fan starts on its trial alone.
await sql(
  "UPDATE creator.access_grant SET state='expired' WHERE creator_id=$1 AND fan_id=$2 AND source IN ('membership','pass_slot') AND state='active'",
  [CREATOR.maya, fan.fanId],
);
const grant = async (source, capabilities) =>
  (
    await sql(
      "INSERT INTO creator.access_grant(creator_id,fan_id,capabilities,source,state,valid_from,valid_until,allowance) VALUES($1,$2,$3,$4,'active',now()-interval '1 minute',now()+interval '30 days',0) RETURNING id",
      [CREATOR.maya, fan.fanId, capabilities, source],
    )
  )[0].id;
const end = (id) =>
  sql("UPDATE creator.access_grant SET state='expired' WHERE id=$1", [id]);
const row = async (id) =>
  (
    await sql(
      "SELECT eligibility,version FROM creator.commerce_mode WHERE id=$1",
      [id],
    )
  )[0];
const slot = async (id) =>
  (
    await sql(
      "SELECT coalesce(sum(reserved),0)::int AS reserved,coalesce(sum(used),0)::int AS used FROM creator.commerce_capacity WHERE mode_id=$1",
      [id],
    )
  )[0];
const requests = async (id) =>
  (
    await sql(
      "SELECT count(*)::int AS n FROM creator.commerce_packet WHERE mode_id=$1",
      [id],
    )
  )[0].n;
const lastCall = async () =>
  Math.max(0, ...(await stripeState()).calls.map((c) => c.seq));
const holdsSince = async (seq) =>
  (await stripeState()).calls.filter((c) => c.op === "create" && c.seq > seq)
    .length;
const editBody = (mode, overrides = {}) => ({
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
  version: mode.version,
  idempotencyKey: key("mode-edit"),
  ...overrides,
});
const edit = (who, mode, overrides) =>
  http(
    "POST",
    `/v1/commerce/creators/${CREATOR.maya}/modes/${mode.id}`,
    who.token,
    editBody(mode, overrides),
  );
/** Refused before any hold: the answer, and nothing behind it. */
async function refusedCleanly(answer, mode, before) {
  const s = await slot(mode.id);
  const holds = await holdsSince(before.seq);
  const made = (await requests(mode.id)) - before.requests;
  expect(
    answer.status === 403 &&
      answer.code === "mode_access_required" &&
      made === 0 &&
      holds === 0 &&
      s.reserved === before.reserved,
    `${answer.status} ${answer.code}; ${made} new requests, ${holds} hold calls, ${s.reserved} reserved`,
  );
  return `${answer.status} ${answer.code}; no request, no hold call, no slot`;
}
const snapshot = async (mode) => ({
  seq: await lastCall(),
  requests: await requests(mode.id),
  reserved: (await slot(mode.id)).reserved,
});

let mode;
await step(
  "E4.12-11",
  "Maya saves an offer for members whose tier includes requests; it reads back that way",
  async () => {
    const saved = await offer(maya, {
      title: "Written reply (members)",
      amount: 6100,
      weeklyLimit: 3,
      eligibility: ["request"],
    });
    mode = saved.body;
    const stored = await row(mode.id);
    expect(
      saved.status === 200 &&
        JSON.stringify(mode.eligibility) === '["request"]' &&
        JSON.stringify(stored.eligibility) === '["request"]',
      `${saved.status} ${saved.code} ${JSON.stringify(stored)}`,
    );
    return `200; the API and the row both say ${JSON.stringify(stored.eligibility)}`;
  },
);
await step(
  "E4.12-12",
  "a fan whose access is only a trial (AI messages) cannot ask: refused before any hold",
  async () => {
    const before = await snapshot(mode);
    return refusedCleanly(await submit(fan, mode), mode, before);
  },
);
await step(
  "E4.12-13",
  "a pass can never carry requests (INV-07): the database refuses one that does, and a pass with AI messages cannot ask",
  async () => {
    let refused = "";
    try {
      await grant("pass_slot", ["ai_message", "request"]);
    } catch (error) {
      refused = error.code;
    }
    const pass = await grant("pass_slot", ["ai_message"]);
    try {
      const before = await snapshot(mode);
      expect(refused === "23514", `the pass with requests: ${refused}`);
      return `a pass with requests: ${refused}; a pass with AI messages: ${await refusedCleanly(await submit(fan, mode), mode, before)}`;
    } finally {
      await end(pass);
    }
  },
);
let membership;
let held;
await step(
  "E4.12-14",
  "a member whose tier includes requests can ask: one hold, one slot",
  async () => {
    membership = await grant("membership", ["request"]);
    const sent = await submit(fan, mode);
    held = sent.body?.packet?.id;
    const p = held && (await packetRow(held));
    const live = held
      ? (await intentsFor(held)).filter((i) => i.status === "requires_capture")
          .length
      : 0;
    expect(
      sent.status === 200 &&
        p.state === "submitted" &&
        live === 1 &&
        (await slot(mode.id)).reserved === 1,
      `${sent.status} ${sent.code} ${p?.state} ${live}`,
    );
    return `${p.state}/${p.payment_state}; 1 hold of ${p.snapshot.amount} ${p.snapshot.currency}; 1 slot reserved`;
  },
);
await step(
  "E4.12-15",
  "the membership ends: the same fan cannot ask again, and the request already made stays as it was",
  async () => {
    await end(membership);
    const before = await snapshot(mode);
    const answer = await refusedCleanly(await submit(fan, mode), mode, before);
    const p = await packetRow(held);
    const live = (await intentsFor(held)).filter(
      (i) => i.status === "requires_capture",
    ).length;
    expect(
      p.state === "submitted" && live === 1,
      `${p.state} with ${live} holds`,
    );
    return `${answer}; the earlier request is still ${p.state} with its 1 hold`;
  },
);
await step(
  "E4.12-16",
  "a card retry rechecks access: after a declined card the membership ends, and another card is refused",
  async () => {
    const member = await grant("membership", ["request"]);
    const sent = await submit(fan, mode, {
      paymentMethodId: "pm_cardDeclined",
    });
    const id = sent.body?.packet?.id;
    await end(member);
    const p = await packetRow(id);
    const before = await snapshot(mode);
    const again = await http(
      "POST",
      `/v1/commerce/packets/${id}/reauthorize`,
      fan.token,
      {
        version: p.version,
        paymentMethodId: "pm_cardVisa",
        idempotencyKey: key("reauthorize"),
      },
    );
    const after = await packetRow(id);
    const holds = await holdsSince(before.seq);
    expect(
      sent.status === 200 &&
        p.payment_state === "failed" &&
        again.status === 403 &&
        again.code === "mode_access_required" &&
        after.state === p.state &&
        holds === 0 &&
        (await slot(mode.id)).reserved === before.reserved,
      `${sent.status} ${p.state}/${p.payment_state}; retry ${again.status} ${again.code}; ${holds} hold calls`,
    );
    return `declined: ${p.state}/${p.payment_state}; the retry: ${again.status} ${again.code}, no hold call, still ${after.state}`;
  },
);
await step(
  "E4.12-17",
  "only Maya can change who can ask: the fan, her team member and another creator are refused",
  async () => {
    const current = await row(mode.id);
    const team = await signIn(ACCOUNT.team);
    const devon = await signIn(ACCOUNT.devon);
    const tries = [];
    for (const [who, person] of [
      ["fan", fan],
      ["team", team],
      ["devon", devon],
    ]) {
      const answer = await edit(
        person,
        { ...mode, version: current.version },
        { eligibility: [] },
      );
      tries.push(`${who} ${answer.status} ${answer.code}`);
      expect(answer.status === 403, `${who}: ${answer.status} ${answer.code}`);
    }
    const stored = await row(mode.id);
    expect(
      JSON.stringify(stored.eligibility) === '["request"]' &&
        stored.version === current.version,
      JSON.stringify(stored),
    );
    return `${tries.join("; ")}; the row is unchanged`;
  },
);
await step(
  "E4.12-18",
  "an edit without the field keeps it; an unknown value or two values are refused; a repeat changes it once",
  async () => {
    const start = await row(mode.id);
    const kept = await edit(maya, { ...mode, version: start.version });
    const afterKept = await row(mode.id);
    const unknown = await edit(
      maya,
      { ...mode, version: afterKept.version },
      { eligibility: ["vip"] },
    );
    const twice = await edit(
      maya,
      { ...mode, version: afterKept.version },
      { eligibility: ["request", "request"] },
    );
    const afterRefused = await row(mode.id);
    const repeatKey = key("mode-edit");
    const body = { eligibility: ["request"], idempotencyKey: repeatKey };
    const first = await edit(
      maya,
      { ...mode, version: afterRefused.version },
      body,
    );
    const repeat = await edit(
      maya,
      { ...mode, version: afterRefused.version },
      body,
    );
    const afterRepeat = await row(mode.id);
    expect(
      kept.status === 200 &&
        JSON.stringify(afterKept.eligibility) === '["request"]' &&
        unknown.status === 400 &&
        twice.status === 400 &&
        afterRefused.version === afterKept.version &&
        first.status === 200 &&
        repeat.status === 200 &&
        repeat.body?.version === first.body?.version &&
        afterRepeat.version === afterRefused.version + 1,
      `kept ${kept.status} ${JSON.stringify(afterKept.eligibility)}; unknown ${unknown.status} ${unknown.code}; twice ${twice.status} ${twice.code}; repeat ${first.status}/${repeat.status} v${afterRefused.version}->${afterRepeat.version}`,
    );
    mode = { ...mode, version: afterRepeat.version };
    return `kept ${JSON.stringify(afterKept.eligibility)}; "vip" ${unknown.status} ${unknown.code}; two values ${twice.status} ${twice.code}; the repeat answered from the first (one version step)`;
  },
);
await step(
  "E4.12-19",
  "two edits at once from the same version: one wins, the other is told the offer changed",
  async () => {
    const start = await row(mode.id);
    const [open, closed] = await Promise.all([
      edit(maya, { ...mode, version: start.version }, { eligibility: [] }),
      edit(
        maya,
        { ...mode, version: start.version },
        { eligibility: ["request"] },
      ),
    ]);
    const stored = await row(mode.id);
    const winner = [open, closed].filter((a) => a.status === 200);
    const loser = [open, closed].filter((a) => a.status !== 200);
    const expected = open.status === 200 ? "[]" : '["request"]';
    expect(
      winner.length === 1 &&
        loser.length === 1 &&
        loser[0].code === "stale_mode" &&
        stored.version === start.version + 1 &&
        JSON.stringify(stored.eligibility) === expected,
      `${open.status} ${open.code} / ${closed.status} ${closed.code}; ${JSON.stringify(stored)}`,
    );
    mode = { ...mode, version: stored.version };
    return `${open.status === 200 ? "opening" : "members-only"} won; the other: ${loser[0].status} ${loser[0].code}; the row holds the winner`;
  },
);
await step(
  "E4.12-20",
  "an empty list opens the offer to any fan: the trial fan can ask; a fan who read the old offer is told it changed",
  async () => {
    const start = await row(mode.id);
    const stale = { ...mode, version: start.version };
    const opened = await edit(maya, stale, { eligibility: [] });
    const now = await row(mode.id);
    const old = await submit(fan, stale);
    const sent = await submit(fan, { ...mode, version: now.version });
    const id = sent.body?.packet?.id;
    const live = id
      ? (await intentsFor(id)).filter((i) => i.status === "requires_capture")
          .length
      : 0;
    expect(
      opened.status === 200 &&
        JSON.stringify(now.eligibility) === "[]" &&
        old.status === 403 &&
        old.code === "mode_unavailable" &&
        sent.status === 200 &&
        (await packetRow(id)).state === "submitted" &&
        live === 1,
      `${opened.status}; ${JSON.stringify(now.eligibility)}; old ${old.status} ${old.code}; new ${sent.status} ${sent.code}, ${live} holds`,
    );
    return `opened (v${now.version}); the old version: ${old.status} ${old.code}; the current one: submitted with 1 hold`;
  },
);
for (const { id } of await sql(
  "SELECT id FROM creator.commerce_packet WHERE mode_id=$1 AND state='submitted'",
  [mode.id],
))
  await withdraw(fan, id);
// Hide this run's offer, so fans and the public summary do not keep seeing it.
await edit(
  maya,
  { ...mode, version: (await row(mode.id)).version },
  {
    state: "hidden",
  },
);
await finish();

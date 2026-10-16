// E4.1 after delivery, sharing (lane 5's ticket): when the fan allows a share
// card, the answer names the share grant, which is what growth's createShare
// takes, and it matches the row; a repeat is answered from the first and a
// stale version is refused; another fan and Maya's team member cannot share or
// revoke it; when Maya withdraws her permission the grant keeps its id, moves
// to a new version and the fan cannot turn it back on; an answer from an offer
// that is not shareable makes no grant at all.
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-1-share.mjs
import {
  ACCOUNT,
  CREATOR,
  accept,
  asCreator,
  asFan,
  expect,
  finish,
  http,
  key,
  offer,
  setLimit,
  signAct,
  signIn,
  sql,
  step,
  submit,
} from "./lib.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const root = `/v1/conversations/${CREATOR.maya}/${fan.fanId}`;
const commitment = async (id) =>
  (
    await sql(
      "SELECT id,state,version FROM creator.commerce_commitment WHERE packet_id=$1",
      [id],
    )
  )[0];
const grantRow = async (id) =>
  (
    await sql(
      "SELECT g.id,g.version,g.fan_choice,g.creator_permission,g.handle_display,g.revoked_at FROM creator.commerce_share_grant g JOIN creator.commerce_commitment c ON c.id=g.commitment_id WHERE c.packet_id=$1",
      [id],
    )
  )[0];
/** A request for this offer, accepted, answered with Maya's signed reply and delivered. */
async function delivered(mode, text) {
  const id = (await submit(fan, mode)).body.packet.id;
  expect((await accept(maya, id)).status === 200, "accept");
  await http("POST", `${root}/takeover`, maya.token, {
    idempotencyKey: key("takeover"),
  });
  const thread = (
    await sql(
      "SELECT id FROM creator.thread WHERE creator_id=$1 AND fan_id=$2",
      [CREATOR.maya, fan.fanId],
    )
  )[0].id;
  const { signedActId } = await signAct(
    maya,
    { actType: "reply", subjectId: thread, content: { text } },
    { fanId: fan.fanId },
  );
  const sent = await http("POST", `${root}/human-replies`, maya.token, {
    text,
    signedActId,
    idempotencyKey: key("reply"),
  });
  const done = await http(
    "POST",
    `/v1/commerce/packets/${id}/deliver`,
    maya.token,
    {
      version: (await commitment(id)).version,
      messageId: sent.body.id,
      idempotencyKey: key("deliver"),
    },
  );
  expect(
    sent.status === 200 &&
      done.status === 200 &&
      (await commitment(id)).state === "delivered",
    `reply ${sent.status} ${sent.code}, deliver ${done.status} ${done.code}`,
  );
  return id;
}
const share = (who, id, body) =>
  http("POST", `/v1/commerce/packets/${id}/share`, who.token, {
    handleDisplay: "hidden",
    idempotencyKey: key("share"),
    ...body,
  });

const shareable = (
  await offer(maya, {
    weeklyLimit: 10,
    shareable: true,
    title: "Written reply (shareable)",
  })
).body;
const id = await delivered(shareable, `A shareable answer (${Date.now()})`);
let first;
await step(
  "E4.1-9",
  "the fan allows a share card: the answer names the grant growth takes, and it matches the row",
  async () => {
    first = await share(fan, id, { version: 1, enabled: true });
    const row = await grantRow(id);
    expect(
      first.status === 200 &&
        first.body.grantId === row?.id &&
        first.body.version === row.version &&
        first.body.commitmentId === (await commitment(id)).id &&
        row.fan_choice &&
        row.creator_permission &&
        row.revoked_at === null,
      `${first.status} ${first.code} ${JSON.stringify(first.body)} / ${JSON.stringify(row)}`,
    );
    return `200 ${JSON.stringify(Object.keys(first.body))}; grantId equals the row's id; version ${row.version}; allowed by fan and Maya`;
  },
);
await step(
  "E4.1-10",
  "a repeat is answered from the first; a change keeps the grant id; a stale version is refused",
  async () => {
    const sameKey = key("share-repeat");
    const one = await share(fan, id, {
      version: first.body.version,
      enabled: true,
      handleDisplay: "handle",
      idempotencyKey: sameKey,
    });
    const two = await share(fan, id, {
      version: first.body.version,
      enabled: true,
      handleDisplay: "handle",
      idempotencyKey: sameKey,
    });
    const stale = await share(fan, id, {
      version: first.body.version,
      enabled: true,
    });
    const row = await grantRow(id);
    expect(
      one.status === 200 &&
        two.status === 200 &&
        ["commitmentId", "grantId", "version"].every(
          (field) => one.body[field] === two.body[field],
        ) &&
        one.body.grantId === first.body.grantId &&
        one.body.version === first.body.version + 1 &&
        row.version === one.body.version &&
        row.handle_display === "handle" &&
        stale.status === 403 &&
        stale.code === "stale_share",
      `${one.status}/${two.status} ${JSON.stringify(one.body)} ${JSON.stringify(two.body)}; stale ${stale.status} ${stale.code}; row v${row.version}`,
    );
    return `the repeat returned the same answer (v${one.body.version}, same grant); the old version: ${stale.status} ${stale.code}`;
  },
);
await step(
  "E4.1-11",
  "another fan and Maya's team member cannot share or revoke this answer",
  async () => {
    const before = await grantRow(id);
    const other = await signIn(ACCOUNT.fanThree);
    const team = await signIn(ACCOUNT.team);
    const tries = [];
    for (const [who, person] of [
      ["another fan", other],
      ["team", team],
    ])
      for (const enabled of [true, false]) {
        const answer = await share(person, id, {
          version: before.version,
          enabled,
        });
        tries.push(
          `${who} ${enabled ? "share" : "revoke"}: ${answer.status} ${answer.code}`,
        );
        expect(answer.status === 403 || answer.status === 404, tries.at(-1));
      }
    const after = await grantRow(id);
    expect(
      JSON.stringify(after) === JSON.stringify(before),
      `${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
    );
    return `${tries.join("; ")}; the grant is unchanged`;
  },
);
await step(
  "E4.1-12",
  "Maya withdraws her permission: same grant, new version, revoked; the fan cannot turn it back on",
  async () => {
    const before = await grantRow(id);
    const withdrawn = await share(maya, id, {
      version: before.version,
      enabled: false,
    });
    const row = await grantRow(id);
    const again = await share(fan, id, { version: row.version, enabled: true });
    expect(
      withdrawn.status === 200 &&
        withdrawn.body.grantId === before.id &&
        withdrawn.body.version === before.version + 1 &&
        row.revoked_at !== null &&
        !row.creator_permission &&
        again.status === 403 &&
        again.code === "sharing_unavailable" &&
        (await grantRow(id)).version === row.version,
      `${withdrawn.status} ${withdrawn.code} ${JSON.stringify(withdrawn.body)}; row ${JSON.stringify(row)}; fan again ${again.status} ${again.code}`,
    );
    return `200, same grant at v${withdrawn.body.version}, revoked; the fan: ${again.status} ${again.code}`;
  },
);
await step(
  "E4.1-13",
  "an answer from an offer that is not shareable cannot be shared, and no grant is made",
  async () => {
    const closed = (
      await offer(maya, {
        weeklyLimit: 10,
        shareable: false,
        title: "Written reply (not shareable)",
      })
    ).body;
    const other = await delivered(closed, `A private answer (${Date.now()})`);
    const answer = await share(fan, other, { version: 1, enabled: true });
    expect(
      answer.status === 403 &&
        answer.code === "sharing_unavailable" &&
        !(await grantRow(other)),
      `${answer.status} ${answer.code}`,
    );
    return `${answer.status} ${answer.code}; no grant row`;
  },
);
await http("POST", `${root}/handback`, maya.token, {
  idempotencyKey: key("handback"),
});
await finish();

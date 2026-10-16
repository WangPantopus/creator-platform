// E4.1 after delivery, the share card (lane 5's ticket), through growth's real
// createShare and public read. A fan makes a card from the answer they chose to
// share: it shows Maya's exact signed reply and nothing private, and anyone
// with the link can read it; only that fan can make it, and making it again
// gives the same card; nothing can be added to it (Maya cannot correct her own
// signed reply); when Maya withdraws her permission the card is withdrawn for
// everyone; a card made with
// the fan's handle is withdrawn while the fan hides the handle; a withdrawn
// signature withdraws the card. The stock backend still answers "sharing
// unavailable": growth's share answers are composed on the share host
// (share-host.mts), the wiring proposed for server.ts.
// In this stack's own database: the share-status migration is applied for the
// run and removed afterwards (its registration is pending), and one signature
// is marked withdrawn and restored, because no route withdraws a signature.
// Fakes: card processor, development identity, software passkey.
// Needs growth: node tests/scenarios/lane-4/stack.mjs up --no-web --growth
//   node tests/scenarios/lane-4/e4-1-share-card.mjs
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
  packet,
  packetRow,
  setLimit,
  signAct,
  signIn,
  sql,
  step,
  submit,
} from "./lib.mjs";
import {
  SHARE_HOST,
  applyShareStatus,
  removeShareStatus,
  startShareHost,
  stopShareHost,
} from "./share-host-control.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const mode = (
  await offer(maya, {
    weeklyLimit: 10,
    shareable: true,
    title: "Written reply (share cards)",
  })
).body;
await startShareHost();
await applyShareStatus();
const root = `/v1/conversations/${CREATOR.maya}/${fan.fanId}`;

/** A call to the share host, which composes growth with commerce's share answers. */
async function atHost(method, path, token, body) {
  const answer = await fetch(`${SHARE_HOST}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await answer.text();
  const json = text ? JSON.parse(text) : undefined;
  return { status: answer.status, body: json, code: json?.error?.code };
}
const card = (id) => atHost("GET", `/v1/growth/public/shares/${id}`);
const make = (who, grantId) =>
  atHost("POST", "/v1/growth/shares", who?.token, { grantId });
/** A request accepted and answered with Maya's signed reply, then delivered. */
async function delivered(text) {
  const id = (await submit(fan, mode)).body.packet.id;
  expect((await accept(maya, id)).status === 200, "accept");
  await http("POST", `${root}/takeover`, maya.token, {
    idempotencyKey: key("takeover"),
  });
  const thread = (await packetRow(id)).thread_id;
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
  const version = (await packet(fan, id)).body.commitment.version;
  const done = await http(
    "POST",
    `/v1/commerce/packets/${id}/deliver`,
    maya.token,
    { version, messageId: sent.body.id, idempotencyKey: key("deliver") },
  );
  expect(
    sent.status === 200 && done.status === 200,
    `reply ${sent.status}, deliver ${done.status} ${done.code}`,
  );
  return { id, messageId: sent.body.id, thread };
}
/** The fan's sharing choice on the request, as the request screen sends it. */
async function choose(who, id, enabled, handleDisplay) {
  const share = (await packet(fan, id)).body.share;
  const answer = await http(
    "POST",
    `/v1/commerce/packets/${id}/share`,
    who.token,
    {
      version: share?.version ?? 1,
      enabled,
      handleDisplay,
      idempotencyKey: key("share"),
    },
  );
  expect(answer.status === 200, `share ${answer.status} ${answer.code}`);
  return (await packet(fan, id)).body.share;
}
const message = async (id) =>
  (
    await sql(
      "SELECT id,text,version,signed_act_id,signed_content_hash FROM creator.message WHERE id=$1",
      [id],
    )
  )[0];

const first = await delivered(`An answer worth sharing (${Date.now()})`);
const grant = await choose(fan, first.id, true, "hidden");
let made;
await step(
  "E4.1-14",
  "the stock backend cannot make a card yet: its growth has no share answers",
  async () => {
    const stock = await http("POST", "/v1/growth/shares", fan.token, {
      grantId: grant.id,
    });
    expect(
      stock.status >= 400 && stock.code === "sharing_unavailable",
      `${stock.status} ${stock.code}`,
    );
    return `${stock.status} ${stock.code}`;
  },
);
await step(
  "E4.1-15",
  "the fan makes a card: Maya's exact signed reply, nothing private, readable by anyone with the link",
  async () => {
    made = await make(fan, grant.id);
    const shown = await card(made.body?.id);
    const m = await message(first.messageId);
    const s = shown.body?.source ?? {};
    const text = JSON.stringify(shown.body);
    const leaks = [first.id, fan.fanId, "lane4fan", "5000", "$"].filter(
      (needle) => text.includes(needle),
    );
    expect(
      made.status === 201 &&
        shown.status === 200 &&
        shown.body.state === "valid" &&
        s.id === m.id &&
        s.text === m.text &&
        s.version === m.version &&
        s.signedActId === m.signed_act_id &&
        s.contentHash === m.signed_content_hash &&
        s.authorKind === "human_creator" &&
        s.creatorName === "Maya" &&
        s.handle === null &&
        s.correction === null &&
        !leaks.length,
      `${made.status} ${made.code} / ${shown.status} ${JSON.stringify(shown.body)} / leaks ${leaks}`,
    );
    return `201; read signed out: valid, the exact signed text and hash, no handle, no request, fan or amount`;
  },
);
await step(
  "E4.1-16",
  "only that fan can make it: Maya, another fan and nobody signed in are refused, a made-up grant too; making it again gives the same card",
  async () => {
    const other = await signIn(ACCOUNT.fanThree);
    const tries = [
      ["Maya", await make(maya, grant.id)],
      ["another fan", await make(other, grant.id)],
      ["signed out", await make(null, grant.id)],
      [
        "made-up grant",
        await make(fan, "20000000-0000-4000-8000-0000000000aa"),
      ],
    ];
    const again = await make(fan, grant.id);
    expect(
      tries.every(([, a]) => a.status >= 400) &&
        again.status === 201 &&
        again.body.id === made.body.id,
      `${tries.map(([w, a]) => `${w} ${a.status} ${a.code}`).join("; ")}; again ${again.status} ${again.body?.id === made.body.id}`,
    );
    return `${tries.map(([w, a]) => `${w}: ${a.status} ${a.code}`).join("; ")}; again: the same card`;
  },
);
await step(
  "E4.1-17",
  "nothing can be added to the card: Maya cannot correct her own signed reply (corrections are for AI originals), and the card shows no correction",
  async () => {
    const m = await message(first.messageId);
    const command = {
      actType: "correction",
      subjectId: m.id,
      content: {
        kind: "conversation_correction",
        creatorId: CREATOR.maya,
        threadId: first.thread,
        fanId: fan.fanId,
        messageVersion: m.version,
        text: `A correction to that answer (${Date.now()})`,
      },
    };
    const signing = await signAct(maya, command);
    const shown = await card(made.body.id);
    expect(
      signing.refused?.status === 403 &&
        signing.refused.code === "correction_original_changed" &&
        shown.body.state === "valid" &&
        shown.body.source.correction === null,
      `${signing.refused?.status} ${signing.refused?.code}; card ${shown.body?.state} ${shown.body?.source?.correction}`,
    );
    return `signing a correction: ${signing.refused.status} ${signing.refused.code}; the card: ${shown.body.state}, correction ${shown.body.source.correction}`;
  },
);
await step(
  "E4.1-18",
  "Maya withdraws her permission: the card is withdrawn for everyone, at once",
  async () => {
    await choose(maya, first.id, false, "hidden");
    const shown = await card(made.body.id);
    expect(
      shown.status === 200 && shown.body.state === "withdrawn",
      `${shown.status} ${JSON.stringify(shown.body)}`,
    );
    return `read signed out: ${shown.body.state}`;
  },
);
const second = await delivered(`Another answer to share (${Date.now()})`);
let named;
await step(
  "E4.1-19",
  "a card made with the fan's handle shows it, and is withdrawn while the fan hides the handle",
  async () => {
    const g = await choose(fan, second.id, true, "handle");
    named = await make(fan, g.id);
    const before = await card(named.body?.id);
    await choose(fan, second.id, true, "hidden");
    const hidden = await card(named.body.id);
    const remade = await make(fan, g.id);
    await choose(fan, second.id, true, "handle");
    const back = await card(named.body.id);
    expect(
      named.status === 201 &&
        before.body.state === "valid" &&
        before.body.source.handle === "lane4fan2" &&
        hidden.body.state === "withdrawn" &&
        back.body.state === "valid",
      `${named.status} ${before.body?.source?.handle} / hidden ${hidden.body?.state} / again ${back.body?.state}`,
    );
    return `shown with "${before.body.source.handle}"; hidden: ${hidden.body.state}; a new card meanwhile: ${remade.status} ${remade.code ?? ""}; shown again: ${back.body.state}`;
  },
);
await step(
  "E4.1-20",
  "a withdrawn signature withdraws the card; when it stands again, so does the card",
  async () => {
    const m = await message(second.messageId);
    await sql(
      "UPDATE creator.signed_verification SET withdrawn=true WHERE id=$1",
      [m.signed_act_id],
    );
    const gone = await card(named.body.id);
    await sql(
      "UPDATE creator.signed_verification SET withdrawn=false WHERE id=$1",
      [m.signed_act_id],
    );
    const back = await card(named.body.id);
    expect(
      gone.body.state === "withdrawn" && back.body.state === "valid",
      `${gone.body?.state} / ${back.body?.state}`,
    );
    return `withdrawn signature: ${gone.body.state}; restored: ${back.body.state}`;
  },
);
await http("POST", `${root}/handback`, maya.token, {
  idempotencyKey: key("handback"),
});
await stopShareHost();
await removeShareStatus();
await finish();

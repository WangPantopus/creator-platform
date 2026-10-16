// E4.9 and C8 when ops pauses a creator: the public summary stops listing her
// offers. Before the pause a signed-out visitor and a signed-in fan read Maya's
// offer. The ops supervisor pauses Maya through lane 1's real ops decision;
// then both read "creator unavailable" (404), exactly what an unknown creator
// reads, so the ops action is not revealed, while Devon's summary is unchanged.
// While lane 1's check cannot answer (an ops write holding its denial key,
// simulated by holding that key in this database), the summary answers 503 and
// lists nothing. Lifting the pause brings her offer back at once; there is no
// unpause yet, so the scenario revokes its own restriction row in this stack's
// own database. Lane 1's pause effect also pauses Maya's AI, and nothing can
// undo that yet: reset the stack after this scenario.
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-9-paused-creator.mjs
import { createRequire } from "node:module";
import {
  ACCOUNT,
  ADMIN_DB,
  CREATOR,
  asCreator,
  asFan,
  expect,
  finish,
  http,
  key,
  offer,
  signIn,
  sql,
  step,
} from "./lib.mjs";

const pg = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
)("pg");
const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const devon = await asCreator(ACCOUNT.devon, CREATOR.devon);
// A report about Maya needs the reporter's own conversation with her.
const reporter = await asFan(ACCOUNT.fanOne);
const visitor = await signIn(ACCOUNT.fanTwo);
const supervisor = await signIn(ACCOUNT.team);
const UNKNOWN = "20000000-0000-4000-8000-0000000000ff";
// Cheaper than every other scenario's offer, so it is always among the 20 listed.
const offers = {
  [CREATOR.maya]: {
    owner: maya,
    body: {
      title: "Written reply (paused creator)",
      amount: 4100,
      weeklyLimit: 3,
    },
  },
  [CREATOR.devon]: {
    owner: devon,
    body: { title: "Written reply (control)", amount: 4200, weeklyLimit: 3 },
  },
};
for (const entry of Object.values(offers))
  entry.mode = (await offer(entry.owner, entry.body)).body;
const summary = async (creatorId, who) => {
  const answer = await http(
    "GET",
    `/v1/commerce/creators/${creatorId}/summary`,
    who?.token,
  );
  return {
    ...answer,
    offer: answer.body?.offers?.find(
      (o) => o.modeId === offers[creatorId]?.mode.id,
    ),
  };
};
/** What a visitor can tell from an answer, without its per-request ids. */
const shape = (answer) =>
  JSON.stringify({
    status: answer.status,
    code: answer.body?.error?.code,
    message: answer.body?.error?.message,
    keys: Object.keys(answer.body ?? {}),
  });
let caseId;

await step(
  "E4.9-P1",
  "before the pause, a signed-out visitor and a signed-in fan read Maya's offer",
  async () => {
    const out = await summary(CREATOR.maya);
    const signed = await summary(CREATOR.maya, visitor);
    expect(
      out.status === 200 &&
        out.offer?.amount === 4100 &&
        signed.status === 200 &&
        signed.offer?.amount === 4100,
      `signed out ${out.status} ${out.code} ${JSON.stringify(out.offer)}; signed in ${signed.status} ${signed.code}`,
    );
    return `200 with the $41 offer for both; "${out.body.capacity}"`;
  },
);
await step(
  "E4.9-P2",
  "the ops supervisor pauses Maya through lane 1's real ops decision",
  async () => {
    const filed = await http("POST", "/v1/trust/reports", reporter.token, {
      kind: "pause",
      creatorId: CREATOR.maya,
      reason: "Please pause this creator while the report is reviewed.",
      idempotencyKey: key("report"),
    });
    caseId = filed.body?.id;
    const opened = await http(
      "POST",
      `/v1/trust/cases/${caseId}/access`,
      supervisor.token,
      { purpose: "Review this report as assigned.", minutes: 15 },
    );
    const decided = await http(
      "POST",
      `/v1/trust/cases/${caseId}/decisions`,
      supervisor.token,
      {
        version: 1,
        resolution: "pause_creator",
        reason: "Paused while the report is reviewed.",
        idempotencyKey: key("decide"),
      },
    );
    const [restriction] = await sql(
      "SELECT reason_code FROM creator_trust.restriction WHERE case_id=$1 AND creator_id=$2 AND revoked_at IS NULL",
      [caseId, CREATOR.maya],
    );
    expect(
      filed.status === 201 &&
        opened.status === 200 &&
        decided.status === 200 &&
        restriction?.reason_code === "pause_creator",
      `report ${filed.status} ${filed.code}, access ${opened.status} ${opened.code}, decision ${decided.status} ${decided.code}, restriction ${JSON.stringify(restriction)}`,
    );
    return "case decided pause_creator; lane 1's restriction is in force";
  },
);
await step(
  "E4.9-P3",
  "after the pause both read 'creator unavailable', exactly what an unknown creator reads; Devon's summary is unchanged",
  async () => {
    const out = await summary(CREATOR.maya);
    const signed = await summary(CREATOR.maya, visitor);
    const unknown = await summary(UNKNOWN);
    const control = await summary(CREATOR.devon, visitor);
    expect(
      out.status === 404 &&
        out.code === "creator_unavailable" &&
        shape(out) === shape(unknown) &&
        shape(signed) === shape(unknown),
      `signed out ${shape(out)}, signed in ${shape(signed)}, unknown ${shape(unknown)}`,
    );
    expect(
      control.status === 200 && control.offer?.amount === 4200,
      `Devon ${control.status} ${control.code}`,
    );
    return "404 creator_unavailable for both, the same as an unknown creator; Devon 200 with his offer";
  },
);
await step(
  "E4.9-P4",
  "while lane 1's check cannot answer, the summary answers 503 and lists nothing; then it answers again",
  async () => {
    // An ops write holds this key exclusively while it changes Maya's denials.
    const held = new pg.Client({ connectionString: ADMIN_DB });
    await held.connect();
    let during;
    let control;
    try {
      await held.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [
        `w8-denial:creator:${CREATOR.maya}`,
      ]);
      during = await summary(CREATOR.maya);
      control = await summary(CREATOR.devon);
    } finally {
      await held.end();
    }
    const after = await summary(CREATOR.maya);
    expect(
      during.status === 503 &&
        !during.body?.offers &&
        control.status === 200 &&
        after.status === 404,
      `while held ${during.status} ${during.code}; Devon ${control.status}; after ${after.status} ${after.code}`,
    );
    return `while held: 503 ${during.code}, nothing listed (Devon still 200); released: 404 again`;
  },
);
await step(
  "E4.9-P5",
  "lifting the pause brings Maya's offer back at once (restriction revoked in this stack's own database)",
  async () => {
    await sql(
      "UPDATE creator_trust.restriction SET revoked_at=now() WHERE case_id=$1 AND revoked_at IS NULL",
      [caseId],
    );
    const out = await summary(CREATOR.maya);
    const signed = await summary(CREATOR.maya, visitor);
    expect(
      out.status === 200 &&
        out.offer?.amount === 4100 &&
        signed.status === 200 &&
        signed.offer?.amount === 4100,
      `signed out ${out.status} ${out.code}; signed in ${signed.status} ${signed.code}`,
    );
    // Each creator retires this scenario's offer.
    const retired = [];
    for (const [creatorId, entry] of Object.entries(offers)) {
      const answer = await http(
        "POST",
        `/v1/commerce/creators/${creatorId}/modes/${entry.mode.id}`,
        entry.owner.token,
        {
          kind: "written_reply",
          publicAmount: null,
          currency: "USD",
          decisionHours: 48,
          deliveryHours: 72,
          durationSeconds: null,
          shareable: false,
          ...entry.body,
          state: "paused",
          version: entry.mode.version,
          idempotencyKey: key("retire"),
        },
      );
      retired.push(answer.status);
    }
    expect(
      retired.every((s) => s === 200),
      `retired ${retired.join(", ")}`,
    );
    return "200 with her offer again for both; both offers then retired";
  },
);
await finish();

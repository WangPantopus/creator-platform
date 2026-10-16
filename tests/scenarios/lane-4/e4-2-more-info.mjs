// E4.2 "Ask for more information" (WP 4.12): Maya asks the fan a question in
// its own field, so a reply draft sent beside it never reaches the fan. A blank
// or missing question is refused, and so is one over 8,000 characters; a second
// question waits for the fan's answer; a repeat with one key asks once, and two
// questions at the same instant ask once. Wrong people are refused with nothing
// moved. The fan answers, the request goes back to Maya with the time it had
// left; she asks once more, the fan answers again, and she accepts: the money
// moves exactly as without a question. An older
// client that sends only `text` still asks (the documented fallback). Until a
// decision the hold is untouched and nothing is captured.
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-2-more-info.mjs
import {
  ACCOUNT,
  CREATOR,
  accept,
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
  signIn,
  sql,
  step,
  stripeState,
  submit,
  withdraw,
} from "./lib.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const devon = await asCreator(ACCOUNT.devon, CREATOR.devon);
const team = await signIn(ACCOUNT.team);
const fan = await asFan(ACCOUNT.fanTwo);
const otherFan = await asFan(ACCOUNT.fanOne);
await setLimit(fan, 1_000_000);
const mode = (await offer(maya, { weeklyLimit: 10 })).body;
const DRAFT = "DRAFT reply: thin the glaze and fire it a cone lower.";
const opened = [];
const request = async () => {
  const sent = await submit(fan, mode);
  expect(sent.status === 200, `submit ${sent.status} ${sent.code}`);
  opened.push(sent.body.packet.id);
  return sent.body.packet.id;
};
/** Maya's question through the Studio's own route, the one lane 6's screen calls. */
const studioDecide = async (id, body) =>
  http("POST", `/v1/studio/${CREATOR.maya}/packets/${id}/decide`, maya.token, {
    idempotencyKey: key("studio-decide"),
    version: (await packetRow(id)).version,
    ...body,
  });
const answer = async (who, id, text, version) =>
  http("POST", `/v1/commerce/packets/${id}/info`, who?.token, {
    version: version ?? (await packetRow(id)).version,
    idempotencyKey: key("info"),
    text,
  });
const questionEvents = async (id) =>
  Number(
    (
      await sql(
        "SELECT count(*) AS n FROM creator.commerce_event WHERE aggregate_id=$1 AND type='packet_more_info'",
        [id],
      )
    )[0].n,
  );
/** Everything a refusal must leave alone: the request, its ledger and the processor. */
const snapshot = async (id) => {
  const row = await packetRow(id);
  return JSON.stringify({
    state: row.state,
    version: row.version,
    question: row.question,
    fanAnswer: row.fan_answer,
    payment: row.payment_state,
    events: await questionEvents(id),
    ledger: await ledger(id),
    intents: await intentsFor(id),
  });
};
/** `statuses` lists accepted statuses, or exact "status code" pairs. */
async function refusedUnchanged(id, label, call, statuses, code) {
  const before = await snapshot(id);
  const response = await call();
  const after = await snapshot(id);
  expect(
    statuses.some((s) =>
      typeof s === "number"
        ? response.status === s && (!code || response.code === code)
        : `${response.status} ${response.code}` === s,
    ),
    `${label}: ${response.status} ${response.code}`,
  );
  expect(after === before, `${label}: something moved`);
  return `${label} ${response.status} ${response.code}`;
}
/** The hold is still held and the processor never captured or released it. */
async function holdUntouched(id) {
  const row = await packetRow(id);
  const rows = (await ledger(id)).map((r) => `${r.kind}:${r.amount}`).join(" ");
  const [intent] = await intentsFor(id);
  const moved = (await stripeState()).calls.filter(
    (c) => ["capture", "cancel"].includes(c.op) && c.ref === intent.id,
  ).length;
  expect(
    row.payment_state === "requires_capture" &&
      rows === "hold:5000" &&
      intent.status === "requires_capture" &&
      moved === 0,
    `${row.payment_state}; ${rows}; ${intent.status}; ${moved} capture or cancel calls`,
  );
  return `hold untouched (${rows}, processor ${intent.status})`;
}

let asked;
await step(
  "E4.2-MI-1",
  "Maya asks through the Studio's route with her reply draft present: the fan is asked the question, never the draft",
  async () => {
    const id = (asked = await request());
    const done = await studioDecide(id, {
      action: "more_info",
      question: "  Which clay body, and what cone do you fire to?  ",
      text: DRAFT,
    });
    expect(done.status === 200, `${done.status} ${done.code}`);
    const row = await packetRow(id);
    expect(
      row.state === "more_info" &&
        row.question === "Which clay body, and what cone do you fire to?",
      `${row.state} question ${JSON.stringify(row.question)}`,
    );
    const seen = await packet(fan, id);
    expect(
      seen.status === 200 &&
        seen.body.packet.question === row.question &&
        !JSON.stringify(seen.body).includes("DRAFT"),
      `the fan reads ${JSON.stringify(seen.body?.packet?.question)}`,
    );
    const studio = await http(
      "GET",
      `/v1/studio/${CREATOR.maya}/packets/${id}`,
      maya.token,
    );
    expect(
      studio.status === 200 && studio.body.packet.question === row.question,
      `the Studio reads ${studio.status} ${JSON.stringify(studio.body?.packet?.question)}`,
    );
    expect((await questionEvents(id)) === 1, "one packet_more_info event");
    return `more_info, trimmed question stored and read by the fan and the Studio, no draft in the fan's view; ${await holdUntouched(id)}`;
  },
);
let blankId;
await step(
  "E4.2-MI-2",
  "a blank or missing question is refused, and a reply draft is never asked in its place",
  async () => {
    const id = (blankId = await request());
    const seen = [
      await refusedUnchanged(
        id,
        "empty question beside a draft",
        () =>
          studioDecide(id, { action: "more_info", question: "", text: DRAFT }),
        [403],
        "question_required",
      ),
      await refusedUnchanged(
        id,
        "whitespace question",
        () => studioDecide(id, { action: "more_info", question: "  \n\t " }),
        [403],
        "question_required",
      ),
      await refusedUnchanged(
        id,
        "no question at all",
        () => studioDecide(id, { action: "more_info" }),
        [403],
        "question_required",
      ),
    ];
    return `${seen.join("; ")}; ${await holdUntouched(id)}`;
  },
);
await step(
  "E4.2-MI-3",
  "boundary: a question of 8,001 characters is refused by the contract; 8,000 is asked",
  async () => {
    const id = blankId;
    const tooLong = await refusedUnchanged(
      id,
      "8,001 characters",
      () =>
        studioDecide(id, { action: "more_info", question: "q".repeat(8001) }),
      [400],
      "invalid_request",
    );
    const done = await studioDecide(id, {
      action: "more_info",
      question: "q".repeat(8000),
    });
    const row = await packetRow(id);
    expect(
      done.status === 200 &&
        row.state === "more_info" &&
        row.question.length === 8000,
      `${done.status} ${done.code} ${row.state} ${row.question?.length}`,
    );
    return `${tooLong}; 8,000 characters 200, stored 8,000`;
  },
);
await step(
  "E4.2-MI-4",
  "a second question while one is pending is refused and the first stays",
  async () =>
    refusedUnchanged(
      asked,
      "second question",
      () =>
        studioDecide(asked, {
          action: "more_info",
          question: "And the glaze thickness?",
        }),
      [403],
      "question_pending",
    ),
);
await step(
  "E4.2-MI-5",
  "the same key twice asks once; the same key with another question conflicts",
  async () => {
    const id = await request();
    const version = (await packetRow(id)).version;
    const body = {
      action: "more_info",
      question: "Is the crawling on the rim or the foot?",
      version,
      idempotencyKey: key("repeat"),
    };
    const first = await decide(maya, id, body);
    const again = await decide(maya, id, body);
    const row = await packetRow(id);
    expect(
      first.status === 200 &&
        again.status === 200 &&
        row.version === version + 1 &&
        row.question === body.question &&
        (await questionEvents(id)) === 1,
      `${first.status}/${again.status} version ${version}->${row.version}, ${await questionEvents(id)} events`,
    );
    const conflict = await refusedUnchanged(
      id,
      "same key, other question",
      () => decide(maya, id, { ...body, question: "Something else?" }),
      [403],
      "idempotency_conflict",
    );
    return `200 then 200 (one version step, one event); ${conflict}`;
  },
);
await step(
  "E4.2-MI-6",
  "two different questions at the same instant: exactly one is asked",
  async () => {
    const id = await request();
    const version = (await packetRow(id)).version;
    const both = await Promise.all(
      ["Rim or foot?", "Which kiln?"].map((question) =>
        decide(maya, id, { action: "more_info", question, version }),
      ),
    );
    const row = await packetRow(id);
    const statuses = both.map((r) => `${r.status} ${r.code ?? ""}`.trim());
    expect(
      both.filter((r) => r.status === 200).length === 1 &&
        both.some(
          (r) =>
            r.status === 403 &&
            ["stale_request", "question_pending"].includes(r.code),
        ) &&
        row.version === version + 1 &&
        ["Rim or foot?", "Which kiln?"].includes(row.question) &&
        (await questionEvents(id)) === 1,
      `${statuses.join(", ")}; version ${version}->${row.version}`,
    );
    return `${statuses.join(", ")}; asked ${JSON.stringify(row.question)} once`;
  },
);
await step(
  "E4.2-MI-7",
  "wrong people cannot ask or answer, and nothing moves",
  async () => {
    const id = await request();
    const ask = (who) =>
      decide(who, id, { action: "more_info", question: "Who are you?" });
    const seen = [
      await refusedUnchanged(id, "the fan asks", () => ask(fan), [403]),
      await refusedUnchanged(
        id,
        "another fan asks",
        () => ask(otherFan),
        [403, 404],
      ),
      await refusedUnchanged(id, "Devon asks", () => ask(devon), [403, 404]),
      await refusedUnchanged(
        id,
        "Maya's team member asks",
        () => ask(team),
        [403, 404],
      ),
      await refusedUnchanged(id, "signed out asks", () => ask(null), [401]),
      await refusedUnchanged(
        id,
        "Devon asks through Maya's Studio route",
        async () =>
          http(
            "POST",
            `/v1/studio/${CREATOR.maya}/packets/${id}/decide`,
            devon.token,
            {
              action: "more_info",
              question: "Who are you?",
              version: (await packetRow(id)).version,
              idempotencyKey: key(),
            },
          ),
        // On the development stack the Studio's role check answers another
        // creator with W8's "unavailable" (fail closed), on every Studio route,
        // reads included. Reported to lane 1; a 403 or 404 is the right answer.
        [403, 404, "503 scope_denial_unavailable"],
      ),
      await refusedUnchanged(
        asked,
        "another fan answers",
        () => answer(otherFan, asked, "Not my request"),
        [403, 404],
      ),
      await refusedUnchanged(
        asked,
        "Maya answers her own question",
        () => answer(maya, asked, "Answering for the fan"),
        [403],
      ),
      await refusedUnchanged(
        asked,
        "signed out answers",
        () => answer(null, asked, "Hello"),
        [401],
      ),
    ];
    return seen.join("; ");
  },
);
await step(
  "E4.2-MI-8",
  "the fan answers: the request returns to Maya with the time it had left",
  async () => {
    const before = await packetRow(asked);
    const answered = await answer(fan, asked, "Stoneware, cone 6.");
    const row = await packetRow(asked);
    const leftSeconds = (row.decision_at.getTime() - Date.now()) / 1000;
    expect(
      answered.status === 200 &&
        row.state === "submitted" &&
        row.fan_answer === "Stoneware, cone 6." &&
        row.question === before.question &&
        Math.abs(leftSeconds - before.remaining_sla_seconds) < 120,
      `${answered.status} ${answered.code} ${row.state} answer ${JSON.stringify(row.fan_answer)}; ${Math.round(leftSeconds)} s left of ${before.remaining_sla_seconds}`,
    );
    return `submitted, answer stored, question kept; ${Math.round(leftSeconds)} s of ${before.remaining_sla_seconds} s back on the clock; ${await holdUntouched(asked)}`;
  },
);
await step(
  "E4.2-MI-9",
  "Maya asks again after the answer; the fan answers again and the new answer replaces the first",
  async () => {
    const again = await studioDecide(asked, {
      action: "more_info",
      question: "Thanks. How thick is the glaze, roughly?",
      text: DRAFT,
    });
    const waiting = await packetRow(asked);
    // While the second question waits, the first answer is still on the request.
    expect(
      again.status === 200 &&
        waiting.state === "more_info" &&
        waiting.question === "Thanks. How thick is the glaze, roughly?" &&
        waiting.fan_answer === "Stoneware, cone 6." &&
        (await questionEvents(asked)) === 2,
      `${again.status} ${again.code} ${waiting.state} ${JSON.stringify(waiting.question)} answer ${JSON.stringify(waiting.fan_answer)}`,
    );
    const answered = await answer(fan, asked, "About two coats, dipped.");
    const row = await packetRow(asked);
    const leftSeconds = (row.decision_at.getTime() - Date.now()) / 1000;
    expect(
      answered.status === 200 &&
        row.state === "submitted" &&
        row.fan_answer === "About two coats, dipped." &&
        Math.abs(leftSeconds - waiting.remaining_sla_seconds) < 120,
      `${answered.status} ${answered.code} ${row.state} ${JSON.stringify(row.fan_answer)}; ${Math.round(leftSeconds)} s left of ${waiting.remaining_sla_seconds}`,
    );
    return `second question asked (2 events; the first answer stays until the next one); answered again, ${Math.round(leftSeconds)} s back on the clock; ${await holdUntouched(asked)}`;
  },
);
await step(
  "E4.2-MI-10",
  "after two rounds of questions Maya accepts: the money moves once",
  async () => {
    const done = await accept(maya, asked);
    const after = await packetRow(asked);
    const rows = (await ledger(asked))
      .map((r) => `${r.kind}:${r.amount}`)
      .join(" ");
    const [intent] = await intentsFor(asked);
    const captures = (await stripeState()).calls.filter(
      (c) => c.op === "capture" && c.ref === intent.id && !c.replayed,
    ).length;
    expect(
      done.status === 200 &&
        after.state === "accepted" &&
        after.payment_state === "captured" &&
        rows === "hold:5000 capture:5000" &&
        intent.status === "succeeded" &&
        captures === 1,
      `${done.status} ${done.code} ${after.state}/${after.payment_state}; ${rows}; ${intent.status}; ${captures} captures`,
    );
    return `accepted: ${rows}, 1 capture at the processor`;
  },
);
await step(
  "E4.2-MI-11",
  "an older client that sends only text still asks (the documented fallback)",
  async () => {
    const id = await request();
    const done = await decide(maya, id, {
      action: "more_info",
      text: "  Older client: which clay body?  ",
    });
    const row = await packetRow(id);
    expect(
      done.status === 200 &&
        row.state === "more_info" &&
        row.question === "Older client: which clay body?",
      `${done.status} ${done.code} ${row.state} ${JSON.stringify(row.question)}`,
    );
    return `200, asked ${JSON.stringify(row.question)}; ${await holdUntouched(id)}`;
  },
);
await step(
  "E4.2-MI-12",
  "a question sent with another decision is not asked: Maya declines, the hold is released",
  async () => {
    const id = await request();
    const done = await decide(maya, id, {
      action: "decline",
      question: "Not asked",
    });
    const row = await packetRow(id);
    expect(
      done.status === 200 &&
        row.state === "declined" &&
        row.payment_state === "released" &&
        row.question === null &&
        (await questionEvents(id)) === 0,
      `${done.status} ${done.code} ${row.state}/${row.payment_state} question ${JSON.stringify(row.question)}`,
    );
    return "declined/released, no question stored";
  },
);
await step(
  "E4.2-MI-13",
  "the fan withdraws instead of answering: released, nothing charged",
  async () => {
    let withdrawn = 0;
    let waiting = 0;
    for (const id of opened) {
      const before = await packetRow(id);
      if (!["submitted", "more_info"].includes(before.state)) continue;
      if (before.state === "more_info") waiting++;
      const done = await withdraw(fan, id);
      const row = await packetRow(id);
      const rows = (await ledger(id))
        .map((r) => `${r.kind}:${r.amount}`)
        .join(" ");
      expect(
        done.status === 200 &&
          row.state === "withdrawn" &&
          row.payment_state === "released" &&
          rows === "hold:5000 release:5000",
        `${id.slice(0, 8)}: ${done.status} ${done.code} ${row.state}/${row.payment_state} ${rows}`,
      );
      withdrawn++;
    }
    expect(waiting >= 3, `${waiting} requests waiting on a question`);
    return `${withdrawn} open requests withdrawn and released (hold:5000 release:5000 each), ${waiting} of them waiting on a question`;
  },
);
await finish();

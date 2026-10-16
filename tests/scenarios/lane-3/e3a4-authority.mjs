// E3A.4: authority changes in the middle of an AI answer. A fan asks; at +0 ms,
// +200 ms after the acknowledgment, right after the worker claims the answer
// ("claimed"), or when the model starts streaming the reply
// ("stream", just before the first sentence would be delivered), the authority
// changes through the real API (or, for the licence lapse, a deadline moved in
// lane 3's own disposable database). Passes when no AI sentence is stored after
// the change committed (INV-03, INV-05), the answer ends in a terminal state, and
// a takeover reaches the fan's socket within 500 ms.
//   node tests/scenarios/lane-3/e3a4-authority.mjs [--cases takeover,pause,consent,lapse,block,pause_ai,signout,delete]
//     [--timings 0,200,claimed,stream] [--delay 300]
import {
  ACTORS,
  API,
  MAYA_CREATOR_ID,
  MODEL,
  call,
  closeDb,
  ensureMaya,
  flag,
  key,
  openFan,
  reporter,
  signIn,
  sleep,
  sql,
  watchFrames,
} from "./lib.mjs";

const { step, finish } = reporter();
const cases = flag("--cases", "takeover,pause,consent,lapse").split(",");
const timings = flag("--timings", "0,200,stream").split(",");
await call(MODEL, "POST", "/__control", {
  body: { mode: "ok", delayMs: Number(flag("--delay", "300")) },
});
step(
  "Maya's AI is live",
  true,
  await ensureMaya(Number(flag("--cap", "20000000"))),
);
const maya = (await signIn(API, ACTORS.maya, "/studio/ai")).token;
const replies = async () =>
  (await call(MODEL, "GET", "/__stats")).json?.counts?.reply ?? 0;
const dbNow = async () => (await sql("SELECT clock_timestamp() AS t"))[0].t;
// An unknown cost outside an answer (an acknowledgment's check) refuses every
// later reply for the creator. Inside an answer it counts as that answer's
// whole cost hold instead (A6b, 0251), so the creator keeps answering.
const uncertain = async () =>
  (
    await sql(
      "SELECT count(*)::int AS n FROM creator.ai_usage WHERE creator_id=$1 AND cost_micros IS NULL AND generation_id IS NULL",
      [MAYA_CREATOR_ID],
    )
  )[0].n;
const heldUnknown = async () =>
  (
    await sql(
      "SELECT count(*)::int AS n FROM creator.ai_usage WHERE creator_id=$1 AND cost_micros IS NULL AND generation_id IS NOT NULL",
      [MAYA_CREATOR_ID],
    )
  )[0].n;
// Fans for the changes that cannot be undone, one per timing.
const spare = [
  "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005",
  "10000000-0000-4000-8000-000000000006",
];
let license;

const CHANGES = {
  takeover: {
    do: (f) =>
      call(API, "POST", `${f.thread}/takeover`, {
        token: maya,
        body: { idempotencyKey: key("takeover") },
      }),
    undo: (f) =>
      call(API, "POST", `${f.thread}/handback`, {
        token: maya,
        body: { idempotencyKey: key("handback") },
      }),
  },
  pause: {
    do: (f) =>
      call(API, "POST", `${f.thread}/pause`, {
        token: maya,
        body: { idempotencyKey: key("pause") },
      }),
    undo: (f) =>
      call(API, "POST", `${f.thread}/handback`, {
        token: maya,
        body: { idempotencyKey: key("handback") },
      }),
  },
  consent: {
    do: (f) =>
      call(API, "POST", `${f.thread}/consent`, {
        token: f.token,
        body: { accepted: false, version: f.policy },
      }),
    undo: (f) =>
      call(API, "POST", `${f.thread}/consent`, {
        token: f.token,
        body: { accepted: true, version: f.policy },
      }),
  },
  lapse: {
    // Fake clock at the outer edge: the licence term ends now, in lane 3's own database only.
    do: async () => {
      [license] = await sql(
        "SELECT document FROM creator.ai_license WHERE creator_id=$1",
        [MAYA_CREATOR_ID],
      );
      await sql(
        "UPDATE creator.ai_license SET document=jsonb_set(document,'{termEndsAt}',to_jsonb(to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))) WHERE creator_id=$1",
        [MAYA_CREATOR_ID],
      );
      return { status: 200 };
    },
    undo: () =>
      sql("UPDATE creator.ai_license SET document=$2 WHERE creator_id=$1", [
        MAYA_CREATOR_ID,
        license.document,
      ]),
  },
  block: {
    fresh: true,
    do: (f) =>
      call(API, "POST", "/v1/trust/blocks", {
        token: f.token,
        body: {
          creatorId: MAYA_CREATOR_ID,
          reason: "Lane 3 scenario: block in the middle of an answer",
          idempotencyKey: key("block-lane3-e3a4"),
        },
      }),
  },
  pause_ai: {
    do: () =>
      call(API, "POST", `/v1/agent/${MAYA_CREATOR_ID}/pause`, {
        token: maya,
        headers: { "Idempotency-Key": key("pause-ai") },
      }),
  },
  // The fan signs out everywhere: the initiating session is revoked.
  signout: {
    fresh: true,
    do: (f) =>
      call(API, "POST", "/v1/identity/revoke-sessions", { token: f.token }),
  },
  delete: {
    fresh: true,
    do: (f) =>
      call(API, "POST", "/v1/trust/privacy/jobs", {
        token: f.token,
        body: {
          kind: "delete",
          scope: "account",
          proof: f.token,
          idempotencyKey: key("delete-lane3-e3a4"),
        },
      }),
  },
};

let regular;
for (const name of cases) {
  for (const [i, timing] of timings.entries()) {
    const change = CHANGES[name];
    if (change.fresh && !spare[i]) {
      step(
        `${name} at ${timing}`,
        false,
        "not run: no unused development fan account left; rebuild the stack",
      );
      continue;
    }
    const fan = change.fresh
      ? await openFan(spare[i], `lane3spare${i}`)
      : (regular ??= await openFan(ACTORS.fanOne, "lane3fan1"));
    fan.policy ??= (
      await call(API, "GET", "/v1/conversations/capabilities", {
        token: fan.token,
      })
    ).json.providers.version;
    fan.watch ??= watchFrames(fan.token, fan.fan.id);
    await fan.watch.ready;
    const locked = await uncertain();
    if (locked) {
      // An earlier case left an uncertain provider cost: every answer is now refused
      // at admission, so this case could only pass vacuously. Rebuild the stack.
      step(
        `${name} at ${timing}`,
        false,
        "not run: Maya is locked by an uncertain provider cost; run fresh-stack.sh and resume with --cases/--timings",
      );
      continue;
    }
    const before = await replies();
    const sent = await call(API, "POST", `${fan.thread}/messages`, {
      token: fan.token,
      body: {
        idempotencyKey: key("e3a4"),
        text: `Authority ${name} at ${timing}: how do I fix crawling glaze?`,
        clientSequence: Date.now() % 1e6,
      },
    });
    const g = sent.json?.generationId;
    if (timing === "stream")
      for (let w = 0; w < 400 && (await replies()) === before; w++)
        await sleep(25);
    else if (timing === "claimed")
      // Right after the worker claims the answer (its lease is set), before its first stage.
      for (let w = 0; w < 800; w++) {
        const [row] = await sql(
          "SELECT state FROM creator.generation WHERE id=$1",
          [g],
        );
        if (row?.state === "generating") break;
        await sleep(10);
      }
    else await sleep(Number(timing));
    const started = performance.now();
    const changed = await change.do(fan);
    const changeMs = performance.now() - started;
    const committed = await dbNow();
    const control =
      name === "takeover"
        ? await fan.watch.until(
            (f) => f.kind === "control" && f.at >= started,
            5000,
          )
        : null;
    let state;
    let endedMs = null;
    // Up to 100 s: a deferred answer is finished by recovery only after its 60 s lease.
    for (let w = 0; w < 200; w++) {
      [state] = await sql(
        "SELECT g.state, m.delivery_state AS delivery FROM creator.generation g JOIN creator.message m ON m.id=g.ai_message_id WHERE g.id=$1",
        [g],
      );
      if (
        state &&
        !["queued", "generating"].includes(state.state) &&
        state.delivery !== "generating"
      ) {
        endedMs = performance.now() - started;
        break;
      }
      await sleep(500);
    }
    const late = await sql(
      "SELECT count(*)::int AS n FROM creator.event WHERE type='sentence' AND payload->>'generationId'=$1 AND created_at>$2",
      [g, committed],
    );
    const shown = await sql(
      "SELECT count(*)::int AS n FROM creator.event WHERE type='sentence' AND payload->>'generationId'=$1",
      [g],
    );
    const leftUncertain = (await uncertain()) > 0;
    const ok =
      sent.status === 200 &&
      changed.status < 300 &&
      late[0].n === 0 &&
      state &&
      !["queued", "generating"].includes(state.state) &&
      (name !== "takeover" || (control && control.at - started <= 500));
    step(
      `${name} at ${timing}`,
      ok,
      `send ${sent.status}, change ${changed.status} in ${Math.round(changeMs)} ms, ${shown[0].n} sentence(s) before, ${late[0].n} after the change, answer ${state?.state}/${state?.delivery}${endedMs === null ? "" : ` ${(endedMs / 1000).toFixed(1)} s after the change`}` +
        (control
          ? `, control frame after ${Math.round(control.at - started)} ms`
          : "") +
        (leftUncertain ? ", LEFT AN UNKNOWN COST OUTSIDE AN ANSWER" : ""),
    );
    if (change.undo) {
      const undone = await change.undo(fan);
      if (undone?.status >= 300)
        step(
          `${name} at ${timing}: undo`,
          false,
          `status ${undone.status} ${undone.json?.error?.code ?? ""}; later cases may be affected`,
        );
    }
    if (change.fresh) fan.watch.close();
    await sleep(1500);
  }
}
regular?.watch.close();
const left = await uncertain();
step(
  "no unknown provider cost outside an answer (none locks the creator)",
  left === 0,
  `${left} row(s) outside an answer; ${await heldUnknown()} interrupted answer call(s) counted at their whole hold`,
);
await closeDb();
finish();

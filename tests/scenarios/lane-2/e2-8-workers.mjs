// Real concurrent fan requests; the current host has one serial worker.
// node tests/scenarios/lane-2/e2-8-workers.mjs [--seconds 120]
import {
  api,
  preflight,
  numberOption,
  fan,
  key,
  timed,
  call,
  check,
  emit,
  sql,
  sleep,
} from "./load-support.mjs";

await preflight();
const seconds = numberOption("--seconds", 120, 300);
const fans = [await fan(1), await fan(2)];
const marker = key("lane2load");
const requests = fans.map((person, index) => ({
  person,
  body: {
    idempotencyKey: `${marker}-${index}`,
    text: `${marker}-${index}`,
    clientSequence: index + 1,
  },
}));
const started = Date.now();
const responses = await Promise.all(
  requests.map(async ({ person, body }) => {
    const pair = await Promise.all(
      [0, 1].map(() =>
        timed(`${person.path}/messages`, {
          method: "POST",
          token: person.token,
          body,
        }),
      ),
    );
    check(
      "concurrent retry has one acknowledgment",
      pair.every((r) => r.status === 200) &&
        pair[0].json?.message?.id === pair[1].json?.message?.id,
      {
        statuses: pair.map((r) => r.status),
        codes: pair.map((r) => r.json?.error?.code ?? null),
        acknowledgmentMs: pair.map((r) => Math.round(r.ms)),
      },
    );
    return pair.find((r) => r.status === 200);
  }),
);
const read = () =>
  sql(`SELECT coalesce(json_agg(t),'[]'::json) FROM (
  SELECT g.id,g.state,g.failure_code,m.delivery_state AS fan_state,a.delivery_state AS ai_state,
    extract(epoch FROM (g.first_visible_at-g.accepted_at))*1000 AS first_visible_ms,
    extract(epoch FROM (g.completed_at-g.accepted_at))*1000 AS completed_ms,
    (SELECT count(*) FROM creator.ai_generation_attempt x WHERE x.generation_id=g.id) AS attempts,
    (SELECT count(*) FROM creator.ai_generation_attempt x WHERE x.generation_id=g.id AND x.state='open') AS open_attempts,
    (SELECT r.state FROM creator.ai_generation_receipt r WHERE r.generation_id=g.id ORDER BY r.revision DESC LIMIT 1) AS receipt_state,
    (SELECT count(*) FROM creator.ai_usage u WHERE u.generation_id=g.id AND u.provider_state='admitted') AS unsettled_calls
  FROM creator.generation g JOIN creator.message m ON m.id=g.fan_message_id
  JOIN creator.message a ON a.id=g.ai_message_id WHERE m.text IN ('${marker}-0','${marker}-1') ORDER BY m.text) t;`);
let rows = read();
while (
  Date.now() - started < seconds * 1000 &&
  rows.some((r) => ["queued", "generating"].includes(r.state))
) {
  await sleep(5000);
  rows = read();
}
check(
  "both concurrent jobs delivered durably",
  rows.length === 2 &&
    rows.every((r) => r.state === "delivered" && r.ai_state === "delivered"),
  { elapsedSeconds: (Date.now() - started) / 1000, rows },
);
check(
  "each accepted request made exactly one durable job",
  rows.length === 2 &&
    responses.every(
      (r) => r && rows.some((row) => row.id === r.json.generationId),
    ) &&
    new Set(responses.map((r) => r?.json.generationId)).size === 2,
  { jobs: rows.length },
);
check(
  "jobs reached a settled accounting receipt",
  rows.length === 2 &&
    rows.every(
      (r) =>
        r.unsettled_calls === 0 &&
        r.open_attempts === 0 &&
        ["known", "no_request"].includes(r.receipt_state),
    ),
  {
    states: rows.map((r) => ({
      attempts: r.attempts,
      openAttempts: r.open_attempts,
      receiptState: r.receipt_state,
      unsettledCalls: r.unsettled_calls,
    })),
  },
);
const changed = await timed(`${fans[0].path}/messages`, {
  method: "POST",
  token: fans[0].token,
  body: { ...requests[0].body, text: "changed replay" },
});
check(
  "changed retry is refused",
  changed.status === 403 &&
    changed.json?.error?.code === "idempotency_conflict",
  { status: changed.status, code: changed.json?.error?.code },
);
const intruder = await call(api, "GET", fans[0].path, { token: fans[1].token });
check("wrong fan remains refused", intruder.status === 403, {
  status: intruder.status,
});
const after = read();
check("rejected actions added no job", after.length === rows.length, {
  jobs: after.length,
});
emit("scope", {
  workers: 1,
  simultaneousFanRequests: 2,
  retriesPerRequest: 2,
  multipleWorkerProcesses:
    "not run; no deployable multi-worker composition on this branch",
});

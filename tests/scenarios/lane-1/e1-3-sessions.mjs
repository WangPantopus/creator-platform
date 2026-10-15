#!/usr/bin/env node
// E1.3: Qelvora sessions end when they should, and survive a restart. With
// STACK_UP_ARGS (the JSON list of `stack up` options) it also restarts the
// stack mid-flow; without it that step is reported as not run.
//   STACK_UP_ARGS='["--lane","1",...]' node tests/scenarios/lane-1/e1-3-sessions.mjs
import { execFileSync } from "node:child_process";
import {
  adult,
  call,
  describe,
  is,
  nativeSignIn,
  nativeStart,
  one,
  reporter,
  sha256,
  sql,
} from "./sign-in-lib.mjs";

const { step, skip, finish } = reporter();
const session = (token) => call("GET", "/v1/identity/session", { token });
const refresh = (token) => call("POST", "/v1/identity/refresh", { token });

const a = await adult("signs-out");
step(
  "sign out ends the session at the next request",
  (await call("POST", "/v1/identity/logout", { token: a.token })).status ===
    200 && is(await session(a.token), 401, "session_expired"),
);

const everywhere = await adult("everywhere");
const devices = [
  everywhere.token,
  (await nativeSignIn(everywhere.sub)).json.completion.token,
  (await nativeSignIn(everywhere.sub)).json.completion.token,
];
const out = await call("POST", "/v1/identity/revoke-sessions", {
  token: devices[1],
});
const after = await Promise.all(devices.map(session));
step(
  "sign out everywhere ends every device's session",
  out.status === 200 && after.every((r) => is(r, 401, "session_expired")),
  after.map(describe).join(", "),
);
step(
  "and every provider grant of the account",
  one(
    `SELECT count(*) FROM creator.identity_grant WHERE account_id='${everywhere.session.accountId}' AND revoked_at IS NULL`,
  ) === "0",
);

const idle = await adult("idle");
sql(
  `UPDATE creator.identity_session SET expires_at=now()-interval '1 second' WHERE token_hash='${sha256(idle.token)}'`,
);
step(
  "an expired access window is refused (moved in the lane's own database)",
  is(await session(idle.token), 401, "session_expired"),
);
const renewed = await refresh(idle.token);
step(
  "refresh inside the 7-day window gives a new token that works",
  renewed.status === 200 && (await session(renewed.json.token)).status === 200,
  describe(renewed),
);
step(
  "the old token stops working after rotation",
  is(await refresh(idle.token), 401, "session_expired") ||
    is(await session(idle.token), 401, "session_expired"),
);
sql(
  `UPDATE creator.identity_session SET refresh_until=now()-interval '1 second',expires_at=now()-interval '1 second' WHERE token_hash='${sha256(renewed.json.token)}'`,
);
step(
  "past the absolute 7-day limit, refresh is refused",
  is(await refresh(renewed.json.token), 401, "session_expired"),
);

const race = await adult("refresh-race");
const both = await Promise.all([refresh(race.token), refresh(race.token)]);
const winner = both.find((r) => r.status === 200);
step(
  "two refreshes at once: one wins, the other is refused",
  both.filter((r) => r.status === 200).length === 1 &&
    both.some((r) => r.status === 401),
  both.map(describe).join(", "),
);
step(
  "the winner's token works",
  winner && (await session(winner.json.token)).status === 200,
);

const tampered = await adult("tampered");
const flipped = `${tampered.token.slice(0, -1)}${tampered.token.endsWith("A") ? "B" : "A"}`;
step(
  "a tampered token is refused",
  is(await session(flipped), 401, "session_expired") &&
    (await session(tampered.token)).status === 200,
);

const withdrawn = await adult("withdrawn");
sql(
  `UPDATE creator.identity_grant SET revoked_at=now() WHERE account_id='${withdrawn.session.accountId}'`,
);
const ended = await session(withdrawn.token);
step(
  "a withdrawn provider grant ends the session at the next request (grant revoked directly; Apple's notices are a follow-up)",
  is(ended, 401, "authorization_ended") &&
    one(
      `SELECT count(*) FROM creator.identity_session WHERE token_hash='${sha256(withdrawn.token)}' AND revoked_at IS NOT NULL`,
    ) === "1",
  describe(ended),
);

if (process.env.STACK_UP_ARGS) {
  const kept = await adult("restart");
  const pending = await nativeStart();
  execFileSync(
    "node",
    [
      "infra/local/stack.mjs",
      "stop",
      "--lane",
      process.env.QELVORA_LANE ?? "1",
    ],
    { stdio: "ignore" },
  );
  execFileSync(
    "node",
    ["infra/local/stack.mjs", "up", ...JSON.parse(process.env.STACK_UP_ARGS)],
    { stdio: "ignore" },
  );
  step(
    "after a restart the session still works",
    (await session(kept.token)).status === 200,
  );
  const resumed = await nativeSignIn(kept.sub, { start: pending });
  step(
    "a sign-in started before the restart completes after it",
    is(resumed, 200, "signed_in"),
    describe(resumed),
  );
} else skip("restart mid-flow", "set STACK_UP_ARGS to restart the stack");
skip(
  "a revocation during a request already in flight",
  "a Qelvora account cannot open a conversation on a development host (lane 3's provider policy), so no long request is available",
);
skip(
  "cross-origin and missing-CSRF writes",
  "the backend takes bearer tokens only; the web proxy's origin check is WP 1.3",
);
finish();

#!/usr/bin/env node
// E1.2: the 18+ gate has no way around. Every refusal is the designed
// adult_eligibility_required, nothing is partly open, and a refusal is final
// for that provider identity.
//   node tests/scenarios/lane-1/e1-2-age-gate.mjs
import {
  adult,
  call,
  confirmAge,
  describe,
  is,
  nativeSignIn,
  nativeStart,
  one,
  person,
  reporter,
  sha256,
  sql,
  yearsAgo,
} from "./sign-in-lib.mjs";

const { step, note, finish } = reporter();
const MAYA = "20000000-0000-4000-8000-000000000001";
const AGE = "This app is available to adults aged 18 and over.";
const refusedAsMinor = (r) =>
  is(r, 403, "adult_eligibility_required") && r.json.error.message === AGE;

// Declining: the age step is never finished.
const declined = await nativeSignIn(person("declines"));
const declinedAccount = one(
  `SELECT account_id FROM creator.sign_in_continuation WHERE id='${declined.json.ageConfirmation.ageContinuationId}'`,
);
sql(
  `UPDATE creator.sign_in_continuation SET expires_at=now()-interval '1 second' WHERE id='${declined.json.ageConfirmation.ageContinuationId}'`,
);
step(
  "a person who never answers gets no session, and the step expires",
  is(
    await confirmAge(declined, yearsAgo(30)),
    403,
    "age_confirmation_expired",
  ) &&
    one(
      `SELECT count(*) FROM creator.identity_session WHERE account_id='${declinedAccount}'`,
    ) === "0",
);

// Dates: impossible ones are refused without using the step; under 18 is final.
const dated = await nativeSignIn(person("dates"));
step(
  "an impossible date is refused without using the step",
  is(await confirmAge(dated, "2001-02-30"), 400, "invalid_request"),
);
step(
  "a future date is refused without using the step",
  is(await confirmAge(dated, yearsAgo(-1)), 400, "invalid_request"),
);
step(
  "then a real adult date works",
  is(await confirmAge(dated, yearsAgo(40)), 200, "signed_in"),
);
const minorSub = person("sixteen");
const minor = await nativeSignIn(minorSub);
step(
  "a date under 18 is refused with the designed message",
  refusedAsMinor(await confirmAge(minor, yearsAgo(16))),
);
const retry = await nativeSignIn(minorSub);
step(
  "signing in again is refused at once, with no new age step",
  refusedAsMinor(retry) && !retry.json?.ageConfirmation,
  describe(retry),
);
step(
  "the web cannot be used to try again either",
  refusedAsMinor(
    await nativeSignIn(minorSub, { start: await nativeStart("google", "ios") }),
  ),
);
step(
  "the 18th birthday is adult",
  is(
    await confirmAge(await nativeSignIn(person("eighteen")), yearsAgo(18)),
    200,
    "signed_in",
  ),
);
step(
  "the day before the 18th birthday is not",
  refusedAsMinor(
    await confirmAge(await nativeSignIn(person("almost")), yearsAgo(18, 1)),
  ),
);

// Platform signals: under 18 wins over an adult date; an adult report is never proof.
for (const [source, platform, provider] of [
  ["apple_declared_age_range", "ios", "apple"],
  ["google_play_age_signals", "android", "google"],
]) {
  const sub = person(`signal-${platform}`);
  const r = await nativeSignIn(sub, {
    provider,
    platform,
    start: await nativeStart(provider, platform),
  });
  step(
    `${source}: under 18 wins over an adult date`,
    refusedAsMinor(
      await confirmAge(r, yearsAgo(40), { source, under18: true }),
    ),
  );
  step(
    `${source}: and it is final`,
    refusedAsMinor(
      await nativeSignIn(sub, {
        provider,
        platform,
        start: await nativeStart(provider, platform),
      }),
    ),
  );
}
const claimed = await nativeSignIn(person("claims-adult"));
step(
  "an adult platform report does not rescue an under-18 date",
  refusedAsMinor(
    await confirmAge(claimed, yearsAgo(15), {
      source: "google_play_age_signals",
      under18: false,
    }),
  ),
);
step(
  "refusals record results and locks, never a date of birth",
  one(
    `SELECT count(*) FROM information_schema.columns WHERE table_schema='creator' AND table_name IN ('age_signal','age_lock','account','account_identity') AND column_name ~ 'birth|dob'`,
  ) === "0" && Number(one("SELECT count(*) FROM creator.age_lock")) >= 4,
);

// Flagged after sign-in: every domain route refuses on the next request.
const fan = await adult("flagged");
const profile = await call("POST", "/v1/identity/fan-profile", {
  token: fan.token,
  body: { handle: `gate${Date.now() % 1e7}`, intro: "" },
});
const caps = (
  await call("GET", "/v1/conversations/capabilities", { token: fan.token })
).json;
const begun = await call("POST", "/v1/conversations/begin", {
  token: fan.token,
  body: {
    creatorId: MAYA,
    policyVersion: caps.providers.version,
    accessNoticeAccepted: true,
    idempotencyKey: `gate-${Date.now()}`,
  },
});
step(
  "setup: the adult has a fan profile",
  profile.status === 200,
  describe(profile),
);
// Lane 3's development provider policy admits only the synthetic accounts, so a
// real (Qelvora) account cannot open a conversation on a development host.
note(
  `opening a conversation: ${describe(begun)} (lane 3's development provider policy)`,
);
const thread = `/v1/conversations/${MAYA}/${profile.json.id}`;
const routes = [
  ["session", "GET", "/v1/identity/session"],
  ["conversations", "GET", "/v1/conversations/capabilities"],
  ["thread", "GET", thread],
  [
    "message",
    "POST",
    `${thread}/messages`,
    {
      idempotencyKey: `gate-m-${Date.now()}`,
      text: "hello",
      clientSequence: 1,
    },
  ],
  ["pay", "POST", "/v1/commerce/packets", {}],
  ["follow (growth not composed here)", "PUT", `/v1/growth/follow/${MAYA}`, {}],
  [
    "notifications (growth not composed here)",
    "GET",
    "/v1/growth/notifications",
  ],
  ["devices (growth not composed here)", "PUT", "/v1/growth/devices", {}],
  ["passkeys", "GET", "/v1/identity/passkeys"],
  [
    "fan profile",
    "POST",
    "/v1/identity/fan-profile",
    { handle: "renamed", intro: "" },
  ],
];
const sessions = [];
while (sessions.length < routes.length)
  sessions.push((await nativeSignIn(fan.sub)).json.completion.token);
sql(
  `INSERT INTO creator.age_signal(account_id,source,result,copy_version) VALUES('${fan.session.accountId}','ops_review','under_18','scenario-stand-in-for-ops-console')`,
);
note(
  "flagged under 18 by an ops_review signal written directly (the ops console is WP 1.6)",
);
for (const [i, [name, method, path, body]] of routes.entries()) {
  const r = await call(method, path, {
    token: sessions[i],
    ...(body ? { body } : {}),
  });
  step(
    `flagged later: ${name} refused at the next request`,
    refusedAsMinor(r),
    describe(r),
  );
}
step(
  "every one of those sessions is ended",
  one(
    `SELECT count(*) FROM creator.identity_session WHERE token_hash IN ('${sessions.map(sha256).join("','")}') AND revoked_at IS NULL`,
  ) === "0" &&
    one(
      `SELECT count(*) FROM creator.identity_session WHERE token_hash IN ('${sessions.map(sha256).join("','")}')`,
    ) === String(sessions.length),
);
step(
  "and signing in again is refused",
  refusedAsMinor(await nativeSignIn(fan.sub)),
);
finish();

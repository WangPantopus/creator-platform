#!/usr/bin/env node
// E1.4: sign-in does not reveal whether an account exists, a burst meets the
// rate limit and recovers, and nobody can lock the real owner out.
//   node tests/scenarios/lane-1/e1-4-no-leak.mjs
import {
  AUDIENCE,
  adult,
  call,
  describe,
  is,
  mint,
  nativeSignIn,
  nativeStart,
  person,
  reporter,
  sleep,
} from "./sign-in-lib.mjs";

const { step, note, finish } = reporter();
const known = await adult("known");
const unknown = person("never-signed-up");

// A refused token for a known and an unknown person: same answer, similar time.
async function refusedAttempt(sub) {
  const start = await nativeStart();
  const idToken = await mint(
    "google",
    AUDIENCE.google.android,
    sub,
    start.nonce,
    {},
    { badSignature: true },
  );
  const began = performance.now();
  const r = await nativeSignIn(sub, { start, idToken });
  return {
    ms: performance.now() - began,
    answer: JSON.stringify([
      r.status,
      r.json?.error?.code,
      r.json?.error?.message,
    ]),
  };
}
const times = { known: [], unknown: [] };
const answers = new Set();
for (let i = 0; i < 15; i += 1)
  for (const [label, sub] of [
    ["known", known.sub],
    ["unknown", unknown],
  ]) {
    const attempt = await refusedAttempt(sub);
    times[label].push(attempt.ms);
    answers.add(attempt.answer);
  }
const median = (values) =>
  [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)];
const [k, u] = [median(times.known), median(times.unknown)];
step(
  "a known and an unknown person get the identical refusal",
  answers.size === 1,
  [...answers][0],
);
step(
  "and similar timing (medians within 25 ms or 1.5 times)",
  Math.abs(k - u) < 25 || Math.max(k, u) / Math.min(k, u) < 1.5,
  `known ${k.toFixed(1)} ms, unknown ${u.toFixed(1)} ms over 15 each`,
);

// The rate limit: starts per client per minute.
const attacker = `attacker-${Date.now()}`;
const burst = [];
for (let i = 0; i < 22; i += 1)
  burst.push(
    await call("POST", "/v1/identity/native/nonce", {
      body: { provider: "google", platform: "android" },
      client: attacker,
    }),
  );
const limited = burst.filter((r) => r.status === 429);
step(
  "a burst of 22 starts meets the limit after 20",
  burst.slice(0, 20).every((r) => r.status === 200) &&
    limited.length === 2 &&
    is(limited[0], 429, "rate_limited"),
  burst.map((r) => r.status).join(","),
);
const wait = Number(limited[0]?.headers.get("retry-after"));
step(
  "the refusal says when to try again",
  wait > 0 && wait <= 60,
  `Retry-After ${wait}`,
);
const owner = await call("POST", "/v1/identity/native/nonce", {
  body: { provider: "google", platform: "android" },
  client: `owner-${Date.now()}`,
});
step("another client is not affected", owner.status === 200, describe(owner));
note(`waiting ${wait} s for the window to pass`);
await sleep((wait + 1) * 1000);
step(
  "the attacker's client recovers after Retry-After",
  (
    await call("POST", "/v1/identity/native/nonce", {
      body: { provider: "google", platform: "android" },
      client: attacker,
    })
  ).status === 200,
);

// No lockout: many failed attempts against a person do not block that person.
for (let i = 0; i < 25; i += 1) await refusedAttempt(known.sub);
const back = await nativeSignIn(known.sub);
step(
  "25 failed attempts against an account do not lock its owner out",
  is(back, 200, "signed_in"),
  describe(back),
);
finish();

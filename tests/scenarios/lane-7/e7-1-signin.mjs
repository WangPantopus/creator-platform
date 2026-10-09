// E7.1 sign-in scenarios: each app runs signed in against the fake API, the
// hook behaves the same on both platforms, and a session ends the way the
// real API ends one. One line per step; exits non-zero on a failure.
//   node tests/scenarios/lane-7/e7-1-signin.mjs [ios|android]
import { readFileSync } from "node:fs";
import * as L from "./lib.mjs";

const copy = JSON.parse(
  readFileSync(new URL("../../../config/copy.json", import.meta.url), "utf8"),
);
const home = new RegExp(copy.growthYourPeople, "u");
const mark = async () => (await L.log()).at(-1)?.n ?? 0;
const live = async () => (await L.state()).sessions.filter((s) => !s.revoked);
const MAYA_THREAD =
  "/threads/c1000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001";
const stopHarness = await L.ensureHarness();

for (const p of L.platforms(process.argv[2])) {
  // Count only this platform's app: the other one may still be running.
  const log = (since) => L.log(since, p);
  const waitLog = (since, match, ms) => L.waitForLog(since, match, ms, p);
  // Stop the app first: a running one would still send requests after the mark.
  const fresh = async () => {
    L.stop(p);
    await L.harness("POST", "/__harness/reset");
    await L.harness("POST", "/__harness/faults", { rules: [] });
    return mark();
  };
  let since = await fresh();
  L.launch(p, "--reset");
  let screen = await L.waitForText(p, /Continue with Pantopus/u);
  let entries = await log(since);
  L.step(
    p,
    "H1 reset only: signed out, no sign-in or session request",
    screen.ok &&
      !L.seen(entries, { path: /complete|identity\/session/u }).length,
  );

  since = await mark();
  L.launch(p, "--reset", "--actor", "devon", "--to", "/home");
  entries = await waitLog(since, {
    path: /growth\/home/u,
    account: "devon",
    status: 200,
  });
  screen = await L.waitForText(p, home);
  L.step(
    p,
    "H2 the hook signs in as Devon and Home loads",
    L.seen(entries, { path: /identity\/complete/u, status: 200 }).length ===
      1 &&
      screen.ok &&
      (await live()).length === 1,
  );

  since = await mark();
  L.stop(p);
  L.launch(p);
  entries = await waitLog(since, {
    path: /identity\/session/u,
    account: "devon",
    status: 200,
  });
  screen = await L.waitForText(p, home);
  L.step(
    p,
    "H3 kill and relaunch: still signed in, no new sign-in",
    !L.seen(entries, { path: /complete/u }).length && screen.ok,
  );

  since = await mark();
  L.launch(p, "--actor", "priya");
  await L.sleep(6000);
  entries = await log(since);
  L.step(
    p,
    "H4 the hook does nothing while someone is signed in",
    !L.seen(entries, { path: /complete/u }).length &&
      (await live()).length === 1,
  );

  since = await mark();
  L.launch(p, "--reset", "--actor", "priya", "--to", "/home");
  entries = await waitLog(since, {
    path: /growth\/home/u,
    account: "priya",
    status: 200,
  });
  screen = await L.waitForText(
    p,
    new RegExp(copy.growthPickACreatorToStart, "u"),
  );
  L.step(
    p,
    "H5 reset switches to Priya: the empty Home",
    screen.ok &&
      L.seen(entries, { path: /growth\/home/u, account: "priya" }).length > 0,
  );

  const before = (await live()).length;
  since = await mark();
  L.launch(p, "--reset", "--actor", "under 18");
  entries = await waitLog(since, {
    path: /identity\/complete/u,
    status: 403,
  });
  screen = await L.waitForText(p, /adults aged 18 and over/u);
  L.step(
    p,
    "H6 an account under 18 is refused with the policy, no session made",
    L.seen(entries, { path: /complete/u, status: 403 }).length === 1 &&
      screen.ok &&
      (await live()).length === before,
  );

  since = await mark();
  L.launch(p, "--reset", "--actor", "nobody");
  screen = await L.waitForText(p, /No development actor matches/u);
  entries = await log(since);
  L.step(
    p,
    "H7 an actor that does not exist: said so, nothing signed in",
    screen.ok && !L.seen(entries, { path: /complete/u }).length,
  );

  since = await mark();
  L.launch(p, "--reset", "--actor", "priya", "--to", MAYA_THREAD);
  entries = await waitLog(since, {
    path: /conversations\/c1/u,
    account: "priya",
    status: 403,
  });
  screen = await L.waitForText(p, /unavailable/iu);
  L.step(
    p,
    "H8 wrong person: someone else's thread is refused (403) and said so",
    L.seen(entries, {
      path: /conversations\/c1/u,
      account: "priya",
      status: 403,
    }).length > 0 && screen.ok,
    screen.text
      .split("\n")
      .filter((l) => /unavailable/iu.test(l))
      .join(" | "),
  );

  await fresh();
  L.launch(p, "--reset", "--actor", "devon", "--to", "/home");
  await L.waitForText(p, home);
  const [original] = await live();
  since = await mark();
  await L.harness("POST", "/__harness/sessions", {
    account: "devon",
    action: "expire",
  });
  entries = await waitLog(
    since,
    { path: /identity\/refresh/u, status: 200 },
    15000,
  );
  await L.sleep(5000);
  const after = await live();
  screen = await L.waitForText(p, home);
  L.step(
    p,
    "H9 an expired session is refreshed in place: same session, still signed in",
    L.seen(entries, { path: /refresh/u, status: 200 }).length === 1 &&
      after.length === 1 &&
      after[0].id === original?.id &&
      screen.ok,
  );

  since = await mark();
  await L.harness("POST", "/__harness/sessions", {
    account: "devon",
    action: "revoke",
  });
  entries = await waitLog(
    since,
    { path: /identity\/refresh/u, status: 401 },
    15000,
  );
  screen = await L.waitForText(p, /Continue with Pantopus/u, 15000);
  L.step(
    p,
    "H10 a revoked session signs the person out and says why",
    L.seen(entries, { path: /refresh/u, status: 401 }).length >= 1 &&
      screen.ok &&
      /session ended/iu.test(screen.text),
    screen.text
      .split("\n")
      .filter((l) => /ended/iu.test(l))
      .join(" | "),
  );

  await fresh();
  L.launch(p, "--reset", "--actor", "devon", "--to", "/home");
  await L.waitForText(p, home);
  await L.harness("POST", "/__harness/faults", {
    rules: [{ match: "^/v1/identity/session$", drop: true }],
  });
  screen = await L.waitForText(p, /Reconnect to refresh your account/u, 20000);
  await L.harness("POST", "/__harness/faults", { rules: [] });
  const recovered = await L.waitForAbsent(
    p,
    /Reconnect to refresh your account/u,
    20000,
  );
  L.step(
    p,
    "H11 the network drops mid-session: says so, keeps the screen, recovers when it returns",
    screen.ok && /Your people/u.test(screen.text) && recovered.ok,
  );
}
stopHarness();
L.finish();

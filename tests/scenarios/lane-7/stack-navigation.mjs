// Navigation on lane 7's disposable real API/PostgreSQL, after stack up --growth.
// Synthetic only at the edge: development identity and lane 2's model provider.
// node tests/scenarios/lane-7/stack-navigation.mjs android | verify
import assert from "node:assert/strict";
import * as android from "./android-ui.mjs";
import { waitForText, sleep } from "./lib.mjs";

const api = "http://127.0.0.1:56471";
const creator = "20000000-0000-4000-8000-000000000001";
async function request(method, path, token, body) {
  const response = await fetch(api + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  return { status: response.status, body: await response.json() };
}
async function signIn(number) {
  const begun = await request("POST", "/v1/identity/continue", null, {
    returnTo: "/home",
  });
  assert.equal(begun.status, 200);
  const result = await request("POST", "/v1/identity/complete", null, {
    continuationId: begun.body.continuationId,
    code: `10000000-0000-4000-8000-00000000000${number}`,
  });
  assert.equal(result.status, 200);
  return result.body;
}
async function verify() {
  const owner = await signIn(1);
  const fan = owner.session.fan;
  assert.ok(fan, "The real stack smoke must create fan one's profile first");
  const path = `/v1/conversations/${creator}/${fan.id}`;
  const thread = await request("GET", path, owner.token);
  assert.equal(thread.status, 200);
  assert.ok(
    thread.body.messages.some((message) => message.authorKind === "fan"),
  );
  console.log(
    "PASS real API: owner's Maya conversation exists with the smoke's accepted fan message",
  );
  const home = await request("GET", "/v1/growth/home", owner.token);
  assert.equal(home.status, 200);
  assert.ok(
    home.body.entries.some(
      (entry) => entry.destination === `/threads/${creator}/${fan.id}`,
    ),
  );
  console.log("PASS real API: Home points at that owner's conversation");
  assert.equal((await request("GET", path)).status, 401);
  const other = await signIn(2);
  const denied = await request("GET", path, other.token);
  assert.ok([403, 404].includes(denied.status));
  console.log(
    `PASS real API: signed-out read 401, other fan read ${denied.status}`,
  );
}
async function operateAndroid() {
  android.adb("reverse", "tcp:56471", "tcp:56471");
  const launch = (...extras) => {
    android.adb("shell", "am", "force-stop", "com.pantopus.qelvora");
    android.adb(
      "shell",
      "am",
      "start",
      "-W",
      "-n",
      "com.pantopus.qelvora/.MainActivity",
      "--es",
      "api_url",
      api,
      ...extras,
    );
  };
  const at = async (pattern, label) => {
    const result = await waitForText("android", pattern, 30000);
    assert.ok(result.ok, `Missing ${label}: ${result.text.slice(0, 500)}`);
    console.log(`PASS real Android: ${label}`);
  };
  const thread = () => at(/Me and privacy/u, "Maya thread");
  const home = () => at(/Your people/u, "Home");
  const back = async () => {
    android.key("BACK");
    await sleep(1000);
  };
  launch(
    "--ez",
    "harness_reset",
    "true",
    "--es",
    "harness_actor",
    "'actor one'",
    "--es",
    "return_to",
    "/home",
  );
  await home();
  await android.tap("Maya");
  await thread();
  await back();
  await home();
  await android.tap("Maya");
  await thread();
  android.openLink("qelvora://app/identity/account");
  await at(/Your account/u, "warm link to account");
  await back();
  await thread();
  launch();
  await thread();
  await back();
  await home();
  android.adb("shell", "am", "force-stop", "com.pantopus.qelvora");
  android.adb(
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    "qelvora://app/creators/maya",
    "--es",
    "api_url",
    api,
    "com.pantopus.qelvora",
  );
  await at(/Official means/u, "cold creator link");
  await back();
  await at(/Search creators/u, "creator parent: Discover");
  await back();
  await home();
  await back();
  assert.notEqual(android.focused(), "com.pantopus.qelvora");
  console.log("PASS real Android: Back from Home leaves the app");
}
// No token or sign-in response is printed or written to evidence.
if (process.argv[2] === "android") await operateAndroid();
else if (process.argv[2] !== "verify")
  throw new Error("Choose android or verify");
await verify();
console.log("PASS real stack navigation verification");

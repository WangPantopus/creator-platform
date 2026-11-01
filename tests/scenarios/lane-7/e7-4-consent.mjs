// WP 7.4 P6 on Android: the provider sentence on the first-conversation
// screen, against the lane 7 fake API. iOS runs the same flows as XCUITest
// (Lane7ConsentFlows, through ios-navigation.mjs --consent).
//   node tests/scenarios/lane-7/e7-4-consent.mjs [C1 C2 C3 C4 C5]
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const PROMISE =
  "Before your first message, Lena Park's AI is powered by Synthetic provider. They don't keep or train on your messages.";
const PLAIN = "This AI is powered by Synthetic provider.";
const CLEAN = "Doesn't train on your messages. Doesn't keep your messages.";
const wanted = process.argv.slice(2);
const run = (id) => !wanted.length || wanted.includes(id);
const stop = await L.ensureHarness();

async function consent(flags, appearance = "light") {
  await L.harness("POST", "/__harness/reset");
  if (flags) await L.harness("POST", "/__harness/flags", flags);
  L.launch(
    "android",
    "--reset",
    "--actor",
    "priya",
    "--to",
    "/creators/lenapark/chat",
    "--appearance",
    appearance,
  );
  await A.waitFor("Synthetic provider processing terms", 30000);
  return A.texts();
}

if (run("C1")) {
  const texts = await consent();
  L.step(
    "android",
    "P6.1 the fixed sentence, verbatim",
    texts.includes(PROMISE) && !texts.some((t) => t.includes(PLAIN)),
  );
  L.step(
    "android",
    "P6.1 terms link kept, no second promise",
    texts.includes("Synthetic provider processing terms") &&
      !texts.includes(CLEAN),
  );
  L.screenshot("android", "C1-promise");
  // The consent still goes through with the policy the screen showed.
  const since = (await L.log()).at(-1)?.n ?? 0;
  const start = await A.waitEnabled("Start with Lena Park's AI");
  A.tapAt(start.x, start.y);
  await A.waitFor("Ask Lena Park to step in", 30000);
  const thread = (await L.state()).threads.find(
    (t) => t.creator === "lenapark" && t.account === "priya",
  );
  const begins = L.seen(await L.log(since, "android"), {
    method: "POST",
    path: /^\/v1\/conversations(\/begin)?$/u,
    status: 200,
  });
  L.step(
    "android",
    "P6.1 Start with opens the thread once, consented",
    thread?.consent === true && begins.length === 1,
    `begin requests ${begins.length}`,
  );
}

if (run("C2")) {
  const texts = await consent({
    providers: [
      { name: "Synthetic provider", noTraining: true, noRetention: false },
    ],
  });
  L.step(
    "android",
    "P6.2 a provider that keeps messages: its own line, no promise",
    texts.includes(PLAIN) &&
      texts.includes(
        "Doesn't train on your messages. Review message retention in these terms.",
      ) &&
      !texts.some((t) => t.includes("They don't keep or train")),
  );
  L.screenshot("android", "C2-keeps-messages");
}

if (run("C3")) {
  const texts = await consent({ policyVerified: false });
  L.step(
    "android",
    "P6.3 an unverified policy: notice and own lines, no promise",
    texts.some((t) => t.includes("Unreviewed development policy")) &&
      texts.includes(PLAIN) &&
      texts.includes(CLEAN) &&
      !texts.some((t) => t.includes("They don't keep or train")),
    texts.find((t) => t.includes("Unreviewed")) ?? "no notice",
  );
  L.screenshot("android", "C3-unverified");
}

if (run("C4")) {
  const texts = await consent({
    providers: [
      { name: "Synthetic provider", noTraining: true, noRetention: true },
      { name: "Second provider", noTraining: true, noRetention: true },
    ],
  });
  L.step(
    "android",
    "P6.4 two clean providers, both named, both links",
    texts.includes(
      "Before your first message, Lena Park's AI is powered by Synthetic provider, Second provider. They don't keep or train on your messages.",
    ) && texts.includes("Second provider processing terms"),
  );
  L.screenshot("android", "C4-two-providers");
}

if (run("C5")) {
  A.adb("shell", "settings", "put", "system", "font_scale", "2.0");
  const texts = await consent(undefined, "night");
  L.step(
    "android",
    "P6.5 largest text, Night: the sentence in full",
    texts.includes(PROMISE),
  );
  L.screenshot("android", "C5-largest-night");
  A.adb("shell", "settings", "put", "system", "font_scale", "1.0");
}

stop();
L.finish();

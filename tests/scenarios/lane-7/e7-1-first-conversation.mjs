// A fan with no conversations reaches a first message: Discover, a creator's
// page, "Start with ... AI", the first message, the streamed reply. The taps
// run on Android through adb. On iOS this stops at what a deep link reaches,
// because tapping needs the simulator panel's "Let Claude use it" access.
//   node tests/scenarios/lane-7/e7-1-first-conversation.mjs [ios|android]
import * as android from "./android-ui.mjs";
import * as L from "./lib.mjs";

const stopHarness = await L.ensureHarness();
const mark = async () => (await L.log()).at(-1)?.n ?? 0;
await L.harness("POST", "/__harness/flags", {
  replyDelayMs: 300,
  sentenceDelayMs: 600,
});

for (const p of L.platforms(process.argv[2])) {
  L.stop(p);
  await L.harness("POST", "/__harness/reset");
  const since = await mark();
  if (p === "ios") {
    L.launch(
      p,
      "--reset",
      "--actor",
      "priya",
      "--to",
      "/creators/lenapark/chat",
    );
    const screen = await L.waitForText(p, /Before your first message/u);
    const entries = await L.log(since, p);
    L.step(
      p,
      "F1 a link to a creator's chat opens the first-conversation screen (its button is below the fold; scrolling and tapping: not run, no device access)",
      screen.ok &&
        L.seen(entries, { path: /conversations\/capabilities/u, status: 200 })
          .length > 0 &&
        /WHO RUNS IT/u.test(screen.text) &&
        /Synthetic provider/u.test(screen.text),
    );
    continue;
  }
  L.launch(p, "--reset", "--actor", "priya", "--to", "/discover");
  await android.tap("Search creators, crafts or questions");
  android.type("Lena");
  android.key("ENTER");
  await android.tap("Lena Park");
  await android.tap("Message Lena Park's AI");
  const consent = await L.waitForText(p, /Before your first message/u);
  // The button stays disabled until the provider terms have loaded.
  await L.waitForLog(
    since,
    { path: /conversations\/capabilities/u, status: 200 },
    8000,
    p,
  );
  await L.sleep(1000);
  await android.tap("Start with Lena Park's AI");
  const empty = await L.waitForText(p, /Message Lena Park's AI/u);
  const thread = (await L.state()).threads.find(
    (t) => t.creator === "lenapark" && t.account === "priya",
  );
  L.step(
    p,
    "F1 four screens to a thread: Discover, page, consent, an empty thread",
    consent.ok &&
      empty.ok &&
      thread?.messages.length === 0 &&
      thread?.consent === true,
    `thread rows: ${thread?.messages.length}`,
  );

  await android.tap("Message Lena Park's AI");
  android.type("Hello, where should I start with a loom?");
  await android.tap("Send");
  const reply = await L.waitForText(
    p,
    /Here's how I'd think about that|That depends on a few things/u,
    15000,
  );
  await L.sleep(3000);
  const after = (await L.state()).threads.find(
    (t) => t.creator === "lenapark" && t.account === "priya",
  );
  const rows = after.messages.map((m) => m.split(":")[0]);
  L.step(
    p,
    "F2 the first message is sent once and the AI replies, streamed, delivered",
    reply.ok &&
      rows.length === 2 &&
      /fan delivered/u.test(rows[0]) &&
      /ai delivered/u.test(rows[1]) &&
      !after.generating,
    rows.join(" | "),
  );
}
await L.harness("POST", "/__harness/flags", {
  replyDelayMs: 500,
  sentenceDelayMs: 450,
});
stopHarness();
L.finish();

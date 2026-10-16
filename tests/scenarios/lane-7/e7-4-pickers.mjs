// WP 7.4 P5 on Android: a creator or a conversation picked by name, never
// typed as an id, against the lane 7 fake API. iOS runs the same flows as
// XCUITest (Lane7PickerFlows, through ios-navigation.mjs --pickers).
//   node tests/scenarios/lane-7/e7-4-pickers.mjs [V1 V2 V3 V4 V5]
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const MAYA = "c1000000-0000-4000-8000-000000000001";
const KILN = "c1000000-0000-4000-8000-000000000002";
const GLAZECO = "c1000000-0000-4000-8000-000000000003";
const wanted = process.argv.slice(2);
const run = (id) => !wanted.length || wanted.includes(id);
const stop = await L.ensureHarness();

const has = (label, nodes = A.screen()) =>
  nodes.some((n) => n.text === label || n.desc === label);
async function open(path, actor = "devon", faults = []) {
  await L.harness("POST", "/__harness/reset");
  await L.harness("POST", "/__harness/faults", { rules: faults });
  L.launch("android", "--reset", "--actor", actor, "--to", path);
  await A.waitFor("Crisis help", 30000);
  await L.sleep(1500);
}
/** Waits for a label (the conversations load after the screen), then scrolls
 * down and, if it is still not there, back up with short drags. */
async function reveal(label) {
  const find = () =>
    A.screen().find((n) => n.text === label || n.desc === label);
  for (let i = 0; i < 6; i += 1) {
    const node = find();
    if (node) return node;
    await L.sleep(500);
  }
  for (const [from, to] of [
    [1500, 1000],
    [1000, 1500],
  ])
    for (let i = 0; i < 8; i += 1) {
      const node = find();
      if (node) return node;
      A.swipe(540, from, 540, to, 600);
      await L.sleep(500);
    }
  return find();
}
async function tapLabel(label) {
  const node = await reveal(label);
  if (!node) throw new Error(`Not on screen: ${label}`);
  A.tapAt(node.x, node.y);
  await L.sleep(800);
}
/** The button that holds a label (its smallest clickable parent): a label's
 * own text node is always "enabled". */
function holder(label) {
  const nodes = A.screen();
  const node = nodes.find((n) => n.text === label || n.desc === label);
  if (!node) return null;
  return nodes
    .filter(
      (n) =>
        n.clickable &&
        n.bounds[0] <= node.bounds[0] &&
        n.bounds[1] <= node.bounds[1] &&
        n.bounds[2] >= node.bounds[2] &&
        n.bounds[3] >= node.bounds[3],
    )
    .sort((a, b) => a.w * a.h - b.w * b.h)[0];
}
const noTypedIds = (nodes = A.screen()) =>
  !nodes.some((n) => /Creator ID|Conversation ID/u.test(n.text + n.desc));
async function sent() {
  for (let i = 0; i < 60; i += 1) {
    const commands = (await L.state()).trust ?? [];
    if (commands.length) return commands;
    await L.sleep(250);
  }
  return [];
}
/** Taps a text field (the node its label describes, not the label above it). */
async function tapField(label) {
  await reveal(label);
  const node = A.screen().find((n) => n.desc === label);
  if (!node) throw new Error(`No field: ${label}`);
  A.tapAt(node.x, node.y);
  await L.sleep(800);
}
async function reason(value) {
  await tapField("What happened?");
  A.type(value);
  A.key("BACK"); // the keyboard
  await L.sleep(600);
}

if (run("V1")) {
  await open("/support");
  await tapLabel("block");
  const prompt = Boolean(await reveal("Choose a creator"));
  await reason("Blocking this creator for the picker test.");
  const waiting = holder("Block creator");
  L.step(
    "android",
    "P5.1 Block: Creator, nothing chosen, no typed id, Block waits",
    prompt && has("Creator") && noTypedIds() && waiting && !waiting.enabled,
  );
  await tapLabel("Choose a creator");
  await tapLabel("Kiln Club");
  const chosen = has("Kiln Club");
  L.screenshot("android", "V1-chosen");
  const block = await A.waitEnabled("Block creator", 10000);
  A.tapAt(block.x, block.y);
  const commands = await sent();
  L.step(
    "android",
    "P5.1 the chosen creator's id is what is sent",
    chosen &&
      commands.length === 1 &&
      commands[0].command === "block" &&
      commands[0].creatorId === KILN,
    JSON.stringify(commands),
  );
}

if (run("V2")) {
  await open(`/support?creatorId=${MAYA}`);
  await tapLabel("abuse");
  const named = Boolean(await reveal("Maya"));
  const nodes = A.screen();
  L.step(
    "android",
    "P5.2 opened with a creator: Maya, already chosen, never the id",
    named && noTypedIds(nodes) && !nodes.some((n) => n.text.includes(MAYA)),
  );
  L.screenshot("android", "V2-maya-chosen");
  await reason("Reporting this creator for the picker test.");
  const send = await A.waitEnabled("Send report", 10000);
  A.tapAt(send.x, send.y);
  const commands = await sent();
  L.step(
    "android",
    "P5.2 the report carries that creator",
    commands[0]?.kind === "abuse" && commands[0]?.creatorId === MAYA,
    JSON.stringify(commands),
  );
}

if (run("V3")) {
  await open("/support/privacy");
  await tapLabel("thread");
  const prompt = Boolean(await reveal("Choose a conversation"));
  L.step(
    "android",
    "P5.3 one conversation: Conversation, nothing chosen, one picker, no typed id",
    prompt && has("Conversation") && !has("Choose a creator") && noTypedIds(),
  );
  await tapLabel("Choose a conversation");
  await tapLabel("Glazeco");
  await tapField("Local confirmation");
  A.type("LOCAL DEVELOPMENT");
  A.key("BACK");
  await L.sleep(600);
  L.screenshot("android", "V3-conversation-chosen");
  await reveal("Request export");
  const exportButton = await A.waitEnabled("Request export", 10000);
  A.tapAt(exportButton.x, exportButton.y);
  const commands = await sent();
  const job = commands[0] ?? {};
  L.step(
    "android",
    "P5.3 the export names that conversation and its creator",
    job.command === "export" &&
      job.scope === "thread" &&
      job.creatorId === GLAZECO &&
      job.threadId === "71000000-0000-4000-8000-000000000003",
    JSON.stringify(commands),
  );
}

if (run("V4")) {
  await open("/support", "priya");
  await tapLabel("abuse");
  const none = Boolean(await reveal("You have no conversations yet."));
  L.step(
    "android",
    "P5.4 no conversations: said so, no picker, no typed id",
    none && !has("Choose a creator") && noTypedIds(),
  );
  L.screenshot("android", "V4-none");
}

if (run("V5")) {
  await open("/support", "devon", [
    { match: "^/v1/conversations/account", status: 503 },
  ]);
  await tapLabel("abuse");
  const failed = Boolean(await reveal("Your conversations couldn't load."));
  L.screenshot("android", "V5-failed");
  await L.harness("POST", "/__harness/faults", { rules: [] });
  // The screen also reloads by itself after a routine session check, so the
  // names may already be back; Try again while it is still offered.
  const retry = A.screen().find((n) => n.text === "Try again");
  if (retry) {
    A.tapAt(retry.x, retry.y);
    await L.sleep(800);
  }
  const back = Boolean(await reveal("Choose a creator"));
  await tapLabel("Choose a creator");
  await tapLabel("Maya");
  L.step(
    "android",
    "P5.5 the list fails: said so, Try again brings the names",
    failed && back && has("Maya"),
  );
}

stop();
L.finish();

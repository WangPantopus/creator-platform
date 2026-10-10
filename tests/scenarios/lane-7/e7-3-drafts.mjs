// Operated Android draft/keyboard flows on lane 7's emulator and fake API.
// Run serially under the heavy-build lock; LANE7_OUT is outside the repository.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const bundle = "com.pantopus.qelvora";
const maya =
  "/threads/c1000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001";
const kiln =
  "/threads/c1000000-0000-4000-8000-000000000002/f1000000-0000-4000-8000-000000000001";
const stopHarness = await L.ensureHarness();
const previousFont = A.adb(
  "shell",
  "settings",
  "get",
  "system",
  "font_scale",
).trim();
const previousNavigation =
  /\[x\] (com\.android\.internal\.systemui\.navbar\.\w+)/u.exec(
    A.adb("shell", "cmd", "overlay", "list"),
  )?.[1];
const pass = (text) => console.log(`PASS Android: ${text}`);
async function fresh() {
  L.stop("android");
  A.rotate("portrait");
  A.adb("shell", "settings", "put", "system", "font_scale", "1.0");
  await L.harness("POST", "/__harness/reset");
  await L.harness("POST", "/__harness/log/clear");
  L.launch(
    "android",
    "--reset",
    "--actor",
    "devon",
    "--to",
    maya,
    "--appearance",
    "light",
  );
  await A.waitFor("Message Maya's AI", 30000);
  // Remove reset/sign-in extras before a rotation or process-restoration check.
  L.launch("android");
  await A.waitFor("Message Maya's AI", 30000);
}
async function hasDraft(marker) {
  const until = Date.now() + 30000;
  while (inputControl()?.text !== marker) {
    assert.ok(
      Date.now() < until,
      "Expected draft must be in the editable composer",
    );
    await L.sleep(250);
  }
  pass("expected draft visible in composer");
}
async function noSends() {
  const rows = await L.log(0, "android");
  assert.equal(
    rows.filter(
      (row) =>
        row.method === "POST" && /\/(messages|fan-replies)$/u.test(row.path),
    ).length,
    0,
  );
  pass("no message POST before explicit Send");
}
// UiAutomator exposes the label separately from its editable/clickable parent.
function controlFor(label, nodes) {
  if (!label) return undefined;
  return nodes
    .filter(
      (node) =>
        node.clickable &&
        node.x - node.w / 2 <= label.x - label.w / 2 + 1 &&
        node.x + node.w / 2 >= label.x + label.w / 2 - 1 &&
        node.y - node.h / 2 <= label.y - label.h / 2 + 1 &&
        node.y + node.h / 2 >= label.y + label.h / 2 - 1,
    )
    .sort((a, b) => a.w * a.h - b.w * b.h)[0];
}
function inputControl() {
  const nodes = A.screen();
  return controlFor(
    nodes.find((node) => node.desc.startsWith("Message ")),
    nodes,
  );
}
async function keyboardClear(name) {
  const until = Date.now() + 10000;
  let match;
  while (!match) {
    const state = A.adb("shell", "dumpsys", "window");
    match =
      /type=ime frame=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\][^\n]*? visible=true/u.exec(
        state,
      );
    if (match) break;
    assert.ok(Date.now() < until, "Software keyboard must be visible");
    await L.sleep(250);
  }
  const top = Number(match[2]);
  const densities = [
    ...A.adb("shell", "wm", "density").matchAll(/density: (\d+)/gu),
  ];
  const minimum = (Number(densities.at(-1)[1]) / 160) * 48;
  const nodes = A.screen();
  const composer = controlFor(
    nodes.find((n) => n.desc.startsWith("Message ")),
    nodes,
  );
  const send = controlFor(
    nodes.find((n) => n.text === "Send" || n.desc === "Send"),
    nodes,
  );
  L.screenshot("android", name);
  assert.ok(composer && send, "Composer and Send must remain reachable");
  assert.ok(
    composer.h >= minimum - 2 && send.h >= minimum - 2,
    "Composer or Send was squeezed below its full 48dp target",
  );
  assert.ok(composer.y + composer.h / 2 <= top + 2, "Keyboard covers composer");
  assert.ok(send.y + send.h / 2 <= top + 2, "Keyboard covers Send");
  pass(
    `${name}: composer/Send heights ${composer.h}/${send.h}px (minimum ${minimum}px), both above keyboard (top ${top})`,
  );
}
function encryptedFiles(markers, expected) {
  const directory = "no_backup/conversation-drafts";
  const files = A.adb(
    "exec-out",
    "run-as",
    bundle,
    "sh",
    "-c",
    "if [ -d no_backup ]; then if [ -d no_backup/conversation-drafts ]; then ls no_backup/conversation-drafts; fi; else echo LANE7_STORAGE_UNAVAILABLE; fi",
  )
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  assert.ok(
    files.every((file) => /^[0-9a-f]{64}\.enc$/u.test(file)),
    "Draft storage must be readable and contain only encrypted records",
  );
  assert.equal(files.length, expected);
  let bytes = 0;
  for (const file of files) {
    assert.match(file, /^[0-9a-f]{64}\.enc$/u);
    const data = execFileSync("adb", [
      "-s",
      process.env.LANE7_ANDROID ?? "emulator-5574",
      "exec-out",
      "run-as",
      bundle,
      "cat",
      `${directory}/${file}`,
    ]);
    assert.ok(data.length >= 28 && data.length <= 65536);
    for (const marker of markers)
      assert.equal(
        data.includes(Buffer.from(marker)),
        false,
        "Input must not appear in the stored bytes",
      );
    bytes += data.length;
  }
  pass(
    `${files.length} encrypted draft files in no_backup; ${bytes} bytes, no plaintext marker`,
  );
}
const faults = (rules) => L.harness("POST", "/__harness/faults", { rules });
const messagePosts = async () =>
  (await L.log(0, "android")).filter(
    (row) => row.method === "POST" && row.path.endsWith("/messages"),
  );
const sentCount = async (marker) =>
  (await L.state()).threads
    .find((thread) => thread.creator === "maya" && thread.account === "devon")
    .messages.filter((text) => text.includes(" fan ") && text.includes(marker))
    .length;
async function accepted(marker) {
  const until = Date.now() + 25000;
  while ((await sentCount(marker)) !== 1) {
    assert.ok(Date.now() < until, "Expected exactly one accepted message");
    await L.sleep(250);
  }
  pass("server has exactly one accepted synthetic message");
}
async function emptyInput() {
  await A.waitFor("Message Maya's AI", 30000);
  const until = Date.now() + 25000;
  for (;;) {
    const nodes = A.screen();
    const field = controlFor(
      nodes.find((node) => node.desc.startsWith("Message ")),
      nodes,
    );
    if (field?.text === "") break;
    assert.ok(Date.now() < until, "Input did not clear after acceptance");
    await L.sleep(500);
  }
  pass("composer is empty");
}
async function typeDraft(marker) {
  await A.tap("Message Maya's AI");
  A.type(marker);
  await hasDraft(marker);
}
async function revealConversation(label) {
  for (let i = 0; i < 16; i++) {
    const nodes = A.screen();
    if (nodes.some((node) => node.text === label || node.desc === label))
      return;
    const composer = controlFor(
      nodes.find((node) => node.desc.startsWith("Message ")),
      nodes,
    );
    if (!composer) {
      await L.sleep(500);
      continue;
    }
    const history = nodes
      .filter((node) => node.scrollable && node.y < composer.y)
      .sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (!history) {
      await L.sleep(500);
      continue;
    }
    A.swipe(
      history.x,
      history.y + history.h * 0.35,
      history.x,
      history.y - history.h * 0.35,
    );
    await L.sleep(300);
  }
  L.screenshot("android", "missing-recovery-control");
  throw new Error(`Could not reach ${label}`);
}
async function waitRead(status) {
  const until = Date.now() + 30000;
  for (;;) {
    const rows = await L.log(0, "android");
    if (
      rows.some(
        (row) =>
          row.method === "GET" &&
          /\/conversations\/[^/]+\/[^/]+$/u.test(row.path) &&
          row.status === status,
      )
    )
      return;
    assert.ok(Date.now() < until, `No thread denial ${status}`);
    await L.sleep(250);
  }
}
function nativeInput(mode) {
  const result = A.adb(
    "shell",
    "am",
    "instrument",
    "-w",
    "-r",
    "-e",
    "lane7DraftInput",
    mode,
    "-e",
    "class",
    "com.pantopus.qelvora.Lane7DraftInputFlow",
    "com.pantopus.qelvora.test/androidx.test.runner.AndroidJUnitRunner",
  );
  assert.match(result, /OK \(1 test\)/u);
}
const flows = {
  async D1() {
    await fresh();
    const marker = "lane7 private unsent draft 314159";
    await A.tap("Message Maya's AI");
    A.type(marker);
    await hasDraft(marker);
    await keyboardClear("D1-portrait-keyboard");
    encryptedFiles([marker], 1);
    A.rotate("landscape");
    await hasDraft(marker);
    await keyboardClear("D1-landscape-keyboard");
    A.rotate("portrait");
    await hasDraft(marker);
    A.home();
    await L.sleep(500);
    A.resume();
    await hasDraft(marker);
    L.launch("android");
    await hasDraft(marker);
    encryptedFiles([marker], 1);
    await noSends();
    L.screenshot("android", "D1-restored-after-process-stop");
  },
  async D2() {
    await fresh();
    await A.tap("Message Maya's AI");
    A.type("draft for Maya");
    await hasDraft("draft for Maya");
    A.openLink(`qelvora://app${kiln}`);
    await A.waitFor("Message Kiln Club", 30000);
    assert.ok(!A.texts().includes("draft for Maya"));
    await A.tap("Message Kiln Club");
    A.type("draft for Kiln");
    await hasDraft("draft for Kiln");
    A.key("BACK"); // dismiss the IME before the app's Back
    A.key("BACK");
    await hasDraft("draft for Maya");
    A.openLink(`qelvora://app${kiln}`);
    await hasDraft("draft for Kiln");
    L.launch("android");
    await hasDraft("draft for Kiln");
    encryptedFiles(["draft for Maya", "draft for Kiln"], 2);
    await noSends();
    L.screenshot("android", "D2-independent-thread-draft");
  },
  async D3() {
    await fresh();
    A.adb("shell", "settings", "put", "system", "font_scale", "2.0");
    for (const appearance of ["light", "night"]) {
      L.launch("android", "--appearance", appearance);
      await A.waitFor("Message Maya's AI", 30000);
      L.screenshot("android", `D3-${appearance}-largest-before-keyboard`);
      if (appearance === "light") await typeDraft("Large text draft");
      else {
        await A.tap("Message Maya's AI");
        await hasDraft("Large text draft");
      }
      await keyboardClear(`D3-${appearance}-largest-portrait`);
      assert.ok(
        A.screen().some((node) => node.desc === "Maya's AI"),
        "Authorship words and glyph must stay available",
      );
      A.rotate("landscape");
      await hasDraft("Large text draft");
      await keyboardClear(`D3-${appearance}-largest-landscape`);
      A.rotate("portrait");
      await hasDraft("Large text draft");
    }
    await noSends();
  },
  async D3S() {
    await fresh();
    await typeDraft("Split screen draft");
    A.key("BACK");
    A.adb("shell", "am", "start", "-a", "android.settings.SETTINGS");
    A.key("APP_SWITCH");
    await A.waitFor("Settings");
    // The owned Pixel launcher's app-menu icon, observed in Recents.
    A.tapAt(540, 275);
    await A.tap("Split screen");
    await A.tap("Qelvora", 15000);
    await A.tap("Message Maya's AI", 30000);
    await hasDraft("Split screen draft");
    A.type(" keeps");
    for (const scale of ["1.0", "2.0"]) {
      A.adb("shell", "settings", "put", "system", "font_scale", scale);
      for (const orientation of ["portrait", "landscape"]) {
        A.rotate(orientation);
        await L.sleep(1200);
        await A.tap("Message Maya's AI", 30000);
        await hasDraft("Split screen draft keeps");
        await keyboardClear(`D3S-${scale}-${orientation}`);
        const tasks = A.adb("shell", "am", "stack", "list");
        assert.match(tasks, /com\.android\.settings.+visible=true/u);
        assert.match(tasks, /com\.pantopus\.qelvora.+visible=true/u);
      }
    }
    A.key("BACK");
    A.rotate("portrait");
    A.adb("shell", "settings", "put", "system", "font_scale", "1.0");
    await L.sleep(1200);
    const tasks = A.adb("shell", "am", "stack", "list");
    const bounds =
      /taskId=\d+: com\.pantopus\.qelvora[^\n]+bounds=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/u.exec(
        tasks,
      );
    assert.ok(bounds, "Qelvora's split task must be present");
    const top = Number(bounds[2]);
    assert.ok(top > 500, "Qelvora must occupy the lower split");
    A.swipe(540, top - 13, 540, 0, 600);
    await L.sleep(1200);
    await hasDraft("Split screen draft keeps");
    await A.tap("Message Maya's AI");
    await keyboardClear("D3S-return-fullscreen");
    await noSends();
    encryptedFiles(["Split screen draft keeps"], 1);
  },
  async D3I() {
    await fresh();
    A.adb(
      "shell",
      "cmd",
      "overlay",
      "enable-exclusive",
      "--category",
      "com.android.internal.systemui.navbar.threebutton",
    );
    A.adb("shell", "settings", "put", "system", "font_scale", "2.0");
    L.launch("android", "--appearance", "night");
    await typeDraft("Three button inset draft");
    await keyboardClear("D3-three-button-largest-portrait");
    A.rotate("landscape");
    await hasDraft("Three button inset draft");
    await keyboardClear("D3-three-button-largest-landscape");
    await noSends();
  },
  async D4() {
    await fresh();
    await typeDraft("accepted draft");
    await A.tap("Send");
    await accepted("accepted draft");
    await emptyInput();
    L.launch("android");
    await emptyInput();
    encryptedFiles(["accepted draft"], 0);

    await fresh();
    await faults([{ method: "POST", match: "/messages$", status: 422 }]);
    await typeDraft("rejected draft");
    await A.tap("Send");
    await revealConversation("Keep editing");
    L.stop("android");
    await faults([]);
    L.launch("android");
    await hasDraft("rejected draft");
    await revealConversation("Keep editing");
    await A.tap("Keep editing");
    await hasDraft("rejected draft");
    assert.equal(await sentCount("rejected draft"), 0);

    await fresh();
    await faults([{ method: "POST", match: "/messages$", drop: true }]);
    await typeDraft("retry original draft");
    await A.tap("Send");
    await revealConversation("Retry");
    L.stop("android");
    await faults([]);
    L.launch("android");
    await hasDraft("retry original draft");
    assert.equal(await sentCount("retry original draft"), 0);
    await revealConversation("Retry");
    await A.tap("Retry");
    await accepted("retry original draft");
    await emptyInput();
    const retries = await messagePosts();
    assert.ok(retries.length >= 2);
    assert.equal(new Set(retries.map((row) => row.commandKeyHash)).size, 1);
    assert.match(retries[0].commandKeyHash, /^[0-9a-f]{64}$/u);

    await fresh();
    await typeDraft("response lost draft");
    await faults([
      { method: "POST", match: "/messages$", dropResponse: true },
      { method: "GET", match: "/conversations/[^/]+/[^/]+$", delayMs: 15000 },
      { method: "POST", match: "/messages/status$", delayMs: 15000 },
    ]);
    await A.tap("Send");
    await accepted("response lost draft");
    L.stop("android");
    await faults([]);
    L.launch("android");
    await emptyInput();
    assert.equal(await sentCount("response lost draft"), 1);
    assert.equal((await messagePosts()).length, 1);
    encryptedFiles(["response lost draft"], 0);
    L.screenshot("android", "D4-lost-response-recovered");
  },
  async D4R() {
    await fresh();
    await faults([{ method: "POST", match: "/messages$", status: 422 }]);
    await typeDraft("retry rejected draft");
    await A.tap("Send");
    await revealConversation("Keep editing");
    await faults([]);
    await revealConversation("Retry");
    await A.tap("Retry");
    await accepted("retry rejected draft");
    await emptyInput();
    const posts = await messagePosts();
    assert.equal(posts.length, 2);
    assert.equal(new Set(posts.map((row) => row.commandKeyHash)).size, 1);
    assert.match(posts[0].commandKeyHash, /^[0-9a-f]{64}$/u);
    encryptedFiles(["retry rejected draft"], 0);
    L.screenshot("android", "D4-rejected-message-retry");
  },
  async D5() {
    await fresh();
    await typeDraft("signed out draft");
    A.openLink("qelvora://app/identity/account");
    await A.tap("Sign out", 30000);
    await A.waitFor("Continue with Pantopus", 30000);
    encryptedFiles(["signed out draft"], 0);
    await A.tap("Continue with Pantopus");
    await A.tap("Devon");
    await A.waitFor("Sign out", 30000);
    A.openLink(`qelvora://app${maya}`);
    await emptyInput();
    await typeDraft("other account draft");
    A.openLink("qelvora://app/identity/account");
    await A.tap("Sign out", 30000);
    await A.tap("Continue with Pantopus", 30000);
    await A.tap("Priya");
    await A.waitFor("Sign out", 30000);
    A.openLink(`qelvora://app${maya}`);
    await waitRead(403);
    assert.ok(!A.texts().includes("other account draft"));
    encryptedFiles(["other account draft"], 0);
    for (const status of [401, 403, 404]) {
      await fresh();
      await typeDraft(`denied draft ${status}`);
      L.stop("android");
      await faults([
        { method: "GET", match: "/conversations/[^/]+/[^/]+$", status },
      ]);
      L.launch("android");
      await waitRead(status);
      await A.waitFor("Conversation unavailable", 30000);
      encryptedFiles(["denied draft"], 0);
      L.stop("android");
      await faults([]);
      L.launch("android");
      await emptyInput();
    }
    await fresh();
    await typeDraft("former conversation draft");
    L.stop("android");
    const recreated = await L.harness(
      "POST",
      "/__harness/threads/maya/recreate",
    );
    assert.ok(recreated.id);
    L.launch("android");
    await emptyInput();
    encryptedFiles(["former conversation draft"], 0);
    await noSends();
  },
  async D7() {
    await fresh();
    const marker = "draft7".repeat(334);
    nativeInput("boundary");
    L.launch("android");
    await hasDraft(marker.slice(0, 2000));
    assert.equal(inputControl().text.length, 2000);
    encryptedFiles(["draft7draft7"], 1);
    L.launch("android");
    await hasDraft(marker.slice(0, 2000));
    await noSends();
    L.screenshot("android", "D7-boundary-restored");
  },
  async D7U() {
    await fresh();
    nativeInput("unicode");
    L.launch("android");
    await hasDraft("Draft 🙂 שלום مرحبا");
    encryptedFiles(["Draft 🙂 שלום مرحبا"], 1);
    await noSends();
    L.screenshot("android", "D7-unicode-restored");
  },
  async D8() {
    await fresh();
    const original = "older pending draft";
    await typeDraft(original);
    await faults([{ method: "POST", match: "/messages$", delayMs: 15000 }]);
    await A.tap("Send");
    await A.tap("Message Maya's AI");
    A.adb(
      "shell",
      "input",
      "keyevent",
      "--longpress",
      ...Array(original.length).fill("KEYCODE_DEL"),
    );
    A.type("newer unsent draft");
    await hasDraft("newer unsent draft");
    await accepted(original);
    L.stop("android");
    await faults([]);
    L.launch("android");
    await hasDraft("newer unsent draft");
    assert.equal(await sentCount(original), 1);
    assert.equal(await sentCount("newer unsent draft"), 0);
    assert.equal((await messagePosts()).length, 1);
    encryptedFiles(["newer unsent draft"], 1);
  },
};
const selected = process.argv.slice(2);
if (selected.some((id) => !flows[id]))
  throw new Error("Choose " + Object.keys(flows).join(", "));
let active;
try {
  for (const id of selected.length ? selected : Object.keys(flows)) {
    active = id;
    await flows[id]();
    pass(`${id} complete`);
  }
} catch (error) {
  L.screenshot("android", `${active}-failure`);
  throw error;
} finally {
  A.rotate("portrait");
  if (previousFont === "null")
    A.adb("shell", "settings", "delete", "system", "font_scale");
  else A.adb("shell", "settings", "put", "system", "font_scale", previousFont);
  if (previousNavigation)
    A.adb(
      "shell",
      "cmd",
      "overlay",
      "enable-exclusive",
      "--category",
      previousNavigation,
    );
  stopHarness();
}

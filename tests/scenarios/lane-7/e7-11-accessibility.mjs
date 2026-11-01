// WP 7.11 on Android: a screen reader hears who is speaking before the words,
// an on/off setting is a switch that says its state, a choice is named and says
// which one is chosen, the largest text keeps those controls reachable, and the
// colors keep their contrast in both themes. iOS runs the same flows as XCUITest
// (Lane7AccessibilityFlows, through ios-navigation.mjs --a11y).
//   node tests/scenarios/lane-7/e7-11-accessibility.mjs [A1 A2 A3 A4 A5]
import fs from "node:fs";
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const MAYA = "c1000000-0000-4000-8000-000000000001";
const KILN = "c1000000-0000-4000-8000-000000000002";
const FAN = "f1000000-0000-4000-8000-000000000001";
const wanted = process.argv.slice(2);
const run = (id) => !wanted.length || wanted.includes(id);
const stop = await L.ensureHarness();

// Who is speaking, as a screen reader says it (the label of an author row).
const AUTHORS = [
  /^You\. /u,
  /^Prepared by AI/u,
  /^(Maya|Kiln Club)('s AI|'s team · .+)?( at .+)?$/u,
  /^Maya · to /u,
  /^Maya reacted/u,
];
// Each body and the author a reader must hear just before it (or in the same element).
const MAYA_ROWS = [
  { body: "I keep getting pinholes", self: /^You\. I keep getting pinholes/u },
  { body: "Pinholes in celadon usually", author: /^Maya's AI( at .+)?$/u },
  {
    body: "Thanks. What bisque temperature",
    self: /^You\. Thanks\. What bisque/u,
  },
  {
    body: "I bisque to cone 04",
    self: /^Prepared by AI · approved by Maya\. I bisque/u,
  },
  { body: "Devon, send me a photo", author: /^Maya( at .+)?$/u },
  {
    body: "Second note: the clinic starts at 6pm.",
    author: /^Maya · to all members/u,
  },
];
const KILN_ROWS = [
  { body: "I'm in this thread now", author: /^Kiln Club( at .+)?$/u },
  {
    body: "I'm helping Kiln Club with the queue",
    author: /^Kiln Club's team · Sam, triage( at .+)?$/u,
  },
];
const spoken = (nodes) => nodes.map((n) => n.desc || n.text).filter(Boolean);

async function open(path, actor = "devon") {
  await L.harness("POST", "/__harness/reset");
  L.launch("android", "--reset", "--actor", actor, "--to", path);
  await A.waitFor(
    path.startsWith("/threads/") ? "Send" : "Crisis help",
    30000,
  ).catch(() => null);
  await L.sleep(2500);
}
/** Scrolls up a screen at a time; on each screen a body is checked against the
 * nearest author label above it on that screen, until every row is checked. */
async function authorship(rows, id) {
  const results = new Map();
  for (let step = 0; step < 14 && results.size < rows.length; step += 1) {
    const labels = spoken(A.screen());
    for (const row of rows) {
      if (results.has(row.body)) continue;
      const i = labels.findIndex((l) => l.includes(row.body));
      if (i < 0) continue;
      if (row.self) {
        results.set(row.body, row.self.test(labels[i]) ? "" : labels[i]);
        continue;
      }
      const j = labels
        .slice(0, i)
        .findLastIndex((l) => AUTHORS.some((r) => r.test(l)));
      if (j >= 0)
        results.set(row.body, row.author.test(labels[j]) ? "" : labels[j]);
    }
    A.swipe(540, 700, 540, 1500, 700);
    await L.sleep(700);
  }
  for (const row of rows) {
    const heard = results.get(row.body);
    L.step(
      "android",
      `${id} "${row.body}"`,
      heard === "",
      heard === undefined
        ? "never on screen with its author"
        : heard
          ? `heard "${heard}" first`
          : "",
    );
  }
}
/** The control that holds a label: its smallest clickable parent. */
function holder(label, nodes = A.screen()) {
  const node = nodes.find((n) => n.text === label || n.desc === label);
  if (!node) return null;
  return (
    nodes
      .filter(
        (n) =>
          n.clickable &&
          n.bounds[0] <= node.bounds[0] &&
          n.bounds[1] <= node.bounds[1] &&
          n.bounds[2] >= node.bounds[2] &&
          n.bounds[3] >= node.bounds[3],
      )
      .sort((a, b) => a.w * a.h - b.w * b.h)[0] ?? null
  );
}
async function reveal(label) {
  for (const [from, to] of [
    [1500, 900],
    [900, 1500],
  ])
    for (let i = 0; i < 10; i += 1) {
      const control = holder(label);
      if (control && control.y > 200 && control.y < 2200) return control;
      A.swipe(540, from, 540, to, 700);
      await L.sleep(600);
    }
  return holder(label);
}
const offTheRecord = async () =>
  (await L.state()).threads.find(
    (t) => t.creator === "maya" && t.account === "devon",
  )?.offTheRecord;
async function toggle(label, id, check) {
  const before = await reveal(label);
  L.step(
    "android",
    `${id} "${label}" is a switch, off`,
    before?.cls === "android.widget.Switch" &&
      before.checkable &&
      !before.checked,
    before ? `${before.cls} checked=${before.checked}` : "missing",
  );
  if (!before) return;
  A.tapAt(before.x, before.y);
  await L.sleep(1500);
  const after = holder(label);
  L.step(
    "android",
    `${id} after a tap it says on`,
    after?.checked === true && (check ? (await check()) === true : true),
  );
  A.tapAt(after.x, after.y);
  await L.sleep(1500);
  L.step(
    "android",
    `${id} a second tap turns it off again`,
    holder(label)?.checked === false &&
      (check ? (await check()) === false : true),
  );
}
async function choose(name, summary, id) {
  const control = await reveal(name);
  if (!control) return L.step("android", `${id} "${name}" is on screen`, false);
  A.tapAt(control.x, control.y);
  await L.sleep(800);
  const nodes = A.screen();
  L.step(
    "android",
    `${id} "${name}" says it is chosen, and the summary names it`,
    holder(name, nodes)?.selected === true &&
      nodes.some((n) => n.text === summary),
  );
}

if (run("A1")) {
  // Text tokens on the surfaces they are used on, and the pending bubble (0.7 over ground).
  const tokens = JSON.parse(
    fs.readFileSync(
      new URL("../../../design/handoff/tokens.json", import.meta.url),
      "utf8",
    ),
  ).color.tokens;
  const value = (name, theme) => {
    const raw = tokens.find((t) => t.name === name).value;
    const v = typeof raw === "string" ? raw : raw[theme];
    const ref = /^\{(.+)\}$/u.exec(v);
    return ref ? value(ref[1], theme) : v;
  };
  const rgb = (hex) =>
    [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const lum = (c) => {
    const [r, g, b] = c
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const mix = (a, b, t) => a.map((v, i) => v * t + b[i] * (1 - t));
  const text = [
    ["ink", "ground"],
    ["ink", "surface"],
    ["ink", "surface-sunken"],
    ["ink", "ai-surface"],
    ["ink", "team-surface"],
    ["ink-muted", "ground"],
    ["ink-muted", "surface"],
    ["ink-muted", "surface-sunken"],
    ["ai-ink", "ground"],
    ["ai-ink", "ai-surface"],
    ["on-ai", "ai-ink"],
    ["on-maya", "maya-surface"],
    ["on-maya-muted", "maya-surface"],
    ["maya-accent", "maya-surface"],
    ["maya-ink", "ground"],
    ["on-maya-accent", "maya-accent"],
    ["team-ink", "team-surface"],
    ["alert", "ground"],
    ["seal-ink", "seal-fill"],
  ];
  for (const theme of ["light", "night"]) {
    const low = text
      .map(([f, b]) => [
        `${f} on ${b}`,
        ratio(rgb(value(f, theme)), rgb(value(b, theme))),
      ])
      .filter(([, r]) => r < 4.5);
    L.step(
      "android",
      `A1 ${theme}: text tokens at 4.5:1 or more (${text.length} pairs)`,
      low.length === 0,
      low.map(([p, r]) => `${p} ${r.toFixed(2)}`).join(", "),
    );
    const ground = rgb(value("ground", theme));
    const pending = ratio(
      mix(rgb(value("ink", theme)), ground, 0.7),
      mix(rgb(value("surface-sunken", theme)), ground, 0.7),
    );
    L.step(
      "android",
      `A1 ${theme}: a message still sending keeps 4.5:1`,
      pending >= 4.5,
      pending.toFixed(2),
    );
    const line = ratio(rgb(value("control-line", theme)), ground);
    L.step(
      "android",
      `A1 ${theme}: control outlines at 3:1 or more`,
      line >= 3,
      line.toFixed(2),
    );
  }
}
if (run("A2")) {
  await open(`/threads/${MAYA}/${FAN}`);
  await authorship(MAYA_ROWS, "A2 Maya's thread:");
  await open(`/threads/${KILN}/${FAN}`);
  await authorship(KILN_ROWS, "A2 Kiln Club's thread:");
}
if (run("A3")) {
  await open(`/you?creatorId=${MAYA}&fanId=${FAN}`);
  await A.waitFor("Off the record", 20000).catch(() => null);
  await toggle(
    "Keep this conversation off the record",
    "A3 off the record:",
    offTheRecord,
  );
  const intro = await reveal("Share my intro with this creator's AI");
  L.step(
    "android",
    "A3 sharing the intro is a switch",
    intro?.cls === "android.widget.Switch" && intro.checkable,
  );
  await open("/support/feedback");
  await toggle(
    "I agree to share these answers for product feedback.",
    "A3 feedback consent:",
  );
  await open("/commerce/spending");
  const remind = await reveal("Remind me at 50% and 100%");
  L.step(
    "android",
    "A3 spending reminders are a switch",
    remind?.cls === "android.widget.Switch" && remind.checkable,
  );
}
if (run("A4")) {
  await open("/support");
  for (const name of [
    "Support request",
    "Report AI message",
    "Block creator",
    "Crisis help",
  ])
    L.step(
      "android",
      `A4 report type "${name}" is named`,
      Boolean(await reveal(name)),
    );
  await choose("Abuse report", "Report type: Abuse report", "A4 report type:");
  await open("/support/privacy");
  await choose("Conversation", "Data scope: Conversation", "A4 data scope:");
  await choose("Account", "Data scope: Account", "A4 data scope:");
}
if (run("A5")) {
  A.adb("shell", "settings", "put", "system", "font_scale", "2.0");
  for (const appearance of ["light", "night"]) {
    await L.harness("POST", "/__harness/reset");
    L.launch(
      "android",
      "--reset",
      "--actor",
      "devon",
      "--appearance",
      appearance,
      "--to",
      `/you?creatorId=${MAYA}&fanId=${FAN}`,
    );
    await L.sleep(4000);
    for (const label of [
      "Keep this conversation off the record",
      "Share my intro with this creator's AI",
    ]) {
      const control = await reveal(label);
      // Reachable here; clipping is judged by eye on the screenshot.
      L.step(
        "android",
        `A5 largest text, ${appearance}: "${label}" reachable as a switch`,
        control?.cls === "android.widget.Switch",
        control ? `${control.w}x${control.h} px` : "missing",
      );
    }
    L.screenshot("android", `A5-largest-privacy-${appearance}`);
    for (const [path, label, name] of [
      [
        "/support/feedback",
        "I agree to share these answers for product feedback.",
        "feedback",
      ],
      ["/commerce/spending", "Remind me at 50% and 100%", "spending"],
    ]) {
      L.launch(
        "android",
        "--actor",
        "devon",
        "--appearance",
        appearance,
        "--to",
        path,
      );
      await L.sleep(4000);
      const control = await reveal(label);
      L.step(
        "android",
        `A5 largest text, ${appearance}: "${label}" reachable as a switch`,
        control?.cls === "android.widget.Switch",
      );
      L.screenshot("android", `A5-largest-${name}-${appearance}`);
    }
  }
  A.adb("shell", "settings", "put", "system", "font_scale", "1.0");
}
L.stop("android");
stop();
L.finish();

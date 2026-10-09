// Drives the Android emulator the way a person would, through adb: read what
// is on screen, tap a label, type, press Back, rotate. Used by the lane 7
// scenarios; also a CLI:
//   node tests/scenarios/lane-7/android-ui.mjs texts | tap "Continue with Pantopus" | wait "Home" 8000
//        | type "hello" | key BACK | rotate landscape | swipe x1 y1 x2 y2
import { execFileSync } from "node:child_process";

const SERIAL = process.env.LANE7_ANDROID ?? "emulator-5574";
const adb = (...args) =>
  execFileSync("adb", ["-s", SERIAL, ...args], {
    encoding: "utf8",
    maxBuffer: 32 << 20,
    stdio: ["ignore", "pipe", "pipe"],
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Every visible node with its text, description and centre point. */
export function screen() {
  // uiautomator answers "null root node" while a window is changing: ask again.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (
      /dumped to/u.test(
        adb("shell", "uiautomator", "dump", "/data/local/tmp/ui.xml"),
      )
    )
      break;
    execFileSync("sleep", ["0.5"]);
  }
  const xml = adb("exec-out", "cat", "/data/local/tmp/ui.xml");
  const nodes = [];
  for (const match of xml.matchAll(/<node [^>]*>/gu)) {
    // uiautomator quotes a value with single quotes when it contains a double quote.
    const attr = (name) => {
      const found = new RegExp(`${name}=(?:"([^"]*)"|'([^']*)')`, "u").exec(
        match[0],
      );
      return found?.[1] ?? found?.[2] ?? "";
    };
    const bounds = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/u.exec(attr("bounds"));
    if (!bounds) continue;
    const [x1, y1, x2, y2] = bounds.slice(1).map(Number);
    const unescape = (value) =>
      value
        .replaceAll("&quot;", '"')
        .replaceAll("&amp;", "&")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&#10;", "\n")
        .replaceAll("&apos;", "'");
    nodes.push({
      text: unescape(attr("text")),
      desc: unescape(attr("content-desc")),
      clickable: attr("clickable") === "true",
      x: Math.round((x1 + x2) / 2),
      y: Math.round((y1 + y2) / 2),
      w: x2 - x1,
      h: y2 - y1,
    });
  }
  return nodes;
}
export const texts = () =>
  screen()
    .flatMap((n) => [n.text, n.desc])
    .filter(Boolean);
const find = (label, nodes = screen()) =>
  nodes.find((n) => n.text === label || n.desc === label) ??
  nodes.find((n) => n.text.includes(label) || n.desc.includes(label));

export async function waitFor(label, timeoutMs = 8000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const node = find(label);
    if (node) return node;
    if (Date.now() > until)
      throw new Error(
        `Timed out waiting for "${label}". On screen: ${texts().slice(0, 12).join(" | ")}`,
      );
    await sleep(400);
  }
}
export async function tap(label, timeoutMs = 8000) {
  const node = await waitFor(label, timeoutMs);
  adb("shell", "input", "tap", String(node.x), String(node.y));
  return node;
}
export const tapAt = (x, y) =>
  adb("shell", "input", "tap", String(x), String(y));
export const key = (name) =>
  adb("shell", "input", "keyevent", `KEYCODE_${name}`);
/** `input text` has no spaces or quotes: spaces become %s and the rest is escaped. */
export const type = (value) =>
  adb(
    "shell",
    "input",
    "text",
    value.replaceAll(" ", "%s").replaceAll(/(["'&<>|;()$\\`])/gu, "\\$1"),
  );
export const swipe = (x1, y1, x2, y2, ms = 300) =>
  adb("shell", "input", "swipe", ...[x1, y1, x2, y2, ms].map(String));
export function rotate(to) {
  adb("shell", "settings", "put", "system", "accelerometer_rotation", "0");
  adb(
    "shell",
    "settings",
    "put",
    "system",
    "user_rotation",
    to === "landscape" ? "1" : "0",
  );
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "texts") console.log(texts().join("\n"));
  else if (command === "tap") console.log(await tap(rest[0]));
  else if (command === "wait")
    console.log(await waitFor(rest[0], Number(rest[1] ?? 8000)));
  else if (command === "type") type(rest.join(" "));
  else if (command === "key") key(rest[0].toUpperCase());
  else if (command === "rotate") rotate(rest[0]);
  else if (command === "swipe") swipe(...rest.map(Number));
  else
    console.error(
      "Usage: android-ui.mjs texts | tap <label> | wait <label> [ms] | type <text> | key <NAME> | rotate portrait|landscape | swipe x1 y1 x2 y2",
    );
}

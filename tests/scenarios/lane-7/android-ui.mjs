// Drives the Android emulator the way a person would, through adb: read what
// is on screen, tap a label, type, press Back, rotate. Used by the lane 7
// scenarios; also a CLI:
//   node tests/scenarios/lane-7/android-ui.mjs texts | tap "Continue with Pantopus" | wait "Home" 8000
//        | type "hello" | key BACK | rotate landscape | swipe x1 y1 x2 y2
import { execFileSync } from "node:child_process";

const SERIAL = process.env.LANE7_ANDROID ?? "emulator-5574";
export const adb = (...args) =>
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
    // Decode once: supplementary characters are numeric XML entities, and
    // literal user input such as "&lt;" must not be decoded twice.
    const unescape = (value) =>
      value.replaceAll(
        /&(?:quot|amp|lt|gt|apos|#\d+|#x[0-9a-fA-F]+);/gu,
        (entity) => {
          const named = {
            "&quot;": '"',
            "&amp;": "&",
            "&lt;": "<",
            "&gt;": ">",
            "&apos;": "'",
          };
          if (entity in named) return named[entity];
          return String.fromCodePoint(
            entity.startsWith("&#x")
              ? Number.parseInt(entity.slice(3, -1), 16)
              : Number(entity.slice(2, -1)),
          );
        },
      );
    nodes.push({
      text: unescape(attr("text")),
      desc: unescape(attr("content-desc")),
      clickable: attr("clickable") === "true",
      scrollable: attr("scrollable") === "true",
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
/** The window that has focus: the app, or the launcher once Back has left the app. */
export const focused = () =>
  /mCurrentFocus=Window\{\S+ \S+ ([^/}\s]+)/u.exec(
    adb("shell", "dumpsys", "window"),
  )?.[1] ?? "";
/** Opens a link as another app would, with the app running or not. */
export const openLink = (url) =>
  adb(
    "shell",
    "am",
    "start",
    "-a",
    "android.intent.action.VIEW",
    "-d",
    `'${url}'`,
    "com.pantopus.qelvora",
  );
/** The back gesture: a swipe in from the left edge. */
export const edgeSwipe = () =>
  adb("shell", "input", "swipe", "2", "1200", "500", "1200", "250");
/** Sends the app to the background, as the Home button does. */
export const home = () => key("HOME");
/** Lets the system reclaim a background app, as it does when memory is short. */
export const reclaim = () => adb("shell", "am", "kill", "com.pantopus.qelvora");
/** Brings the app back from the launcher, as a tap on its icon does. */
export const resume = () =>
  adb(
    "shell",
    "monkey",
    "-p",
    "com.pantopus.qelvora",
    "-c",
    "android.intent.category.LAUNCHER",
    "1",
  );
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

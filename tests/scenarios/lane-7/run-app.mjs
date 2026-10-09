// Starts the lane 7 debug app on its own simulator or emulator, signed in the
// same way on both. The harness (harness/server.mjs) must be running.
//   node tests/scenarios/lane-7/run-app.mjs ios|android [--actor devon] [--reset]
//        [--to /threads/<creator>/<fan>] [--appearance light|night] [--shot out.png]
// Other commands: `shot ios|android <out.png>`, `stop ios|android`.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const IOS_NAME = process.env.LANE7_IOS ?? "qelvora-lane7-ios";
const ANDROID_SERIAL = process.env.LANE7_ANDROID ?? "emulator-5574";
const PORT = process.env.LANE7_PORT ?? "56473";
const BUNDLE = "com.pantopus.qelvora";

const run = (file, args, options = {}) =>
  execFileSync(file, args, {
    encoding: options.binary ? "buffer" : "utf8",
    maxBuffer: 64 << 20,
    ...options,
  });
const adb = (...args) => run("adb", ["-s", ANDROID_SERIAL, ...args]);
const adbBinary = (...args) =>
  run("adb", ["-s", ANDROID_SERIAL, ...args], { binary: true });
const udid = () => {
  const devices = Object.values(
    JSON.parse(run("xcrun", ["simctl", "list", "-j", "devices"])).devices,
  ).flat();
  const device = devices.find((d) => d.name === IOS_NAME);
  if (!device) throw new Error(`No simulator named ${IOS_NAME}.`);
  return device.udid;
};

// `ios` and `android` take options straight after them; `shot` and `stop` take the platform first.
const [command, ...rest] = process.argv.slice(2);
const platform = ["shot", "stop"].includes(command) ? rest.shift() : command;
const option = (name) =>
  rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined;
const shot = (target, file) => {
  if (target === "ios")
    run("xcrun", ["simctl", "io", udid(), "screenshot", file]);
  else writeFileSync(file, adbBinary("exec-out", "screencap", "-p"));
  console.log(`screenshot: ${file}`);
};

if (command === "shot") shot(platform, rest[0]);
else if (command === "stop") {
  if (platform === "ios") run("xcrun", ["simctl", "terminate", udid(), BUNDLE]);
  else adb("shell", "am", "force-stop", BUNDLE);
} else if (command === "ios" || command === "android") {
  const actor = option("--actor");
  const to = option("--to");
  const appearance = option("--appearance");
  const reset = rest.includes("--reset");
  if (command === "ios") {
    const id = udid();
    try {
      run("xcrun", ["simctl", "terminate", id, BUNDLE]);
    } catch {
      /* it was not running */
    }
    const args = [
      ...(reset ? ["--harness-reset"] : []),
      ...(actor ? ["--harness-actor", actor] : []),
      ...(to ? ["--return-to", to] : []),
      ...(appearance ? ["--appearance", appearance] : []),
    ];
    console.log(run("xcrun", ["simctl", "launch", id, BUNDLE, ...args]).trim());
  } else {
    // The emulator reaches the harness at its own 127.0.0.1 through this tunnel,
    // so both apps use one address (http://127.0.0.1:56473).
    adb("reverse", `tcp:${PORT}`, `tcp:${PORT}`);
    adb("shell", "am", "force-stop", BUNDLE);
    const extras = [
      ...(reset ? ["--ez", "harness_reset", "true"] : []),
      ...(actor ? ["--es", "harness_actor", actor] : []),
      ...(to ? ["--es", "return_to", to] : []),
      ...(appearance ? ["--es", "appearance", appearance] : []),
    ];
    console.log(
      adb(
        "shell",
        "am",
        "start",
        "-W",
        "-n",
        `${BUNDLE}/.MainActivity`,
        ...extras,
      )
        .trim()
        .split("\n")
        .slice(-3)
        .join("\n"),
    );
  }
  if (option("--shot")) {
    await new Promise((resolve) =>
      setTimeout(resolve, Number(option("--wait") ?? 6000)),
    );
    shot(command, option("--shot"));
  }
} else {
  console.error(
    "Usage: run-app.mjs ios|android [--actor text] [--reset] [--to path] [--appearance light|night] [--shot file] | shot <platform> <file> | stop <platform>",
  );
  process.exit(64);
}

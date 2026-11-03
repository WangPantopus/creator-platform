// Team triage is off for the pilot: the Android Studio Team screen offers
// Drafting, Publishing and Scheduling, never Triage, a member who already holds
// Triage still displays with it, and saving that member's roles drops it. Run on
// a fresh stack, with the debug app installed on an emulator:
//   node infra/local/stack.mjs up --lane N --base-port P
//   adb -s <serial> install -r app-debug.apk
//   LANE7_ANDROID=<serial> PILOT_BASE_PORT=P node tests/scenarios/pilot/team-triage-off-android.mjs [--shots DIR]
// The real app on the emulator, the real backend and PostgreSQL, driven through
// adb (lane 7's android-ui.mjs). Fakes: the development identity, signed in by
// the debug launch hook, and a SQL row standing in for a membership made before
// triage went off. --shots saves the editor in Light and Night to DIR.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  adb,
  screen,
  swipe,
  tapAt,
  texts,
  waitEnabled,
} from "../lane-7/android-ui.mjs";
import {
  API,
  MAYA,
  account,
  expect,
  fan,
  finish,
  legacyMember,
  roles,
  step,
} from "./lib.mjs";

const shots = process.argv.includes("--shots")
  ? process.argv[process.argv.indexOf("--shots") + 1]
  : null;
const SEEDED = account(4);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const port = new URL(API).port;

const two = await fan(2);
await legacyMember(2, ["drafter", "triage"]);
adb("reverse", `tcp:${port}`, `tcp:${port}`);

/** Maya signed in through the debug hook, on her Team screen. */
async function open(appearance, reset) {
  adb("shell", "am", "force-stop", "com.pantopus.qelvora");
  adb(
    "shell",
    "am",
    "start",
    "-n",
    "com.pantopus.qelvora/.MainActivity",
    "--es",
    "api_url",
    `http://127.0.0.1:${port}`,
    "--es",
    "return_to",
    `/studio/${MAYA}/team`,
    "--es",
    "appearance",
    appearance,
    ...(reset
      ? ["--ez", "harness_reset", "true", "--es", "harness_actor", "three"]
      : []),
  );
  await until(() => texts().includes(SEEDED), 90_000, "the seeded member");
}
async function until(check, timeoutMs, what) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return;
    if (Date.now() > end)
      throw new Error(
        `no ${what}; on screen: ${texts().slice(0, 14).join(" | ")}`,
      );
    await sleep(500);
  }
}
/** The member's roles line and its own enabled Edit roles button. */
function member(label) {
  const nodes = screen();
  const name = nodes.find((n) => n.text === label);
  if (!name) return null;
  const below = nodes.filter((n) => n.y > name.y).sort((a, b) => a.y - b.y);
  const edit = below.find((n) => n.text === "Edit roles");
  const holder = edit
    ? nodes
        .filter(
          (n) =>
            n.clickable &&
            n.bounds[0] <= edit.bounds[0] &&
            n.bounds[1] <= edit.bounds[1] &&
            n.bounds[2] >= edit.bounds[2] &&
            n.bounds[3] >= edit.bounds[3],
        )
        .sort((a, b) => a.w * a.h - b.w * b.h)[0]
    : null;
  return { roles: below[0]?.text ?? "", edit, enabled: holder?.enabled };
}
// The screen re-reads the team every few seconds. While it reads, its controls
// are disabled, and when a read runs late the team is hidden and redrawn at the
// top. A screen dump takes about 2 seconds, so a tap can land after either: the
// helpers below scroll back and tap again until the effect shows. A swallowed
// tap sends nothing, so trying again never sends a command twice.
/** Scrolls down until a line starting with `prefix` is on screen. */
async function reveal(prefix) {
  const seen = () => texts().some((t) => t.startsWith(prefix));
  if (seen()) return true;
  // From the top down, in steps shorter than the screen, so no line is skipped.
  top();
  for (let i = 0; i < 6; i++) {
    await sleep(700);
    if (seen()) return true;
    swipe(540, 1700, 540, 1100);
  }
  return seen();
}
const top = () => {
  for (let i = 0; i < 4; i++) swipe(540, 700, 540, 1900);
};
/** Opens the role editor for a member and scrolls it into view. */
async function edit(label) {
  for (let attempt = 0; attempt < 4; attempt++) {
    top();
    // A late tap may have opened it after the last look.
    if (attempt > 0 && (await reveal(`Roles for ${label}`))) break;
    top();
    await until(
      () => member(label)?.enabled,
      30_000,
      `enabled Edit roles for ${label}`,
    );
    const { edit } = member(label);
    tapAt(edit.x, edit.y);
    await sleep(1500);
    if (await reveal(`Roles for ${label}`)) break;
  }
  expect(await reveal("Save roles"), `no editor for ${label}`);
}
/** Taps a control once it is enabled. */
async function press(label) {
  const control = await waitEnabled(label, 30_000);
  tapAt(control.x, control.y);
}
// The PNG needs the raw bytes; android-ui.mjs's adb() decodes its output as text.
const shot = (name) =>
  shots &&
  writeFileSync(
    join(shots, name),
    execFileSync(
      "adb",
      [
        "-s",
        process.env.LANE7_ANDROID ?? "emulator-5574",
        "exec-out",
        "screencap",
        "-p",
      ],
      { maxBuffer: 64 << 20 },
    ),
  );

await open("light", true);
await step(
  "A1",
  "the seeded member who holds Triage still displays with it",
  async () => {
    const seeded = member(SEEDED);
    expect(
      seeded?.roles.split(", ").includes("triage"),
      `shows "${seeded?.roles}"`,
    );
    return `"${SEEDED}" shows "${seeded.roles}"`;
  },
);
await step(
  "A2",
  "editing that member offers no Triage and shows, before Save, the roles it keeps",
  async () => {
    await edit(SEEDED);
    const now = texts();
    const offered = ["Drafting", "Publishing", "Scheduling"].filter((role) =>
      now.includes(role),
    );
    expect(offered.length === 3, `offered ${offered.join(", ")}`);
    expect(
      !now.includes("Triage") &&
        !now.some((t) => t.includes("Reads and routes the queue")),
      "a Triage choice is on the screen",
    );
    const reviewed = now.find((t) => t.startsWith("Reviewed roles:"));
    const desired = now.find((t) => t.startsWith("Desired roles:"));
    expect(reviewed?.includes("triage"), `"${reviewed}"`);
    expect(desired === "Desired roles: drafter, publisher", `"${desired}"`);
    shot("android-editor-light.png");
    return `offered ${offered.join(", ")}; "${reviewed}"; "${desired}"`;
  },
);
await step(
  "A3",
  "saving a member who holds Triage drops it, and the server accepts the change",
  async () => {
    const label = `@${two.handle}`;
    await open("light", false);
    await edit(label);
    for (let attempt = 0; ; attempt++) {
      await reveal("Desired roles:");
      const desired = texts().find((t) => t.startsWith("Desired roles:"));
      if (desired === "Desired roles: drafter, scheduler") break;
      expect(
        attempt < 5 && desired === "Desired roles: drafter",
        `"${desired}"`,
      );
      await reveal("Scheduling");
      await press("Scheduling");
      await sleep(1500);
    }
    for (let attempt = 0; (await roles(2)) !== "drafter,scheduler"; attempt++) {
      expect(attempt < 5, "the save never reached the server");
      await reveal("Save roles");
      const save = await waitEnabled("Save roles", 10_000).catch(() => null);
      if (save) tapAt(save.x, save.y);
      await sleep(4000);
    }
    // The confirmation is the screen's status notice, at the top.
    top();
    await until(
      () => texts().includes("The role change was confirmed."),
      15_000,
      "the confirmation",
    );
    return `"Desired roles: drafter, scheduler" before Save; saved drafter,scheduler; "The role change was confirmed."`;
  },
);
if (shots) {
  await open("night", false);
  await edit(SEEDED);
  shot("android-editor-night.png");
}
await finish();

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
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { adb, screen, swipe, tapAt, texts } from "../lane-7/android-ui.mjs";
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
/** Opens the role editor for a member and scrolls it into view. */
async function edit(label) {
  await until(
    () => member(label)?.enabled,
    30_000,
    `enabled Edit roles for ${label}`,
  );
  const { edit } = member(label);
  tapAt(edit.x, edit.y);
  await until(
    () => texts().includes(`Roles for ${label}`),
    15_000,
    "the editor",
  );
  for (let i = 0; i < 4 && !texts().includes("Save roles"); i++) {
    swipe(540, 1800, 540, 900);
    await sleep(700);
  }
}
const shot = (name) =>
  shots &&
  writeFileSync(
    join(shots, name),
    adb("exec-out", "screencap", "-p").toString("latin1"),
    "latin1",
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
    const scheduling = screen().find((n) => n.text === "Scheduling");
    tapAt(scheduling.x, scheduling.y);
    await until(
      () => texts().includes("Desired roles: drafter, scheduler"),
      10_000,
      "the new desired roles",
    );
    const save = screen().find((n) => n.text === "Save roles");
    tapAt(save.x, save.y);
    await until(
      () => texts().includes("The role change was confirmed."),
      30_000,
      "the confirmation",
    );
    const now = await roles(2);
    expect(now === "drafter,scheduler", `roles became ${now}`);
    return `"Desired roles: drafter, scheduler" before Save; confirmed; saved ${now}`;
  },
);
if (shots) {
  await open("night", false);
  await edit(SEEDED);
  shot("android-editor-night.png");
}
await finish();

// Team triage is off for the pilot: the Android Studio Team screen offers
// Drafting, Publishing and Scheduling, never Triage, a member who already holds
// Triage still displays with it, and saving that member's roles drops it. The
// screen keeps the team, and the person's place in it, through its refreshes.
// Run on a fresh stack, with the debug app installed on an emulator:
//   node infra/local/stack.mjs up --lane N --base-port P
//   adb -s <serial> install -r app-debug.apk
//   LANE7_ANDROID=<serial> PILOT_BASE_PORT=P node tests/scenarios/pilot/team-triage-off-android.mjs [--shots DIR]
// As a slow phone would see it: put lane 7's delay proxy in front of the API,
// holding each Team read, and point the app at it with PILOT_APP_PORT=Q:
//   node tests/scenarios/lane-7/delay-proxy.mjs --listen Q --target <P+1> \
//     --hold "GET /v1/studio/20000000-0000-4000-8000-000000000001/team" --ms 2500
// The real app on the emulator, the real backend and PostgreSQL, driven through
// adb (lane 7's android-ui.mjs). Fakes: the development identity, signed in by
// the debug launch hook, and a SQL row standing in for a membership made before
// triage went off. --shots saves to DIR the editor in Light and Night, and the
// screen before and after its refreshes.
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
// The port the app reaches: the API itself, or a delay proxy in front of it.
const port = process.env.PILOT_APP_PORT ?? new URL(API).port;

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
const line = (prefix, nodes = screen()) =>
  nodes.find((n) => n.text.startsWith(prefix));
/** Scrolls down to the line that starts with `prefix` and puts it near the top,
 * so the editor below it fits on the screen. */
async function bringUp(prefix) {
  let found = line(prefix);
  for (let i = 0; !found && i < 6; i++) {
    // Steps shorter than the screen, so no line is skipped.
    swipe(540, 1700, 540, 1100);
    await sleep(700);
    found = line(prefix);
  }
  expect(found, `no "${prefix}" on screen`);
  // Slowly, so the list doesn't fling past it.
  if (found.y > 800) swipe(540, found.y, 540, 600, 1500);
  await sleep(700);
}
/** Opens the role editor for a member and brings it on screen. */
async function edit(label) {
  let found;
  await until(
    () => (found = member(label))?.enabled,
    30_000,
    `enabled Edit roles for ${label}`,
  );
  tapAt(found.edit.x, found.edit.y);
  await sleep(1000);
  await bringUp(`Roles for ${label}`);
  expect(texts().includes("Save roles"), `the editor for ${label} is cut off`);
}
/** Taps a control once it is enabled. */
async function press(label) {
  const control = await waitEnabled(label, 30_000);
  tapAt(control.x, control.y);
}
const top = () => {
  for (let i = 0; i < 4; i++) swipe(540, 700, 540, 1900);
};
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
  "the screen keeps the team, and the person's place in it, through its refreshes",
  async () => {
    // Scrolled down to the editor. For 35 s, through about eleven team reads
    // and the session's own re-check (every 30 s), every look must find the
    // editor's lines where the first look did: never hidden, never moved.
    const place = () => {
      const nodes = screen();
      return [`Roles for ${SEEDED}`, "Desired roles:", "Save roles"]
        .map((prefix) => line(prefix, nodes)?.y ?? "gone")
        .join(", ");
    };
    shot("android-hold-before.png");
    const first = place();
    expect(!first.includes("gone"), `the editor is not on screen: ${first}`);
    let looks = 0;
    for (const end = Date.now() + 35_000; Date.now() < end; looks++) {
      const now = place();
      if (now !== first) shot("android-hold-moved.png");
      expect(now === first, `look ${looks + 1} found y ${now}, not ${first}`);
    }
    shot("android-hold-after.png");
    return `${looks} looks in 35 s found the heading, "Desired roles:" and "Save roles" at y ${first}`;
  },
);
await step(
  "A4",
  "saving a member who holds Triage drops it, and the server accepts the change",
  async () => {
    const label = `@${two.handle}`;
    await open("light", false);
    await edit(label);
    const desired = texts().find((t) => t.startsWith("Desired roles:"));
    expect(desired === "Desired roles: drafter", `"${desired}"`);
    await press("Scheduling");
    await until(
      () => texts().includes("Desired roles: drafter, scheduler"),
      10_000,
      "the new desired roles",
    );
    // Save needs a current lease and session. On a slow phone the lease can run
    // out just before a read lands, and the session's own check pauses Save too,
    // so a tap can land on it disabled and do nothing: tap again until the
    // server has the change. A tap that did nothing sent nothing.
    let taps = 0;
    for (let attempt = 0; (await roles(2)) !== "drafter,scheduler"; attempt++) {
      expect(attempt < 4, "the save never reached the server");
      const save = await waitEnabled("Save roles", 10_000).catch(() => null);
      if (save) {
        tapAt(save.x, save.y);
        taps++;
      }
      await sleep(3000);
    }
    // The confirmation is the screen's status notice, at the top.
    top();
    await until(
      () => texts().includes("The role change was confirmed."),
      15_000,
      "the confirmation",
    );
    return `"Desired roles: drafter, scheduler" before Save; saved drafter,scheduler after ${taps} tap${taps === 1 ? "" : "s"} on Save; "The role change was confirmed."`;
  },
);
if (shots) {
  await open("night", false);
  await edit(SEEDED);
  shot("android-editor-night.png");
}
await finish();

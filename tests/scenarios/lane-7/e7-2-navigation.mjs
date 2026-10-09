// E7.2 Back and restore, on Android. Each flow walks forward through real
// screens, then presses system Back (or the in-screen Back) and checks the trail
// comes back in reverse, ending with the app leaving (the launcher takes focus).
// iOS has no system Back: its flows are run by hand with the simulator tool and
// recorded in the pull request.
//   node tests/scenarios/lane-7/e7-2-navigation.mjs [N1 N7 ...]
import * as android from "./android-ui.mjs";
import * as L from "./lib.mjs";

const p = "android";
const KILN =
  "/threads/c1000000-0000-4000-8000-000000000002/f1000000-0000-4000-8000-000000000001";
const SCREEN = {
  home: /Your people/u,
  discover: /Search creators, crafts or questions/u,
  creator: /Official means/u,
  consent: /Before your first message/u,
  // The composer says "Message <name>" and has Send; the privacy view and the creator page do not.
  thread: {
    test: (t) =>
      /(^|\n)Message [^\n]+/u.test(t) &&
      /(^|\n)Send(\n|$)/u.test(t) &&
      !/AI remembers/u.test(t),
  },
  privacy: /AI remembers/u,
  packet: /Included in your request/u,
  you: /THIS MONTH/u,
  spending: /Charged this UTC calendar month/u,
  help: /Reports are available without paid access/u,
  notifications: {
    test: (t) =>
      /(^|\n)Settings(\n|$)/u.test(t) && /(^|\n)Notifications(\n|$)/u.test(t),
  },
  post: /POST · PUBLIC/u,
  account: /Your account/u,
  handle: /How creators will know you/u,
  requests: /Creator access[\s\S]*Manage membership/u,
  access: /YOU CAN/u,
  welcome: /Continue with Pantopus/u,
  chooser: /Synthetic isolated accounts/u,
};
const only = process.argv.slice(2);
const stopHarness = await L.ensureHarness();
const at = async (name, ms = 10000) =>
  (await L.waitForText(p, SCREEN[name], ms)).ok;
/** One press of system Back, then a moment for the screen to change. */
const back = async (ms = 1500) => {
  android.key("BACK");
  await L.sleep(ms);
};
/** True once the launcher (or anything but the app) has focus. */
const leftApp = async (ms = 6000) => {
  const until = Date.now() + ms;
  do {
    const focus = android.focused();
    if (focus !== "" && !focus.startsWith("com.pantopus.qelvora")) return true;
    await L.sleep(500);
  } while (Date.now() < until);
  return false;
};
/** A flow is a list of [what happened, did it pass]; the step passes if all do. */
async function flow(id, title, run) {
  if (only.length && !only.includes(id)) return;
  let results;
  try {
    results = await run();
  } catch (error) {
    results = [
      [`threw: ${String(error.message).split("\n")[0].slice(0, 160)}`, false],
    ];
  }
  const failed = results.filter(([, ok]) => !ok).map(([label]) => label);
  L.step(
    p,
    `${id} ${title}`,
    failed.length === 0,
    failed.length
      ? `failed at: ${failed.join("; ")}`
      : results.map(([label]) => label).join(" > "),
  );
}
/** A clean app, signed in as `actor`, then a plain launch so the intent carries no test extras. */
const fresh = async (actor, ...args) => {
  L.stop(p);
  await L.harness("POST", "/__harness/reset");
  await L.harness("POST", "/__harness/faults", { rules: [] });
  L.launch(p, "--reset", "--actor", actor, ...args);
};
const plainRelaunch = async () => {
  await L.sleep(1500);
  L.stop(p);
  L.launch(p);
};

await flow(
  "N1",
  "Home to a thread: Back returns to Home, not You",
  async () => {
    await fresh("devon");
    const r = [["home", await at("home")]];
    await android.tap("Kiln Club · Kiln Club's team");
    r.push(["thread", await at("thread")]);
    await back();
    r.push(["home", await at("home")]);
    await back();
    r.push(["app left", await leftApp()]);
    return r;
  },
);

await flow(
  "N2",
  "Discover, creator, consent, thread: Back skips the consent",
  async () => {
    await fresh("priya", "--to", "/discover");
    const r = [["discover", await at("discover")]];
    await android.tap("Search creators, crafts or questions");
    android.type("Lena");
    android.key("ENTER");
    await android.tap("Lena Park");
    r.push(["creator", await at("creator")]);
    await android.tap("Message Lena Park's AI");
    r.push(["consent", await at("consent")]);
    await L.waitForLog(
      0,
      { path: /conversations\/capabilities/u, status: 200 },
      8000,
      p,
    );
    await L.sleep(1000);
    await android.tap("Start with Lena Park's AI");
    r.push(["thread", await at("thread")]);
    await back();
    r.push(["creator, not the consent", await at("creator")]);
    await back();
    r.push(["discover", await at("discover")]);
    await back();
    r.push(["home, the tab's parent", await at("home")]);
    await back();
    r.push(["app left", await leftApp()]);
    return r;
  },
);

await flow("N3", "Step-in packet: Back returns to the thread", async () => {
  await fresh("devon", "--to", KILN);
  const r = [["thread", await at("thread")]];
  await android.tap("Ask Kiln Club to step in");
  r.push(["packet", await at("packet")]);
  await back();
  r.push(["thread, not Requests", await at("thread")]);
  await back();
  r.push(["home", await at("home")]);
  return r;
});

await flow("N4", "A view inside a thread closes first", async () => {
  await fresh("devon", "--to", KILN);
  const r = [["thread", await at("thread")]];
  await android.tap("Me and privacy");
  r.push(["privacy", await at("privacy")]);
  await back();
  r.push(["thread", await at("thread")]);
  await back();
  r.push(["home", await at("home")]);
  return r;
});

await flow(
  "N5",
  "Account screens: Back returns to You, then Home",
  async () => {
    await fresh("devon", "--to", "/you");
    const r = [["you", await at("you")]];
    await android.tap("Spending and time");
    r.push(["spending", await at("spending")]);
    await back();
    r.push(["you", await at("you")]);
    await android.tap("Help and safety");
    r.push(["help", await at("help")]);
    await back();
    r.push(["you", await at("you")]);
    await back();
    r.push(["home, the tab's parent", await at("home")]);
    return r;
  },
);

await flow(
  "N6",
  "Notifications: a tapped item, Back to the list, Back to Home",
  async () => {
    await fresh("devon");
    await at("home");
    await android.tap("Notifications");
    const r = [["list", await at("notifications")]];
    await android.tap("The Friday glaze clinic is back");
    r.push(["post", await at("post")]);
    // The post's back control names Maya's page only when that is where it goes.
    const labels = android.texts();
    r.push([
      "its back control says Back, not Back to Maya's page",
      labels.includes("Back") && !labels.some((t) => /Back to Maya/u.test(t)),
    ]);
    await android.tap("Back");
    r.push(["in-screen Back: list", await at("notifications")]);
    await android.tap("Your bisque question has an approved reply");
    r.push(["creator page", await at("creator")]);
    await back();
    r.push(["system Back: list", await at("notifications")]);
    await back();
    r.push(["home", await at("home")]);
    return r;
  },
);

await flow(
  "N7",
  "A link while the app is open: Back returns to where you were",
  async () => {
    await fresh("devon", "--to", "/discover");
    const r = [["discover", await at("discover")]];
    android.openLink(`qelvora://app${KILN}`);
    r.push(["thread", await at("thread")]);
    await back();
    r.push(["discover, where you were", await at("discover")]);
    await back();
    r.push(["home", await at("home")]);
    await back();
    r.push(["app left", await leftApp()]);
    return r;
  },
);

await flow(
  "N8",
  "A link into a stopped app: Back goes Home, then leaves",
  async () => {
    await fresh("devon");
    await at("home");
    android.home();
    await L.sleep(1000);
    L.stop(p);
    android.openLink(`qelvora://app${KILN}`);
    const r = [["thread", await at("thread", 20000)]];
    await back();
    r.push(["home", await at("home")]);
    await back();
    r.push(["app left", await leftApp()]);
    return r;
  },
);

await flow("N9", "Rotation keeps the trail", async () => {
  await fresh("devon");
  await at("home");
  await android.tap("Kiln Club · Kiln Club's team");
  const r = [["thread", await at("thread")]];
  android.rotate("landscape");
  await L.sleep(2500);
  android.rotate("portrait");
  await L.sleep(2500);
  r.push(["thread after rotating", await at("thread")]);
  await back();
  r.push(["home, the trail survived", await at("home")]);
  return r;
});

await flow(
  "N10",
  "Stopped and reopened: the place returns, Back goes Home",
  async () => {
    await fresh("devon");
    await at("home");
    await plainRelaunch();
    await at("home");
    await android.tap("Kiln Club · Kiln Club's team");
    const r = [["thread", await at("thread")]];
    await plainRelaunch();
    r.push(["thread restored", await at("thread", 20000)]);
    await back();
    r.push(["home", await at("home")]);
    await back();
    r.push(["app left", await leftApp()]);
    return r;
  },
);

await flow(
  "N11",
  "The back gesture goes back, and at Home leaves the app",
  async () => {
    await fresh("devon");
    await at("home");
    await android.tap("Kiln Club · Kiln Club's team");
    const r = [["thread", await at("thread")]];
    android.edgeSwipe();
    r.push(["home", await at("home")]);
    android.edgeSwipe();
    r.push(["app left", await leftApp()]);
    return r;
  },
);

await flow("N12", "Sign-in chooser: Back closes it, then leaves", async () => {
  L.stop(p);
  await L.harness("POST", "/__harness/reset");
  L.launch(p, "--reset");
  const r = [["welcome", await at("welcome")]];
  await android.tap("Continue with Pantopus");
  r.push(["chooser", await at("chooser")]);
  await back();
  r.push(["welcome", await at("welcome")]);
  await back();
  r.push(["app left", await leftApp()]);
  return r;
});

await flow(
  "N13",
  "Wrong person: a new account never inherits the last one's trail",
  async () => {
    await fresh("devon");
    await at("home");
    await android.tap("Kiln Club · Kiln Club's team");
    const r = [["devon's thread", await at("thread")]];
    android.openLink("qelvora://app/identity/account");
    r.push(["account", await at("account")]);
    const since = (await L.log()).at(-1)?.n ?? 0;
    await android.tap("Sign out");
    r.push(["signed out", await at("welcome")]);
    await android.tap("Continue with Pantopus");
    r.push(["chooser", await at("chooser")]);
    await android.tap("Harness: Priya");
    // Signing in returns to the screen you signed in from: the account screen.
    r.push(["priya, back on the account screen", await at("account")]);
    await back();
    r.push([
      "Back: priya's You, not devon's thread",
      (await at("you")) && android.texts().some((t) => /priya_n/u.test(t)),
    ]);
    await back();
    r.push(["Back: home", await at("home")]);
    await back();
    r.push(["Back: app left, nothing stale to go to", await leftApp()]);
    const entries = await L.log(since, p);
    r.push([
      "priya never asked for devon's thread",
      !L.seen(entries, { path: /threads\/c1000000/u, account: "priya" }).length,
    ]);
    return r;
  },
);

await flow("N14", "A link the app does not know changes nothing", async () => {
  await fresh("devon", "--to", "/discover");
  const r = [["discover", await at("discover")]];
  android.openLink("qelvora://app/admin");
  await L.sleep(2500);
  r.push(["still on discover", await at("discover", 4000)]);
  await back();
  r.push(["home", await at("home")]);
  return r;
});

await flow(
  "N15",
  "Repeat: the same link twice is one step, fast Back presses do not skip",
  async () => {
    await fresh("devon", "--to", "/discover");
    const r = [["discover", await at("discover")]];
    android.openLink(`qelvora://app${KILN}`);
    r.push(["thread", await at("thread")]);
    android.openLink(`qelvora://app${KILN}`);
    await L.sleep(2500);
    r.push(["thread still", await at("thread")]);
    await back();
    r.push(["one Back: discover", await at("discover")]);
    android.openLink(`qelvora://app${KILN}`);
    r.push(["thread again", await at("thread")]);
    // Two presses 150 ms apart: discover, then home. Never past it, never twice on one screen.
    await back(150);
    await back(1500);
    r.push(["two quick Backs: home", await at("home")]);
    return r;
  },
);

await flow(
  "N16",
  "Race: a link arrives while a thread's privacy view is open",
  async () => {
    await fresh("devon", "--to", KILN);
    const r = [["thread", await at("thread")]];
    await android.tap("Me and privacy");
    r.push(["privacy", await at("privacy")]);
    android.openLink("qelvora://app/creators/maya");
    r.push(["creator page", await at("creator")]);
    await back();
    r.push(["thread, privacy closed", await at("thread")]);
    return r;
  },
);

await flow(
  "N17",
  "Boundary: thirty screens deep, the trail holds 24 and Back never loops",
  async () => {
    await fresh("devon");
    await at("home");
    for (let i = 1; i <= 30; i += 1) {
      android.openLink(
        i % 2 ? "qelvora://app/creators/maya" : "qelvora://app/support",
      );
      await L.sleep(800);
    }
    const r = [["on the last screen", await at("help", 8000)]];
    let presses = 0;
    while (presses < 40 && !(await leftApp(0))) {
      await back(400);
      presses += 1;
    }
    // 24 kept screens, then the bottom one's parent chain: You, then Home, then out.
    r.push([`left after ${presses} presses (expected 27)`, presses === 27]);
    return r;
  },
);

await flow(
  "N18",
  "The system reclaims the app: the place returns, Back goes to its parent",
  async () => {
    await fresh("devon");
    await at("home");
    await plainRelaunch();
    await at("home");
    await android.tap("Notifications");
    await at("notifications");
    await android.tap("The Friday glaze clinic is back");
    const r = [["post", await at("post")]];
    await L.sleep(1500);
    android.home();
    await L.sleep(1500);
    android.reclaim();
    await L.sleep(1500);
    android.resume();
    r.push(["post restored", await at("post", 20000)]);
    await back();
    // The trail lived in the process (as on iOS): Back goes to Maya's page, not the list.
    r.push(["creator page, not the list", await at("creator")]);
    return r;
  },
);

await flow(
  "N19",
  "A new fan on the handle form can still leave with Back",
  async () => {
    await fresh("new fan");
    const r = [["handle form", await at("handle", 15000)]];
    await back();
    r.push(["app left, not trapped", await leftApp()]);
    return r;
  },
);

await flow(
  "N20",
  "Edit profile: Back through the account screen to You, then Home",
  async () => {
    await fresh("devon", "--to", "/you");
    const r = [["you", await at("you")]];
    await android.tap("Edit handle and intro");
    r.push(["account", await at("account")]);
    await android.tap("Edit public profile");
    r.push(["handle form", await at("handle")]);
    await android.tap("Back");
    r.push(["in-screen Back: account", await at("account")]);
    await back();
    r.push(["system Back: you", await at("you")]);
    await back();
    r.push(["home", await at("home")]);
    return r;
  },
);

await flow(
  "N21",
  "Requests tab: money screens go Back to Requests, not to You",
  async () => {
    await fresh("devon", "--to", "/requests");
    const r = [["requests", await at("requests")]];
    await android.tap("Spending and time");
    r.push(["spending", await at("spending")]);
    await android.tap("Back");
    r.push(["in-screen Back: requests, not you", await at("requests")]);
    await android.tap("Creator access");
    r.push(["access", await at("access")]);
    await back();
    r.push(["system Back: requests", await at("requests")]);
    await back();
    r.push(["home", await at("home")]);
    return r;
  },
);

stopHarness();
L.finish();

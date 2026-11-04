// WP 7.12 Z3 on a local stack and its web app: a creator opens the web Studio
// from the iOS app, and the web lands at its sign-in, which returns to that
// Studio, then lands signed in once the browser is. iOS only for now: CI's
// Android debug APK is built without a web origin, so it shows no Studio link.
// Run on a fresh stack, with the iOS app built for it on lane 7's simulator:
//   node infra/local/stack.mjs up --lane N --base-port P
//   xcodebuild build-for-testing ... CREATOR_API_URL=http://127.0.0.1:<P+1> \
//     CREATOR_WEB_URL=http://localhost:<P+2>
//   LANE7_IOS=<simulator> LANE7_STACK_BASE=P \
//     node tests/scenarios/lane-7/e7-12-studio-web.mjs <built.xctestrun>
// The real app, Safari, and the stack's web app, backend and PostgreSQL. Fakes:
// the development identity (the app's debug hook, the web's development sign-in).
// The simulator's Safari must not be signed in to that web app yet: it keeps the
// session from an earlier run, so a second run lands in the Studio at once.
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { call, signIn } from "../lane-2/lib.mjs";

const xctestrun = process.argv[2];
const base = Number(process.env.LANE7_STACK_BASE);
if (!xctestrun || !Number.isSafeInteger(base) || base < 1024 || base > 65526)
  throw new Error(
    "Pass the built .xctestrun, and LANE7_STACK_BASE with the stack's first port.",
  );
const API = `http://127.0.0.1:${base + 1}`;
const MAYA = "10000000-0000-4000-8000-000000000003";
const copy = JSON.parse(
  readFileSync(new URL("../../../config/copy.json", import.meta.url), "utf8"),
);

// Without a handle both the app and the web ask for one before the account and
// the Studio, so Maya gets hers through the product first.
const { token, session } = await signIn(API, MAYA);
if (!session.fan) {
  const made = await call(API, "POST", "/v1/identity/fan-profile", {
    token,
    body: { handle: `maya${randomUUID().slice(0, 6)}`, intro: "" },
  });
  if (made.status !== 200)
    throw new Error(`Maya's handle was refused (${made.status} ${made.text})`);
}

const result = spawnSync(
  process.execPath,
  [
    new URL("ios-navigation.mjs", import.meta.url).pathname,
    xctestrun,
    "--studio-web",
  ],
  {
    stdio: "inherit",
    cwd: new URL("../../..", import.meta.url).pathname,
    env: {
      ...process.env,
      LANE7_STUDIO_WEB_API: API,
      // The app's hook signs in the actor whose label contains this.
      LANE7_STUDIO_WEB_ACTOR: "three",
      LANE7_STUDIO_WEB_SIGN_IN: copy.continueWithPantopus,
      LANE7_STUDIO_WEB_CHOOSER: "Development actor three",
      LANE7_STUDIO_WEB_SIGNED_IN: copy.studioTodayTitle,
    },
  },
);
console.log(
  result.status === 0
    ? "PASS ios     Z3 the web lands at its sign-in, returns to the Studio, then lands signed in"
    : "FAIL ios     Z3 the web lands at its sign-in, returns to the Studio, then lands signed in",
);
process.exit(result.status ?? 1);

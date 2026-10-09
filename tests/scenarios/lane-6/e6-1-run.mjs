// One command for an E6.1 run: node tests/scenarios/lane-6/e6-1-run.mjs --out DIR [--only step,step]
// Starts the stand-in API (56463) and the web app (56462, private build dir .next-lane6) from the
// working tree, waits until both answer, runs the capture, and stops both. Use --reuse to leave
// servers you started yourself alone. `next dev` rewrites apps/web/next-env.d.ts; restore it
// with `git restore apps/web/next-env.d.ts` before committing.
import { spawn } from "node:child_process";

const flag = (name) => process.argv.includes(`--${name}`);
const value = (name) =>
  flag(name) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : undefined;
const webPort = process.env.LANE6_WEB_PORT ?? "56462",
  apiPort = process.env.LANE6_FAKE_PORT ?? "56463";
const web = `http://localhost:${webPort}`,
  api = `http://127.0.0.1:${apiPort}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const children = [];
const start = (command, args, env = {}) => {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", "ignore", "inherit"],
  });
  children.push(child);
  return child;
};
const stop = () =>
  children.forEach((c) => {
    try {
      process.kill(-c.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  });
async function ready(url, label) {
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`${label} did not come up at ${url}`);
}
async function busy(url) {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
}
process.on("SIGINT", () => {
  stop();
  process.exit(130);
});
let code = 1;
try {
  if (!flag("reuse")) {
    if ((await busy(`${api}/__mode`)) || (await busy(`${web}/auth/continue`)))
      throw new Error(
        `ports ${webPort}/${apiPort} are in use; stop your servers or pass --reuse`,
      );
    start(
      process.execPath,
      ["--import", "tsx", "tests/scenarios/lane-6/fixture-api.mjs"],
      { LANE6_FAKE_PORT: apiPort },
    );
    start(
      "pnpm",
      [
        "--filter",
        "@qelvora/web",
        "exec",
        "next",
        "dev",
        "--webpack",
        "-p",
        webPort,
      ],
      {
        QELVORA_API_URL: api,
        WEB_ORIGIN: web,
        CREATOR_NEXT_OUTPUT: ".next-lane6",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    );
  }
  await ready(`${api}/__mode`, "stand-in API");
  await ready(`${web}/auth/continue`, "web app");
  const capture = spawn(
    process.execPath,
    [
      "tests/scenarios/lane-6/e6-1-capture.mjs",
      "--out",
      value("out"),
      "--web",
      web,
      "--api",
      api,
      ...(flag("only") ? ["--only", value("only")] : []),
    ],
    { stdio: "inherit" },
  );
  code = await new Promise((resolve) => capture.on("exit", resolve));
} finally {
  stop();
}
process.exit(code ?? 1);

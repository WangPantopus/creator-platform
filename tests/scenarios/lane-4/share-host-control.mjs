// Starts and stops the lane 4 share host (share-host.mts) on 127.0.0.1:56446,
// with the lane 4 backend's own settings file, and applies or removes the
// proposed share-status migration (schema-share-status.sql) in this stack's
// own database. The migration is applied only after the stack's backend has
// started and removed again afterwards: it changes catalogue pins that the
// integrator regenerates when registering it, and the stock backend refuses
// to start while they differ.
//   node tests/scenarios/lane-4/share-host-control.mjs start | stop | status
import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "./lib.mjs";

export const SHARE_HOST = "http://127.0.0.1:56446";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const dir = join(tmpdir(), "qelvora-lane4-scenarios");
const settings = join(tmpdir(), "qelvora-stack", "lane4", "backend.env");
const pidFile = join(dir, "share-host.pid");
const log = join(dir, "share-host.log");
const migration = fileURLToPath(
  new URL(
    "../../../apps/backend/src/modules/commerce/schema-share-status.sql",
    import.meta.url,
  ),
);

const pid = () => {
  try {
    const value = Number(readFileSync(pidFile, "utf8"));
    process.kill(value, 0);
    return value;
  } catch {
    return null;
  }
};

export async function startShareHost() {
  if (pid()) return pid();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const from = existsSync(log) ? statSync(log).size : 0;
  const out = openSync(log, "a");
  const child = spawn(
    process.execPath,
    [
      `--env-file=${settings}`,
      "--import",
      "tsx",
      "tests/scenarios/lane-4/share-host.mts",
    ],
    {
      cwd: root,
      detached: true,
      stdio: ["ignore", out, out],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        PORT: "56446",
      },
    },
  );
  child.unref();
  closeSync(out);
  writeFileSync(pidFile, String(child.pid));
  for (let i = 0; i < 300; i++) {
    if (readFileSync(log, "utf8").slice(from).includes("share host listening"))
      return child.pid;
    if (!pid()) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`the share host did not start; see ${log}`);
}

export async function stopShareHost() {
  const running = pid();
  if (!running) return false;
  process.kill(running, "SIGTERM");
  for (let i = 0; i < 100 && pid(); i++)
    await new Promise((r) => setTimeout(r, 100));
  rmSync(pidFile, { force: true });
  return true;
}

/** Stand-in for the proposed migration's registration, in this stack's own database. */
export async function applyShareStatus() {
  const [{ present }] = await sql(
    "SELECT to_regprocedure('creator.commerce_share_status(uuid,uuid,uuid,integer,uuid,text,boolean)') IS NOT NULL AS present",
  );
  if (!present) await sql(readFileSync(migration, "utf8"));
}

/** Removes it again, so the stack's backend can restart until it is registered. */
export async function removeShareStatus() {
  await sql(`BEGIN;
DROP FUNCTION IF EXISTS creator.commerce_share_status(uuid,uuid,uuid,integer,uuid,text,boolean);
DROP POLICY IF EXISTS share_status ON creator.commerce_share_grant;
DROP POLICY IF EXISTS share_status ON creator.commerce_commitment;
DROP POLICY IF EXISTS share_status ON creator.message;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='creator_commerce_share_read') THEN
  SET LOCAL ROLE creator_owner;
  REVOKE ALL ON creator.commerce_share_grant,creator.commerce_commitment,creator.message,
   creator.signed_verification,creator.creator_profile,creator.fan_profile FROM creator_commerce_share_read;
  REVOKE USAGE ON SCHEMA creator FROM creator_commerce_share_read;
  RESET ROLE;
  DROP ROLE creator_commerce_share_read;
 END IF;
END $$;
COMMIT;`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command = "status"] = process.argv.slice(2);
  if (command === "start")
    console.log(`share host running (pid ${await startShareHost()})`);
  else if (command === "stop")
    console.log(
      (await stopShareHost())
        ? "share host stopped"
        : "share host was not running",
    );
  else
    console.log(
      pid() ? `share host running (pid ${pid()})` : "share host not running",
    );
  process.exit(0);
}

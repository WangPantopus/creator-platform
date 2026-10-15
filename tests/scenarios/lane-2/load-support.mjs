// Real lane 2 stack only. No credentials or session tokens are written to output.
import { execFileSync } from "node:child_process";
import { cpus, loadavg } from "node:os";
import { createRequire } from "node:module";
import { ACTORS, MAYA_CREATOR_ID, call, key, signIn, sleep } from "./lib.mjs";

export { MAYA_CREATOR_ID, call, key, sleep };
export const api = "http://127.0.0.1:56421";
export const { WebSocket } = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
)("ws");
export const emit = (event, data) =>
  process.stdout.write(JSON.stringify({ event, ...data }) + "\n");
export function check(name, ok, detail = {}) {
  emit(ok ? "PASS" : "FAIL", { name, ...detail });
  if (!ok) process.exitCode = 1;
  return ok;
}
export function numberOption(name, fallback, max) {
  const at = process.argv.indexOf(name);
  const value = at < 0 ? fallback : Number(process.argv[at + 1]);
  if (!Number.isInteger(value) || value < 1 || value > max)
    throw new Error(`Invalid ${name}`);
  return value;
}
export function sql(query) {
  return JSON.parse(
    execFileSync(
      "docker",
      [
        "exec",
        "qelvora-lane2-postgres",
        "psql",
        "-XAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "creator_stack",
        "-c",
        query,
      ],
      { encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "pipe"] },
    ).trim(),
  );
}
export async function preflight() {
  const label = execFileSync(
    "docker",
    [
      "inspect",
      "--format",
      '{{index .Config.Labels "qelvora.stack"}}',
      "qelvora-lane2-postgres",
    ],
    { encoding: "utf8" },
  ).trim();
  if (label !== "lane2")
    throw new Error("Lane 2 database ownership not verified");
  const caps = await call(api, "GET", "/v1/identity/capabilities");
  if (caps.json?.mode !== "development")
    throw new Error("Development stack required");
  emit("machine", { load: loadavg(), cpus: cpus().length });
}
export async function fan(index) {
  const signed = await signIn(api, index === 1 ? ACTORS.fanOne : ACTORS.fanTwo);
  const profile =
    signed.session.fan ??
    (
      await call(api, "POST", "/v1/identity/fan-profile", {
        token: signed.token,
        body: { handle: `lane2load${index}`, intro: "" },
      })
    ).json;
  if (!profile?.id) throw new Error("Fan profile unavailable");
  const caps = await call(api, "GET", "/v1/conversations/capabilities", {
    token: signed.token,
  });
  const begun = await call(api, "POST", "/v1/conversations/begin", {
    token: signed.token,
    body: {
      creatorId: MAYA_CREATOR_ID,
      policyVersion: caps.json.providers.version,
      accessNoticeAccepted: true,
      idempotencyKey: key("load-begin"),
    },
  });
  if (begun.status !== 200)
    throw new Error(
      `Conversation unavailable: ${begun.status} ${begun.json?.error?.code ?? "unknown"}`,
    );
  return {
    token: signed.token,
    id: profile.id,
    path: `/v1/conversations/${MAYA_CREATOR_ID}/${profile.id}`,
  };
}
export async function observer() {
  const session = await signIn(api, "10000000-0000-4000-8000-000000000004");
  let refreshedAt = Date.now();
  return async () => {
    if (Date.now() - refreshedAt > 600000) {
      await refreshSession(session);
      refreshedAt = Date.now();
      emit("observer_session_refreshed", {});
    }
    const result = await call(api, "GET", "/v1/trust/operations/metrics", {
      token: session.token,
    });
    if (result.status !== 200)
      throw new Error(`Metrics unavailable: ${result.status}`);
    return result.json;
  };
}
export async function refreshSession(session) {
  const response = await call(api, "POST", "/v1/identity/refresh", {
    token: session.token,
  });
  if (response.status !== 200 || !response.json?.token)
    throw new Error(`Session refresh unavailable: ${response.status}`);
  session.token = response.json.token;
}
export function quantile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length
    ? Math.round(sorted[Math.ceil(sorted.length * fraction) - 1])
    : null;
}
export async function timed(path, options = {}) {
  const start = performance.now();
  try {
    const result = await call(api, options.method ?? "GET", path, options);
    return { ...result, ms: performance.now() - start };
  } catch {
    return { status: 0, json: null, ms: performance.now() - start };
  }
}
export function dbCounts() {
  return sql(`SELECT json_build_object('messages',(SELECT count(*) FROM creator.message),
    'generations',(SELECT count(*) FROM creator.generation),
    'events',(SELECT count(*) FROM creator.event),
    'duplicateSequences',(SELECT count(*) FROM (SELECT thread_id,sequence FROM creator.message GROUP BY 1,2 HAVING count(*)>1) s));`);
}

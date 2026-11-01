// Read an actual completed same-account export, including every streamed owner
// artifact, after the reply-review source graph change. No job or clock writes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
const flag = (name) => process.argv[process.argv.indexOf(name) + 1];
const API = flag("--api"),
  jobId = flag("--job"),
  actor = Number(flag("--actor")),
  out = flag("--out");
assert(
  API && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(API).hostname),
);
assert(jobId && actor >= 1 && actor <= 6 && out);
process.env.LANE6_API = API;
const L = await import("./e6-2-lib.mjs");
const token = await L.apiSession(actor);
const result = await L.api("GET", `/v1/trust/privacy/jobs/${jobId}`, token);
assert.equal(result.status, 200);
assert.equal(result.json.state, "complete");
assert.equal(result.json.tasks.length, 8);
assert(result.json.tasks.every((t) => t.state === "complete"));
const manifest = await L.api(
  "GET",
  `/v1/trust/privacy/jobs/${jobId}/download`,
  token,
);
assert.equal(manifest.status, 200, JSON.stringify(manifest));
const domains = manifest.json.domains;
assert.equal(domains.length, 8);
const summary = {
  jobId,
  account: L.account(actor),
  originalCreatedAt: result.json.created_at,
  tasks: result.json.tasks.map((t) => ({
    domain: t.domain,
    state: t.state,
    attempts: t.attempts,
  })),
  downloads: [],
};
for (const part of domains) {
  if (part.data?.format !== "privacy-stream-v1") continue;
  const r = await fetch(
    `${API}/v1/trust/privacy/jobs/${jobId}/download/${part.domain}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000),
    },
  );
  assert.equal(r.status, 200, `${part.domain} download refused`);
  const bytes = Buffer.from(await r.arrayBuffer());
  assert.equal(bytes.length, part.data.bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha256, part.data.sha256);
  for (const line of bytes.toString("utf8").trim().split("\n"))
    if (line) JSON.parse(line);
  summary.downloads.push({
    domain: part.domain,
    bytes: bytes.length,
    sha256,
    status: r.status,
  });
}
const outsider = await L.apiSession(actor === 5 ? 2 : 5);
const denied = await L.api(
  "GET",
  `/v1/trust/privacy/jobs/${jobId}/download`,
  outsider,
);
assert.equal(denied.status, 404);
summary.crossAccountStatus = denied.status;
const after = await L.api("GET", `/v1/trust/privacy/jobs/${jobId}`, token);
assert.equal(after.json.created_at, summary.originalCreatedAt);
await writeFile(out, JSON.stringify(summary, null, 2), { mode: 0o600 });
console.log(
  `PASS eight completed domains; ${summary.downloads.length} streamed artifacts match original byte counts and SHA-256; cross-account 404; original job clock unchanged`,
);

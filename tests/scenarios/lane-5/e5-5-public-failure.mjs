// Real failure at lane 5's disposable PostgreSQL. Never touches another lane.
// Run with the full stock stack, after its rate-limit window has cleared.
import { execFileSync } from "node:child_process";
import { expect, step, finish } from "./lib.mjs";
const url = "http://127.0.0.1:56451/v1/growth/public/creators/maya";
const read = (headers = {}, timeout = 15000) =>
  fetch(url, { headers, signal: AbortSignal.timeout(timeout) });
await step(
  "E5.5-conditional",
  "weak and listed validators revalidate the current public page",
  async () => {
    const warm = await read();
    expect(warm.status === 200, `warm read ${warm.status}`);
    const tag = warm.headers.get("etag");
    for (const validator of [`W/${tag}`, `"another-version", ${tag}`, "*"]) {
      const r = await read({ "If-None-Match": validator });
      expect(r.status === 304, `conditional ${validator}: ${r.status}`);
      expect((await r.text()) === "", "304 response had a body");
    }
    expect(
      (await read({ "If-None-Match": '"another-version"' })).status === 200,
      "different version returned 304",
    );
  },
);
await step(
  "E5.5-database-failure",
  "a warm cache does not serve through a database outage and recovers afterwards",
  async () => {
    expect((await read()).status === 200, "could not warm cache");
    let observed;
    try {
      execFileSync("docker", ["pause", "qelvora-lane5-postgres"]);
      try {
        const r = await read({}, 3500);
        observed = `HTTP ${r.status}`;
        expect(r.status >= 500, `served during database outage: ${r.status}`);
      } catch (error) {
        if (error.name !== "TimeoutError") throw error;
        observed = "request timed out after 3.5 seconds; no cached page served";
      }
    } finally {
      execFileSync("docker", ["unpause", "qelvora-lane5-postgres"]);
    }
    const recovered = await read();
    expect(recovered.status === 200, `recovery ${recovered.status}`);
    const body = await recovered.json();
    expect(
      body.creator.handle === "maya" && body.creator.state === "published",
      "wrong recovered page",
    );
    return `${observed}; recovered 200 with current published Maya`;
  },
);
process.exit(finish());

// Stock server and PostgreSQL, no replacement sharing/signature owner.
// Development identity is the only edge fake used by this scenario.
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { ACTORS, call, signIn } from "../lane-2/lib.mjs";
import { expect, step, skip, finish } from "./lib.mjs";
const require = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
);
const { Pool } = require("pg");
const db = new Pool({
  connectionString:
    "postgresql://postgres:foundation-test-only@127.0.0.1:56450/creator_stack",
  max: 2,
});
const api = "http://127.0.0.1:56451";
try {
  const fan = await signIn(api, ACTORS.fanOne);
  const grantId = randomUUID();
  await step(
    "E5.7-missing-owner",
    "a missing owner cannot create a share, including repeat and concurrent requests",
    async () => {
      const before = (
        await db.query("SELECT count(*)::int AS n FROM growth.share")
      ).rows[0].n;
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          call(api, "POST", "/v1/growth/shares", {
            token: fan.token,
            body: { grantId },
          }),
        ),
      );
      expect(
        results.every(
          (r) =>
            r.status === 403 && r.json?.error?.code === "sharing_unavailable",
        ),
        results.map((r) => `${r.status} ${r.text}`).join("; "),
      );
      expect(
        (await db.query("SELECT count(*)::int AS n FROM growth.share")).rows[0]
          .n === before,
        "share persisted without owner authority",
      );
      return "four refusals; database share count unchanged";
    },
  );
  await step(
    "E5.7-unknown-link",
    "an unknown public share exposes neither words nor an export",
    async () => {
      const id = randomUUID();
      const page = await call(api, "GET", `/v1/growth/public/shares/${id}`);
      const exported = await call(
        api,
        "GET",
        `/v1/growth/public/shares/${id}/export`,
      );
      expect(
        page.status === 404 && exported.status === 410,
        `${page.status} ${page.text}; ${exported.status} ${exported.text}`,
      );
      return "page 404; export 410";
    },
  );
  for (const [id, what] of [
    [
      "normal",
      "delivered signed reply, fan handle choice, real grant ID and creation call",
    ],
    [
      "author",
      "AI and approved drafts refused; altered text produces hash mismatch",
    ],
    [
      "withdraw",
      "fan and creator withdrawal removes page and image, including racing reads",
    ],
    ["render", "Unicode, very long text, image export and short URL"],
    [
      "restart",
      "a real shared reply remains correct after restart and owner failure",
    ],
  ])
    skip(
      `E5.7-${id}`,
      what,
      "stock server has no shareSource/shareStatus owner; no substitute permission or signature reader is installed",
    );
} finally {
  await db.end();
}
process.exitCode = finish();

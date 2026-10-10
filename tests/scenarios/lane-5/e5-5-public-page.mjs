// E5.5: real public reads on lane 2's full stock stack (run with --lane 5 --growth).
// Fakes: development identity, development creator license and the model edge.
// No module/projection mock. Profile-authoring and capacity cases stay not run
// until their real sources exist. Uses lane 5's disposable creator_stack only.
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { ACTORS, MAYA_CREATOR_ID as id, call, signIn } from "../lane-2/lib.mjs";
import { expect, step, skip, finish, delay } from "./lib.mjs";
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
const path = (handle = "maya") => `/v1/growth/public/creators/${handle}`;
const read = async (handle = "maya", headers = {}) => {
  const r = await fetch(api + path(handle), {
    headers,
    signal: AbortSignal.timeout(20000),
  });
  return {
    status: r.status,
    headers: r.headers,
    body: r.status === 304 ? null : await r.json(),
  };
};
const creator = await signIn(api, ACTORS.maya, "/studio/ai");
const command = (route, body) =>
  call(api, "POST", route, {
    token: creator.token,
    body,
    headers: { "Idempotency-Key": randomUUID() },
  });
const expectStatus = (r, status) =>
  expect(
    r.status === status,
    `${r.status} ${JSON.stringify(r.json ?? r.body)}`,
  );
if (process.argv.includes("--after-restart")) {
  await step(
    "E5.5-restart",
    "the public page survives a host restart without stale process state",
    async () => {
      const r = await read();
      expectStatus(r, 200);
      expect(
        r.headers.get("x-qelvora-public-cache") === "miss",
        "first read was not cold",
      );
      expect(
        r.body.creator.id === id && r.body.creator.state === "published",
        JSON.stringify(r.body),
      );
    },
  );
} else {
  await step(
    "E5.5-anonymous",
    "a published creator is readable with no account",
    async () => {
      const before = (
        await db.query(
          "SELECT count(*)::int AS n FROM creator.identity_session",
        )
      ).rows[0].n;
      const r = await read();
      expectStatus(r, 200);
      expect(
        r.body.creator.id === id && r.body.creator.state === "published",
        JSON.stringify(r.body),
      );
      expect(
        r.body.creator.biography === "" && r.body.creator.category === "",
        "missing author source fabricated fields",
      );
      expect(
        r.headers.get("cache-control") === "public, max-age=0, must-revalidate",
        "cache revalidation missing",
      );
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM creator.identity_session",
          )
        ).rows[0].n === before,
        "public read created an identity session",
      );
      return `state=${r.body.creator.state}, topics=${r.body.creator.topics.length}, no identity session created`;
    },
  );
  await step(
    "E5.5-cache-lock",
    "a warm read works while the stored creator row is locked",
    async () => {
      await read();
      const held = await db.connect();
      try {
        await held.query("BEGIN");
        await held.query(
          "SELECT id FROM growth.creator_public WHERE id=$1 FOR UPDATE",
          [id],
        );
        const r = await read();
        expectStatus(r, 200);
        expect(
          r.headers.get("x-qelvora-public-cache") === "hit",
          "warm read did not hit cache",
        );
        const tag = r.headers.get("etag");
        expect(Boolean(tag), "missing ETag");
        const matched = await read("maya", { "If-None-Match": tag });
        expectStatus(matched, 304);
        return "200 from cache under row lock; matching ETag returned 304";
      } finally {
        await held.query("ROLLBACK");
        held.release();
      }
    },
  );
  await step(
    "E5.5-session",
    "signed-in reads never share public cache authority or permit a signed-out token",
    async () => {
      const fan = await signIn(api, ACTORS.fanOne);
      const r = await read("maya", { Authorization: `Bearer ${fan.token}` });
      expectStatus(r, 200);
      expect(
        r.headers.get("cache-control") === "no-store",
        "signed-in response was publicly cacheable",
      );
      expectStatus(
        await call(api, "POST", "/v1/identity/fan-profile", {
          token: fan.token,
          body: { handle: "public_page_fan", intro: "" },
        }),
        200,
      );
      const capabilities = await call(
        api,
        "GET",
        "/v1/conversations/capabilities",
        { token: fan.token },
      );
      expectStatus(
        await call(api, "POST", "/v1/conversations/begin", {
          token: fan.token,
          body: {
            creatorId: id,
            policyVersion: capabilities.json.providers.version,
            accessNoticeAccepted: true,
            idempotencyKey: randomUUID(),
          },
        }),
        200,
      );
      expectStatus(
        await call(api, "POST", "/v1/trust/blocks", {
          token: fan.token,
          body: {
            creatorId: id,
            reason: "Synthetic public-page access check",
            idempotencyKey: randomUUID(),
          },
        }),
        200,
      );
      const concurrent = await Promise.all(
        Array.from({ length: 12 }, (_, n) =>
          read("maya", n % 2 ? { Authorization: `Bearer ${fan.token}` } : {}),
        ),
      );
      expect(
        concurrent
          .filter((_, n) => n % 2)
          .every((r) => [403, 404, 429].includes(r.status)),
        `blocked visitor borrowed public authority: ${concurrent.map((r) => r.status)}`,
      );
      expect(
        [403, 404].includes(
          (await read("maya", { Authorization: `Bearer ${fan.token}` })).status,
        ),
        "blocked visitor read a cached page",
      );
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM creator_trust.block WHERE account_id=$1 AND creator_id=$2 AND revoked_at IS NULL",
            [ACTORS.fanOne, id],
          )
        ).rows[0].n === 1,
        "block not committed",
      );
      expectStatus(
        await call(api, "POST", "/v1/identity/logout", { token: fan.token }),
        200,
      );
      expectStatus(
        await read("maya", { Authorization: `Bearer ${fan.token}` }),
        401,
      );
      expectStatus(await read(), 200);
    },
  );
  await step(
    "E5.5-rename",
    "a real profile rename invalidates the old handle immediately",
    async () => {
      await read();
      const name = "陶芸 Maya 🧑🏽‍🎨 <script>plain</script>";
      expectStatus(
        await command("/v1/identity/creator-profile", {
          handle: "maya_renamed",
          displayName: name,
        }),
        200,
      );
      try {
        expectStatus(await read(), 404);
        const r = await read("maya_renamed");
        expectStatus(r, 200);
        expect(
          r.body.creator.id === id && r.body.creator.name === name,
          "rename lost unicode or treated markup specially",
        );
        const row = (
          await db.query(
            "SELECT handle,display_name FROM creator.creator_profile WHERE id=$1",
            [id],
          )
        ).rows[0];
        expect(
          row.handle === "maya_renamed" && row.display_name === name,
          JSON.stringify(row),
        );
      } finally {
        expectStatus(
          await command("/v1/identity/creator-profile", {
            handle: "maya",
            displayName: "Maya",
          }),
          200,
        );
      }
    },
  );
  await step(
    "E5.5-pause",
    "pause is visible immediately after a warm read, and resume restores the page",
    async () => {
      const state = await call(api, "GET", `/v1/agent/${id}/state`, {
        token: creator.token,
      });
      const version = state.json.liveVersion.id;
      await read();
      expectStatus(await command(`/v1/agent/${id}/pause`), 200);
      try {
        const r = await read();
        expectStatus(r, 200);
        expect(
          r.body.creator.state === "paused" && r.body.posts.length === 0,
          JSON.stringify(r.body),
        );
        expect(
          (
            await db.query(
              "SELECT paused FROM creator.ai_workspace WHERE creator_id=$1",
              [id],
            )
          ).rows[0].paused,
          "pause not stored",
        );
      } finally {
        expectStatus(
          await command(`/v1/agent/${id}/versions/${version}/rollback`),
          200,
        );
      }
      const r = await read();
      expectStatus(r, 200);
      expect(r.body.creator.state === "published", "resume remained stale");
    },
  );
  await step(
    "E5.5-boundary",
    "invalid handles and an unpublished creator never produce a public page",
    async () => {
      expectStatus(await read("ab"), 400);
      expectStatus(await read("a".repeat(31)), 400);
      expectStatus(await read("a".repeat(30)), 404);
      const fan = await signIn(api, ACTORS.fanTwo);
      expectStatus(
        await call(api, "POST", "/v1/identity/creator-profile", {
          token: fan.token,
          body: { handle: "not_published", displayName: "Not published" },
        }),
        200,
      );
      expectStatus(await read("not_published"), 404);
    },
  );
  skip(
    "E5.5-profile-author",
    "biography, category, caption, markup and length boundary",
    "the growth authoring endpoint/migration is still gated; no projection was mocked",
  );
  skip(
    "E5.5-capacity",
    "at-capacity profile agrees with enforced capacity",
    "lane 4 public summary is not connected",
  );
  await step(
    "E5.5-hammer",
    "120 reads succeed; the next ten, including spoofed addresses, are limited",
    async () => {
      await delay(61000); // Real fixed-window boundary; no clock or module fake.
      const results = await Promise.all(
        Array.from({ length: 130 }, (_, n) =>
          read("maya", { "X-Forwarded-For": `198.51.100.${n + 1}` }),
        ),
      );
      const ok = results.filter((r) => r.status === 200),
        limited = results.filter((r) => r.status === 429);
      expect(
        ok.length === 120 && limited.length === 10,
        JSON.stringify(results.map((r) => r.status)),
      );
      expect(
        limited.every(
          (r) =>
            Number(r.headers.get("retry-after")) > 0 &&
            r.headers.get("cache-control") === "no-store",
        ),
        "bad limit headers",
      );
      expect(
        new Set(ok.map((r) => JSON.stringify(r.body))).size === 1,
        "concurrent readers got different pages",
      );
      const waits = (
        await db.query(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'",
        )
      ).rows[0].n;
      expect(waits === 0, `${waits} database lock waiters`);
      return "120 identical pages, 10 rate limits, 0 lock waiters";
    },
  );
}
await db.end();
process.exit(finish());

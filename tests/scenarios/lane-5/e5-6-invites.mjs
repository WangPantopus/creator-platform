// Fresh full lane 2 stack on lane 5 ports, plus pending_w7_invite_note.sql.
// Real server/PostgreSQL. Fakes: development identity/license/model and expiry
// time on one disposable link. Never creates a fake public creator projection.
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { ACTORS, MAYA_CREATOR_ID, call, signIn } from "../lane-2/lib.mjs";
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
const creator = await signIn(api, ACTORS.maya, "/studio/ai");
const fan = await signIn(api, ACTORS.fanOne);
const create = (body, token = creator.token) =>
  call(api, "POST", "/v1/growth/invites", { token, body });
const read = (id) => call(api, "GET", `/v1/growth/public/invites/${id}`);
const revoke = (id, token = creator.token) =>
  call(api, "DELETE", `/v1/growth/invites/${id}`, { token });
const status = (r, n) => expect(r.status === n, `${r.status}: ${r.text}`);
const fixturePath = "/tmp/qelvora-lane5-invite-fixture.json";
if (process.argv.includes("--after-restart")) {
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  await step(
    "E5.6-restart",
    "the stored note survives restart; withdrawn links stay unavailable",
    async () => {
      const r = await read(fixture.id);
      status(r, 200);
      expect(r.json.note === fixture.note, "note changed on restart");
      status(await read(fixture.revokedId), 404);
      status(await read(fixture.expiredId), 404);
    },
  );
} else {
  const first = {
    id: randomUUID(),
    contextId: null,
    note: "Come talk pottery. 陶芸 <script>window.__invite_markup=true</script>\nمرحبا 🧑🏽‍🎨",
  };
  let expiry;
  await step(
    "E5.6-create-race",
    "five identical creator requests make one invitation with one expiry",
    async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => create(first)),
      );
      results.forEach((r) => status(r, 201));
      expect(
        results.every((r) => r.json.id === first.id),
        "request ID changed",
      );
      expect(
        new Set(results.map((r) => r.json.expires_at)).size === 1,
        "retry extended expiry",
      );
      expiry = results[0].json.expires_at;
      const rows = (
        await db.query(
          "SELECT note,expires_at FROM growth.invite WHERE id=$1",
          [first.id],
        )
      ).rows;
      expect(
        rows.length === 1 && rows[0].note === first.note,
        "stored invitation differs",
      );
      return "five 201s, one stored link, identical expiry";
    },
  );
  await step(
    "E5.6-open-reuse",
    "a signed-out visitor can reuse the link and sees the creator's exact note",
    async () => {
      for (let n = 0; n < 3; n++) {
        const r = await read(first.id);
        status(r, 200);
        expect(
          r.json.note === first.note && r.json.creator.id === MAYA_CREATOR_ID,
          "wrong note or creator",
        );
        expect(
          r.json.destination === "/creators/maya/chat",
          "destination changed",
        );
      }
      const changed = await create({
        ...first,
        note: "Different request using the old ID",
      });
      status(changed, 409);
      status(await read(randomUUID()), 404);
      const old = await create(first);
      status(old, 201);
      expect(old.json.expires_at === expiry, "retry changed expiry");
    },
  );
  await step(
    "E5.6-wrong-person",
    "a fan cannot create or revoke the creator's invitation",
    async () => {
      const made = await create(
        { contextId: null, note: "Fan cannot speak as Maya" },
        fan.token,
      );
      expect([403, 404].includes(made.status), made.text);
      status(await revoke(first.id, fan.token), 404);
      status(await read(first.id), 200);
    },
  );
  let boundary;
  await step(
    "E5.6-boundaries",
    "600 characters persist; 601, an invalid ID and an unknown post are refused",
    async () => {
      boundary = { id: randomUUID(), contextId: null, note: "陶".repeat(600) };
      status(await create(boundary), 201);
      expect(
        (await read(boundary.id)).json.note === boundary.note,
        "Unicode boundary changed",
      );
      status(await create({ contextId: null, note: "x".repeat(601) }), 400);
      status(await create({ id: "bad", contextId: null, note: "" }), 400);
      status(await create({ contextId: randomUUID(), note: "" }), 404);
    },
  );
  await step(
    "E5.6-limit",
    "concurrent creations stop at 20; an exact retry still works at the limit",
    async () => {
      const before = (
        await db.query(
          "SELECT count(*)::int AS n FROM growth.invite WHERE created_by=$1 AND revoked_at IS NULL AND expires_at>now()",
          [ACTORS.maya],
        )
      ).rows[0].n;
      const results = await Promise.all(
        Array.from({ length: 22 - before }, () =>
          create({ id: randomUUID(), contextId: null, note: "" }),
        ),
      );
      expect(
        results.filter((r) => r.status === 201).length === 20 - before,
        JSON.stringify(results.map((r) => r.status)),
      );
      expect(
        results.filter((r) => r.status === 429).length === 2,
        JSON.stringify(results.map((r) => r.status)),
      );
      status(await create(first), 201);
      const row = (
        await db.query(
          "SELECT count(*)::int AS n FROM growth.invite WHERE created_by=$1 AND revoked_at IS NULL AND expires_at>now()",
          [ACTORS.maya],
        )
      ).rows[0];
      expect(row.n === 20, JSON.stringify(row));
      return "20 stored active links; two refused; original retry reused its link";
    },
  );
  const revokedId = boundary.id;
  await step(
    "E5.6-revoke",
    "revoke is repeat-safe and retrying creation cannot restore the link",
    async () => {
      status(await revoke(revokedId), 200);
      status(await revoke(revokedId), 200);
      status(await read(revokedId), 404);
      status(await create(boundary), 201);
      status(await read(revokedId), 404);
    },
  );
  const expired = {
    id: randomUUID(),
    contextId: null,
    note: "Expires in this clock-edge check.",
  };
  await step(
    "E5.6-expire",
    "a past-expiry link is unavailable and a retry does not extend it",
    async () => {
      status(await create(expired), 201);
      // Outer clock edge: avoid waiting 30 days; no module or permission fake.
      await db.query(
        "UPDATE growth.invite SET expires_at=now()-interval '1 second' WHERE id=$1",
        [expired.id],
      );
      status(await read(expired.id), 404);
      const retried = await create(expired);
      status(retried, 201);
      expect(
        new Date(retried.json.expires_at).valueOf() < Date.now(),
        "retry renewed expiry",
      );
      status(await read(expired.id), 404);
    },
  );
  await step(
    "E5.6-pause",
    "a paused creator's invite is unavailable until the real AI resumes",
    async () => {
      const state = await call(
        api,
        "GET",
        `/v1/agent/${MAYA_CREATOR_ID}/state`,
        { token: creator.token },
      );
      const command = (path) =>
        call(api, "POST", path, {
          token: creator.token,
          headers: { "Idempotency-Key": randomUUID() },
        });
      status(await command(`/v1/agent/${MAYA_CREATOR_ID}/pause`), 200);
      try {
        status(await read(first.id), 404);
      } finally {
        status(
          await command(
            `/v1/agent/${MAYA_CREATOR_ID}/versions/${state.json.liveVersion.id}/rollback`,
          ),
          200,
        );
      }
      status(await read(first.id), 200);
    },
  );
  writeFileSync(
    fixturePath,
    JSON.stringify({
      id: first.id,
      note: first.note,
      revokedId,
      expiredId: expired.id,
    }),
  );
  skip(
    "E5.6-useful-answer",
    "record a useful answer once and offer install",
    "lane 3 has not connected the owner outcome; no browser event may fabricate it",
  );
  skip(
    "E5.6-app-links",
    "open the installed app and web fallback",
    "founder domain and native app association identifiers are not supplied",
  );
}
await db.end();
process.exit(finish());

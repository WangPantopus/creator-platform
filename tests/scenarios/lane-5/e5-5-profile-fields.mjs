// Real server/PostgreSQL/installed Chrome. Outer-edge development identity,
// license and model only. Run after applying pending_w7_creator_profile_fields.sql.
import { chromium } from "@playwright/test";
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
const api = "http://127.0.0.1:56451",
  web = "http://localhost:56452";
const creator = await signIn(api, ACTORS.maya, "/studio/ai"),
  fan = await signIn(api, ACTORS.fanOne);
const status = (r, code) => expect(r.status === code, `${r.status} ${r.text}`);
const read = (token) => call(api, "GET", "/v1/growth/profile", { token });
const save = (body, token = creator.token) =>
  call(api, "PUT", "/v1/growth/profile", { token, body });
const publicRead = () => call(api, "GET", "/v1/growth/public/creators/maya");
const fixturePath = "/tmp/qelvora-lane5-profile-fixture.json";
let browser;
try {
  if (process.argv.includes("--after-restart")) {
    await step(
      "E5.5-profile-restart",
      "saved public words and version survive a stock server restart",
      async () => {
        const expected = JSON.parse(readFileSync(fixturePath, "utf8"));
        const got = await read(creator.token);
        status(got, 200);
        expect(JSON.stringify(got.json) === JSON.stringify(expected), got.text);
        const page = await publicRead();
        status(page, 200);
        for (const key of ["biography", "category", "photoCaption"])
          expect(
            page.json.creator[key] === expected[key],
            `public ${key} changed`,
          );
      },
    );
  } else {
    let current;
    await step(
      "E5.5-profile-owner",
      "only the current verified creator can read/write the authoring endpoint",
      async () => {
        const initial = await read(creator.token);
        status(initial, 200);
        current = initial.json;
        status(await read(null), 401);
        status(await read(fan.token), 403);
        status(await save(current, fan.token), 403);
        status(await save({ ...current, creatorId: randomUUID() }), 400);
        expect(
          JSON.stringify((await read(creator.token)).json) ===
            JSON.stringify(current),
          "denied write changed data",
        );
      },
    );
    await step(
      "E5.5-profile-repeat",
      "four identical concurrent saves make one version with the exact public words",
      async () => {
        const value = {
          ...current,
          biography:
            "陶芸 <script>window.__profile_markup=true</script>\nمرحبا 🧑🏽‍🎨",
          category: "Ceramics 陶芸",
          photoCaption: "Maya at the kiln <b>本人</b>",
        };
        const results = await Promise.all(
          Array.from({ length: 4 }, () => save(value)),
        );
        for (const r of results) {
          status(r, 200);
          expect(r.json.version === current.version + 1, r.text);
        }
        current = results[0].json;
        const row = (
          await db.query(
            "SELECT account_id,version,biography FROM growth.creator_profile_fields WHERE creator_id=$1",
            [MAYA_CREATOR_ID],
          )
        ).rows;
        expect(
          row.length === 1 &&
            row[0].account_id === ACTORS.maya &&
            row[0].version === current.version &&
            row[0].biography === value.biography,
          "stored owner/version/words mismatch",
        );
        const page = await publicRead();
        status(page, 200);
        for (const key of ["biography", "category", "photoCaption"])
          expect(
            page.json.creator[key] === value[key],
            `public ${key} differs`,
          );
      },
    );
    await step(
      "E5.5-profile-race",
      "two different edits at one version cannot overwrite each other",
      async () => {
        const before = current;
        const results = await Promise.all([
          save({ ...before, category: "Clay A" }),
          save({ ...before, category: "Clay B" }),
        ]);
        expect(
          results.filter((r) => r.status === 200).length === 1 &&
            results.filter((r) => r.status === 409).length === 1,
          results.map((r) => `${r.status} ${r.text}`).join("; "),
        );
        current = results.find((r) => r.status === 200).json;
        expect(current.version === before.version + 1, "two versions written");
        status(await save(before), 409);
      },
    );
    await step(
      "E5.5-profile-boundary",
      "the existing 600/60/100 limits accept Unicode; oversize/NUL/version errors do not change data",
      async () => {
        const value = {
          ...current,
          biography: "陶".repeat(600),
          category: "芸".repeat(60),
          photoCaption: "火".repeat(100),
        };
        const accepted = await save(value);
        status(accepted, 200);
        current = accepted.json;
        for (const patch of [
          { biography: "陶".repeat(601) },
          { category: "芸".repeat(61) },
          { photoCaption: "火".repeat(101) },
          { biography: "bad\0text" },
          { version: -1 },
          { version: 1.5 },
        ])
          status(await save({ ...current, ...patch }), 400);
        expect(
          JSON.stringify((await read(creator.token)).json) ===
            JSON.stringify(current),
          "rejected edit changed data",
        );
      },
    );
    await step(
      "E5.5-profile-clear",
      "clearing all optional words removes the old public values",
      async () => {
        const r = await save({
          ...current,
          biography: "",
          category: "",
          photoCaption: "",
        });
        status(r, 200);
        current = r.json;
        const page = await publicRead();
        status(page, 200);
        for (const key of ["biography", "category", "photoCaption"])
          expect(page.json.creator[key] === "", `old ${key} survived`);
      },
    );
    await step(
      "E5.5-profile-browser",
      "real anonymous creator page renders creator biography as text, including markup and Unicode",
      async () => {
        const r = await save({
          ...current,
          biography:
            "陶芸 <script>window.__profile_markup=true</script>\nمرحبا 🧑🏽‍🎨",
          category: "Ceramics",
          photoCaption: "Maya at the kiln <b>本人</b>",
        });
        status(r, 200);
        current = r.json;
        browser = await chromium.launch({ channel: "chrome", headless: true });
        const page = await browser.newPage({
          viewport: { width: 390, height: 844 },
        });
        await page.goto(`${web}/creators/maya`, {
          waitUntil: "domcontentloaded",
          timeout: 90000,
        });
        const text = page.getByText(current.biography, { exact: true });
        await text.waitFor({ timeout: 30000 });
        expect(
          (await text.textContent()) === current.biography,
          "biography text changed",
        );
        expect(
          (await page.evaluate(() => window.__profile_markup)) === undefined,
          "markup executed",
        );
        await page.screenshot({
          path: "/tmp/qelvora-lane5-profile-public.png",
          fullPage: true,
        });
      },
    );
    await step(
      "E5.5-profile-pause",
      "real AI pause/resume preserves the author's public words",
      async () => {
        const state = await call(
          api,
          "GET",
          `/v1/agent/${MAYA_CREATOR_ID}/state`,
          { token: creator.token },
        );
        status(state, 200);
        const command = (path) =>
          call(api, "POST", path, {
            token: creator.token,
            headers: { "Idempotency-Key": randomUUID() },
          });
        status(await command(`/v1/agent/${MAYA_CREATOR_ID}/pause`), 200);
        try {
          const page = await publicRead();
          status(page, 200);
          expect(
            page.json.creator.state === "paused" &&
              page.json.creator.biography === current.biography,
            page.text,
          );
        } finally {
          status(
            await command(
              `/v1/agent/${MAYA_CREATOR_ID}/versions/${state.json.liveVersion.id}/rollback`,
            ),
            200,
          );
        }
      },
    );
    writeFileSync(fixturePath, JSON.stringify(current));
    skip(
      "E5.5-profile-form",
      "creator edits these fields in Studio",
      "Q2 default assigns the form and proxy admission to lane 6/integrator; no out-of-lane file edited",
    );
    skip(
      "E5.5-profile-privacy",
      "full account export and erasure through W8",
      "pending real privacy-coordinator check; source collection/deletion added, not yet proved",
    );
  }
} finally {
  await browser?.close();
  await db.end();
}
process.exitCode = finish();

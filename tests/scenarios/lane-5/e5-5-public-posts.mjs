// Full stock stack. Real draft/sign/publish/edit/unpublish HTTP workflow.
// Outer fakes: stock identity/license/model and an enrolled software passkey.
// Set LANE5_ADMIN_DB to creator_stack and LANE5_WEB_ORIGIN to localhost:56452.
// --drain runs Studio's existing effects action after unpublish. Without it,
// the current host exposes the missing automatic withdrawal delivery.
import { randomUUID } from "node:crypto";
import { ACTORS, MAYA_CREATOR_ID, signIn } from "../lane-2/lib.mjs";
import {
  BASE,
  sql,
  closeDb,
  http,
  newPasskey,
  saveDraft,
  signAndPublish,
  expect,
  step,
  finish,
  delay,
} from "./lib.mjs";
const session = await signIn(BASE, ACTORS.maya, "/studio/ai");
const creator = { ...session, id: MAYA_CREATOR_ID, passkey: newPasskey() };
await sql(
  "INSERT INTO creator.passkey_credential(id,account_id,public_key,counter) VALUES($1,$2,$3,0)",
  [creator.passkey.credentialId, ACTORS.maya, creator.passkey.cose],
);
const id = randomUUID();
const page = () => http("GET", "/v1/growth/public/creators/maya");
const projected = async (predicate) => {
  for (let n = 0; n < 20; n++) {
    const r = await page();
    expect(r.status === 200, `public page ${r.status}`);
    if (predicate(r.body.posts)) return r.body.posts;
    await delay(500);
  }
  const effects = await sql(
    "SELECT type,state,last_error FROM creator.content_effect WHERE content_id=$1",
    [id],
  );
  throw new Error(
    `public projection did not settle: ${JSON.stringify(effects.rows)}`,
  );
};
try {
  await step(
    "E5.5-post-publish",
    "a signed public post appears after its real delivery effect",
    async () => {
      const draft = await saveDraft(
        creator,
        id,
        0,
        "陶芸 <script>plain text</script> مرحبا",
        { kind: "public" },
        { kind: "post", title: "Public kiln update" },
      );
      const made = await signAndPublish(
        creator,
        id,
        draft.version,
        draft.document,
      );
      expect(made.response.status === 200, JSON.stringify(made.response));
      const posts = await projected((posts) => posts.some((p) => p.id === id));
      const p = posts.find((p) => p.id === id);
      expect(
        p.body === draft.document.text && p.version === 1,
        JSON.stringify(p),
      );
      const stored = (
        await sql(
          "SELECT version,state FROM growth.content_public WHERE id=$1",
          [id],
        )
      ).rows[0];
      expect(
        stored.version === 1 && stored.state === "published",
        JSON.stringify(stored),
      );
    },
  );
  await step(
    "E5.5-post-edit",
    "a newly signed version replaces a warm cached public post",
    async () => {
      await page();
      const draft = await saveDraft(
        creator,
        id,
        1,
        "Updated kiln opening: Saturday.",
        { kind: "public" },
        { kind: "post", title: "Updated kiln news" },
      );
      await projected((posts) => posts.every((p) => p.id !== id));
      const made = await signAndPublish(
        creator,
        id,
        draft.version,
        draft.document,
      );
      expect(made.response.status === 200, JSON.stringify(made.response));
      const posts = await projected((posts) =>
        posts.some((p) => p.id === id && p.version === 2),
      );
      expect(
        posts.find((p) => p.id === id).body === draft.document.text,
        "old body after public projection update",
      );
    },
  );
  await step(
    "E5.5-post-wrong-person",
    "another account cannot remove the creator's public post",
    async () => {
      const other = await signIn(BASE, ACTORS.fanTwo);
      const r = await http(
        "POST",
        `/v1/content/${creator.id}/${id}/unpublish`,
        other.token,
        { version: 2, idempotencyKey: randomUUID() },
      );
      expect([403, 404, 503].includes(r.status), JSON.stringify(r));
      expect(
        (await page()).body.posts.some((p) => p.id === id && p.version === 2),
        "other account removed the post",
      );
      return `refused ${r.status} (${r.body?.error?.code}); public post unchanged`;
    },
  );
  await step(
    "E5.5-post-withdraw",
    "a withdrawn public post disappears from the warm cache",
    async () => {
      await page();
      const r = await http(
        "POST",
        `/v1/content/${creator.id}/${id}/unpublish`,
        creator.token,
        { version: 2, idempotencyKey: randomUUID() },
      );
      expect(r.status === 200, JSON.stringify(r));
      if (process.argv.includes("--drain")) {
        const drained = await http(
          "POST",
          `/v1/content/${creator.id}/studio/effects/run`,
          creator.token,
        );
        expect(drained.status === 200, JSON.stringify(drained));
      }
      await projected((posts) => posts.every((p) => p.id !== id));
      const stored = (
        await sql("SELECT state FROM growth.content_public WHERE id=$1", [id])
      ).rows[0];
      expect(stored.state === "withdrawn", JSON.stringify(stored));
    },
  );
  await step(
    "E5.5-post-archive-race",
    "three repeated archives withdraw one publication once",
    async () => {
      const second = randomUUID();
      const draft = await saveDraft(
        creator,
        second,
        0,
        "Archive this public post.",
        { kind: "public" },
        { kind: "post", title: "Temporary public post" },
      );
      const made = await signAndPublish(
        creator,
        second,
        draft.version,
        draft.document,
      );
      expect(made.response.status === 200, JSON.stringify(made.response));
      await projected((posts) => posts.some((p) => p.id === second));
      const body = { version: 1, idempotencyKey: randomUUID() };
      const outcomes = await Promise.all(
        Array.from({ length: 3 }, () =>
          http(
            "POST",
            `/v1/content/${creator.id}/${second}/archive`,
            creator.token,
            body,
          ),
        ),
      );
      expect(
        outcomes.every((r) => r.status === 200 && r.body.state === "archived"),
        JSON.stringify(outcomes),
      );
      await projected((posts) => posts.every((p) => p.id !== second));
      const row = (
        await sql(
          "SELECT count(*)::int AS n,bool_and(state='done') AS done FROM creator.content_effect WHERE content_id=$1 AND type='withdrawn'",
          [second],
        )
      ).rows[0];
      expect(row.n === 1 && row.done, JSON.stringify(row));
      return "three 200 responses; one completed withdrawal effect";
    },
  );
} finally {
  await sql(
    "UPDATE creator.passkey_credential SET revoked_at=now() WHERE id=$1",
    [creator.passkey.credentialId],
  );
  await closeDb();
}
process.exit(finish());

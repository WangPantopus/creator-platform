// E5.4: a Note whose fan-out fails for a passing reason is retried by itself,
// and told exactly once; one that keeps failing stops after three tries and
// waits for the Studio. Block 3820-3899. Takes about three minutes: the backoff
// after the fourth attempt is 80 seconds and the cap is proved by waiting it out.
// Run: node tests/scenarios/lane-5/e5-4-self-retry.mjs
import {
  closeDb,
  delay,
  expect,
  finish,
  publishNote,
  runEffects,
  seedCreator,
  seedFan,
  seedMembership,
  seedTier,
  sql,
  step,
  waitFor,
} from "./lib.mjs";

const B = 3820;
const maya = await seedCreator(B, "maya_retry", "Maya");
const tier = await seedTier(maya.id, "Kiln Club");
for (const [i, name] of ["ana", "ben", "cy"].entries()) {
  const fan = await seedFan(B + 10 + i, `${name}_retry`);
  await seedMembership(maya.id, fan.id, tier);
}
// The check W8 answers for every creator/fan pair; without it nothing may be sent.
const breakIt = () =>
  sql(
    "ALTER FUNCTION creator_trust.creator_fan_denial(uuid,uuid) RENAME TO creator_fan_denial_off",
  );
const fixIt = () =>
  sql(
    "DO $$ BEGIN IF to_regprocedure('creator_trust.creator_fan_denial_off(uuid,uuid)') IS NOT NULL THEN ALTER FUNCTION creator_trust.creator_fan_denial_off(uuid,uuid) RENAME TO creator_fan_denial; END IF; END $$",
  );
const effectOf = (id) =>
  sql(
    "SELECT state,attempts,last_error,result_ref FROM creator.content_effect WHERE content_id=$1 AND type='published'",
    [id],
  ).then((r) => r.rows[0]);
const notices = () =>
  sql(
    "SELECT count(*)::int AS n FROM growth.notification WHERE type='note'",
  ).then((r) => r.rows[0].n);

await step(
  "E5.4-self-retry",
  "a passing failure is retried by itself and the audience is told once",
  async () => {
    let noteId;
    await breakIt();
    try {
      const note = await publishNote(
        maya,
        "Sent while the denial check was down.",
        { kind: "members" },
      );
      expect(note.response.status === 200, `publish ${note.response.status}`);
      noteId = note.id;
      await waitFor(
        "the first failure",
        async () => (await effectOf(noteId))?.state === "blocked",
      );
      const failed = await effectOf(noteId);
      expect(
        failed.last_error === "scope_denial_unconfigured",
        `error ${failed.last_error}`,
      );
      expect(
        (await notices()) === 0,
        "someone was told while the denial check was down",
      );
    } finally {
      await fixIt();
    }
    // Nobody presses anything: the same session retries when the backoff is due.
    await waitFor(
      "the automatic retry",
      async () => (await effectOf(noteId))?.state === "done",
      45000,
    );
    const done = await effectOf(noteId);
    expect(done.attempts >= 2, `attempts ${done.attempts}`);
    await waitFor("the notices", async () => (await notices()) >= 3);
    await delay(2000);
    expect((await notices()) === 3, `notices ${await notices()}`);
    return `done on attempt ${done.attempts} without any button; ${done.result_ref}`;
  },
);
await step(
  "E5.4-self-retry-gives-up",
  "a failure that does not clear stops after three retries and waits for the Studio",
  async () => {
    await breakIt();
    try {
      const note = await publishNote(
        maya,
        "Sent while the denial check stays down.",
        { kind: "members" },
      );
      // Tries at once, then after 10, 20 and 40 seconds: the fourth attempt.
      await waitFor(
        "three automatic retries",
        async () => (await effectOf(note.id))?.attempts >= 4,
        150000,
      );
      // The next backoff is 80 seconds; a fifth attempt would show by then.
      await delay(95000);
      const stuck = await effectOf(note.id);
      expect(
        stuck.state === "blocked" &&
          stuck.attempts === 4 &&
          stuck.last_error === "scope_denial_unconfigured",
        `after the cap ${JSON.stringify(stuck)}`,
      );
      expect(
        (await notices()) === 3,
        "a notice went out while the check was down",
      );
      // The Studio's button finishes it once the check is back.
      await fixIt();
      await sql(
        "UPDATE creator.content_effect SET next_at=now() WHERE content_id=$1",
        [note.id],
      );
      expect((await runEffects(maya)).status === 200, "creator run");
      expect(
        (await effectOf(note.id)).state === "done",
        "the Studio's run did not finish it",
      );
      await waitFor("the notices", async () => (await notices()) >= 6);
      await delay(2000);
      expect((await notices()) === 6, `notices ${await notices()}`);
    } finally {
      await fixIt();
    }
  },
);
await closeDb();
process.exit(finish());

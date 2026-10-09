// E5.1 (part 3): a Note to 600 members. Block 1000-3999.
// Run: node tests/scenarios/lane-5/e5-1-scale.mjs
import {
  closeDb,
  expect,
  finish,
  http,
  publishNote,
  seedCreator,
  seedFan,
  seedMembership,
  seedTier,
  step,
} from "./lib.mjs";

const B = 1000;
const MEMBERS = 600;
const OUTSIDERS = 20;
const NOTES = 25;
async function inBatches(count, size, work) {
  const out = [];
  for (let start = 0; start < count; start += size)
    out.push(
      ...(await Promise.all(
        Array.from({ length: Math.min(size, count - start) }, (_u, i) =>
          work(start + i),
        ),
      )),
    );
  return out;
}

const maya = await seedCreator(B, "maya_scale", "Maya");
const tier = await seedTier(maya.id, "Kiln Club");
const members = await inBatches(MEMBERS, 20, async (n) => {
  const fan = await seedFan(B + 10 + n, `m${n}_scale`);
  await seedMembership(maya.id, fan.id, tier);
  return fan;
});
const outsiders = await inBatches(OUTSIDERS, 20, (n) =>
  seedFan(B + 1000 + n, `o${n}_scale`),
);
const read = (fan, query = "?limit=50") =>
  http("GET", `/v1/content/${maya.id}/presence${query}`, fan.token);

await step(
  "E5.1-600",
  `a members Note reaches all ${MEMBERS} members and none of ${OUTSIDERS} outsiders`,
  async () => {
    const note = await publishNote(maya, "Six hundred of you, thank you.", {
      kind: "members",
    });
    expect(note.response.status === 200, `publish ${note.response.status}`);
    const seen = await inBatches(MEMBERS, 25, async (n) => {
      const r = await read(members[n]);
      return r.status === 200 && r.body.items.some((i) => i.id === note.id);
    });
    expect(
      seen.every(Boolean),
      `${seen.filter((x) => !x).length} members missed the Note`,
    );
    const leaked = await inBatches(OUTSIDERS, 20, async (n) => {
      const r = await read(outsiders[n]);
      return r.status !== 200 || r.body.items.length > 0;
    });
    expect(!leaked.some(Boolean), "an outsider saw something");
  },
);
await step(
  "E5.1-latency",
  `reads stay fast with ${NOTES} Notes and ${MEMBERS} members`,
  async () => {
    for (let i = 1; i < NOTES; i++)
      await publishNote(maya, `Note number ${i}`, { kind: "members" });
    const times = [];
    await inBatches(100, 5, async (n) => {
      const started = performance.now();
      const r = await read(members[n * 5]);
      times.push(performance.now() - started);
      expect(
        r.status === 200 && r.body.items.length === NOTES,
        `items ${r.body?.items?.length}`,
      );
    });
    times.sort((a, b) => a - b);
    const p50 = times[50],
      p95 = times[94];
    return `100 reads, p50 ${p50.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms (5 at a time, one machine, fake identity)`;
  },
);
await closeDb();
process.exit(finish());

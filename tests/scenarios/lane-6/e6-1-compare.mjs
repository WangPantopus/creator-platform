// E6.1 compare: node tests/scenarios/lane-6/e6-1-compare.mjs BEFORE_DIR AFTER_DIR [--subset]
// Passes only when every shot has the same pixels, /api calls, console messages and Tab order,
// and the polling cadence is exactly the same. Exits 1 and says what differs otherwise.
// --subset compares only the shots the AFTER run has (for a run limited with --only).
import { readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const [before, after] = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--"));
const subset = process.argv.includes("--subset");
if (!before || !after)
  throw new Error("usage: e6-1-compare.mjs BEFORE_DIR AFTER_DIR");
const load = async (dir) =>
  JSON.parse(await readFile(`${dir}/result.json`, "utf8"));
const [a, b] = [await load(before), await load(after)];
const problems = [];
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
// Reads that start together have no fixed order, and whether the page cancels a read before its
// answer lands is a race, so reads compare as a sorted list with "aborted" counted as answered.
// In the first shot of a step they compare as a set: while a page loads, how often a read repeats
// depends on how long the load took (a 4-second refresh can land in it), not on the code. Repeats
// are covered by the later shots, where time is paused, and by the polling cadence.
// Writes (anything but GET) compare in order, exactly.
const splitCalls = (list, first) => {
  const line = (e) =>
    JSON.stringify({ ...e, status: e.status === "aborted" ? 200 : e.status });
  const reads = list
    .filter((e) => e.call.startsWith("GET "))
    .map(line)
    .sort();
  return {
    reads: first ? [...new Set(reads)] : reads,
    writes: list.filter((e) => !e.call.startsWith("GET ")).map(line),
  };
};
const sameCalls = (x, y, first) =>
  same(splitCalls(x, first), splitCalls(y, first));
const callDiff = (x, y, first) => {
  const [p, q] = [splitCalls(x, first), splitCalls(y, first)];
  const writes = firstDiff(p.writes, q.writes);
  if (writes) return `a write ${writes}`;
  const only = (m, n) => m.reads.filter((r) => !n.reads.includes(r));
  const [a, b] = [only(p, q)[0], only(q, p)[0]];
  if (!a && !b)
    return `a read repeated a different number of times (${p.reads.length} <> ${q.reads.length} reads)`;
  return `a read: ${a ?? "(none)"} <> ${b ?? "(none)"}`;
};
const firstDiff = (x, y) => {
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++)
    if (!same(x[i], y[i]))
      return `#${i}: ${JSON.stringify(x[i])} <> ${JSON.stringify(y[i])}`;
};
// Pixels may differ by at most 8/255 in at most 64 places before a shot counts as changed. The existing
// visual suite allows 64 pixels at 2/255 for Chromium rounding native control corners (tests/visual/README.md);
// identical code shows up to 6/255 at the corners of native selects and search boxes, so the level here is 8.
// A changed word, colour or position moves hundreds of pixels by far more than that.
async function pixels(shot) {
  const [p, q] = (
    await Promise.all([
      readFile(`${before}/${shot.png}`),
      readFile(`${after}/${shot.png}`),
    ])
  ).map((buf) => PNG.sync.read(buf));
  if (p.width !== q.width || p.height !== q.height)
    return { problem: `size ${p.width}x${p.height} <> ${q.width}x${q.height}` };
  const diff = new PNG({ width: p.width, height: p.height });
  let count = 0,
    max = 0;
  for (let i = 0; i < p.data.length; i += 4) {
    const delta = Math.max(
      ...[0, 1, 2, 3].map((c) => Math.abs(p.data[i + c] - q.data[i + c])),
    );
    count += delta ? 1 : 0;
    max = Math.max(max, delta);
    diff.data.set(
      delta ? [255, 0, 0, 255] : [q.data[i], q.data[i + 1], q.data[i + 2], 40],
      i,
    );
  }
  const text = `${count} pixels differ, by at most ${max}/255`;
  if (count <= 64 && max <= 8) return { noise: text };
  await writeFile(`${after}/diff-${shot.png}`, PNG.sync.write(diff));
  return { problem: `${text} (diff-${shot.png})` };
}
if (a.chrome !== b.chrome)
  problems.push(`browser differs: ${a.chrome} <> ${b.chrome}`);
const byKey = new Map(b.shots.map((s) => [s.key, s]));
if (subset) a.shots = a.shots.filter((s) => byKey.has(s.key));
const noisy = [];
let identical = 0,
  calls = 0,
  tabs = 0;
for (const shot of a.shots) {
  const other = byKey.get(shot.key);
  if (!other) {
    problems.push(`${shot.key}: missing after`);
    continue;
  }
  calls += shot.requests.length;
  tabs += shot.tabs.length;
  let exact = shot.sha256 === other.sha256;
  if (!exact) {
    const { problem, noise } = await pixels(shot);
    if (problem) problems.push(`${shot.key}: screenshot ${problem}`);
    else noisy.push(`${shot.key}: ${noise}`);
  }
  if (!sameCalls(shot.requests, other.requests, shot.first))
    problems.push(
      `${shot.key}: /api calls differ at ${callDiff(shot.requests, other.requests, shot.first)}`,
    );
  if (!same(shot.console, other.console))
    problems.push(
      `${shot.key}: console differs ${JSON.stringify(shot.console)} <> ${JSON.stringify(other.console)}`,
    );
  if (!same(shot.tabs, other.tabs))
    problems.push(
      `${shot.key}: Tab order differs at ${firstDiff(shot.tabs, other.tabs)}`,
    );
  if (
    exact &&
    sameCalls(shot.requests, other.requests, shot.first) &&
    same(shot.tabs, other.tabs) &&
    same(shot.console, other.console)
  )
    identical++;
}
for (const key of byKey.keys())
  if (!a.shots.some((s) => s.key === key)) problems.push(`${key}: extra after`);
for (const [theme, counts] of Object.entries(
  subset && !b.cadence.light ? {} : a.cadence,
)) {
  for (const call of new Set([
    ...Object.keys(counts),
    ...Object.keys(b.cadence[theme] ?? {}),
  ]))
    if ((counts[call] ?? 0) !== (b.cadence[theme]?.[call] ?? 0))
      problems.push(
        `cadence ${theme} ${call}: ${counts[call] ?? 0} <> ${b.cadence[theme]?.[call] ?? 0}`,
      );
}
console.log(
  `${a.shots.length} shots, ${identical} identical in pixels, calls, console and Tab order; ${calls} /api calls and ${tabs} Tab stops compared; chrome ${a.chrome}`,
);
if (noisy.length)
  console.log(
    `${noisy.length} shot(s) equal within rendering tolerance (at most 64 pixels, at most 8/255):\n  ${noisy.join("\n  ")}`,
  );
for (const p of problems) console.log(`DIFF ${p}`);
console.log(
  problems.length
    ? `FAIL: ${problems.length} difference(s)`
    : "PASS: identical",
);
process.exit(problems.length ? 1 : 0);

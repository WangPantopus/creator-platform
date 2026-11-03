import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Writes the migration wave packets and their chain index from the registry.
// infra/migrations.json names each source's wave; a packet's baseline is every
// source of the waves before it, in order, and every checksum is the SHA-256 of
// the SQL bytes. A registered wave never changes, so an existing packet that
// would come out different stops the run instead of being rewritten. See
// docs/engineering/migrations.md.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const exists = (name) => fs.existsSync(path.join(root, name));
const read = (name) => fs.readFileSync(path.join(root, name));
const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const text = (value) => JSON.stringify(value, null, 2) + "\n";
const packetPath = (id) => `infra/migrations/waves/${id}.json`;
const problems = [];
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

// Reviewed packets the registry cannot reproduce. The generator checks their
// bytes and their place in the chain, and never writes them.
const frozen = new Map([
  // Its 17 sources carry no wave in the registry, and it records two held
  // versions and the traffic marker.
  [
    "20261002",
    "9e21499af1c10ad488dbb6e7f6477c675f2c2511bfde5c7635f3adfef56919b9",
  ],
  // Its 4 sources carry no wave in the registry.
  [
    "20261002-privacy",
    "2d72120d1be136081acb5d324f19dae44660d6e423e932cc962664596ab4c3e2",
  ],
  // It records the reviewed baseline-ordering exception for 0198.
  [
    "20261007-content",
    "0511a93b6df6fb2eb70527898fea04b59844b38bdb63c69bc6b85640765ff972",
  ],
  // Its 2 sources, 0235 and 0236, carry no wave in the registry.
  [
    "20261007-public-ai",
    "0568f611eafe32329ca4ca8305ca33130f72a615d7a209010a9adbe65baac1e8",
  ],
]);

const registry = JSON.parse(read("infra/migrations.json"));
if (registry.schemaVersion !== 1 || !Array.isArray(registry.migrations))
  fail("infra/migrations.json: unknown registry format.");
const packets = new Map();
const frozenWave = new Map();
for (const [id, digest] of frozen) {
  const bytes = read(packetPath(id));
  if (sha256(bytes) !== digest)
    fail(`${packetPath(id)} changed. It is a frozen reviewed packet.`);
  const packet = JSON.parse(bytes);
  packets.set(id, packet);
  for (const source of packet.wave) frozenWave.set(source.version, id);
}

// The sources before the first wave, then each wave's sources in the order
// their first source appears in the registry.
const initial = [];
const waves = new Map();
const tagged = new Set();
const seen = new Set();
for (const entry of registry.migrations) {
  const { version, path: file } = entry;
  if (
    typeof version !== "string" ||
    !/^\d{4}_[a-z0-9_]+$/.test(version) ||
    typeof file !== "string" ||
    !/^(apps\/backend|infra\/migrations\/history)\/[a-zA-Z0-9_./-]+\.sql$/.test(
      file,
    ) ||
    file.includes("..")
  )
    fail(`Invalid registry entry ${version}.`);
  for (const key of [version, version.slice(0, 4), file]) {
    if (seen.has(key)) fail(`Two registry entries share ${key}.`);
    seen.add(key);
  }
  if (!exists(file)) fail(`${file} (${version}) does not exist.`);
  const checksum = sha256(read(file));
  if (entry.sourceSha256 !== undefined && entry.sourceSha256 !== checksum)
    fail(
      `${file} no longer has the registered checksum of ${version}. Applied SQL never changes; add a new migration.`,
    );
  if (
    entry.wave !== undefined &&
    frozenWave.has(version) &&
    frozenWave.get(version) !== entry.wave
  )
    fail(`${version} is in ${frozenWave.get(version)}, not ${entry.wave}.`);
  const wave = entry.wave ?? frozenWave.get(version);
  const source = { version, path: file, checksum };
  if (wave === undefined) {
    if (waves.size)
      fail(`${version} comes after the first wave, so it needs a wave.`);
    initial.push(source);
    continue;
  }
  if (typeof wave !== "string" || !/^\d{8}(-[a-z0-9]+)*$/.test(wave))
    fail(`Invalid wave name for ${version}.`);
  if (entry.wave !== undefined) tagged.add(wave);
  if (!waves.has(wave)) waves.set(wave, []);
  waves.get(wave).push(source);
}
for (const version of frozenWave.keys())
  if (!seen.has(version))
    fail(`${version}, in ${frozenWave.get(version)}, is not registered.`);

const outputs = new Map();
const chain = [];
const sources = [...initial];
let previous;
for (const [id, wave] of waves) {
  let packet = packets.get(id);
  if (packet) {
    if (
      packet.schemaVersion !== 1 ||
      packet.id !== id ||
      text(packet.baseline) !== text(sources) ||
      text(packet.wave) !== text(wave)
    )
      fail(`${packetPath(id)} no longer fits the registry's wave chain.`);
  } else {
    // Every wave since 20261002 carries the W5 adoption exception forward:
    // its baseline holds 0045 applied before 0044.
    if (!previous?.outOfOrderException)
      fail(`${id} has no reviewed predecessor to follow.`);
    packet = {
      schemaVersion: 1,
      id,
      baseline: [...sources],
      wave,
      outOfOrderException: previous.outOfOrderException,
    };
    const content = text(packet);
    if (exists(packetPath(id)) && read(packetPath(id)).toString() !== content)
      problems.push(
        `${packetPath(id)} differs from what the registry gives. A registered wave never changes: restore the reviewed file, or put the registry back.`,
      );
    else outputs.set(packetPath(id), content);
  }
  chain.push({
    id,
    sha256: sha256(packets.has(id) ? read(packetPath(id)) : text(packet)),
    baseline: sources.length,
    sources: wave.length,
    ...(packets.has(id) ? { frozen: true } : {}),
  });
  sources.push(...wave);
  previous = packet;
}
for (const name of fs.readdirSync(path.join(root, "infra/migrations/waves")))
  if (
    name.endsWith(".json") &&
    !waves.has(name.slice(0, -5)) &&
    JSON.parse(read(`infra/migrations/waves/${name}`)).baseline
  )
    problems.push(
      `infra/migrations/waves/${name} is a packet for a wave the registry does not have.`,
    );

// A review pins the bytes of the packet it follows; keep that pin true.
for (const name of fs.readdirSync(
  path.join(root, "infra/migrations/reviews"),
)) {
  const review = JSON.parse(read(`infra/migrations/reviews/${name}`));
  const pin = review.baselineWave;
  const bytes =
    pin && (outputs.get(pin.path) ?? (exists(pin.path) && read(pin.path)));
  if (pin && (!bytes || sha256(bytes) !== pin.sha256))
    problems.push(
      `infra/migrations/reviews/${name} pins ${pin.path}, which no longer has that checksum.`,
    );
}

// The local installer applies every wave after the canonical bootstrap that
// migrate-trust runs file by file: the waves from the first one the registry
// names.
const first = chain.findIndex((wave) => tagged.has(wave.id));
if (first < 0) fail("The registry names no wave.");
outputs.set(
  "infra/migrations/chain.json",
  text({
    schemaVersion: 1,
    generatedFrom:
      "infra/migrations.json, by scripts/generate-migrations.mjs. Do not edit.",
    waves: chain,
    fresh: {
      canonical: chain[first].baseline,
      waves: chain.slice(first).map((wave) => wave.id),
    },
    head: { wave: chain.at(-1).id, sources: sources.length },
  }),
);

const stale = [...outputs].filter(
  ([name, content]) => !exists(name) || read(name).toString() !== content,
);
if (check)
  for (const [name] of stale) problems.push(`Generated file is stale: ${name}`);
if (problems.length) fail(problems.join("\n"));
for (const [name, content] of stale) {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), content);
}
console.log(
  `${check ? "Verified" : "Generated"} ${chain.length} migration waves (${frozen.size} frozen) and their chain.`,
);

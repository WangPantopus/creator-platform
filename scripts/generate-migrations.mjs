import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Writes the migration wave packets and their chain index from the registry.
// infra/migrations.json names each source's wave; a packet's baseline is every
// source of the waves before it, in order, and every checksum is the SHA-256 of
// the SQL bytes. A registered wave never changes, so an existing packet that
// would come out different stops the run instead of being rewritten. Each
// packet must list exactly the sources its review names, and every other
// reviewed record under infra/migrations must keep the checksum that
// infra/migrations/reviewed.json pins. See docs/engineering/migrations.md.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const exists = (name) => fs.existsSync(path.join(root, name));
const read = (name) => fs.readFileSync(path.join(root, name));
const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const text = (value) => JSON.stringify(value, null, 2) + "\n";
const packetPath = (id) => `infra/migrations/waves/${id}.json`;
const pins = "infra/migrations/reviewed.json";
const walk = (dir) =>
  fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((entry) =>
      entry.name.startsWith(".")
        ? []
        : entry.isDirectory()
          ? walk(`${dir}/${entry.name}`)
          : [`${dir}/${entry.name}`],
    );
const problems = [];
// Only --check refuses these: a registration's packet is written before its
// review exists, and its review is pinned once it has been reviewed.
const pending = [];
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

// Reviewed packets the registry cannot reproduce. reviewed.json pins their
// bytes; the generator checks their place in the chain and never writes them.
const frozen = new Set([
  // Its 17 sources carry no wave in the registry, and it records two held
  // versions and the traffic marker.
  "20261002",
  // Its 4 sources carry no wave in the registry.
  "20261002-privacy",
  // It records the reviewed baseline-ordering exception for 0198.
  "20261007-content",
  // Its 2 sources, 0235 and 0236, carry no wave in the registry.
  "20261007-public-ai",
]);
// The reviews of three October waves have other names.
const reviewPath = (id) =>
  `infra/migrations/reviews/${
    {
      "20261007-generation": "20261007-generation-privacy",
      "20261007-content": "20261007-content-privacy",
      "20261007-generation-output": "20261007-generation-first-visible",
    }[id] ?? id
  }.json`;

const pinned = JSON.parse(read(pins));
if (
  pinned.schemaVersion !== 1 ||
  typeof pinned.sha256 !== "object" ||
  pinned.sha256 === null ||
  !Object.values(pinned.sha256).every((digest) => /^[a-f0-9]{64}$/.test(digest))
)
  fail(`${pins}: unknown format.`);
const registry = JSON.parse(read("infra/migrations.json"));
if (registry.schemaVersion !== 1 || !Array.isArray(registry.migrations))
  fail("infra/migrations.json: unknown registry format.");
const packets = new Map();
const frozenWave = new Map();
for (const id of frozen) {
  const name = packetPath(id);
  if (!exists(name))
    fail(`${name} is missing. It is a frozen reviewed packet.`);
  if (sha256(read(name)) !== pinned.sha256[name])
    fail(`${name} changed. It is a frozen reviewed packet, pinned in ${pins}.`);
  const packet = JSON.parse(read(name));
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
  if (entry.sourceSha256 === undefined)
    fail(`${version} is in a wave, so it needs its sourceSha256.`);
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
const reviews = new Set();
let previous;
let fresh = false;
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
    // The operator applies a wave's sources in version order on top of its
    // baseline and refuses a version below one already applied, so a new
    // wave's versions rise and all come after its baseline's.
    const last = sources.reduce(
      (high, source) => (source.version > high ? source.version : high),
      "",
    );
    if (
      wave.some(
        (source, at) => source.version <= (at ? wave[at - 1].version : last),
      )
    )
      fail(
        `${id}'s versions must rise in registry order, above every version before the wave (${last}).`,
      );
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
  // From the first wave the registry names on, every wave has a review that
  // names its sources exactly: that is what anchors the newest packet.
  fresh ||= tagged.has(id);
  if (fresh) {
    const name = reviewPath(id);
    reviews.add(name);
    if (!exists(name))
      pending.push(
        `${name} does not exist yet: measure the wave's pins with apps/backend/scripts/wave-pins.ts.`,
      );
    else {
      const review = JSON.parse(read(name));
      const named = review.source ? [review.source] : review.sources;
      if (
        !Array.isArray(named) ||
        text(
          named.map(({ version, path, checksum }) => ({
            version,
            path,
            checksum,
          })),
        ) !== text(wave)
      )
        problems.push(
          `${packetPath(id)} does not list exactly the sources ${name} names.`,
        );
    }
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

// A review pins the bytes of the packet it follows; keep that pin true.
for (const name of walk("infra/migrations/reviews"))
  if (name.endsWith(".json")) {
    const pin = JSON.parse(read(name)).baselineWave;
    const bytes =
      pin && (outputs.get(pin.path) ?? (exists(pin.path) && read(pin.path)));
    if (pin && (!bytes || sha256(bytes) !== pin.sha256))
      problems.push(
        `${name} pins ${pin.path}, which no longer has that checksum.`,
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

// Every other file here is a registered source or a pinned reviewed record.
const registered = new Set(registry.migrations.map((entry) => entry.path));
const generated = new Set([
  "infra/migrations/chain.json",
  ...[...waves.keys()].filter((id) => !frozen.has(id)).map(packetPath),
]);
for (const name of walk("infra/migrations")) {
  if (name === pins || registered.has(name) || generated.has(name)) continue;
  const digest = sha256(read(name));
  if (pinned.sha256[name] === digest) continue;
  if (pinned.sha256[name] !== undefined)
    problems.push(
      `${name} no longer has the checksum ${pins} pins. A reviewed record never changes in place; re-measuring one is a review of its own.`,
    );
  else if (reviews.has(name))
    pending.push(
      `${name} is not pinned yet. Once its pins are reviewed, add "${name}": "${digest}" to ${pins}.`,
    );
  else
    problems.push(`${name} is not generated, registered or pinned in ${pins}.`);
}
for (const name of Object.keys(pinned.sha256))
  if (!exists(name)) problems.push(`${name} is pinned in ${pins} but missing.`);

const stale = [...outputs].filter(
  ([name, content]) => !exists(name) || read(name).toString() !== content,
);
if (check) {
  for (const [name] of stale) problems.push(`Generated file is stale: ${name}`);
  problems.push(...pending);
}
if (problems.length) fail(problems.join("\n"));
for (const [name, content] of stale) {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), content);
}
for (const note of pending) console.log(note);
console.log(
  `${check ? "Verified" : "Generated"} ${chain.length} migration waves (${frozen.size} frozen), their chain and ${Object.keys(pinned.sha256).length} pinned records.`,
);

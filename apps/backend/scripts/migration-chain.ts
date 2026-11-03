import { readFile } from "node:fs/promises";
import { reviewedWaves as table } from "../src/db/reviewed-waves.js";
import { repositoryRoot, sha256 } from "./migration-custody.js";

// The one reader of infra/migrations/chain.json for scripts/migrate-trust.ts,
// the local installer (src/operations/local/fresh-install.ts) and
// scripts/activate-wave.ts. Each checks the chain against the table of
// reviewed waves, which src/db/reviewed-waves.ts shares with the runtime's
// head profile.

export type ChainSource = { version: string; path: string; checksum: string };
const chainSources = (value: unknown): value is ChainSource[] =>
  Array.isArray(value) &&
  value.every(
    (source) =>
      typeof source?.version === "string" &&
      /^\d{4}_[a-z0-9_]+$/u.test(source.version) &&
      typeof source.path === "string" &&
      /^(apps\/backend|infra\/migrations\/history)\/[a-zA-Z0-9_./-]+\.sql$/u.test(
        source.path,
      ) &&
      !source.path.includes("..") &&
      typeof source.checksum === "string" &&
      /^[a-f0-9]{64}$/u.test(source.checksum),
  );
/** Where the canonical bootstrap ends is fixed here, not read from the chain:
 * the first wave after it (firstFresh in scripts/generate-migrations.mjs) and
 * its size, the canonical61. */
const firstFresh = "20261007-generation";
export const canonicalSize = 61;
export const chainRefusal =
  "infra/migrations/chain.json does not match its packets or the reviewed chain; run pnpm generate. No migration was applied.";

const sourceVersions = (sources: readonly { version: string }[]) =>
  new Set(sources.map((source) => source.version));
/** Each wave after the canonical bootstrap that this revision has a review
 * for, with the versions its review names. */
export const reviewedWaves: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  table.map(({ id, sources }) => [id, sourceVersions(sources)] as const),
);

/** A wave of the chain. Its packet is parsed from the bytes whose checksum
 * the chain holds; only its baseline and wave are checked. */
export type ChainWave = { id: string; sources: ChainSource[]; packet: unknown };

/** infra/migrations/chain.json, with the checks every reader makes. */
async function chainIndex(root: URL) {
  const chain = JSON.parse(
    await readFile(new URL("infra/migrations/chain.json", root), "utf8"),
  ) as {
    waves: { id: string; sha256: string }[];
    fresh: { canonical: number; waves: string[] };
  };
  if (
    !Array.isArray(chain.waves) ||
    !Array.isArray(chain.fresh.waves) ||
    chain.fresh.waves[0] !== firstFresh ||
    chain.fresh.canonical !== canonicalSize
  )
    throw new Error();
  return chain;
}

/** A wave's packet, if its bytes have the checksum the chain holds for it. */
async function chainPacket(
  root: URL,
  id: unknown,
  checksum: () => string | undefined,
) {
  if (typeof id !== "string" || !/^\d{8}(-[a-z0-9]+)*$/u.test(id))
    throw new Error();
  const bytes = await readFile(
    new URL(`infra/migrations/waves/${id}.json`, root),
  );
  const packet = JSON.parse(bytes.toString("utf8")) as {
    baseline: unknown;
    wave: unknown;
  };
  if (
    sha256(bytes) !== checksum() ||
    !chainSources(packet.baseline) ||
    !chainSources(packet.wave)
  )
    throw new Error();
  return { id, baseline: packet.baseline, sources: packet.wave, packet };
}

/** The canonical bootstrap and the waves the local installer applies after
 * it, from infra/migrations/chain.json and the packets whose checksums it
 * holds (scripts/generate-migrations.mjs writes both). */
export async function freshChain(root: URL) {
  try {
    const chain = await chainIndex(root);
    let canonical: ChainSource[] | undefined;
    const waves: ChainWave[] = [];
    for (const id of chain.fresh.waves) {
      const { baseline, sources, packet } = await chainPacket(
        root,
        id,
        () => chain.waves.find((wave) => wave.id === id)?.sha256,
      );
      canonical ??= baseline;
      waves.push({ id, sources, packet });
    }
    if (canonical?.length !== canonicalSize) throw new Error();
    return { canonical, waves };
  } catch {
    throw new Error(chainRefusal);
  }
}

/** Every wave of the chain, in its order, for scripts/activate-wave.ts: the
 * canonical bootstrap's October waves, then the fresh list, which must be the
 * rest of the chain (`fresh` is where it starts). Each packet is checked as
 * freshChain checks the fresh ones, and no id appears twice. */
export async function operatorChain(root: URL = repositoryRoot) {
  try {
    const chain = await chainIndex(root);
    const waves: ChainWave[] = [];
    let canonical: ChainSource[] | undefined;
    const fresh = chain.waves.length - chain.fresh.waves.length;
    for (const [index, wave] of chain.waves.entries()) {
      const { id, baseline, sources, packet } = await chainPacket(
        root,
        wave.id,
        () => wave.sha256,
      );
      if (index === fresh) canonical = baseline;
      waves.push({ id, sources, packet });
    }
    if (
      fresh < 0 ||
      chain.fresh.waves.some((id, index) => id !== waves[fresh + index]?.id) ||
      new Set(waves.map((wave) => wave.id)).size !== waves.length ||
      canonical?.length !== canonicalSize
    )
      throw new Error();
    return { waves, fresh };
  } catch {
    throw new Error(chainRefusal);
  }
}

/** The waves after the canonical bootstrap, in the chain's order: what the
 * local installer applies, and what the operator walk walks. */
export async function freshWaves(root: URL = repositoryRoot) {
  return (await freshChain(root)).waves.map((wave) => wave.id);
}

/** Whether this revision has the wave's review, and the wave lists exactly
 * the versions it names. */
export function matchesReview(id: string, sources: readonly ChainSource[]) {
  const versions = reviewedWaves.get(id);
  return (
    versions !== undefined &&
    sources.length === versions.size &&
    sources.every((source) => versions.has(source.version))
  );
}
/** The refusal for a wave that fails matchesReview. Each caller throws it
 * itself, which keeps the stack trace short: `stack up` prints only the last
 * lines of stderr. */
export const noMatchingReview = (id: string) =>
  `Registered wave ${id} has no matching review in this revision; no migration was applied.`;

import { readFile } from "node:fs/promises";
import { reviewedWaves as table } from "../src/db/reviewed-waves.js";
import { repositoryRoot, sha256 } from "./migration-custody.js";

// The one reader of infra/migrations/chain.json for scripts/migrate-trust.ts
// and the local installer (src/operations/local/fresh-install.ts). Both check
// the chain against the table of reviewed waves, which src/db/reviewed-waves.ts
// shares with the runtime's head profile.

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

/** A wave of the chain's fresh list. Its packet is parsed from the bytes
 * whose checksum the chain holds; only its baseline and wave are checked. */
export type ChainWave = { id: string; sources: ChainSource[]; packet: unknown };

/** The canonical bootstrap and the waves the local installer applies after
 * it, from infra/migrations/chain.json and the packets whose checksums it
 * holds (scripts/generate-migrations.mjs writes both). */
export async function freshChain(root: URL) {
  try {
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
    let canonical: ChainSource[] | undefined;
    const waves: ChainWave[] = [];
    for (const id of chain.fresh.waves) {
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
        sha256(bytes) !== chain.waves.find((wave) => wave.id === id)?.sha256 ||
        !chainSources(packet.baseline) ||
        !chainSources(packet.wave)
      )
        throw new Error();
      canonical ??= packet.baseline;
      waves.push({ id, sources: packet.wave, packet });
    }
    if (canonical?.length !== canonicalSize) throw new Error();
    return { canonical, waves };
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

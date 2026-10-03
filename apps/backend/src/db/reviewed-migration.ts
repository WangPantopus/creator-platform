import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { DomainError } from "../core/errors.js";

type Source = Readonly<{ path: string; owner: string; checksum: string }>;
export type ReviewedMigration = Readonly<{
  path: string;
  owner: string;
  name: string;
  checksum: string;
}>;
export type RegisteredMigration = Readonly<{
  version: string;
  checksum: string;
}>;
declare const __QELVORA_REGISTERED_MIGRATION_SOURCES__:
  | Readonly<Record<string, Source>>
  | undefined;

function unavailable() {
  return new DomainError(
    "reviewed_migration_unavailable",
    "Reviewed runtime authority is unavailable.",
    503,
  );
}

/** Executable custody only. A metadata-only allocation may change the version,
 * while the producer's reviewed owner, path and SQL bytes remain fixed. Neither
 * a reservation, manually installed function nor database readback activates it.
 */
export async function registeredMigration(
  expected: ReviewedMigration,
): Promise<RegisteredMigration | undefined> {
  if (!/^[a-z0-9_]+$/u.test(expected.name)) throw unavailable();
  const versionPattern = new RegExp(`^\\d{4}_${expected.name}$`, "u");
  let sources: Readonly<Record<string, Source>>;
  if (typeof __QELVORA_REGISTERED_MIGRATION_SOURCES__ !== "undefined") {
    sources = __QELVORA_REGISTERED_MIGRATION_SOURCES__;
  } else {
    let root = dirname(fileURLToPath(import.meta.url));
    let registry:
      | {
          migrations: {
            version: string;
            path: string;
            owner: string;
            sourceSha256?: string;
          }[];
        }
      | undefined;
    for (let depth = 0; depth < 8; depth++) {
      try {
        registry = JSON.parse(
          await readFile(join(root, "infra/migrations.json"), "utf8"),
        );
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const parent = dirname(root);
      if (parent === root) break;
      root = parent;
    }
    if (!registry) return undefined;
    const entries = registry.migrations.filter(
      (entry) =>
        entry.path === expected.path || versionPattern.test(entry.version),
    );
    if (!entries.length) return undefined;
    if (entries.length !== 1) throw unavailable();
    const entry = entries[0]!;
    if (entry.path !== expected.path || entry.owner !== expected.owner)
      throw unavailable();
    const checksum = createHash("sha256")
      .update(await readFile(join(root, expected.path)))
      .digest("hex");
    if (entry.sourceSha256 !== checksum) throw unavailable();
    sources = {
      [entry.version]: { path: entry.path, owner: entry.owner, checksum },
    };
  }
  const entries = Object.entries(sources).filter(
    ([version, source]) =>
      source.path === expected.path || versionPattern.test(version),
  );
  if (!entries.length) return undefined;
  const [version, source] = entries[0]!;
  if (
    entries.length !== 1 ||
    !versionPattern.test(version) ||
    source.path !== expected.path ||
    source.owner !== expected.owner ||
    source.checksum !== expected.checksum
  )
    throw unavailable();
  return Object.freeze({ version, checksum: expected.checksum });
}

/** Read on the actual held purpose client. Never borrow runtime/owner custody
 * when a dedicated worker lacks its approved minimum ledger-read capability.
 */
export async function assertRegisteredMigration(
  client: Pick<PoolClient, "query">,
  expected: ReviewedMigration,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const migration = await registeredMigration(expected);
  signal?.throwIfAborted();
  if (!migration) throw unavailable();
  try {
    const result = await client.query<{ ready: boolean }>(
      "SELECT EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2) AS ready",
      [migration.version, migration.checksum],
    );
    signal?.throwIfAborted();
    if (result.rows[0]?.ready !== true) throw unavailable();
  } catch (error) {
    if ((error as { code?: string }).code === "42501") throw unavailable();
    throw error;
  }
}

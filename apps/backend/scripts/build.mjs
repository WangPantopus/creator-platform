import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
// Bundle workspace TypeScript; installed provider SDKs retain their native
// Node module format and resolve through the deployed production dependencies.
const external = Object.entries(manifest.dependencies)
  .filter(([, version]) => !version.startsWith("workspace:"))
  .map(([name]) => name);

// Freeze executable registry custody from the checked-out SQL bytes. A bundle
// can be deployed without the source tree; database values never supply its
// expected checksums and reserved entries cannot become executable authority.
const repositoryRoot = new URL("../../../", import.meta.url);
const registry = JSON.parse(
  await readFile(new URL("infra/migrations.json", repositoryRoot), "utf8"),
);
const registeredChecksums = Object.create(null);
const registeredSources = Object.create(null);
for (const entry of registry.migrations) {
  if (
    typeof entry.version !== "string" ||
    typeof entry.path !== "string" ||
    Object.hasOwn(registeredChecksums, entry.version)
  )
    throw new Error("Invalid executable migration registry.");
  const location = new URL(entry.path, repositoryRoot);
  if (!location.href.startsWith(repositoryRoot.href))
    throw new Error("Registered migration must belong to this repository.");
  registeredChecksums[entry.version] = createHash("sha256")
    .update(await readFile(location))
    .digest("hex");
  registeredSources[entry.version] = {
    path: entry.path,
    owner: entry.owner,
    checksum: registeredChecksums[entry.version],
  };
}

await build({
  entryPoints: {
    server: "src/server.ts",
    integration: "src/integration.ts",
    "workers/start": "src/workers/start.ts",
    "workers/generation-composition": "src/workers/generation-composition.ts",
    "workers/usage-expiry": "src/workers/usage-expiry.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external,
  define: {
    __QELVORA_REGISTERED_MIGRATIONS__: JSON.stringify(registeredChecksums),
    __QELVORA_REGISTERED_MIGRATION_SOURCES__: JSON.stringify(registeredSources),
  },
});

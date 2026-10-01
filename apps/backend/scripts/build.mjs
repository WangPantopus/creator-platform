import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
// Bundle workspace TypeScript; installed provider SDKs retain their native
// Node module format and resolve through the deployed production dependencies.
const external = Object.entries(manifest.dependencies)
  .filter(([, version]) => !version.startsWith("workspace:"))
  .map(([name]) => name);

await build({
  entryPoints: {
    server: "src/server.ts",
    integration: "src/integration.ts",
    "workers/start": "src/workers/start.ts",
  },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external,
});

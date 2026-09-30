import { build } from "esbuild";

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
  external: ["express", "pg", "ws", "zod", "@simplewebauthn/server"],
});

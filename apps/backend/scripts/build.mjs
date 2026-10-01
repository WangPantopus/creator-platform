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
  // Provider SDKs load CommonJS and Node built-ins internally. Keep their
  // installed package entry points intact in the ESM production executables.
  external: [
    "express",
    "pg",
    "ws",
    "zod",
    "@simplewebauthn/server",
    "@apple/app-store-server-library",
    "google-auth-library",
    "stripe",
  ],
});

import path from "node:path";
import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  distDir: process.env.CREATOR_NEXT_OUTPUT ?? ".next",
  devIndicators: false,
  logging: { incomingRequests: false },
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  outputFileTracingIncludes: {
    "/*": [
      "../../design/phase4*/*.dc.html",
      "../../design/phase4*/canvas.json",
      "../../design/phase5-prototypes/*.dc.html",
      "../../design/phase5-prototypes/canvas.json",
      "../../design/design-system/project/components/*/preview.html",
    ],
  },
  transpilePackages: [
    "@qelvora/api",
    "@qelvora/ui-web",
    "@qelvora/tokens",
    "@qelvora/copy",
    "@qelvora/brand",
  ],
};
export default nextConfig;

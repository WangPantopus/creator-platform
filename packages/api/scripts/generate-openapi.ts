import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createOpenApi } from "../src/openapi.js";

const directory = new URL("../generated/", import.meta.url);
const expected = `${JSON.stringify(createOpenApi(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  if ((await readFile(new URL("openapi.json", directory), "utf8")) !== expected)
    throw new Error(
      "OpenAPI is stale; run pnpm --filter @qelvora/api generate.",
    );
} else {
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("openapi.json", directory), expected);
}

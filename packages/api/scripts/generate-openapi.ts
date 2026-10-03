import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createOpenApi } from "../src/openapi.js";

const directory = new URL("../generated/", import.meta.url);
const destination = new URL("openapi.json", directory);
const expected = `${JSON.stringify(createOpenApi(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  if ((await readFile(destination, "utf8")) !== expected)
    throw new Error(
      "OpenAPI is stale; run pnpm --filter @qelvora/api generate.",
    );
} else {
  const current = await readFile(destination, "utf8").catch(
    (error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    },
  );
  if (current !== expected) {
    await mkdir(directory, { recursive: true });
    await writeFile(destination, expected);
  }
}

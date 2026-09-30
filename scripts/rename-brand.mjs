import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(
  fs.readFileSync(path.join(root, "config/brand.json"), "utf8"),
);
const args = process.argv.slice(2);
const name = args.find((arg) => !arg.startsWith("--"));
const dryRun = args.includes("--dry-run");
if (!name || !/^[A-Z][A-Za-z0-9]*$/.test(name)) {
  console.error(
    "Usage: pnpm brand:rename NewName [--dry-run]\nUse one unbroken identifier so native type names, packages and paths remain valid.",
  );
  process.exit(1);
}
const replacements = [
  [config.name, name],
  [config.slug, name.toLowerCase()],
  [config.environmentPrefix, name.toUpperCase()],
];
if (new Set(replacements.map(([from]) => from)).size !== 3)
  throw new Error("Brand spellings must be distinct.");
const replace = (text) =>
  replacements.reduce(
    (result, [from, to]) => result.split(from).join(to),
    text,
  );
const paths = [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: root, encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean),
  ),
];
const changes = [];
for (const relative of paths) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute) || !fs.lstatSync(absolute).isFile()) continue;
  const buffer = fs.readFileSync(absolute);
  if (buffer.includes(0)) continue;
  const before = buffer.toString("utf8");
  const after = replace(before);
  const renamed = replace(relative);
  if (before === after && relative === renamed) continue;
  changes.push({
    relative,
    absolute,
    renamed,
    after,
    textChanged: before !== after,
  });
}
for (const change of changes) {
  const destination = path.join(root, change.renamed);
  if (change.relative !== change.renamed && fs.existsSync(destination))
    throw new Error(`Rename would overwrite ${change.renamed}`);
}
if (dryRun) {
  console.log(
    `Would update ${changes.length} text files/paths from ${config.name} to ${name}. Pantopus is preserved.`,
  );
  for (const change of changes)
    console.log(
      change.relative === change.renamed
        ? change.relative
        : `${change.relative} → ${change.renamed}`,
    );
} else {
  for (const change of changes) {
    const destination = path.join(root, change.renamed);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, change.after);
    if (destination !== change.absolute) fs.unlinkSync(change.absolute);
  }
  console.log(
    `Updated ${changes.length} text files/paths. Run pnpm install && pnpm generate && pnpm check.\nReview the external-service checklist in docs/NAMING.md before store submission.`,
  );
}

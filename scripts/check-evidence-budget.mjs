// Check the actual Git objects in a proposed change; generated local output is
// not evidence until committed. Historical, unchanged artifacts are preserved.
import { execFileSync } from "node:child_process";

const fileLimit = 300_000;
const changeLimit = 1_000_000;
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--"))
    throw new Error(`Supply a value for ${name}.`);
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}
function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
function commit(ref) {
  return git(
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${ref}^{commit}`,
  ).trim();
}

try {
  const baseRef = option("--base"),
    headRef = option("--head", "HEAD");
  if (!baseRef || args.length)
    throw new Error(
      "Usage: node scripts/check-evidence-budget.mjs --base <commit> [--head <commit>]",
    );
  const base = commit(baseRef),
    head = commit(headRef);
  const changed = git(
    "diff",
    "--name-only",
    "--diff-filter=ACMRT",
    "-z",
    `${base}...${head}`,
    "--",
    "artifacts/",
  )
    .split("\0")
    .filter(Boolean);
  const entries = new Map();
  const pathsByBlob = new Map();
  for (const record of git(
    "ls-tree",
    "-r",
    "-l",
    "-z",
    head,
    "--",
    "artifacts/",
  )
    .split("\0")
    .filter(Boolean)) {
    const tab = record.indexOf("\t");
    const [mode, type, oid, size] = record.slice(0, tab).trim().split(/\s+/);
    const path = record.slice(tab + 1);
    entries.set(path, { mode, type, oid, size: Number(size) });
    const paths = pathsByBlob.get(oid) ?? [];
    paths.push(path);
    pathsByBlob.set(oid, paths);
  }
  const failures = [];
  const checkedDuplicates = new Set();
  let total = 0;
  for (const path of changed) {
    const entry = entries.get(path);
    if (
      !entry ||
      entry.type !== "blob" ||
      !["100644", "100755"].includes(entry.mode)
    ) {
      failures.push(
        `${JSON.stringify(path)} must be a regular tracked evidence file.`,
      );
      continue;
    }
    total += entry.size;
    if (entry.size > fileLimit)
      failures.push(
        `${JSON.stringify(path)} is ${entry.size} bytes; maximum ${fileLimit}.`,
      );
    const duplicates = pathsByBlob.get(entry.oid);
    if (duplicates.length > 1 && !checkedDuplicates.has(entry.oid)) {
      checkedDuplicates.add(entry.oid);
      failures.push(
        `Duplicate evidence blob: ${duplicates.map((path) => JSON.stringify(path)).join(", ")}. Keep one file and link to it.`,
      );
    }
  }
  if (total > changeLimit)
    failures.push(
      `Changed evidence totals ${total} bytes; maximum ${changeLimit}. Deleted files do not offset new evidence.`,
    );
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(
      `Evidence budget passed: ${changed.length} changed files, ${total}/${changeLimit} bytes; per-file maximum ${fileLimit}.`,
    );
  }
} catch (error) {
  console.error(
    error instanceof Error && error.message.startsWith("Command failed:")
      ? "Cannot inspect the requested Git commits. Fetch their history and retry with an explicit base."
      : error.message,
  );
  process.exitCode = 1;
}

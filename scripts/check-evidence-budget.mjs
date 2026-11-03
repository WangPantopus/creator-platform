// The evidence budget is zero: evidence stays out of Git. Screenshots and logs go in the pull
// request description or the CI artifacts, and artifacts/ is ignored. This check refuses any file a
// change adds or modifies under artifacts/; deletions pass. Everything that was there is kept at the
// tag archive/artifacts-2026-11-03.
import { execFileSync } from "node:child_process";

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
  // --no-renames lists a move as a deletion plus an addition, so a file moved within or into
  // artifacts/ counts as added. The folder matches without regard to case, like CI's path
  // classifier: macOS would check Artifacts/ out into artifacts/.
  const fields = git(
    "diff",
    "--name-status",
    "--no-renames",
    "-z",
    `${base}...${head}`,
    "--",
    ":(top,icase)artifacts/",
  )
    .split("\0")
    .filter(Boolean);
  const refused = [];
  let deleted = 0;
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index],
      path = fields[index + 1];
    if (status === "D") deleted += 1;
    else
      refused.push(
        `  ${status === "A" ? "added" : "modified"}: ${JSON.stringify(path)}`,
      );
  }
  if (refused.length) {
    console.error(
      [
        `Evidence stays out of Git. This change adds or modifies ${refused.length} ${refused.length === 1 ? "file" : "files"} under artifacts/:`,
        ...refused,
        "Put screenshots and logs in the pull request description or the CI artifacts instead. Deleting files under artifacts/ passes.",
      ].join("\n"),
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Evidence check passed: no file under artifacts/ is added or modified; ${deleted} deleted.`,
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

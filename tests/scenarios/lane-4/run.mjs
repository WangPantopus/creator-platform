// Runs lane 4's money scenarios one after another against the running lane 4
// stack and prints one summary line per scenario. Each scenario ends with the
// invariant sweep, so a scenario passes only when its steps and the sweep pass.
//   node tests/scenarios/lane-4/run.mjs                 every e4-*.mjs scenario
//   node tests/scenarios/lane-4/run.mjs e4-1 e4-12      the named ones
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const wanted = process.argv.slice(2);
const files = readdirSync(here)
  .filter((name) => /^e4-[\d]+-.+\.mjs$/u.test(name))
  .filter(
    (name) => !wanted.length || wanted.some((w) => name.startsWith(`${w}-`)),
  )
  .sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]));
const summary = [];
for (const file of files) {
  console.log(`\n=== ${file}`);
  const run = spawnSync(process.execPath, [here + file], {
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
  });
  process.stdout.write(run.stdout);
  const tally =
    /(\d+)\/(\d+) steps passed/u.exec(run.stdout)?.[0] ?? "no result";
  summary.push(`${run.status === 0 ? "PASS" : "FAIL"}  ${file}  ${tally}`);
}
console.log(`\n${summary.join("\n")}`);
process.exit(summary.some((line) => line.startsWith("FAIL")) ? 1 : 0);

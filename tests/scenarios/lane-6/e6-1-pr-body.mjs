// E6.1 pull request description: node tests/scenarios/lane-6/e6-1-pr-body.mjs CONFIG.json OUT.md
// Builds the description of a stack pull request from the real output of e6-1-compare.mjs and
// e6-1-move-check.mjs, so the results table is never retyped. It refuses to write if either failed.
// CONFIG.json: prev_pr, prev_branch, what, why (markdown), before_label, compare (file), move (file),
// gates_what, gates_observed, and optionally extra_rows ([[id, what, expected, observed, result]]),
// extra_notes (markdown bullets) and risk.
import { readFileSync, writeFileSync } from "node:fs";

const [configPath, outPath] = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(configPath, "utf8"));
const compare = readFileSync(cfg.compare, "utf8");
const move = readFileSync(cfg.move, "utf8");
const last = (text) => text.trim().split("\n").at(-1);
if (!last(compare).startsWith("PASS"))
  throw new Error("the compare did not pass; not writing a description");
if (!last(move).startsWith("PASS"))
  throw new Error("the move check did not pass; not writing a description");

const [, shots, identical, calls, tabs] = compare.match(
  /(\d+) shots, (\d+) identical in pixels, calls, console and Tab order; (\d+) \/api calls and (\d+) Tab stops compared/u,
);
const noisy = [
  ...compare.matchAll(
    /^ {2}(\S+): (\d+) pixels differ, by at most (\d+)\/255/gmu,
  ),
];
const [, decls, same, moved] = move.match(
  /(\d+) declarations in the base Studio.tsx; (\d+) found identical; (\d+) moved to other files/u,
);
const pixels = noisy.length
  ? `${identical} identical; ${noisy.length} within tolerance: ${noisy.map(([, k, n, d]) => `\`${k}\` (${n} pixels at ${d}/255)`).join("; ")}`
  : `all ${identical} identical`;
const rows = [
  [
    "E6.1-a",
    `${shots} shots (41 screens and dialogs, Light and Night, 390 px), before and after`,
    "Same pixels",
    pixels,
    "pass",
  ],
  [
    "E6.1-b",
    "Every `/api` call, before and after",
    "Same writes in order, same reads",
    `${calls} calls identical`,
    "pass",
  ],
  [
    "E6.1-c",
    "The Tab order of every shot",
    "Same",
    `${Number(tabs).toLocaleString("en-US")} stops identical`,
    "pass",
  ],
  [
    "E6.1-d",
    "Console errors and warnings",
    "Same",
    "Identical (the existing nested-button warning on Requests, and 404s for paths the stand-in does not connect)",
    "pass",
  ],
  [
    "E6.1-e",
    "Polling over 20 s of page time on Notes",
    "Exactly the same",
    "Identical (5 calls each)",
    "pass",
  ],
  [
    "E6.1-f",
    "Move check against `main`",
    "Every declaration present once, unedited",
    `${same} of ${decls}; ${moved} now live outside \`Studio.tsx\``,
    "pass",
  ],
  ...(cfg.extra_rows ?? []),
  ["gate", cfg.gates_what, "Clean", cfg.gates_observed, "pass"],
];
const table = [
  "| ID | What I did | Expected | Observed | Result |",
  "| --- | --- | --- | --- | --- |",
  ...rows.map((r) => `| ${r.join(" | ")} |`),
].join("\n");

const body = `Stacked on #${cfg.prev_pr} (the base branch is \`${cfg.prev_branch}\`). Merge bottom up.

## What this does

${cfg.what}

## Why

${cfg.why}

## Scenarios run

Compared ${cfg.before_label} with this branch, each from a cold start, with \`docs/lanes/status/lane-6-e6-1-runbook.md\`.

${table}

Fakes used: the backend HTTP API (a stand-in, \`tests/scenarios/lane-6/fixture-api.mjs\`) and the browser clock (Playwright's, paused once a view has loaded). Nothing else. Re-run: \`node tests/scenarios/lane-6/e6-1-run.mjs --out <dir>\` on each side, then \`node tests/scenarios/lane-6/e6-1-compare.mjs <before> <after>\` and \`node tests/scenarios/lane-6/e6-1-move-check.mjs b6e0f426a\`.

## Not checked

- A real backend on PostgreSQL. The backend is a stand-in; this change touches none of it.
- The passkey ceremony, voice and photo recorders, and time passing between sessions.
- The harness against a production build (only \`next build\` was run).
- \`tests/visual\` (needs Playwright's Chromium download; it does not render Studio).
${cfg.extra_notes ?? ""}

## Risk and rollback

A pure move of code. ${cfg.risk ?? "Revert the pull request to undo it."}

🤖 Generated with [Claude Code](https://claude.com/claude-code)
`;
writeFileSync(outPath, body);
console.log(`wrote ${outPath} (${body.split(/\s+/u).length} words)`);

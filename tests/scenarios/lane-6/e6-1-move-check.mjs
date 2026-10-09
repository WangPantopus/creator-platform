// E6.1 move check: node tests/scenarios/lane-6/e6-1-move-check.mjs [BASE_REF]
// Proves a split only moved code. Every top-level declaration of the base Studio.tsx (with its
// leading comments) must exist exactly once under apps/web/features/studio with identical text,
// ignoring a leading `export`. Reports what moved where, and anything missing, edited or added.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const base = process.argv[2] ?? "origin/main";
const dir = "apps/web/features/studio";
const baseFile = `${dir}/Studio.tsx`;

function declarations(path, source) {
  const sf = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found = [];
  for (const st of sf.statements) {
    const names =
      ts.isFunctionDeclaration(st) ||
      ts.isTypeAliasDeclaration(st) ||
      ts.isInterfaceDeclaration(st)
        ? [st.name?.text]
        : ts.isVariableStatement(st)
          ? st.declarationList.declarations.map((d) => d.name.getText(sf))
          : [];
    if (!names.length) continue;
    const text = st.getText(sf),
      full = st.getFullText(sf);
    const comments = full.slice(0, full.length - text.length).trim();
    found.push({
      name: names.join(","),
      path,
      text: `${comments}\n${text.replace(/^export\s+(?:default\s+)?/u, "")}`.trim(),
    });
  }
  return found;
}
const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(join(d, e.name))
      : /\.tsx?$/u.test(e.name)
        ? [join(d, e.name)]
        : [],
  );
const original = declarations(
  baseFile,
  execFileSync("git", ["show", `${base}:${baseFile}`], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  }),
);
const current = walk(dir).flatMap((p) =>
  declarations(p, readFileSync(p, "utf8")),
);
const baseFiles = new Set(
  execFileSync("git", ["ls-tree", "-r", "--name-only", base, dir], {
    encoding: "utf8",
  }).split("\n"),
);
const problems = [],
  where = new Map();
for (const decl of original) {
  const hits = current.filter((c) => c.name === decl.name);
  if (hits.length !== 1)
    problems.push(
      `${decl.name}: ${hits.length ? `declared ${hits.length} times (${hits.map((h) => h.path).join(", ")})` : "missing"}`,
    );
  else if (hits[0].text !== decl.text) {
    const [x, y] = [decl.text.split("\n"), hits[0].text.split("\n")];
    const at = x.findIndex((line, i) => line !== y[i]);
    problems.push(
      `${decl.name}: edited at line ${at + 1} of ${hits[0].path}: ${JSON.stringify(x[at])} <> ${JSON.stringify(y[at])}`,
    );
  } else
    where.set(hits[0].path, [...(where.get(hits[0].path) ?? []), decl.name]);
}
const known = new Set(original.map((d) => d.name));
for (const c of current)
  if (!known.has(c.name) && !baseFiles.has(c.path))
    problems.push(`${c.name}: added in new file ${c.path}`);
let moved = 0;
for (const [path, names] of where) {
  if (path !== baseFile) moved += names.length;
  console.log(
    `${path === baseFile ? "stays " : "moved "} ${path}: ${names.join(", ")}`,
  );
}
console.log(
  `${original.length} declarations in the base Studio.tsx; ${where.size ? [...where.values()].flat().length : 0} found identical; ${moved} moved to other files`,
);
for (const p of problems) console.log(`PROBLEM ${p}`);
console.log(
  problems.length
    ? `FAIL: ${problems.length} problem(s)`
    : "PASS: every declaration is present once and unedited",
);
process.exit(problems.length ? 1 : 0);

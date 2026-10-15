// E6.1 extraction: node tests/scenarios/lane-6/e6-1-extract.mjs <area>   (the areas are in e6-1-split-plan.mjs)
// Moves one area out of apps/web/features/studio/Studio.tsx the way the plan says: copies the named
// top-level declarations byte for byte (adding `export` where planned) into new modules that carry
// their own imports, imports the new modules in Studio.tsx, drops the imports Studio.tsx no longer
// uses (as ESLint reports them), and formats what it touched with Prettier. It never edits a
// declaration; prove that with e6-1-move-check.mjs, and behavior with e6-1-run.mjs and e6-1-compare.mjs.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import ts from "typescript";
import { plan } from "./e6-1-split-plan.mjs";

const dir = "apps/web/features/studio";
const studio = `${dir}/Studio.tsx`;
const area = process.argv[2];
if (!plan[area])
  throw new Error(`area must be one of: ${Object.keys(plan).join(", ")}`);

const parse = (text) =>
  ts.createSourceFile(
    studio,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
const declared = (st, sf) =>
  ts.isFunctionDeclaration(st) ||
  ts.isTypeAliasDeclaration(st) ||
  ts.isInterfaceDeclaration(st)
    ? [st.name.text]
    : ts.isVariableStatement(st)
      ? st.declarationList.declarations.map((d) => d.name.getText(sf))
      : [];
const pnpm = (...args) =>
  spawnSync("pnpm", ["exec", ...args], {
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });

let text = readFileSync(studio, "utf8");
const written = [];
for (const file of plan[area].files) {
  const sf = parse(text);
  const picked = file.names.map((name) => {
    const hits = sf.statements.filter((st) => declared(st, sf).includes(name));
    if (hits.length !== 1)
      throw new Error(
        `${name}: found ${hits.length} declarations in ${studio}`,
      );
    return hits[0];
  });
  const pieces = picked.map((st) => {
    const trivia = text
      .slice(st.getFullStart(), st.getStart())
      .replace(/^\s*\n/u, "");
    const body = text.slice(st.getStart(), st.getEnd());
    const wanted =
      declared(st, sf).some((n) => file.exports.includes(n)) &&
      !/^export\s/u.test(body);
    return `${trivia}${wanted ? "export " : ""}${body}`;
  });
  const dest = `${dir}/${file.dest}`;
  if (existsSync(dest)) throw new Error(`${dest} already exists`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, `${file.header.trim()}\n${pieces.join("\n")}\n`);
  written.push(dest);
  // Remove from Studio.tsx, last first. The newline that ends the previous statement's line belongs
  // to this statement's leading trivia: keep it and drop the statement's own.
  for (const st of [...picked].sort(
    (a, b) => b.getFullStart() - a.getFullStart(),
  )) {
    let start = st.getFullStart();
    if (text[start] === "\n") start += 1;
    let end = st.getEnd();
    if (text[end] === "\n") end += 1;
    text = text.slice(0, start) + text.slice(end);
  }
}
const lastImport = parse(text).statements.filter(ts.isImportDeclaration).at(-1);
text = `${text.slice(0, lastImport.getEnd())}\n${plan[area].studioImports.join("\n")}${text.slice(lastImport.getEnd())}`;
writeFileSync(studio, text);
pnpm("prettier", "--write", studio, ...written);

// Drop the imports Studio.tsx no longer uses, as ESLint reports them.
const report = pnpm("eslint", "--format", "json", studio).stdout;
const messages = JSON.parse(report.slice(report.indexOf("[{")))[0].messages;
const unused = new Set(
  messages
    .filter((m) => m.ruleId === "@typescript-eslint/no-unused-vars")
    .map((m) => m.message.match(/^'(.+)' is defined but never used/u)?.[1]),
);
let src = readFileSync(studio, "utf8");
const sf = parse(src);
const edits = [];
for (const decl of sf.statements.filter(ts.isImportDeclaration)) {
  const clause = decl.importClause;
  if (!clause) continue;
  const named =
    clause.namedBindings && ts.isNamedImports(clause.namedBindings)
      ? [...clause.namedBindings.elements]
      : [];
  const keepDefault =
    clause.name && !unused.has(clause.name.text) ? clause.name.text : null;
  const keepNamed = named.filter((e) => !unused.has(e.name.text));
  if (
    keepDefault === (clause.name?.text ?? null) &&
    keepNamed.length === named.length
  )
    continue;
  const names = [
    keepDefault,
    keepNamed.length
      ? `{ ${keepNamed.map((e) => e.getText(sf)).join(", ")} }`
      : null,
  ].filter(Boolean);
  const end = decl.getEnd() + (src[decl.getEnd()] === "\n" ? 1 : 0);
  edits.push([
    decl.getStart(),
    end,
    names.length
      ? `import ${clause.isTypeOnly ? "type " : ""}${names.join(", ")} from ${decl.moduleSpecifier.getText(sf)};\n`
      : "",
  ]);
}
for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0]))
  src = src.slice(0, start) + replacement + src.slice(end);
writeFileSync(studio, src);
pnpm("prettier", "--write", studio);

const left = pnpm("eslint", studio);
console.log(`${area}: wrote ${written.join(", ")}`);
console.log(
  `${studio} is now ${src.split("\n").length - 1} lines; removed imports: ${[...unused].join(", ") || "none"}`,
);
console.log(
  left.status === 0 ? "eslint: clean" : `eslint still reports:\n${left.stdout}`,
);
process.exit(left.status === 0 ? 0 : 1);
